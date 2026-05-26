-- ============================================================================
-- Expense Tracker MVP — initial schema
-- Creates: users (profile mirror), transactions, RLS policies, signup trigger.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- users: profile data mirrored from auth.users via trigger
-- ---------------------------------------------------------------------------
create table if not exists public.users (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  full_name   text,
  avatar_url  text,
  created_at  timestamptz not null default now()
);

alter table public.users enable row level security;

drop policy if exists "users_select_own" on public.users;
create policy "users_select_own"
  on public.users for select
  using (auth.uid() = id);

drop policy if exists "users_update_own" on public.users;
create policy "users_update_own"
  on public.users for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Trigger: copy auth.users -> public.users on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do update
    set email      = excluded.email,
        full_name  = coalesce(excluded.full_name, public.users.full_name),
        avatar_url = coalesce(excluded.avatar_url, public.users.avatar_url);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------------------------------------------------------------------------
-- transactions: extracted expenses
-- ---------------------------------------------------------------------------
create table if not exists public.transactions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.users (id) on delete cascade,
  merchant         text,
  amount           numeric(12, 2),
  currency         text not null default 'USD',
  transaction_date date,
  category         text not null default 'Other',
  is_subscription  boolean not null default false,
  source_email     text,                       -- Gmail message ID (nullable for manual entries)
  source_subject   text,
  created_at       timestamptz not null default now()
);

-- Dedup: a Gmail message can only produce one transaction per user
create unique index if not exists transactions_user_source_uniq
  on public.transactions (user_id, source_email)
  where source_email is not null;

-- Dashboard query path
create index if not exists transactions_user_date_idx
  on public.transactions (user_id, transaction_date desc);

alter table public.transactions enable row level security;

drop policy if exists "tx_select_own" on public.transactions;
create policy "tx_select_own"
  on public.transactions for select
  using (auth.uid() = user_id);

drop policy if exists "tx_insert_own" on public.transactions;
create policy "tx_insert_own"
  on public.transactions for insert
  with check (auth.uid() = user_id);

drop policy if exists "tx_update_own" on public.transactions;
create policy "tx_update_own"
  on public.transactions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "tx_delete_own" on public.transactions;
create policy "tx_delete_own"
  on public.transactions for delete
  using (auth.uid() = user_id);

-- Service role bypasses RLS automatically; the sync-gmail Edge Function uses it
-- after verifying the caller's JWT, so inserts are always scoped to that user.
