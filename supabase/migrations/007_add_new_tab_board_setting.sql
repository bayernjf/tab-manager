-- =====================================================
-- Migration 007: Add open board on new tab setting
-- File: 007_add_new_tab_board_setting.sql
-- Date: 2026-07-23 15:05
-- Depends on: 001_create_user_sync_tables.sql
-- Run: Supabase SQL Editor, execute once
-- =====================================================
-- Note: Adds the open_board_on_new_tab boolean to
--       user_settings.
-- -----------------------------------------------------
alter table public.user_settings
  add column if not exists open_board_on_new_tab boolean not null default false;
