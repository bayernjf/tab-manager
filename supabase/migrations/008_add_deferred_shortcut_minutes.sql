-- =====================================================
-- Migration 008: Add deferred shortcut minutes
-- File: 008_add_deferred_shortcut_minutes.sql
-- Date: 2026-07-25 14:24
-- Depends on: 001_create_user_sync_tables.sql
-- Run: Supabase SQL Editor, execute once
-- =====================================================
-- Note: Adds the deferred_shortcut_minutes integer[]
--       column to user_settings. Superseded by
--       012_add_deferred_shortcut_times.sql; kept for
--       migration history.
-- -----------------------------------------------------
-- [作废 2026-07-24] 本列已被 010_add_deferred_shortcut_times.sql 取代。
-- 快捷提醒从「延迟分钟数」改为「24 小时制时刻」(deferred_shortcut_times text[])，
-- 代码不再读写本列。保留以维护迁移历史与线上 schema，勿删；如需清理请另起 drop 迁移。

alter table public.user_settings
  add column if not exists deferred_shortcut_minutes integer[] not null default '{1,3,5}'
    check (coalesce(array_length(deferred_shortcut_minutes, 1), 0) between 1 and 5);
