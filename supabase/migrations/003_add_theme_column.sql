-- =====================================================
-- Migration 003: Add theme column to user settings
-- File: 003_add_theme_column.sql
-- Date: 2026-07-28 21:58
-- Depends on: 001_create_user_sync_tables.sql
-- Run: Supabase SQL Editor, execute once
-- =====================================================
-- Note: Adds theme and language columns to user_settings,
--       with an index on (user_id, theme).
-- -----------------------------------------------------
-- Add theme and language columns to user_settings.

alter table public.user_settings
add column if not exists theme text not null default 'light'
  check (theme in ('light', 'dark'));

create index if not exists user_settings_theme_idx
  on public.user_settings(user_id, theme);

alter table public.user_settings
add column if not exists language text;
