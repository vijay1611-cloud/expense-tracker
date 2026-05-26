-- Fix dedup: supabase-js upsert(...onConflict: 'user_id,source_email') needs
-- a non-partial unique constraint, but the original migration created a
-- partial index (where source_email is not null). Replace it.
--
-- PostgreSQL treats multiple NULLs as distinct in unique constraints by
-- default, so manual entries with NULL source_email won't collide with
-- each other.

drop index if exists public.transactions_user_source_uniq;

alter table public.transactions
  drop constraint if exists transactions_user_source_uniq;

alter table public.transactions
  add constraint transactions_user_source_uniq
  unique (user_id, source_email);
