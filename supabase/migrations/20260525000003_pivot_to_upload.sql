-- ============================================================================
-- Pivot from Gmail-based sync to user-uploaded PDF flow.
-- - Wipes all existing transactions and sync_runs (user requested fresh start).
-- - Renames sync_runs -> upload_runs and adds filename/size/hash columns.
-- - Repurposes transactions.source_email column to hold a file hash + row
--   discriminator (e.g. `<sha256>` or `<sha256>:row:5`). The column is left
--   in place for compatibility — only its semantics change.
-- ============================================================================

truncate table public.transactions cascade;
truncate table public.sync_runs cascade;

-- Rename sync_runs -> upload_runs (indexes + RLS policies follow the table by OID)
alter table public.sync_runs rename to upload_runs;
alter index sync_runs_user_started_idx rename to upload_runs_user_started_idx;

-- New columns describing the uploaded file
alter table public.upload_runs
  add column if not exists filename        text,
  add column if not exists file_size_bytes integer,
  add column if not exists file_hash       text;

-- Document the new semantics of source_email on transactions
comment on column public.transactions.source_email is
  'Source reference: SHA-256 hash of the uploaded file, with optional `:row:<N>` suffix to disambiguate multiple rows extracted from the same PDF.';

-- Rename the dedup unique constraint to reflect the new semantics
alter table public.transactions
  rename constraint transactions_user_source_uniq to transactions_user_source_ref_uniq;
