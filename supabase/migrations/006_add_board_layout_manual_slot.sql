-- =====================================================
-- Migration 006: Add manual slot to board layouts
-- File: 006_add_board_layout_manual_slot.sql
-- Date: 2026-07-22 20:32
-- Depends on: 005_add_board_layout_tables.sql
-- Run: Supabase SQL Editor, execute once
-- =====================================================
-- Note: Adds manual_slot to board_layouts, backfills it
--       from manual_order, and replaces the old
--       auto_fill/manual_order check constraint so manual
--       grid rows persist independently of visual card
--       height.
-- -----------------------------------------------------
-- Preserve manual board grid rows independently from visual card height.

alter table public.board_layouts
  add column if not exists manual_slot integer check (manual_slot >= 0);

-- Existing manual_order values were visual order values. They are valid initial slots.
update public.board_layouts
set manual_slot = manual_order
where manual_slot is null and manual_order is not null;

do $$
declare
  old_constraint record;
begin
  -- The original unnamed table check has a generated name, so find it by its
  -- definition instead of assuming a particular PostgreSQL-generated name.
  for old_constraint in
    select conname
    from pg_constraint
    where conrelid = 'public.board_layouts'::regclass
      and contype = 'c'
      and conname <> 'board_layouts_manual_slot_check'
      and pg_get_constraintdef(oid) like '%auto_fill%manual_order%'
  loop
    execute format('alter table public.board_layouts drop constraint %I', old_constraint.conname);
  end loop;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.board_layouts'::regclass
      and conname = 'board_layouts_manual_slot_check'
  ) then
    alter table public.board_layouts
      add constraint board_layouts_manual_slot_check check (
        (auto_fill and manual_lane is null and manual_slot is null and manual_order is null)
        or (not auto_fill and manual_lane is not null and manual_slot is not null)
      );
  end if;
end $$;
