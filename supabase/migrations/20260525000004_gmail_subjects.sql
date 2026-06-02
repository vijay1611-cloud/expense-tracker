-- User-curated list of exact subject patterns to look for in Gmail.
-- Lets the user opt into narrow Gmail integration: e.g. "Your HDFC Bank
-- e-Statement" or "Your order from Swiggy". The Edge Function only fetches
-- emails matching THESE subjects — never the whole inbox, never a broad
-- keyword search.

create table if not exists public.gmail_subjects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users (id) on delete cascade,
  pattern     text not null,                  -- the subject pattern to match
  enabled     boolean not null default true,
  created_at  timestamptz not null default now()
);

create index if not exists gmail_subjects_user_idx
  on public.gmail_subjects (user_id);

-- Avoid storing duplicate patterns per user
create unique index if not exists gmail_subjects_user_pattern_uniq
  on public.gmail_subjects (user_id, lower(pattern));

alter table public.gmail_subjects enable row level security;

drop policy if exists "gmail_subjects_select_own" on public.gmail_subjects;
create policy "gmail_subjects_select_own"
  on public.gmail_subjects for select
  using (auth.uid() = user_id);

drop policy if exists "gmail_subjects_insert_own" on public.gmail_subjects;
create policy "gmail_subjects_insert_own"
  on public.gmail_subjects for insert
  with check (auth.uid() = user_id);

drop policy if exists "gmail_subjects_update_own" on public.gmail_subjects;
create policy "gmail_subjects_update_own"
  on public.gmail_subjects for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "gmail_subjects_delete_own" on public.gmail_subjects;
create policy "gmail_subjects_delete_own"
  on public.gmail_subjects for delete
  using (auth.uid() = user_id);
