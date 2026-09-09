-- =====================================================
-- Migration 012: Add deferred shortcut times
-- File: 012_add_deferred_shortcut_times.sql
-- Date: 2026-07-25 14:24
-- Depends on: 001_create_user_sync_tables.sql
-- Run: Supabase SQL Editor, execute once
-- =====================================================
-- Note: Adds the deferred_shortcut_times text[] column
--       (24-hour times) to user_settings, replacing
--       deferred_shortcut_minutes.
-- -----------------------------------------------------
alter table public.user_settings
  add column if not exists deferred_shortcut_times text[] not null default '{"09:00","14:00","18:00"}'
    check (coalesce(array_length(deferred_shortcut_times, 1), 0) between 1 and 5);
