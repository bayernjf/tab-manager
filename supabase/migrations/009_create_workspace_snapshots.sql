-- Synced workspace snapshots: user-curated tab collections shared across all
-- devices/browsers. Always synced (gated only by the master cloudSyncEnabled).
-- Globally unique by (user_id, device_name, title): same title may coexist on
-- different device names; first-come-first-served within a device name.

create table if not exists public.workspace_snapshots (
  user_id uuid not null
    references auth.users(id)
    on delete cascade,
  id uuid not null
    default gen_random_uuid(),
  device_id text not null,
  device_name text not null
    check (char_length(trim(device_name)) between 1 and 60),
  title text not null
    check (char_length(trim(title)) between 1 and 80),
  tabs jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  primary key (user_id, id),
  unique (user_id, device_name, title)
);

create index if not exists workspace_snapshots_user_idx
  on public.workspace_snapshots(user_id);

drop trigger if exists set_workspace_snapshots_updated_at
  on public.workspace_snapshots;

create trigger set_workspace_snapshots_updated_at
before update on public.workspace_snapshots
for each row
execute function public.set_updated_at();

alter table public.workspace_snapshots enable row level security;

drop policy if exists "Users can read own workspace snapshots"
  on public.workspace_snapshots;
drop policy if exists "Users can insert own workspace snapshots"
  on public.workspace_snapshots;
drop policy if exists "Users can update own workspace snapshots"
  on public.workspace_snapshots;
drop policy if exists "Users can delete own workspace snapshots"
  on public.workspace_snapshots;

create policy "Users can read own workspace snapshots"
on public.workspace_snapshots
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can insert own workspace snapshots"
on public.workspace_snapshots
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update own workspace snapshots"
on public.workspace_snapshots
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete own workspace snapshots"
on public.workspace_snapshots
for delete
to authenticated
using ((select auth.uid()) = user_id);

revoke all on table public.workspace_snapshots from anon;

grant select, insert, update, delete
  on table public.workspace_snapshots
  to authenticated;
