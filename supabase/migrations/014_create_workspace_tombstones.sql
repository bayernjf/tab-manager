-- =====================================================
-- Migration 014: Create workspace tombstones table
-- File: 014_create_workspace_tombstones.sql
-- Date: 2026-11-03 12:00
-- Depends on: 011_create_workspace_snapshots.sql
-- Run: Supabase SQL Editor, execute once
-- =====================================================
-- Note: Workspace sync used to overwrite the whole local
--       snapshot list with the cloud list, silently
--       deleting workspaces created offline. The fix
--       switches to a last-write-wins merge that needs
--       deletion markers: this table records which
--       workspace ids were deleted (and when) so other
--       devices drop their local copies instead of
--       resurrecting them.
-- -----------------------------------------------------

create table if not exists public.workspace_tombstones (
  user_id uuid not null
    references auth.users(id)
    on delete cascade,
  id uuid not null,
  deleted_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists workspace_tombstones_user_idx
  on public.workspace_tombstones(user_id);

alter table public.workspace_tombstones enable row level security;

drop policy if exists "Users can read own workspace tombstones"
  on public.workspace_tombstones;
drop policy if exists "Users can insert own workspace tombstones"
  on public.workspace_tombstones;
drop policy if exists "Users can update own workspace tombstones"
  on public.workspace_tombstones;
drop policy if exists "Users can delete own workspace tombstones"
  on public.workspace_tombstones;

create policy "Users can read own workspace tombstones"
on public.workspace_tombstones
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can insert own workspace tombstones"
on public.workspace_tombstones
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update own workspace tombstones"
on public.workspace_tombstones
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete own workspace tombstones"
on public.workspace_tombstones
for delete
to authenticated
using ((select auth.uid()) = user_id);

revoke all on table public.workspace_tombstones from anon;

grant select, insert, update, delete
  on table public.workspace_tombstones
  to authenticated;
