-- =====================================================
-- Migration 010: Create device tab snapshots table
-- File: 010_create_device_tab_snapshots.sql
-- Date: 2026-07-25 14:24
-- Depends on: 001_create_user_sync_tables.sql
-- Run: Supabase SQL Editor, execute once
-- =====================================================
-- Note: Creates device_tab_snapshots for per-device /
--       per-browser cross-device navigation, one row per
--       extension install, opt-in only. Feature later
--       removed; table kept idle for migration history.
-- -----------------------------------------------------
-- [作废 2026-07-24] 设备/浏览器跨设备导航功能已移除（被工作区导航取代），
-- 代码不再读写本表，device_tab_snapshots 在线上闲置。保留迁移历史与线上表，
-- 勿删、勿新增 drop 迁移（避免动线上表）。

-- Per-device/browser tab snapshots for cross-device, cross-browser board navigation.
-- One row per extension install (deviceId + browserKind). Opt-in only: rows are
-- written when the user enables syncTabSnapshotsEnabled. Stores group metadata
-- plus stable tab content (title/url/favIconUrl); never runtime tab/window IDs.

create table if not exists public.device_tab_snapshots (
  user_id uuid not null
    references auth.users(id)
    on delete cascade,
  device_id text not null,
  device_name text not null
    check (char_length(trim(device_name)) between 1 and 60),
  browser_kind text not null
    check (browser_kind in ('chrome', 'edge')),
  groups jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, device_id)
);

create index if not exists device_tab_snapshots_user_idx
  on public.device_tab_snapshots(user_id);

drop trigger if exists set_device_tab_snapshots_updated_at
  on public.device_tab_snapshots;

create trigger set_device_tab_snapshots_updated_at
before update on public.device_tab_snapshots
for each row
execute function public.set_updated_at();

alter table public.device_tab_snapshots enable row level security;

drop policy if exists "Users can read own device tab snapshots"
  on public.device_tab_snapshots;
drop policy if exists "Users can insert own device tab snapshots"
  on public.device_tab_snapshots;
drop policy if exists "Users can update own device tab snapshots"
  on public.device_tab_snapshots;
drop policy if exists "Users can delete own device tab snapshots"
  on public.device_tab_snapshots;

create policy "Users can read own device tab snapshots"
on public.device_tab_snapshots
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can insert own device tab snapshots"
on public.device_tab_snapshots
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update own device tab snapshots"
on public.device_tab_snapshots
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete own device tab snapshots"
on public.device_tab_snapshots
for delete
to authenticated
using ((select auth.uid()) = user_id);

revoke all on table public.device_tab_snapshots from anon;

grant select, insert, update, delete
  on table public.device_tab_snapshots
  to authenticated;
