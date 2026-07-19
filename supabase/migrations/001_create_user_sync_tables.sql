-- Tab Garden user settings and cross-device grouping rules.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.user_settings (
  user_id uuid primary key
    references auth.users(id)
    on delete cascade,
  auto_group_enabled boolean not null default true,
  minimum_tabs integer not null default 2
    check (minimum_tabs between 2 and 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.group_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null
    references auth.users(id)
    on delete cascade,
  title text not null
    check (char_length(trim(title)) between 1 and 40),
  color text not null default 'blue'
    check (
      color in (
        'blue',
        'green',
        'purple',
        'orange',
        'red',
        'pink',
        'cyan',
        'yellow',
        'grey'
      )
    ),
  domains text[] not null default '{}'::text[],
  enabled boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists group_rules_user_id_idx
  on public.group_rules(user_id);

create index if not exists group_rules_user_sort_idx
  on public.group_rules(user_id, sort_order);

create index if not exists group_rules_domains_idx
  on public.group_rules using gin(domains);

drop trigger if exists set_user_settings_updated_at
  on public.user_settings;

create trigger set_user_settings_updated_at
before update on public.user_settings
for each row
execute function public.set_updated_at();

drop trigger if exists set_group_rules_updated_at
  on public.group_rules;

create trigger set_group_rules_updated_at
before update on public.group_rules
for each row
execute function public.set_updated_at();

alter table public.user_settings enable row level security;
alter table public.group_rules enable row level security;

drop policy if exists "Users can read own settings"
  on public.user_settings;
drop policy if exists "Users can insert own settings"
  on public.user_settings;
drop policy if exists "Users can update own settings"
  on public.user_settings;
drop policy if exists "Users can delete own settings"
  on public.user_settings;

drop policy if exists "Users can read own group rules"
  on public.group_rules;
drop policy if exists "Users can insert own group rules"
  on public.group_rules;
drop policy if exists "Users can update own group rules"
  on public.group_rules;
drop policy if exists "Users can delete own group rules"
  on public.group_rules;

create policy "Users can read own settings"
on public.user_settings
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can insert own settings"
on public.user_settings
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update own settings"
on public.user_settings
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete own settings"
on public.user_settings
for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can read own group rules"
on public.group_rules
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can insert own group rules"
on public.group_rules
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update own group rules"
on public.group_rules
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete own group rules"
on public.group_rules
for delete
to authenticated
using ((select auth.uid()) = user_id);

revoke all on table public.user_settings from anon;
revoke all on table public.group_rules from anon;

grant select, insert, update, delete
  on table public.user_settings
  to authenticated;

grant select, insert, update, delete
  on table public.group_rules
  to authenticated;
