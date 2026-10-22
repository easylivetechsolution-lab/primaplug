create table if not exists public.profile_work_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 100),
  description text not null default '' check (char_length(description) <= 2000),
  skill_tags text[] not null default '{}',
  media_url text not null,
  media_type text not null check (media_type in ('image', 'video')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profile_work_items_user_created_idx
  on public.profile_work_items (user_id, created_at desc);

alter table public.profile_work_items enable row level security;

create policy "Public profiles can view work items"
  on public.profile_work_items for select
  to anon, authenticated
  using (true);

create policy "Users can add their own work items"
  on public.profile_work_items for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can edit their own work items"
  on public.profile_work_items for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can remove their own work items"
  on public.profile_work_items for delete
  to authenticated
  using (auth.uid() = user_id);
