-- =====================================================
-- Migration 009: Add sync tab snapshots toggle
-- File: 009_add_sync_tab_snapshots.sql
-- Date: 2026-07-25 14:24
-- Depends on: 001_create_user_sync_tables.sql
-- Run: Supabase SQL Editor, execute once
-- =====================================================
-- Note: Adds the sync_tab_snapshots_enabled boolean to
--       user_settings (opt-in toggle for per-device tab
--       snapshot syncing). Feature later removed; kept
--       for migration history.
-- -----------------------------------------------------
-- [作废 2026-07-24] 设备/浏览器跨设备导航功能已移除（被工作区导航取代），
-- syncTabSnapshotsEnabled 设置随之删除，代码不再读写本列。保留迁移历史，勿删。

-- Opt-in toggle for syncing per-device/browser tab snapshots (titles + URLs).
-- When disabled (default), no tab content is uploaded; only stable metadata syncs.

alter table public.user_settings
  add column if not exists sync_tab_snapshots_enabled boolean not null default false;
