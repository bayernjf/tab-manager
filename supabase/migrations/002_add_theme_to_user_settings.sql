-- Add theme preference to user_settings for cross-device dark mode sync.

alter table public.user_settings
  add column if not exists theme text
    check (theme in ('light', 'dark'));
