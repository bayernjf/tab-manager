-- Persisted board groups and per-device layout preferences.

create table if not exists public.board_custom_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 40),
  color text not null default 'blue' check (color in ('blue', 'green', 'purple', 'orange', 'red', 'pink', 'cyan', 'yellow', 'grey')),
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.board_layouts (
  user_id uuid not null references auth.users(id) on delete cascade,
  board_key text not null check (
    board_key = 'ungrouped'
    or board_key ~ '^auto:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$'
    or board_key ~ '^custom:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  device_class text not null check (device_class in ('desktop', 'tablet', 'mobile')),
  rank integer not null check (rank >= 0),
  auto_fill boolean not null default true,
  manual_lane integer check (manual_lane >= 0),
  manual_order integer check (manual_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, board_key, device_class),
  check ((auto_fill and manual_lane is null and manual_order is null) or (not auto_fill and manual_lane is not null and manual_order is not null))
);

create index if not exists board_custom_groups_user_sort_idx on public.board_custom_groups(user_id, sort_order);
create index if not exists board_layouts_user_device_rank_idx on public.board_layouts(user_id, device_class, rank);

drop trigger if exists set_board_custom_groups_updated_at on public.board_custom_groups;
create trigger set_board_custom_groups_updated_at before update on public.board_custom_groups for each row execute function public.set_updated_at();
drop trigger if exists set_board_layouts_updated_at on public.board_layouts;
create trigger set_board_layouts_updated_at before update on public.board_layouts for each row execute function public.set_updated_at();

alter table public.board_custom_groups enable row level security;
alter table public.board_layouts enable row level security;

drop policy if exists "Users can read own board custom groups" on public.board_custom_groups;
drop policy if exists "Users can insert own board custom groups" on public.board_custom_groups;
drop policy if exists "Users can update own board custom groups" on public.board_custom_groups;
drop policy if exists "Users can delete own board custom groups" on public.board_custom_groups;
drop policy if exists "Users can read own board layouts" on public.board_layouts;
drop policy if exists "Users can insert own board layouts" on public.board_layouts;
drop policy if exists "Users can update own board layouts" on public.board_layouts;
drop policy if exists "Users can delete own board layouts" on public.board_layouts;

create policy "Users can read own board custom groups" on public.board_custom_groups for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can insert own board custom groups" on public.board_custom_groups for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users can update own board custom groups" on public.board_custom_groups for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users can delete own board custom groups" on public.board_custom_groups for delete to authenticated using ((select auth.uid()) = user_id);
create policy "Users can read own board layouts" on public.board_layouts for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can insert own board layouts" on public.board_layouts for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users can update own board layouts" on public.board_layouts for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users can delete own board layouts" on public.board_layouts for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on table public.board_custom_groups from anon;
revoke all on table public.board_layouts from anon;
grant select, insert, update, delete on table public.board_custom_groups to authenticated;
grant select, insert, update, delete on table public.board_layouts to authenticated;
