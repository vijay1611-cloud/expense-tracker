-- Per-user record of every Gmail sync run, used to surface "last synced X ago".

create table if not exists public.sync_runs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users (id) on delete cascade,
  inserted     integer not null default 0,
  scanned      integer not null default 0,
  errors_count integer not null default 0,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz not null default now()
);

create index if not exists sync_runs_user_started_idx
  on public.sync_runs (user_id, started_at desc);

alter table public.sync_runs enable row level security;

drop policy if exists "sync_runs_select_own" on public.sync_runs;
create policy "sync_runs_select_own"
  on public.sync_runs for select
  using (auth.uid() = user_id);

-- Service role bypasses RLS; the Edge Function inserts rows after each sync.
