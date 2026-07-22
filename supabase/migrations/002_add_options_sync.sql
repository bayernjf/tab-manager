-- Add cloud-sync options and portable rule/ignore-list records.

alter table public.user_settings
  add column if not exists default_group_color text not null default 'blue',
  add column if not exists cloud_sync_enabled boolean not null default true,
  add column if not exists sync_rules_enabled boolean not null default true,
  add column if not exists sync_ignore_list_enabled boolean not null default true;

alter table public.group_rules
  add column if not exists match_scope text not null default 'exact';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'user_settings_default_group_color_check' and conrelid = 'public.user_settings'::regclass) then
    alter table public.user_settings add constraint user_settings_default_group_color_check
      check (default_group_color in ('blue', 'green', 'purple', 'orange', 'red', 'pink', 'cyan', 'yellow', 'grey'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'group_rules_match_scope_check' and conrelid = 'public.group_rules'::regclass) then
    alter table public.group_rules add constraint group_rules_match_scope_check
      check (match_scope in ('exact', 'domain-and-subdomains'));
  end if;
end;
$$;

create table if not exists public.ignored_sites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  domain text not null check (char_length(trim(domain)) between 1 and 253),
  match_scope text not null default 'exact' check (match_scope in ('exact', 'domain-and-subdomains')),
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, domain, match_scope)
);

create index if not exists ignored_sites_user_id_idx on public.ignored_sites(user_id);
create index if not exists ignored_sites_user_sort_idx on public.ignored_sites(user_id, sort_order);

drop trigger if exists set_ignored_sites_updated_at on public.ignored_sites;
create trigger set_ignored_sites_updated_at
before update on public.ignored_sites
for each row execute function public.set_updated_at();

alter table public.ignored_sites enable row level security;

drop policy if exists "Users can read own ignored sites" on public.ignored_sites;
drop policy if exists "Users can insert own ignored sites" on public.ignored_sites;
drop policy if exists "Users can update own ignored sites" on public.ignored_sites;
drop policy if exists "Users can delete own ignored sites" on public.ignored_sites;

create policy "Users can read own ignored sites" on public.ignored_sites for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can insert own ignored sites" on public.ignored_sites for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users can update own ignored sites" on public.ignored_sites for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users can delete own ignored sites" on public.ignored_sites for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on table public.ignored_sites from anon;
grant select, insert, update, delete on table public.ignored_sites to authenticated;
