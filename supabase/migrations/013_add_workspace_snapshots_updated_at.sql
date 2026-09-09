-- =====================================================
-- Migration 013: Add updated at to workspace snapshots
-- File: 013_add_workspace_snapshots_updated_at.sql
-- Date: 2026-07-25 21:33
-- Depends on: 011_create_workspace_snapshots.sql
-- Run: Supabase SQL Editor, execute once
-- =====================================================
-- Note: Fixes an omission in the workspace snapshots
--       migration: the table was created without an
--       updated_at column while its trigger
--       (set_workspace_snapshots_updated_at) sets
--       NEW.updated_at, so UPDATEs failed. Adds the
--       column.
-- -----------------------------------------------------
-- 修复 009 遗漏：workspace_snapshots 表创建了 set_workspace_snapshots_updated_at
-- 触发器（执行 public.set_updated_at()，内部 `new.updated_at = now()`），但建表时
-- 只有 created_at、漏了 updated_at 列。UPDATE 该表（例如把标签加入已有工作区，
-- upsert 走 on_conflict 的 UPDATE 分支）时，触发器因 NEW.updated_at 不存在而报错：
--   record "new" has no field "updated_at"
-- 补上 updated_at 列，触发器即可正常工作，与 user_settings / group_rules 等
-- 其他同步表保持一致。

alter table public.workspace_snapshots
  add column if not exists updated_at timestamptz not null default now();
