-- Add theme column to user_settings for dark/light theme preference.

alter table public.user_settings
add column if not exists theme text not null default 'light'
  check (theme in ('light', 'dark'));

create index if not exists user_settings_theme_idx
  on public.user_settings(user_id, theme);
