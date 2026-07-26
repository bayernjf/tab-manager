alter table public.user_settings
  add column if not exists deferred_shortcut_times text[] not null default '{"09:00","14:00","18:00"}'
    check (coalesce(array_length(deferred_shortcut_times, 1), 0) between 1 and 5);
