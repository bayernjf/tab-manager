alter table public.user_settings
  add column if not exists open_board_on_new_tab boolean not null default false;
