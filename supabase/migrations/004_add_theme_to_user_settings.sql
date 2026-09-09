-- =====================================================
-- Migration 004: Add theme preference to user settings
-- File: 004_add_theme_to_user_settings.sql
-- Date: 2026-07-28 18:19
-- Depends on: 001_create_user_sync_tables.sql
-- Run: Supabase SQL Editor, execute once
-- =====================================================
-- Note: Adds an optional theme column to user_settings
--       for cross-device dark mode sync.
-- -----------------------------------------------------
-- Add theme preference to user_settings for cross-device dark mode sync.

alter table public.user_settings
  add column if not exists theme text
    check (theme in ('light', 'dark'));
