-- Add theme and language columns to user_settings.

alter table public.user_settings
add column if not exists theme text not null default 'light'
  check (theme in ('light', 'dark'));

create index if not exists user_settings_theme_idx
  on public.user_settings(user_id, theme);

alter table public.user_settings
add column if not exists language text;
