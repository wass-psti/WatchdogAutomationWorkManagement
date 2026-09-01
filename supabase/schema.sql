-- Work Management authenticated account, RBAC, and authorization foundation for Supabase/Postgres.
-- v1.14.0. Safe to run for a new project. Existing v1.13.x deployments should run the v1.14.0 migration.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  platform_role text not null default 'employee',
  status text not null default 'active' check (status in ('active','disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Remove the legacy role constraint before translating legacy values. Existing v1.12/v1.13
-- databases reject the new values (for example `employee`) while that old CHECK remains active.
alter table public.profiles drop constraint if exists profiles_platform_role_check;

-- Normalize legacy roles only after the incompatible constraint has been removed.
update public.profiles set platform_role = case platform_role
  when 'platform_admin' then 'admin_general_manager'
  when 'manager' then 'supervisor'
  when 'user' then 'employee'
  else platform_role
end
where platform_role in ('platform_admin','manager','user');

alter table public.profiles alter column platform_role set default 'employee';
alter table public.profiles add constraint profiles_platform_role_check
  check (platform_role in ('admin_general_manager','hr','supervisor','employee'));

create table if not exists public.module_role_assignments (
  user_id uuid not null references public.profiles(id) on delete cascade,
  module_id text not null check (module_id in ('time-tracker','fueltrack-plus','tradelink')),
  role text not null,
  enabled boolean not null default true,
  assigned_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, module_id),
  constraint valid_module_role check (
    (module_id='time-tracker' and role in ('Employee','OJT','Supervisor','HR','Finance','System Admin','IT Administrator')) or
    (module_id='fueltrack-plus' and role in ('User','Pump Attendant','Admin')) or
    (module_id='tradelink' and role in ('User','Sales Supervisor','General Manager'))
  )
);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at before update on public.profiles
for each row execute function public.touch_updated_at();

drop trigger if exists module_roles_touch_updated_at on public.module_role_assignments;
create trigger module_roles_touch_updated_at before update on public.module_role_assignments
for each row execute function public.touch_updated_at();

create or replace function public.is_platform_admin(check_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from public.profiles
    where id=check_user and platform_role='admin_general_manager' and status='active'
  );
$$;

-- The platform role is authoritative. Module roles are derived centrally so identity and
-- authorization propagate consistently into isolated application runtimes.
create or replace function public.sync_module_roles(p_user_id uuid, p_platform_role text, p_assigned_by uuid default null)
returns void language plpgsql security definer set search_path=public as $$
begin
  if p_platform_role not in ('admin_general_manager','hr','supervisor','employee') then
    raise exception 'Unsupported Work Management role';
  end if;

  insert into public.module_role_assignments(user_id,module_id,role,enabled,assigned_by) values
    (p_user_id,'time-tracker',case p_platform_role
      when 'admin_general_manager' then 'System Admin'
      when 'hr' then 'HR'
      when 'supervisor' then 'Supervisor'
      else 'Employee' end,true,p_assigned_by),
    (p_user_id,'fueltrack-plus',case p_platform_role
      when 'admin_general_manager' then 'Admin'
      else 'User' end,true,p_assigned_by),
    (p_user_id,'tradelink',case p_platform_role
      when 'admin_general_manager' then 'General Manager'
      when 'supervisor' then 'Sales Supervisor'
      else 'User' end,true,p_assigned_by)
  on conflict (user_id,module_id) do update set
    role=excluded.role,
    enabled=true,
    assigned_by=excluded.assigned_by,
    updated_at=now();
end;
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  initial_role text := case
    when lower(coalesce(new.email,''))='lmsenagan@watchdogautomation.com.ph' then 'admin_general_manager'
    else 'employee'
  end;
begin
  insert into public.profiles(id,email,display_name,platform_role,status)
  values(
    new.id,
    lower(coalesce(new.email,'')),
    coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'),''), split_part(coalesce(new.email,''),'@',1)),
    initial_role,
    'active'
  )
  on conflict (id) do update set
    email=excluded.email,
    display_name=coalesce(nullif(public.profiles.display_name,''), excluded.display_name),
    platform_role=case when lower(excluded.email)='lmsenagan@watchdogautomation.com.ph' then 'admin_general_manager' else public.profiles.platform_role end;

  perform public.sync_module_roles(new.id, initial_role, null);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- Ensure the known first account is bootstrapped server-side even on an existing database.
update public.profiles
set platform_role='admin_general_manager', status='active'
where lower(email)='lmsenagan@watchdogautomation.com.ph';

do $$
declare r record;
begin
  for r in select id, platform_role from public.profiles loop
    perform public.sync_module_roles(r.id, r.platform_role, null);
  end loop;
end $$;

-- Limited self-service profile mutation. The function deliberately exposes only display_name.
create or replace function public.update_own_profile(p_display_name text)
returns setof public.profiles
language plpgsql
security definer
set search_path=public
as $$
declare
  clean_name text := regexp_replace(trim(coalesce(p_display_name,'')), '\\s+', ' ', 'g');
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if char_length(clean_name) < 2 or char_length(clean_name) > 80 then
    raise exception 'Display name must contain between 2 and 80 characters';
  end if;
  return query update public.profiles set display_name=clean_name
    where id=auth.uid() and status='active' returning *;
end;
$$;

-- Administrative directory is exposed through an RPC rather than unrestricted client queries.
create or replace function public.list_user_directory()
returns table(
  id uuid, email text, display_name text, platform_role text, status text,
  created_at timestamptz, updated_at timestamptz
)
language plpgsql security definer set search_path=public as $$
begin
  if not public.is_platform_admin() then raise exception 'Administrator access required'; end if;
  return query select p.id,p.email,p.display_name,p.platform_role,p.status,p.created_at,p.updated_at
    from public.profiles p order by lower(coalesce(p.display_name,p.email)), lower(p.email);
end;
$$;

-- Server-enforced role/status administration with bootstrap and last-admin safeguards.
create or replace function public.admin_set_user_access(p_user_id uuid, p_platform_role text, p_status text)
returns setof public.profiles
language plpgsql security definer set search_path=public as $$
declare
  target public.profiles%rowtype;
  active_admins integer;
begin
  if not public.is_platform_admin() then raise exception 'Administrator access required'; end if;
  if p_platform_role not in ('admin_general_manager','hr','supervisor','employee') then raise exception 'Unsupported role'; end if;
  if p_status not in ('active','disabled') then raise exception 'Unsupported account status'; end if;

  select * into target from public.profiles where id=p_user_id for update;
  if not found then raise exception 'User account not found'; end if;

  if lower(target.email)='lmsenagan@watchdogautomation.com.ph'
     and (p_platform_role <> 'admin_general_manager' or p_status <> 'active') then
    raise exception 'The bootstrap administrator cannot be demoted or disabled';
  end if;

  if p_user_id=auth.uid() and p_status='disabled' then
    raise exception 'You cannot disable your own active administrator account';
  end if;

  if target.platform_role='admin_general_manager' and target.status='active'
     and (p_platform_role <> 'admin_general_manager' or p_status <> 'active') then
    select count(*) into active_admins from public.profiles
      where platform_role='admin_general_manager' and status='active';
    if active_admins <= 1 then raise exception 'At least one active Admin/General Manager is required'; end if;
  end if;

  update public.profiles set platform_role=p_platform_role,status=p_status where id=p_user_id;
  perform public.sync_module_roles(p_user_id,p_platform_role,auth.uid());
  return query select * from public.profiles where id=p_user_id;
end;
$$;

revoke all on function public.update_own_profile(text) from public;
revoke all on function public.sync_module_roles(uuid,text,uuid) from public;
revoke all on function public.list_user_directory() from public;
revoke all on function public.admin_set_user_access(uuid,text,text) from public;
grant execute on function public.update_own_profile(text) to authenticated;
grant execute on function public.list_user_directory() to authenticated;
grant execute on function public.admin_set_user_access(uuid,text,text) to authenticated;

alter table public.profiles enable row level security;
alter table public.module_role_assignments enable row level security;

revoke all on public.profiles from anon;
revoke all on public.module_role_assignments from anon;
grant select on public.profiles to authenticated;
grant select on public.module_role_assignments to authenticated;
grant insert,update,delete on public.module_role_assignments to authenticated;
grant update on public.profiles to authenticated;

drop policy if exists "profiles_self_or_admin_select" on public.profiles;
drop policy if exists "profiles_admin_update" on public.profiles;
drop policy if exists "assignments_self_or_admin_select" on public.module_role_assignments;
drop policy if exists "assignments_admin_insert" on public.module_role_assignments;
drop policy if exists "assignments_admin_update" on public.module_role_assignments;
drop policy if exists "assignments_admin_delete" on public.module_role_assignments;

create policy "profiles_self_or_admin_select" on public.profiles for select to authenticated
using (id=auth.uid() or public.is_platform_admin());
create policy "profiles_admin_update" on public.profiles for update to authenticated
using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "assignments_self_or_admin_select" on public.module_role_assignments for select to authenticated
using (user_id=auth.uid() or public.is_platform_admin());
create policy "assignments_admin_insert" on public.module_role_assignments for insert to authenticated
with check (public.is_platform_admin());
create policy "assignments_admin_update" on public.module_role_assignments for update to authenticated
using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "assignments_admin_delete" on public.module_role_assignments for delete to authenticated
using (public.is_platform_admin());


-- v1.16.0 bootstrap reconciliation. This is intentionally callable by authenticated
-- clients, but it can only promote the caller when the caller's own persisted email
-- matches the fixed bootstrap administrator identity. No arbitrary role value is accepted.
create or replace function public.claim_bootstrap_admin()
returns setof public.profiles
language plpgsql security definer set search_path=public as $$
declare
  caller uuid := auth.uid();
  target public.profiles%rowtype;
begin
  if caller is null then raise exception 'Authentication required'; end if;
  select * into target from public.profiles where id=caller for update;
  if not found then raise exception 'User profile not found'; end if;
  if lower(coalesce(target.email,'')) <> 'lmsenagan@watchdogautomation.com.ph' then
    raise exception 'Bootstrap administrator reconciliation is not permitted for this account';
  end if;
  update public.profiles
     set platform_role='admin_general_manager', status='active'
   where id=caller;
  perform public.sync_module_roles(caller,'admin_general_manager',caller);
  return query select * from public.profiles where id=caller;
end;
$$;

revoke all on function public.claim_bootstrap_admin() from public;
grant execute on function public.claim_bootstrap_admin() to authenticated;

-- v1.16.0 authenticated module cloud state -----------------------------------
create table if not exists public.module_state_entries (
  module_id text not null,
  state_key text not null,
  scope text not null check (scope in ('shared','user')),
  owner_key text not null,
  value text not null,
  revision bigint not null default 1,
  updated_by uuid,
  updated_at timestamptz not null default now(),
  primary key (module_id, state_key, scope, owner_key)
);
create index if not exists module_state_entries_module_idx on public.module_state_entries(module_id, updated_at desc);
alter table public.module_state_entries enable row level security;
revoke all on public.module_state_entries from anon, authenticated;

create or replace function public.has_module_access(p_module_id text, p_user_id uuid default auth.uid()) returns boolean
language sql stable security definer set search_path=public as $$
select p_user_id is not null and (public.is_platform_admin(p_user_id) or exists(select 1 from public.module_role_assignments m where m.user_id=p_user_id and m.module_id=p_module_id and m.enabled=true));
$$;
create or replace function public.module_state_key_allowed(p_module_id text,p_state_key text) returns boolean
language sql immutable as $$ select case p_module_id when 'time-tracker' then p_state_key ~ '^timetracker\.' when 'fueltrack-plus' then p_state_key ~ '^fueltrackplus\.' when 'tradelink' then p_state_key ~ '^tradelink_' else false end; $$;
create or replace function public.list_module_state(p_module_id text)
returns table(state_key text,value text,scope text,revision bigint,updated_at timestamptz)
language plpgsql security definer set search_path=public as $$
declare caller uuid:=auth.uid(); begin
if caller is null then raise exception 'authentication required' using errcode='42501'; end if;
if not public.has_module_access(p_module_id,caller) then raise exception 'module access denied' using errcode='42501'; end if;
return query select e.state_key,e.value,e.scope,e.revision,e.updated_at from public.module_state_entries e where e.module_id=p_module_id and (e.scope='shared' or (e.scope='user' and e.owner_key=caller::text));
end; $$;
create or replace function public.put_module_state(p_module_id text,p_state_key text,p_value text,p_scope text default 'shared')
returns table(state_key text,revision bigint,updated_at timestamptz)
language plpgsql security definer set search_path=public as $$
declare caller uuid:=auth.uid(); owner text; begin
if caller is null then raise exception 'authentication required' using errcode='42501'; end if;
if not public.has_module_access(p_module_id,caller) then raise exception 'module access denied' using errcode='42501'; end if;
if p_scope not in ('shared','user') then raise exception 'invalid state scope'; end if;
if not public.module_state_key_allowed(p_module_id,p_state_key) then raise exception 'state key is not valid for module'; end if;
if p_value is null or octet_length(p_value)>26214400 then raise exception 'state value is empty or exceeds 25 MB'; end if;
owner:=case when p_scope='user' then caller::text else '*' end;
insert into public.module_state_entries(module_id,state_key,scope,owner_key,value,revision,updated_by,updated_at) values(p_module_id,p_state_key,p_scope,owner,p_value,1,caller,now())
on conflict(module_id,state_key,scope,owner_key) do update set value=excluded.value,revision=public.module_state_entries.revision+1,updated_by=caller,updated_at=now();
return query select e.state_key,e.revision,e.updated_at from public.module_state_entries e where e.module_id=p_module_id and e.state_key=p_state_key and e.scope=p_scope and e.owner_key=owner;
end; $$;
create or replace function public.delete_module_state(p_module_id text,p_state_key text,p_scope text default 'shared') returns boolean
language plpgsql security definer set search_path=public as $$
declare caller uuid:=auth.uid(); owner text; affected integer; begin
if caller is null then raise exception 'authentication required' using errcode='42501'; end if;
if not public.has_module_access(p_module_id,caller) then raise exception 'module access denied' using errcode='42501'; end if;
if p_scope not in ('shared','user') then raise exception 'invalid state scope'; end if;
if not public.module_state_key_allowed(p_module_id,p_state_key) then raise exception 'state key is not valid for module'; end if;
owner:=case when p_scope='user' then caller::text else '*' end;
delete from public.module_state_entries where module_id=p_module_id and state_key=p_state_key and scope=p_scope and owner_key=owner;
get diagnostics affected=row_count; return affected>0;
end; $$;
revoke all on function public.has_module_access(text,uuid) from public;
revoke all on function public.list_module_state(text) from public;
revoke all on function public.put_module_state(text,text,text,text) from public;
revoke all on function public.delete_module_state(text,text,text) from public;
grant execute on function public.has_module_access(text,uuid) to authenticated;
grant execute on function public.list_module_state(text) to authenticated;
grant execute on function public.put_module_state(text,text,text,text) to authenticated;
grant execute on function public.delete_module_state(text,text,text) to authenticated;
-- Work Management v1.16.0
-- Shared, account-aware module state with conflict detection and corrected RPC SQL.
-- Run after v1.15.0-cloud-module-state.sql. Safe to re-run.

create extension if not exists pgcrypto;

create table if not exists public.workspaces (
  id uuid primary key,
  name text not null,
  created_at timestamptz not null default now()
);

insert into public.workspaces(id,name)
values ('00000000-0000-4000-8000-000000000001','Work Management')
on conflict (id) do nothing;

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (workspace_id,user_id)
);

insert into public.workspace_members(workspace_id,user_id,active)
select '00000000-0000-4000-8000-000000000001', p.id, true from public.profiles p
on conflict (workspace_id,user_id) do update set active=true;

create or replace function public.ensure_default_workspace_membership()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.workspace_members(workspace_id,user_id,active)
  values('00000000-0000-4000-8000-000000000001',new.id,true)
  on conflict(workspace_id,user_id) do update set active=true;
  return new;
end;
$$;
drop trigger if exists profiles_default_workspace_membership on public.profiles;
create trigger profiles_default_workspace_membership
after insert on public.profiles for each row execute function public.ensure_default_workspace_membership();

alter table public.module_state_entries
  add column if not exists workspace_id uuid references public.workspaces(id);
update public.module_state_entries
set workspace_id='00000000-0000-4000-8000-000000000001'
where workspace_id is null;
alter table public.module_state_entries alter column workspace_id set default '00000000-0000-4000-8000-000000000001';
alter table public.module_state_entries alter column workspace_id set not null;

-- Replace the legacy primary key with a workspace-aware key.
do $$
declare pk_name text;
begin
  select c.conname into pk_name
  from pg_constraint c
  where c.conrelid='public.module_state_entries'::regclass and c.contype='p';
  if pk_name is not null then execute format('alter table public.module_state_entries drop constraint %I', pk_name); end if;
exception when undefined_table then null;
end $$;
alter table public.module_state_entries
  add constraint module_state_entries_pkey primary key (workspace_id,module_id,state_key,scope,owner_key);

create index if not exists module_state_entries_workspace_module_idx
  on public.module_state_entries(workspace_id,module_id,updated_at desc);

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
revoke all on public.workspaces from anon, authenticated;
revoke all on public.workspace_members from anon, authenticated;
revoke all on public.module_state_entries from anon, authenticated;

create or replace function public.current_workspace_id(p_user_id uuid default auth.uid())
returns uuid language sql stable security definer set search_path=public as $$
  select wm.workspace_id
  from public.workspace_members wm
  join public.profiles p on p.id=wm.user_id
  where wm.user_id=p_user_id and wm.active=true and p.status='active'
  order by wm.created_at asc limit 1;
$$;

create or replace function public.has_module_access(p_module_id text, p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path=public as $$
  select p_user_id is not null
    and public.current_workspace_id(p_user_id) is not null
    and exists(select 1 from public.profiles p where p.id=p_user_id and p.status='active')
    and (
      public.is_platform_admin(p_user_id)
      or exists (
        select 1 from public.module_role_assignments m
        where m.user_id=p_user_id and m.module_id=p_module_id and m.enabled=true
      )
    );
$$;

create or replace function public.module_role_for(p_module_id text, p_user_id uuid default auth.uid())
returns text language sql stable security definer set search_path=public as $$
  select case when public.is_platform_admin(p_user_id) then
    case p_module_id when 'time-tracker' then 'System Admin' when 'fueltrack-plus' then 'Admin' when 'tradelink' then 'General Manager' else 'Admin' end
  else (select m.role from public.module_role_assignments m where m.user_id=p_user_id and m.module_id=p_module_id and m.enabled=true)
  end;
$$;

create or replace function public.module_state_delete_allowed(p_module_id text,p_scope text,p_user_id uuid default auth.uid())
returns boolean language plpgsql stable security definer set search_path=public as $$
declare r text:=public.module_role_for(p_module_id,p_user_id);
begin
  if p_scope='user' then return public.has_module_access(p_module_id,p_user_id); end if;
  return case p_module_id
    when 'time-tracker' then r in ('System Admin','IT Administrator','HR')
    when 'fueltrack-plus' then r='Admin'
    when 'tradelink' then r='General Manager'
    else false end;
end;
$$;

create or replace function public.module_state_key_allowed(p_module_id text, p_state_key text)
returns boolean language sql immutable as $$
  select case p_module_id
    when 'time-tracker' then p_state_key ~ '^timetracker\\.'
    when 'fueltrack-plus' then p_state_key ~ '^fueltrackplus\\.'
    when 'tradelink' then p_state_key ~ '^tradelink_'
    else false end;
$$;

-- Central authorization for sensitive module state. Operational users may write workflow data,
-- while role directories and privileged configuration remain server-controlled.
create or replace function public.module_state_write_allowed(p_module_id text, p_state_key text, p_user_id uuid default auth.uid())
returns boolean language plpgsql stable security definer set search_path=public as $$
declare r text := public.module_role_for(p_module_id,p_user_id);
begin
  if not public.has_module_access(p_module_id,p_user_id) then return false; end if;
  if p_module_id='time-tracker' and p_state_key in ('timetracker.rbac.v1','timetracker.rbac.v1.backup') then
    return r in ('System Admin','IT Administrator','HR');
  end if;
  if p_module_id='fueltrack-plus' and p_state_key='fueltrackplus.userroles.v3' then return r='Admin'; end if;
  return true;
end;
$$;

-- Account-aware directory for integrated modules. Least-privilege roles receive self only;
-- supervisory roles receive the active workspace directory needed for authorized team/org views.
create or replace function public.list_module_directory(p_module_id text)
returns table(id uuid,email text,display_name text,platform_role text,module_role text,status text)
language plpgsql security definer set search_path=public as $$
declare
  caller uuid := auth.uid();
  caller_role text;
  ws uuid;
  broad boolean := false;
begin
  if caller is null then raise exception 'authentication required' using errcode='42501'; end if;
  if not public.has_module_access(p_module_id,caller) then raise exception 'module access denied' using errcode='42501'; end if;
  ws := public.current_workspace_id(caller);
  caller_role := public.module_role_for(p_module_id,caller);
  broad := case p_module_id
    when 'time-tracker' then caller_role in ('System Admin','IT Administrator','HR','Supervisor','Finance')
    when 'fueltrack-plus' then caller_role='Admin'
    when 'tradelink' then caller_role in ('General Manager','Sales Supervisor')
    else false end;
  return query
    select p.id,p.email,p.display_name,p.platform_role,
      public.module_role_for(p_module_id,p.id),p.status
    from public.profiles p
    join public.workspace_members wm on wm.user_id=p.id and wm.workspace_id=ws and wm.active=true
    where p.status='active' and (broad or p.id=caller)
      and public.has_module_access(p_module_id,p.id)
    order by lower(coalesce(p.display_name,p.email)),lower(p.email);
end;
$$;


create or replace function public.module_state_visible_value(
  p_module_id text,p_state_key text,p_value text,p_user_id uuid default auth.uid()
)
returns text language plpgsql stable security definer set search_path=public as $$
declare
  r text := public.module_role_for(p_module_id,p_user_id);
  actor_id text := 'cloud:'||p_user_id::text;
  actor_email text;
  actor_name text;
  j jsonb;
begin
  if p_value is null then return p_value; end if;
  select lower(p.email),coalesce(p.display_name,p.email) into actor_email,actor_name from public.profiles p where p.id=p_user_id;
  begin j:=p_value::jsonb; exception when others then return p_value; end;

  if p_module_id='time-tracker' then
    if p_state_key in ('timetracker.rbac.v1','timetracker.rbac.v1.backup') then return null; end if;
    if p_state_key in ('timetracker.attendance.v1','timetracker.attendance.v1.backup') and r in ('Employee','OJT') then
      return jsonb_set(j,'{records}',coalesce((select jsonb_agg(x) from jsonb_array_elements(coalesce(j->'records','[]'::jsonb)) x where x->>'ownerId'=actor_id),'[]'::jsonb),true)::text;
    end if;
    if p_state_key in ('timetracker.ot.v1','timetracker.ot.v1.backup') and r in ('Employee','OJT') then
      return jsonb_set(j,'{requests}',coalesce((select jsonb_agg(x) from jsonb_array_elements(coalesce(j->'requests','[]'::jsonb)) x where x->>'ownerId'=actor_id),'[]'::jsonb),true)::text;
    end if;
    if p_state_key in ('timetracker.audit.v1','timetracker.audit.v1.backup','timetracker.ot.activity.v1','timetracker.ot.activity.v1.backup') and r in ('Employee','OJT') then
      return coalesce((select jsonb_agg(x) from jsonb_array_elements(coalesce(j,'[]'::jsonb)) x where coalesce(x->>'ownerId',x->>'actorId')=actor_id),'[]'::jsonb)::text;
    end if;
  elsif p_module_id='fueltrack-plus' then
    if p_state_key='fueltrackplus.userroles.v3' then return null; end if;
    if p_state_key='fueltrackplus.activity.v3' and r<>'Admin' then return '[]'; end if;
    if p_state_key='fueltrackplus.requests.v3' and r='User' then
      return coalesce((select jsonb_agg(x) from jsonb_array_elements(coalesce(j,'[]'::jsonb)) x
        where x->>'createdByUserId'=p_user_id::text
           or (coalesce(x->>'createdByUserId','')='' and lower(coalesce(x->>'createdBy','')) in (actor_email,lower(actor_name)))),'[]'::jsonb)::text;
    end if;
    if p_state_key='fueltrackplus.inventory.v3' and r='User' then return '[]'; end if;
  end if;
  return p_value;
end;
$$;

create or replace function public.json_collection_foreign_unchanged(
  p_old jsonb,p_new jsonb,p_collection_key text,p_owner_field text,p_owner_value text
)
returns boolean language plpgsql immutable as $$
declare oldarr jsonb; newarr jsonb; oldforeign jsonb; newforeign jsonb;
begin
  oldarr:=case when p_collection_key='' then coalesce(p_old,'[]'::jsonb) else coalesce(p_old->p_collection_key,'[]'::jsonb) end;
  newarr:=case when p_collection_key='' then coalesce(p_new,'[]'::jsonb) else coalesce(p_new->p_collection_key,'[]'::jsonb) end;
  if jsonb_typeof(oldarr)<>'array' or jsonb_typeof(newarr)<>'array' then return false; end if;
  select coalesce(jsonb_agg(x order by coalesce(x->>'id',x::text)),'[]'::jsonb) into oldforeign from jsonb_array_elements(oldarr) x where coalesce(x->>p_owner_field,'')<>p_owner_value;
  select coalesce(jsonb_agg(x order by coalesce(x->>'id',x::text)),'[]'::jsonb) into newforeign from jsonb_array_elements(newarr) x where coalesce(x->>p_owner_field,'')<>p_owner_value;
  return oldforeign=newforeign;
end;
$$;


create or replace function public.module_state_merge_authorized_payload(
  p_module_id text,p_state_key text,p_old_value text,p_new_value text,p_user_id uuid default auth.uid()
)
returns text language plpgsql stable security definer set search_path=public as $$
declare
  r text:=public.module_role_for(p_module_id,p_user_id);
  oldj jsonb; newj jsonb; merged jsonb;
  actor_id text:='cloud:'||p_user_id::text;
begin
  if p_old_value is null then return p_new_value; end if;
  begin oldj:=p_old_value::jsonb; newj:=p_new_value::jsonb; exception when others then return p_new_value; end;

  if p_module_id='time-tracker' then
    if p_state_key in ('timetracker.attendance.v1','timetracker.attendance.v1.backup') and r in ('Employee','OJT','Supervisor','Finance') then
      merged:=jsonb_set(newj,'{records}',
        coalesce((select jsonb_agg(x) from jsonb_array_elements(coalesce(oldj->'records','[]'::jsonb)) x where coalesce(x->>'ownerId','')<>actor_id),'[]'::jsonb)
        || coalesce(newj->'records','[]'::jsonb),true);
      return merged::text;
    end if;
    if p_state_key in ('timetracker.ot.v1','timetracker.ot.v1.backup') and r in ('Employee','OJT') then
      merged:=jsonb_set(newj,'{requests}',
        coalesce((select jsonb_agg(x) from jsonb_array_elements(coalesce(oldj->'requests','[]'::jsonb)) x where coalesce(x->>'ownerId','')<>actor_id),'[]'::jsonb)
        || coalesce(newj->'requests','[]'::jsonb),true);
      return merged::text;
    end if;
    if p_state_key in ('timetracker.audit.v1','timetracker.audit.v1.backup','timetracker.ot.activity.v1','timetracker.ot.activity.v1.backup') and r in ('Employee','OJT') then
      return (
        coalesce((select jsonb_agg(x) from jsonb_array_elements(coalesce(oldj,'[]'::jsonb)) x where coalesce(x->>'ownerId',x->>'actorId','')<>actor_id),'[]'::jsonb)
        || coalesce(newj,'[]'::jsonb)
      )::text;
    end if;
  elsif p_module_id='fueltrack-plus' then
    if p_state_key='fueltrackplus.requests.v3' and r='User' then
      return (
        coalesce((select jsonb_agg(x) from jsonb_array_elements(coalesce(oldj,'[]'::jsonb)) x where coalesce(x->>'createdByUserId','')<>p_user_id::text),'[]'::jsonb)
        || coalesce(newj,'[]'::jsonb)
      )::text;
    end if;
    if p_state_key='fueltrackplus.activity.v3' and r<>'Admin' then
      -- Activity is append-oriented. Keep the authoritative history and add only previously unseen event IDs.
      return (
        coalesce(oldj,'[]'::jsonb) ||
        coalesce((select jsonb_agg(x) from jsonb_array_elements(coalesce(newj,'[]'::jsonb)) x
          where not exists(select 1 from jsonb_array_elements(coalesce(oldj,'[]'::jsonb)) o where o->>'id'=x->>'id')),'[]'::jsonb)
      )::text;
    end if;
  end if;
  return p_new_value;
end;
$$;

create or replace function public.module_state_payload_allowed(
  p_module_id text,p_state_key text,p_old_value text,p_new_value text,p_user_id uuid default auth.uid()
)
returns boolean language plpgsql stable security definer set search_path=public as $$
declare
  r text:=public.module_role_for(p_module_id,p_user_id);
  oldj jsonb; newj jsonb;
  actor_id text:='cloud:'||p_user_id::text;
begin
  if p_old_value is null then p_old_value := case when p_module_id='time-tracker' then '{}' else '[]' end; end if;
  begin oldj:=p_old_value::jsonb; newj:=p_new_value::jsonb; exception when others then return true; end;
  if p_module_id='time-tracker' then
    if p_state_key in ('timetracker.attendance.v1','timetracker.attendance.v1.backup') and r not in ('System Admin','IT Administrator','HR') then
      return public.json_collection_foreign_unchanged(oldj,newj,'records','ownerId',actor_id);
    end if;
    if p_state_key in ('timetracker.ot.v1','timetracker.ot.v1.backup') and r in ('Employee','OJT') then
      return public.json_collection_foreign_unchanged(oldj,newj,'requests','ownerId',actor_id);
    end if;
  elsif p_module_id='fueltrack-plus' then
    if p_state_key='fueltrackplus.requests.v3' and r='User' then
      return public.json_collection_foreign_unchanged(oldj,newj,'','createdByUserId',p_user_id::text);
    end if;
    if p_state_key='fueltrackplus.inventory.v3' and r='User' then return false; end if;
    if p_state_key='fueltrackplus.activity.v3' and r<>'Admin' then return true; end if;
  end if;
  return true;
end;
$$;

create or replace function public.list_module_state(p_module_id text)
returns table(state_key text,value text,scope text,revision bigint,updated_at timestamptz)
language plpgsql security definer set search_path=public as $$
declare caller uuid := auth.uid(); ws uuid;
begin
  if caller is null then raise exception 'authentication required' using errcode='42501'; end if;
  if not public.has_module_access(p_module_id,caller) then raise exception 'module access denied' using errcode='42501'; end if;
  ws := public.current_workspace_id(caller);
  return query
    select e.state_key,public.module_state_visible_value(p_module_id,e.state_key,e.value,caller),e.scope,e.revision,e.updated_at
    from public.module_state_entries e
    where e.workspace_id=ws and e.module_id=p_module_id
      and (e.scope='shared' or (e.scope='user' and e.owner_key=caller::text))
      and public.module_state_visible_value(p_module_id,e.state_key,e.value,caller) is not null
    order by e.state_key,e.scope;
end;
$$;

-- Drop the legacy 4-argument function first. Its RETURNS TABLE output parameter `state_key`
-- collided with the unqualified ON CONFLICT target and caused SQLSTATE 42702/ambiguous-column failures.
drop function if exists public.put_module_state(text,text,text,text);
create or replace function public.put_module_state(
  p_module_id text,
  p_state_key text,
  p_value text,
  p_scope text default 'shared',
  p_expected_revision bigint default null
)
returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  caller uuid := auth.uid();
  ws uuid;
  owner text;
  current_revision bigint;
  current_value text;
  effective_value text;
  result_revision bigint;
  result_updated_at timestamptz;
begin
  if caller is null then raise exception 'authentication required' using errcode='42501'; end if;
  if not public.has_module_access(p_module_id,caller) then raise exception 'module access denied' using errcode='42501'; end if;
  if not public.module_state_write_allowed(p_module_id,p_state_key,caller) then raise exception 'module state write denied' using errcode='42501'; end if;
  if p_scope not in ('shared','user') then raise exception 'invalid state scope' using errcode='22023'; end if;
  if not public.module_state_key_allowed(p_module_id,p_state_key) then raise exception 'state key is not valid for module' using errcode='22023'; end if;
  if p_value is null or octet_length(p_value)>26214400 then raise exception 'state value is empty or exceeds 25 MB' using errcode='22023'; end if;
  ws := public.current_workspace_id(caller);
  owner := case when p_scope='user' then caller::text else '*' end;

  select e.revision,e.value into current_revision,current_value
  from public.module_state_entries e
  where e.workspace_id=ws and e.module_id=p_module_id and e.state_key=p_state_key and e.scope=p_scope and e.owner_key=owner
  for update;

  if p_expected_revision is not null and coalesce(current_revision,0)<>p_expected_revision then
    raise exception 'WM_STATE_CONFLICT expected %, current %',p_expected_revision,coalesce(current_revision,0) using errcode='40001';
  end if;
  effective_value:=public.module_state_merge_authorized_payload(p_module_id,p_state_key,current_value,p_value,caller);
  if not public.module_state_payload_allowed(p_module_id,p_state_key,current_value,effective_value,caller) then
    raise exception 'module state payload violates record ownership boundary' using errcode='42501';
  end if;

  insert into public.module_state_entries(workspace_id,module_id,state_key,scope,owner_key,value,revision,updated_by,updated_at)
  values(ws,p_module_id,p_state_key,p_scope,owner,effective_value,1,caller,now())
  on conflict on constraint module_state_entries_pkey
  do update set value=excluded.value,
                revision=public.module_state_entries.revision+1,
                updated_by=caller,
                updated_at=now()
  returning revision,updated_at into result_revision,result_updated_at;

  return jsonb_build_object('state_key',p_state_key,'revision',result_revision,'updated_at',result_updated_at);
end;
$$;

drop function if exists public.delete_module_state(text,text,text);
create or replace function public.delete_module_state(
  p_module_id text,p_state_key text,p_scope text default 'shared',p_expected_revision bigint default null
)
returns boolean language plpgsql security definer set search_path=public as $$
declare caller uuid:=auth.uid(); ws uuid; owner text; current_revision bigint; affected integer;
begin
  if caller is null then raise exception 'authentication required' using errcode='42501'; end if;
  if not public.has_module_access(p_module_id,caller) then raise exception 'module access denied' using errcode='42501'; end if;
  if not public.module_state_write_allowed(p_module_id,p_state_key,caller) then raise exception 'module state write denied' using errcode='42501'; end if;
  if not public.module_state_delete_allowed(p_module_id,p_scope,caller) then raise exception 'module state delete denied' using errcode='42501'; end if;
  if p_scope not in ('shared','user') then raise exception 'invalid state scope' using errcode='22023'; end if;
  if not public.module_state_key_allowed(p_module_id,p_state_key) then raise exception 'state key is not valid for module' using errcode='22023'; end if;
  ws:=public.current_workspace_id(caller);
  owner:=case when p_scope='user' then caller::text else '*' end;
  select e.revision into current_revision from public.module_state_entries e
   where e.workspace_id=ws and e.module_id=p_module_id and e.state_key=p_state_key and e.scope=p_scope and e.owner_key=owner for update;
  if p_expected_revision is not null and coalesce(current_revision,0)<>p_expected_revision then
    raise exception 'WM_STATE_CONFLICT expected %, current %',p_expected_revision,coalesce(current_revision,0) using errcode='40001';
  end if;
  delete from public.module_state_entries e
   where e.workspace_id=ws and e.module_id=p_module_id and e.state_key=p_state_key and e.scope=p_scope and e.owner_key=owner;
  get diagnostics affected=row_count;
  return affected>0;
end;
$$;

revoke all on function public.ensure_default_workspace_membership() from public;
revoke all on function public.current_workspace_id(uuid) from public;
revoke all on function public.module_state_delete_allowed(text,text,uuid) from public;
revoke all on function public.module_state_visible_value(text,text,text,uuid) from public;
revoke all on function public.json_collection_foreign_unchanged(jsonb,jsonb,text,text,text) from public;
revoke all on function public.module_state_merge_authorized_payload(text,text,text,text,uuid) from public;
revoke all on function public.module_state_payload_allowed(text,text,text,text,uuid) from public;
revoke all on function public.has_module_access(text,uuid) from public;
revoke all on function public.module_role_for(text,uuid) from public;
revoke all on function public.module_state_write_allowed(text,text,uuid) from public;
revoke all on function public.list_module_directory(text) from public;
revoke all on function public.list_module_state(text) from public;
revoke all on function public.put_module_state(text,text,text,text,bigint) from public;
revoke all on function public.delete_module_state(text,text,text,bigint) from public;
grant execute on function public.has_module_access(text,uuid) to authenticated;
grant execute on function public.list_module_directory(text) to authenticated;
grant execute on function public.list_module_state(text) to authenticated;
grant execute on function public.put_module_state(text,text,text,text,bigint) to authenticated;
grant execute on function public.delete_module_state(text,text,text,bigint) to authenticated;

-- Work Management v1.17.0 state contract + append-only activity architecture
-- Work Management v1.17.0
-- Durable state-key contract, append-only FuelTrack+ activity stream, and atomic request+activity commits.
-- Run after v1.16.0-shared-data-architecture.sql. Safe to re-run.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1) Server-authoritative state-key contract.
--    This replaces regex-only validation, which rejected valid keys such as
--    timetracker.attendance.v1 in some deployments due to escaping differences.
-- ---------------------------------------------------------------------------
create table if not exists public.module_state_key_policies (
  module_id text not null,
  key_pattern text not null,
  match_type text not null default 'exact' check (match_type in ('exact','prefix')),
  required_scope text not null check (required_scope in ('shared','user')),
  max_bytes integer not null default 26214400 check (max_bytes between 1 and 26214400),
  writable boolean not null default true,
  description text,
  primary key (module_id,key_pattern,match_type)
);

revoke all on public.module_state_key_policies from anon, authenticated;

insert into public.module_state_key_policies(module_id,key_pattern,match_type,required_scope,max_bytes,writable,description) values
  ('time-tracker','timetracker.attendance.v1','exact','shared',26214400,true,'Shared attendance records'),
  ('time-tracker','timetracker.attendance.v1.backup','exact','shared',26214400,true,'Attendance recovery copy'),
  ('time-tracker','timetracker.audit.v1','exact','shared',26214400,true,'Shared attendance audit trail'),
  ('time-tracker','timetracker.audit.v1.backup','exact','shared',26214400,true,'Audit recovery copy'),
  ('time-tracker','timetracker.ot.v1','exact','shared',26214400,true,'Shared overtime requests'),
  ('time-tracker','timetracker.ot.v1.backup','exact','shared',26214400,true,'Overtime recovery copy'),
  ('time-tracker','timetracker.ot.activity.v1','exact','shared',26214400,true,'Overtime activity'),
  ('time-tracker','timetracker.ot.activity.v1.backup','exact','shared',26214400,true,'Overtime activity recovery copy'),
  ('time-tracker','timetracker.rbac.v1','exact','shared',1048576,false,'Legacy RBAC compatibility state; cloud directory is authoritative'),
  ('time-tracker','timetracker.rbac.v1.backup','exact','shared',1048576,false,'Legacy RBAC recovery state'),
  ('time-tracker','timetracker.ui.v1','exact','user',1048576,true,'Per-user TimeTracker UI state'),
  ('time-tracker','timetracker.auto-gps-cache.v1','exact','user',1048576,true,'Per-user short-lived GPS cache'),
  ('time-tracker','timetracker.auto-clockout.lock.v1','exact','user',262144,false,'Obsolete state-shaped lock retained only for migration compatibility'),
  ('time-tracker','timetracker.auto-gps-lock.v1:','prefix','user',262144,false,'Obsolete state-shaped GPS lock retained only for migration compatibility'),

  ('fueltrack-plus','fueltrackplus.requests.v3','exact','shared',26214400,true,'Shared fuel request registry'),
  ('fueltrack-plus','fueltrackplus.activity.v3','exact','shared',26214400,false,'Legacy activity aggregate; append-only activity stream is authoritative'),
  ('fueltrack-plus','fueltrackplus.inventory.v3','exact','shared',26214400,true,'Shared fuel inventory state'),
  ('fueltrack-plus','fueltrackplus.preferences.v3','exact','user',1048576,true,'Per-user FuelTrack+ preferences'),
  ('fueltrack-plus','fueltrackplus.activity.workspace.v1','exact','user',1048576,true,'Per-user FuelTrack+ Activity triage/archive workspace'),
  ('fueltrack-plus','fueltrackplus.userroles.v3','exact','shared',1048576,false,'Legacy role directory; Work Management RBAC is authoritative'),

  ('tradelink','tradelink_state_v1','exact','shared',26214400,true,'Shared TradeLink committed state'),
  ('tradelink','tradelink_state_backup_v1','exact','shared',26214400,true,'Shared TradeLink recovery state'),
  ('tradelink','tradelink_ui_v1','exact','user',1048576,true,'Per-user TradeLink UI state'),
  ('tradelink','tradelink_draft_v1','exact','user',8388608,true,'Per-user TradeLink draft state'),
  ('tradelink','tradelink_vendor_logo_','prefix','shared',8388608,true,'Shared vendor logo asset'),
  ('tradelink','tradelink_vendor_qr_','prefix','shared',8388608,true,'Shared vendor QR asset')
on conflict (module_id,key_pattern,match_type) do update set
  required_scope=excluded.required_scope,
  max_bytes=excluded.max_bytes,
  writable=excluded.writable,
  description=excluded.description;

-- PostgreSQL does not permit output-column aliases in the desired overloaded helper
-- above without ambiguity. Replace it with a PL/pgSQL implementation using explicit aliases.
create or replace function public.module_state_policy(p_module_id text,p_state_key text)
returns table(required_scope text,max_bytes integer,writable boolean)
language plpgsql stable security definer set search_path=public as $$
begin
  return query
    select pol.required_scope,pol.max_bytes,pol.writable
    from public.module_state_key_policies pol
    where pol.module_id=p_module_id
      and (
        (pol.match_type='exact' and pol.key_pattern=p_state_key)
        or (pol.match_type='prefix' and left(p_state_key,length(pol.key_pattern))=pol.key_pattern)
      )
    order by case when pol.match_type='exact' then 0 else 1 end, length(pol.key_pattern) desc
    limit 1;
end;
$$;

create or replace function public.module_state_key_allowed(p_module_id text,p_state_key text)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.module_state_policy(p_module_id,p_state_key));
$$;

create or replace function public.module_state_write_allowed(p_module_id text,p_state_key text,p_user_id uuid default auth.uid())
returns boolean language plpgsql stable security definer set search_path=public as $$
declare r text:=public.module_role_for(p_module_id,p_user_id); pol record;
begin
  if not public.has_module_access(p_module_id,p_user_id) then return false; end if;
  select * into pol from public.module_state_policy(p_module_id,p_state_key);
  if not found or not pol.writable then return false; end if;
  if p_module_id='time-tracker' and p_state_key in ('timetracker.rbac.v1','timetracker.rbac.v1.backup') then return false; end if;
  if p_module_id='fueltrack-plus' and p_state_key in ('fueltrackplus.userroles.v3','fueltrackplus.activity.v3') then return false; end if;
  return true;
end;
$$;

-- Data-shape invariants prevent duplicate record IDs and multiple active attendance
-- sessions for one account from being committed even if a stale or modified client submits them.
create or replace function public.module_state_invariants_valid(p_module_id text,p_state_key text,p_value text)
returns boolean language plpgsql immutable as $$
declare j jsonb; total_count integer; distinct_count integer; invalid_count integer; active_duplicate_count integer;
begin
  begin j:=p_value::jsonb; exception when others then return false; end;
  if p_module_id='time-tracker' and p_state_key in ('timetracker.attendance.v1','timetracker.attendance.v1.backup') then
    if jsonb_typeof(j)<>'object' or jsonb_typeof(coalesce(j->'records','[]'::jsonb))<>'array' then return false; end if;
    select count(*),count(distinct x->>'id'),count(*) filter(where nullif(trim(coalesce(x->>'id','')),'') is null or nullif(trim(coalesce(x->>'ownerId','')),'') is null)
      into total_count,distinct_count,invalid_count from jsonb_array_elements(coalesce(j->'records','[]'::jsonb)) x;
    if total_count<>distinct_count or invalid_count>0 then return false; end if;
    select count(*) into active_duplicate_count from (
      select x->>'ownerId' owner_id from jsonb_array_elements(coalesce(j->'records','[]'::jsonb)) x
      where x->'clockOut' is null or x->'clockOut'='null'::jsonb
      group by x->>'ownerId' having count(*)>1
    ) d;
    return active_duplicate_count=0;
  elsif p_module_id='fueltrack-plus' and p_state_key='fueltrackplus.requests.v3' then
    if jsonb_typeof(j)<>'array' then return false; end if;
    select count(*),count(distinct x->>'id'),count(*) filter(where nullif(trim(coalesce(x->>'id','')),'') is null)
      into total_count,distinct_count,invalid_count from jsonb_array_elements(j) x;
    return total_count=distinct_count and invalid_count=0;
  end if;
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2) Correct state read/write RPCs. Policies also enforce scope and size.
-- ---------------------------------------------------------------------------
create or replace function public.list_module_state(p_module_id text)
returns table(state_key text,value text,scope text,revision bigint,updated_at timestamptz)
language plpgsql security definer set search_path=public as $$
declare caller uuid:=auth.uid(); ws uuid;
begin
  if caller is null then raise exception 'authentication required' using errcode='42501'; end if;
  if not public.has_module_access(p_module_id,caller) then raise exception 'module access denied' using errcode='42501'; end if;
  ws:=public.current_workspace_id(caller);
  return query
    select e.state_key,public.module_state_visible_value(p_module_id,e.state_key,e.value,caller),e.scope,e.revision,e.updated_at
    from public.module_state_entries e
    where e.workspace_id=ws and e.module_id=p_module_id
      and (e.scope='shared' or (e.scope='user' and e.owner_key=caller::text))
      and not (p_module_id='fueltrack-plus' and e.state_key='fueltrackplus.activity.v3')
      and public.module_state_visible_value(p_module_id,e.state_key,e.value,caller) is not null
    order by e.state_key,e.scope;
end;
$$;

create or replace function public.put_module_state(
  p_module_id text,p_state_key text,p_value text,p_scope text default 'shared',p_expected_revision bigint default null
)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  caller uuid:=auth.uid(); ws uuid; owner text; current_revision bigint; current_value text;
  effective_value text; result_revision bigint; result_updated_at timestamptz; pol record;
begin
  if caller is null then raise exception 'authentication required' using errcode='42501'; end if;
  if not public.has_module_access(p_module_id,caller) then raise exception 'module access denied' using errcode='42501'; end if;
  select * into pol from public.module_state_policy(p_module_id,p_state_key);
  if not found then raise exception 'state key is not registered for module' using errcode='22023'; end if;
  if not pol.writable or not public.module_state_write_allowed(p_module_id,p_state_key,caller) then raise exception 'module state write denied' using errcode='42501'; end if;
  if p_scope<>pol.required_scope then raise exception 'state scope mismatch: expected %',pol.required_scope using errcode='22023'; end if;
  if p_value is null or octet_length(p_value)>pol.max_bytes then raise exception 'state value is empty or exceeds policy limit' using errcode='22023'; end if;
  ws:=public.current_workspace_id(caller); owner:=case when p_scope='user' then caller::text else '*' end;

  select e.revision,e.value into current_revision,current_value from public.module_state_entries e
   where e.workspace_id=ws and e.module_id=p_module_id and e.state_key=p_state_key and e.scope=p_scope and e.owner_key=owner for update;
  if p_expected_revision is not null and coalesce(current_revision,0)<>p_expected_revision then
    raise exception 'WM_STATE_CONFLICT expected %, current %',p_expected_revision,coalesce(current_revision,0) using errcode='40001';
  end if;
  effective_value:=public.module_state_merge_authorized_payload(p_module_id,p_state_key,current_value,p_value,caller);
  if not public.module_state_payload_allowed(p_module_id,p_state_key,current_value,effective_value,caller) then
    raise exception 'module state payload violates record ownership boundary' using errcode='42501';
  end if;
  if not public.module_state_invariants_valid(p_module_id,p_state_key,effective_value) then
    raise exception 'module state violates data integrity invariants' using errcode='22023';
  end if;

  insert into public.module_state_entries(workspace_id,module_id,state_key,scope,owner_key,value,revision,updated_by,updated_at)
  values(ws,p_module_id,p_state_key,p_scope,owner,effective_value,1,caller,now())
  on conflict on constraint module_state_entries_pkey do update
    set value=excluded.value,revision=public.module_state_entries.revision+1,updated_by=caller,updated_at=now()
  returning revision,updated_at into result_revision,result_updated_at;
  return jsonb_build_object('state_key',p_state_key,'revision',result_revision,'updated_at',result_updated_at);
end;
$$;

create or replace function public.delete_module_state(
  p_module_id text,p_state_key text,p_scope text default 'shared',p_expected_revision bigint default null
)
returns boolean language plpgsql security definer set search_path=public as $$
declare caller uuid:=auth.uid(); ws uuid; owner text; current_revision bigint; affected integer; pol record;
begin
  if caller is null then raise exception 'authentication required' using errcode='42501'; end if;
  if not public.has_module_access(p_module_id,caller) then raise exception 'module access denied' using errcode='42501'; end if;
  select * into pol from public.module_state_policy(p_module_id,p_state_key);
  if not found then raise exception 'state key is not registered for module' using errcode='22023'; end if;
  if p_scope<>pol.required_scope then raise exception 'state scope mismatch: expected %',pol.required_scope using errcode='22023'; end if;
  if not public.module_state_delete_allowed(p_module_id,p_scope,caller) then raise exception 'module state delete denied' using errcode='42501'; end if;
  ws:=public.current_workspace_id(caller); owner:=case when p_scope='user' then caller::text else '*' end;
  select e.revision into current_revision from public.module_state_entries e
    where e.workspace_id=ws and e.module_id=p_module_id and e.state_key=p_state_key and e.scope=p_scope and e.owner_key=owner for update;
  if p_expected_revision is not null and coalesce(current_revision,0)<>p_expected_revision then
    raise exception 'WM_STATE_CONFLICT expected %, current %',p_expected_revision,coalesce(current_revision,0) using errcode='40001';
  end if;
  delete from public.module_state_entries e where e.workspace_id=ws and e.module_id=p_module_id and e.state_key=p_state_key and e.scope=p_scope and e.owner_key=owner;
  get diagnostics affected=row_count; return affected>0;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3) Distributed operation locks. These coordinate the same account across
--    tabs/devices for operations such as TimeTracker automatic clock-out/GPS.
--    Locks are server-owned, expire automatically, and cannot be stolen early.
-- ---------------------------------------------------------------------------
create table if not exists public.module_operation_locks (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  module_id text not null,
  lock_key text not null,
  token text not null,
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key(workspace_id,module_id,lock_key)
);
create index if not exists module_operation_locks_expiry_idx on public.module_operation_locks(expires_at);
alter table public.module_operation_locks enable row level security;
revoke all on public.module_operation_locks from anon,authenticated;

create or replace function public.acquire_module_operation_lock(p_module_id text,p_lock_key text,p_ttl_seconds integer default 30)
returns text language plpgsql security definer set search_path=public as $$
declare caller uuid:=auth.uid(); ws uuid; generated_token text:=encode(gen_random_bytes(24),'hex'); acquired_token text;
begin
  if caller is null then raise exception 'authentication required' using errcode='42501'; end if;
  if not public.has_module_access(p_module_id,caller) then raise exception 'module access denied' using errcode='42501'; end if;
  if length(trim(coalesce(p_lock_key,'')))<3 or length(p_lock_key)>240 then raise exception 'invalid operation lock key' using errcode='22023'; end if;
  p_ttl_seconds:=greatest(3,least(coalesce(p_ttl_seconds,30),120));
  ws:=public.current_workspace_id(caller);
  insert into public.module_operation_locks as l(workspace_id,module_id,lock_key,token,owner_user_id,expires_at,created_at)
  values(ws,p_module_id,trim(p_lock_key),generated_token,caller,now()+make_interval(secs=>p_ttl_seconds),now())
  on conflict(workspace_id,module_id,lock_key) do update
    set token=excluded.token,owner_user_id=excluded.owner_user_id,expires_at=excluded.expires_at,created_at=now()
    where l.expires_at<=now()
  returning token into acquired_token;
  return acquired_token;
end;
$$;

create or replace function public.release_module_operation_lock(p_module_id text,p_lock_key text,p_token text)
returns boolean language plpgsql security definer set search_path=public as $$
declare caller uuid:=auth.uid(); ws uuid; affected integer;
begin
  if caller is null then raise exception 'authentication required' using errcode='42501'; end if;
  if not public.has_module_access(p_module_id,caller) then raise exception 'module access denied' using errcode='42501'; end if;
  ws:=public.current_workspace_id(caller);
  delete from public.module_operation_locks l
    where l.workspace_id=ws and l.module_id=p_module_id and l.lock_key=trim(p_lock_key)
      and l.owner_user_id=caller and l.token=p_token;
  get diagnostics affected=row_count;
  return affected>0;
end;
$$;

-- Old state-shaped lock keys are obsolete after server operation locks are installed.
delete from public.module_state_entries e
where e.module_id='time-tracker' and (e.state_key='timetracker.auto-clockout.lock.v1' or e.state_key like 'timetracker.auto-gps-lock.v1:%');

-- ---------------------------------------------------------------------------
-- 4) Append-only activity stream. FuelTrack+ Activity is an audit log, not
--    replaceable application state. Actor identity and time are server-derived.
-- ---------------------------------------------------------------------------
create table if not exists public.module_activity_events (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  module_id text not null,
  sequence bigint generated by default as identity,
  event_id text not null,
  event_type text not null,
  title text not null,
  message text not null default '',
  request_id text,
  actor_user_id uuid not null references public.profiles(id),
  actor_email text not null,
  actor_name text not null,
  actor_role text not null,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  primary key(workspace_id,module_id,event_id),
  unique(workspace_id,module_id,sequence)
);
create index if not exists module_activity_events_feed_idx on public.module_activity_events(workspace_id,module_id,sequence desc);
create index if not exists module_activity_events_request_idx on public.module_activity_events(workspace_id,module_id,request_id,sequence desc);
alter table public.module_activity_events enable row level security;
revoke all on public.module_activity_events from anon, authenticated;

create or replace function public.append_module_activity(
  p_module_id text,p_event_id text,p_event_type text,p_title text,p_message text default '',p_request_id text default null,p_payload jsonb default '{}'::jsonb
)
returns jsonb language plpgsql security definer set search_path=public as $$
declare caller uuid:=auth.uid(); ws uuid; prof public.profiles%rowtype; role_name text; evt public.module_activity_events%rowtype;
begin
  if caller is null then raise exception 'authentication required' using errcode='42501'; end if;
  if not public.has_module_access(p_module_id,caller) then raise exception 'module access denied' using errcode='42501'; end if;
  if p_module_id<>'fueltrack-plus' then raise exception 'activity stream is not enabled for module' using errcode='22023'; end if;
  if length(trim(coalesce(p_event_id,'')))<8 or length(p_event_id)>160 then raise exception 'invalid event id' using errcode='22023'; end if;
  if length(trim(coalesce(p_title,'')))<1 or length(p_title)>240 then raise exception 'invalid activity title' using errcode='22023'; end if;
  if length(coalesce(p_message,''))>4000 then raise exception 'activity message is too long' using errcode='22023'; end if;
  if p_event_type not in ('submit','review','issue','system') then raise exception 'invalid activity type' using errcode='22023'; end if;
  ws:=public.current_workspace_id(caller); select * into prof from public.profiles p where p.id=caller and p.status='active';
  role_name:=coalesce(public.module_role_for(p_module_id,caller),'User');
  insert into public.module_activity_events(workspace_id,module_id,event_id,event_type,title,message,request_id,actor_user_id,actor_email,actor_name,actor_role,payload)
  values(ws,p_module_id,p_event_id,p_event_type,trim(p_title),coalesce(p_message,''),nullif(trim(coalesce(p_request_id,'')),''),caller,prof.email,coalesce(prof.display_name,prof.email),role_name,coalesce(p_payload,'{}'::jsonb))
  on conflict(workspace_id,module_id,event_id) do nothing;
  select * into evt from public.module_activity_events e where e.workspace_id=ws and e.module_id=p_module_id and e.event_id=p_event_id;
  return jsonb_build_object('id',evt.event_id,'sequence',evt.sequence,'type',evt.event_type,'title',evt.title,'message',evt.message,'requestId',coalesce(evt.request_id,''),'actor',evt.actor_name,'actorUserId',evt.actor_user_id,'actorEmail',evt.actor_email,'actorRole',evt.actor_role,'at',evt.occurred_at,'payload',evt.payload);
end;
$$;

create or replace function public.list_module_activity(p_module_id text,p_before_sequence bigint default null,p_limit integer default 500)
returns table(event_id text,sequence bigint,event_type text,title text,message text,request_id text,actor_user_id uuid,actor_email text,actor_name text,actor_role text,occurred_at timestamptz,payload jsonb)
language plpgsql security definer set search_path=public as $$
declare caller uuid:=auth.uid(); ws uuid; role_name text;
begin
  if caller is null then raise exception 'authentication required' using errcode='42501'; end if;
  if not public.has_module_access(p_module_id,caller) then raise exception 'module access denied' using errcode='42501'; end if;
  if p_module_id<>'fueltrack-plus' then raise exception 'activity stream is not enabled for module' using errcode='22023'; end if;
  role_name:=public.module_role_for(p_module_id,caller);
  if role_name<>'Admin' then raise exception 'activity access denied' using errcode='42501'; end if;
  ws:=public.current_workspace_id(caller);
  return query select e.event_id,e.sequence,e.event_type,e.title,e.message,e.request_id,e.actor_user_id,e.actor_email,e.actor_name,e.actor_role,e.occurred_at,e.payload
    from public.module_activity_events e
    where e.workspace_id=ws and e.module_id=p_module_id and (p_before_sequence is null or e.sequence<p_before_sequence)
    order by e.sequence desc limit greatest(1,least(coalesce(p_limit,500),2000));
end;
$$;

-- Atomic request-state + activity operation for FuelTrack+.
create or replace function public.commit_fueltrack_requests_with_activity(
  p_value text,p_expected_revision bigint,p_event_id text,p_event_type text,p_title text,p_message text default '',p_request_id text default null,p_payload jsonb default '{}'::jsonb
)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  caller uuid:=auth.uid(); ws uuid; owner text:='*'; current_revision bigint; current_value text; effective_value text;
  result_revision bigint; result_updated_at timestamptz; existing_evt jsonb; activity_evt jsonb; pol record;
begin
  if caller is null then raise exception 'authentication required' using errcode='42501'; end if;
  if not public.has_module_access('fueltrack-plus',caller) then raise exception 'module access denied' using errcode='42501'; end if;
  ws:=public.current_workspace_id(caller);
  select jsonb_build_object('id',e.event_id,'sequence',e.sequence,'type',e.event_type,'title',e.title,'message',e.message,'requestId',coalesce(e.request_id,''),'actor',e.actor_name,'actorUserId',e.actor_user_id,'actorEmail',e.actor_email,'actorRole',e.actor_role,'at',e.occurred_at,'payload',e.payload)
    into existing_evt from public.module_activity_events e where e.workspace_id=ws and e.module_id='fueltrack-plus' and e.event_id=p_event_id;
  if existing_evt is not null then
    select e.revision,e.updated_at into result_revision,result_updated_at from public.module_state_entries e
      where e.workspace_id=ws and e.module_id='fueltrack-plus' and e.state_key='fueltrackplus.requests.v3' and e.scope='shared' and e.owner_key='*';
    return jsonb_build_object('state_key','fueltrackplus.requests.v3','revision',coalesce(result_revision,0),'updated_at',result_updated_at,'activity',existing_evt,'idempotent',true);
  end if;

  select * into pol from public.module_state_policy('fueltrack-plus','fueltrackplus.requests.v3');
  if not found or not pol.writable then raise exception 'request state policy unavailable' using errcode='42501'; end if;
  if p_value is null or octet_length(p_value)>pol.max_bytes then raise exception 'request state exceeds policy limit' using errcode='22023'; end if;

  select e.revision,e.value into current_revision,current_value from public.module_state_entries e
   where e.workspace_id=ws and e.module_id='fueltrack-plus' and e.state_key='fueltrackplus.requests.v3' and e.scope='shared' and e.owner_key=owner for update;
  if coalesce(current_revision,0)<>coalesce(p_expected_revision,0) then
    raise exception 'WM_STATE_CONFLICT expected %, current %',coalesce(p_expected_revision,0),coalesce(current_revision,0) using errcode='40001';
  end if;
  effective_value:=public.module_state_merge_authorized_payload('fueltrack-plus','fueltrackplus.requests.v3',current_value,p_value,caller);
  if not public.module_state_payload_allowed('fueltrack-plus','fueltrackplus.requests.v3',current_value,effective_value,caller) then
    raise exception 'request payload violates record ownership boundary' using errcode='42501';
  end if;
  if not public.module_state_invariants_valid('fueltrack-plus','fueltrackplus.requests.v3',effective_value) then
    raise exception 'request state violates data integrity invariants' using errcode='22023';
  end if;

  insert into public.module_state_entries(workspace_id,module_id,state_key,scope,owner_key,value,revision,updated_by,updated_at)
  values(ws,'fueltrack-plus','fueltrackplus.requests.v3','shared','*',effective_value,1,caller,now())
  on conflict on constraint module_state_entries_pkey do update set value=excluded.value,revision=public.module_state_entries.revision+1,updated_by=caller,updated_at=now()
  returning revision,updated_at into result_revision,result_updated_at;

  activity_evt:=public.append_module_activity('fueltrack-plus',p_event_id,p_event_type,p_title,p_message,p_request_id,p_payload);
  return jsonb_build_object('state_key','fueltrackplus.requests.v3','revision',result_revision,'updated_at',result_updated_at,'activity',activity_evt,'idempotent',false);
end;
$$;

-- Migrate legacy FuelTrack+ aggregate activity into the append-only stream.
do $$
declare rec record; item jsonb; ws uuid; eid text; actor_uuid uuid; prof record;
begin
  for rec in select e.workspace_id,e.value from public.module_state_entries e where e.module_id='fueltrack-plus' and e.state_key='fueltrackplus.activity.v3' loop
    ws:=rec.workspace_id;
    begin
      for item in select * from jsonb_array_elements(coalesce(rec.value::jsonb,'[]'::jsonb)) loop
        eid:=coalesce(nullif(item->>'id',''),'legacy-'||encode(digest(item::text,'sha256'),'hex'));
        begin actor_uuid:=(item->>'actorUserId')::uuid; exception when others then actor_uuid:=null; end;
        if actor_uuid is null or not exists(select 1 from public.profiles p where p.id=actor_uuid) then
          select p.id,p.email,coalesce(p.display_name,p.email) as display_name into prof from public.profiles p join public.workspace_members wm on wm.user_id=p.id and wm.workspace_id=ws where p.status='active' order by public.is_platform_admin(p.id) desc,p.created_at asc limit 1;
          actor_uuid:=prof.id;
        else
          select p.email,coalesce(p.display_name,p.email) as display_name into prof from public.profiles p where p.id=actor_uuid;
        end if;
        if actor_uuid is not null then
          insert into public.module_activity_events(workspace_id,module_id,event_id,event_type,title,message,request_id,actor_user_id,actor_email,actor_name,actor_role,payload,occurred_at)
          values(ws,'fueltrack-plus',eid,case when item->>'type' in ('submit','review','issue','system') then item->>'type' else 'system' end,
            coalesce(nullif(item->>'title',''),'Legacy activity'),coalesce(item->>'message',''),nullif(item->>'requestId',''),actor_uuid,
            coalesce(prof.email,'unknown@local.invalid'),coalesce(item->>'actor',prof.display_name,'Unknown user'),coalesce(item->>'actorRole',public.module_role_for('fueltrack-plus',actor_uuid),'User'),
            jsonb_build_object('migratedFrom','fueltrackplus.activity.v3'),coalesce(nullif(item->>'at','')::timestamptz,now()))
          on conflict(workspace_id,module_id,event_id) do nothing;
        end if;
      end loop;
    exception when others then
      raise notice 'FuelTrack+ legacy activity migration skipped for workspace %: %',ws,sqlerrm;
    end;
  end loop;
end $$;

-- Admin-only import used by Workspace Backup recovery. Imported events keep their
-- original display metadata and timestamp, while the importing authenticated Admin
-- is recorded in payload metadata for provenance. Event IDs make re-import idempotent.
create or replace function public.import_fueltrack_activity_backup(p_events jsonb)
returns integer language plpgsql security definer set search_path=public as $$
declare caller uuid:=auth.uid(); ws uuid; role_name text; item jsonb; eid text; at_time timestamptz; inserted_count integer:=0; prof public.profiles%rowtype;
begin
  if caller is null then raise exception 'authentication required' using errcode='42501'; end if;
  if public.module_role_for('fueltrack-plus',caller)<>'Admin' then raise exception 'activity import requires FuelTrack+ Admin' using errcode='42501'; end if;
  if p_events is null or jsonb_typeof(p_events)<>'array' then raise exception 'activity import payload must be an array' using errcode='22023'; end if;
  if jsonb_array_length(p_events)>10000 then raise exception 'activity import exceeds 10000 events' using errcode='22023'; end if;
  ws:=public.current_workspace_id(caller); select * into prof from public.profiles p where p.id=caller;
  for item in select * from jsonb_array_elements(p_events) loop
    eid:=coalesce(nullif(item->>'id',''),'backup-'||encode(digest(item::text,'sha256'),'hex'));
    begin at_time:=coalesce(nullif(item->>'at','')::timestamptz,now()); exception when others then at_time:=now(); end;
    insert into public.module_activity_events(workspace_id,module_id,event_id,event_type,title,message,request_id,actor_user_id,actor_email,actor_name,actor_role,payload,occurred_at)
    values(ws,'fueltrack-plus',eid,
      case when item->>'type' in ('submit','review','issue','system') then item->>'type' else 'system' end,
      left(coalesce(nullif(item->>'title',''),'Imported activity'),240),left(coalesce(item->>'message',''),4000),nullif(item->>'requestId',''),caller,
      coalesce(nullif(item->>'actorEmail',''),prof.email),coalesce(nullif(item->>'actor',''),prof.display_name,prof.email),coalesce(nullif(item->>'actorRole',''),'Imported'),
      coalesce(item->'payload','{}'::jsonb)||jsonb_build_object('backupImported',true,'importedBy',caller,'originalActorUserId',item->>'actorUserId'),at_time)
    on conflict(workspace_id,module_id,event_id) do nothing;
    if found then inserted_count:=inserted_count+1; end if;
  end loop;
  return inserted_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5) Privileges.
-- ---------------------------------------------------------------------------
revoke all on function public.module_state_policy(text,text) from public;
revoke all on function public.module_state_key_allowed(text,text) from public;
revoke all on function public.module_state_write_allowed(text,text,uuid) from public;
revoke all on function public.module_state_invariants_valid(text,text,text) from public;
revoke all on function public.acquire_module_operation_lock(text,text,integer) from public;
revoke all on function public.release_module_operation_lock(text,text,text) from public;
revoke all on function public.list_module_state(text) from public;
revoke all on function public.put_module_state(text,text,text,text,bigint) from public;
revoke all on function public.delete_module_state(text,text,text,bigint) from public;
revoke all on function public.append_module_activity(text,text,text,text,text,text,jsonb) from public;
revoke all on function public.list_module_activity(text,bigint,integer) from public;
revoke all on function public.commit_fueltrack_requests_with_activity(text,bigint,text,text,text,text,text,jsonb) from public;
revoke all on function public.import_fueltrack_activity_backup(jsonb) from public;

grant execute on function public.acquire_module_operation_lock(text,text,integer) to authenticated;
grant execute on function public.release_module_operation_lock(text,text,text) to authenticated;
grant execute on function public.list_module_state(text) to authenticated;
grant execute on function public.put_module_state(text,text,text,text,bigint) to authenticated;
grant execute on function public.delete_module_state(text,text,text,bigint) to authenticated;
grant execute on function public.append_module_activity(text,text,text,text,text,text,jsonb) to authenticated;
grant execute on function public.list_module_activity(text,bigint,integer) to authenticated;
grant execute on function public.commit_fueltrack_requests_with_activity(text,bigint,text,text,text,text,text,jsonb) to authenticated;
grant execute on function public.import_fueltrack_activity_backup(jsonb) to authenticated;

-- Work Management v1.17.3
-- Transactional TimeTracker attendance lifecycle.
-- Run after v1.17.0-state-contract-and-activity.sql. Safe to re-run.
--
-- Clock In/Clock Out correctness no longer depends on expiring browser/device leases.
-- PostgreSQL serializes attendance actions per workspace+account inside the same
-- transaction that validates and commits the authoritative attendance record.

create or replace function public.commit_timetracker_attendance_action(
  p_action text,
  p_record_id text,
  p_location text,
  p_department text,
  p_geo jsonb,
  p_work_note text,
  p_attendance_policy jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  caller uuid := auth.uid();
  ws uuid;
  actor_id text;
  actor_name text;
  owner text := '*';
  normalized_action text := lower(trim(coalesce(p_action,'')));
  current_value text;
  current_revision bigint := 0;
  current_state jsonb;
  records jsonb;
  active_count integer := 0;
  active_record jsonb;
  active_id text;
  committed_at timestamptz := clock_timestamp();
  committed_at_text text;
  record_id text;
  note_text text := nullif(trim(coalesce(p_work_note,'')),'');
  new_record jsonb;
  updated_records jsonb;
  updated_state jsonb;
  result_revision bigint;
  result_updated_at timestamptz;
  visible_value text;
  backup_revision bigint;
begin
  if caller is null then
    raise exception 'authentication required' using errcode='42501';
  end if;
  if not public.has_module_access('time-tracker',caller) then
    raise exception 'module access denied' using errcode='42501';
  end if;
  if normalized_action not in ('clock-in','clock-out') then
    raise exception 'invalid attendance action' using errcode='22023';
  end if;
  if nullif(trim(coalesce(p_location,'')),'') is null or nullif(trim(coalesce(p_department,'')),'') is null then
    raise exception 'location and department are required' using errcode='22023';
  end if;
  if p_geo is null or jsonb_typeof(p_geo)<>'object' or coalesce(p_geo->>'status','')<>'captured' then
    raise exception 'valid captured GPS evidence is required' using errcode='22023';
  end if;
  if note_text is not null and length(note_text)>500 then
    raise exception 'work note exceeds maximum length' using errcode='22023';
  end if;

  ws := public.current_workspace_id(caller);
  if ws is null then
    raise exception 'workspace membership is required' using errcode='42501';
  end if;
  actor_id := 'cloud:'||caller::text;
  select coalesce(p.display_name,p.email,'Authenticated User') into actor_name
    from public.profiles p where p.id=caller;

  -- Permanent concurrency boundary: this transaction-scoped advisory lock cannot
  -- survive a failed request, tab close, refresh, navigation, or authentication
  -- change. It is automatically released by PostgreSQL at transaction end.
  perform pg_advisory_xact_lock(hashtextextended(ws::text||':time-tracker:attendance:'||caller::text,0));

  select e.value,e.revision into current_value,current_revision
    from public.module_state_entries e
    where e.workspace_id=ws
      and e.module_id='time-tracker'
      and e.state_key='timetracker.attendance.v1'
      and e.scope='shared'
      and e.owner_key=owner
    for update;

  if current_value is null then
    current_state := jsonb_build_object('version',1,'records','[]'::jsonb,'selection',jsonb_build_object('location','','department',''));
    current_revision := 0;
  else
    begin
      current_state := current_value::jsonb;
    exception when others then
      raise exception 'authoritative attendance state is malformed' using errcode='22023';
    end;
  end if;

  if jsonb_typeof(current_state)<>'object' or jsonb_typeof(coalesce(current_state->'records','[]'::jsonb))<>'array' then
    raise exception 'authoritative attendance state has an invalid shape' using errcode='22023';
  end if;
  records := coalesce(current_state->'records','[]'::jsonb);

  select count(*)
    into active_count
    from jsonb_array_elements(records) x
    where x->>'ownerId'=actor_id
      and (x->'clockOut' is null or x->'clockOut'='null'::jsonb);
  select x into active_record
    from jsonb_array_elements(records) x
    where x->>'ownerId'=actor_id
      and (x->'clockOut' is null or x->'clockOut'='null'::jsonb)
    limit 1;

  committed_at_text := to_char(committed_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');

  if normalized_action='clock-in' then
    if active_count>0 then
      raise exception 'WM_ATTENDANCE_ACTIVE_EXISTS' using errcode='P0001';
    end if;

    record_id := gen_random_uuid()::text;
    new_record := jsonb_build_object(
      'id',record_id,
      'ownerId',actor_id,
      'ownerName',actor_name,
      'clockIn',jsonb_build_object(
        'location',trim(p_location),
        'department',trim(p_department),
        'timestamp',committed_at_text,
        'geo',p_geo
      ) || case when note_text is not null then jsonb_build_object('workNote',note_text) else '{}'::jsonb end,
      'clockOut','null'::jsonb,
      'createdAt',committed_at_text,
      'updatedAt',committed_at_text
    );
    if note_text is not null then new_record := new_record || jsonb_build_object('note',note_text); end if;
    if p_attendance_policy is not null and jsonb_typeof(p_attendance_policy)='object' then
      new_record := new_record || jsonb_build_object('attendancePolicy',p_attendance_policy);
    end if;
    updated_records := jsonb_build_array(new_record) || records;

  else
    if active_count=0 then
      raise exception 'WM_ATTENDANCE_NO_ACTIVE' using errcode='P0001';
    end if;
    if active_count<>1 then
      raise exception 'authoritative attendance contains multiple active sessions for this account' using errcode='22023';
    end if;
    active_id := active_record->>'id';
    if nullif(trim(coalesce(p_record_id,'')),'') is not null and active_id<>trim(p_record_id) then
      raise exception 'WM_ATTENDANCE_SESSION_CHANGED' using errcode='P0001';
    end if;

    select coalesce(jsonb_agg(
      case when elem->>'id'=active_id then
        (
          elem
          || jsonb_build_object(
            'clockOut', jsonb_build_object(
              'location',trim(p_location),
              'department',trim(p_department),
              'timestamp',committed_at_text,
              'geo',p_geo
            ) || case when note_text is not null then jsonb_build_object('workNote',note_text) else '{}'::jsonb end,
            'updatedAt',committed_at_text
          )
          || case
               when note_text is not null then jsonb_build_object(
                 'note', concat_ws(' • ',nullif(trim(coalesce(elem->>'note','')),''),note_text)
               ) else '{}'::jsonb
             end
          || case
               when p_attendance_policy is not null and jsonb_typeof(p_attendance_policy)='object'
                 then jsonb_build_object('attendancePolicy',p_attendance_policy)
               else '{}'::jsonb
             end
        )
      else elem end
      order by ord
    ),'[]'::jsonb)
    into updated_records
    from jsonb_array_elements(records) with ordinality a(elem,ord);

    select elem into new_record from jsonb_array_elements(updated_records) elem where elem->>'id'=active_id limit 1;
  end if;

  updated_state := jsonb_set(current_state,'{records}',updated_records,true);
  updated_state := jsonb_set(updated_state,'{selection}',jsonb_build_object('location','','department',''),true);

  if not public.module_state_invariants_valid('time-tracker','timetracker.attendance.v1',updated_state::text) then
    raise exception 'attendance transaction violates data integrity invariants' using errcode='22023';
  end if;

  -- Maintain the rolling recovery copy in the same transaction. It never becomes
  -- runtime authority automatically, but remains available for explicit recovery.
  if current_value is not null then
    insert into public.module_state_entries(workspace_id,module_id,state_key,scope,owner_key,value,revision,updated_by,updated_at)
    values(ws,'time-tracker','timetracker.attendance.v1.backup','shared','*',current_value,1,caller,now())
    on conflict on constraint module_state_entries_pkey do update
      set value=excluded.value,
          revision=public.module_state_entries.revision+1,
          updated_by=caller,
          updated_at=now()
    returning revision into backup_revision;
  end if;

  insert into public.module_state_entries(workspace_id,module_id,state_key,scope,owner_key,value,revision,updated_by,updated_at)
  values(ws,'time-tracker','timetracker.attendance.v1','shared','*',updated_state::text,1,caller,now())
  on conflict on constraint module_state_entries_pkey do update
    set value=excluded.value,
        revision=public.module_state_entries.revision+1,
        updated_by=caller,
        updated_at=now()
  returning revision,updated_at into result_revision,result_updated_at;

  visible_value := public.module_state_visible_value('time-tracker','timetracker.attendance.v1',updated_state::text,caller);
  if normalized_action='clock-in' then
    -- new_record already points at the committed server-created record.
    null;
  else
    select elem into new_record from jsonb_array_elements(updated_records) elem where elem->>'id'=active_id limit 1;
  end if;

  return jsonb_build_object(
    'state_key','timetracker.attendance.v1',
    'action',normalized_action,
    'revision',result_revision,
    'updated_at',result_updated_at,
    'value',visible_value,
    'record',new_record,
    'committed_at',committed_at_text
  );
end;
$$;

-- Attendance no longer uses lease rows. Remove any stale leases left by v1.17.0-v1.17.2.
delete from public.module_operation_locks
where module_id='time-tracker' and lock_key like 'attendance-action:%';

revoke all on function public.commit_timetracker_attendance_action(text,text,text,text,jsonb,text,jsonb) from public;
grant execute on function public.commit_timetracker_attendance_action(text,text,text,text,jsonb,text,jsonb) to authenticated;

-- v1.17.3 legacy attendance ownership normalization.
do $$
declare rec record; j jsonb; normalized_records jsonb;
begin
  for rec in
    select e.workspace_id,e.module_id,e.state_key,e.scope,e.owner_key,e.value
    from public.module_state_entries e
    where e.module_id='time-tracker'
      and e.state_key in ('timetracker.attendance.v1','timetracker.attendance.v1.backup')
  loop
    begin
      j := rec.value::jsonb;
      if jsonb_typeof(j)<>'object' or jsonb_typeof(coalesce(j->'records','[]'::jsonb))<>'array' then continue; end if;
      select coalesce(jsonb_agg(
        case when nullif(trim(coalesce(elem->>'ownerId','')),'') is null then
          elem || jsonb_build_object(
            'ownerId','legacy:unassigned:'||coalesce(nullif(trim(elem->>'id'),''),md5(elem::text)),
            'ownerName',coalesce(nullif(trim(elem->>'ownerName'),''),'Legacy unassigned')
          ) else elem end order by ord
      ),'[]'::jsonb)
      into normalized_records
      from jsonb_array_elements(coalesce(j->'records','[]'::jsonb)) with ordinality a(elem,ord);
      if normalized_records is distinct from coalesce(j->'records','[]'::jsonb) then
        update public.module_state_entries e
          set value=jsonb_set(j,'{records}',normalized_records,true)::text,
              revision=e.revision+1,
              updated_at=now()
          where e.workspace_id=rec.workspace_id and e.module_id=rec.module_id
            and e.state_key=rec.state_key and e.scope=rec.scope and e.owner_key=rec.owner_key;
      end if;
    exception when others then
      raise notice 'Skipped malformed TimeTracker legacy attendance state in workspace % key %: %',rec.workspace_id,rec.state_key,sqlerrm;
    end;
  end loop;
end;
$$;

-- Work Management v1.17.4 — authoritative email-verification projection.
alter table public.profiles add column if not exists email_verified_at timestamptz;
update public.profiles p set email_verified_at=u.email_confirmed_at
from auth.users u where u.id=p.id and p.email_verified_at is distinct from u.email_confirmed_at;
create or replace function public.sync_profile_email_verification()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  update public.profiles set email=lower(coalesce(new.email,email)), email_verified_at=new.email_confirmed_at, updated_at=now() where id=new.id;
  return new;
end;
$$;
drop trigger if exists zz_on_auth_user_verification_sync on auth.users;
create trigger zz_on_auth_user_verification_sync after insert or update of email_confirmed_at,email on auth.users
for each row execute function public.sync_profile_email_verification();
revoke all on function public.sync_profile_email_verification() from public;

-- Work Management v1.19.0 — native boards/work management
begin;

create table if not exists public.work_boards (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  description text not null default '' check (char_length(description) <= 1200),
  status text not null default 'active' check (status in ('active','archived','trashed')),
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  trashed_at timestamptz
);
create index if not exists work_boards_workspace_status_idx on public.work_boards(workspace_id,status,updated_at desc);

create table if not exists public.work_board_members (
  board_id uuid not null references public.work_boards(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'viewer' check (role in ('owner','editor','viewer')),
  view_mode text not null default 'table' check (view_mode in ('table','kanban')),
  added_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (board_id,user_id)
);

create table if not exists public.work_board_groups (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.work_boards(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  accent_color text not null default '#5b7cfa' check (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists work_board_groups_board_position_idx on public.work_board_groups(board_id,position,id);

create table if not exists public.work_board_items (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.work_boards(id) on delete cascade,
  group_id uuid not null references public.work_board_groups(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 240),
  status text not null default 'not_started' check (status in ('not_started','in_progress','blocked','done')),
  assignee_id uuid references public.profiles(id) on delete set null,
  due_date date,
  notes text not null default '' check (char_length(notes) <= 5000),
  position integer not null default 0 check (position >= 0),
  archived_at timestamptz,
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists work_board_items_group_position_idx on public.work_board_items(group_id,archived_at,position,id);
create index if not exists work_board_items_assignee_idx on public.work_board_items(assignee_id,archived_at);

create table if not exists public.work_board_events (
  id bigint generated always as identity primary key,
  board_id uuid not null references public.work_boards(id) on delete cascade,
  actor_id uuid not null references public.profiles(id),
  event_type text not null,
  message text not null,
  entity_type text,
  entity_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists work_board_events_board_idx on public.work_board_events(board_id,id desc);

alter table public.work_boards enable row level security;
alter table public.work_board_members enable row level security;
alter table public.work_board_groups enable row level security;
alter table public.work_board_items enable row level security;
alter table public.work_board_events enable row level security;
revoke all on public.work_boards, public.work_board_members, public.work_board_groups, public.work_board_items, public.work_board_events from anon, authenticated;

create or replace function public.work_board_access(p_board_id uuid, p_required text default 'view') returns boolean
language plpgsql stable security definer set search_path=public as $$
declare caller uuid:=auth.uid(); member_role text; ws uuid; board_ws uuid;
begin
  if caller is null then return false; end if;
  if not exists(select 1 from public.profiles p where p.id=caller and p.status='active') then return false; end if;
  select workspace_id into board_ws from public.work_boards where id=p_board_id;
  if board_ws is null then return false; end if;
  ws:=public.current_workspace_id(caller);
  if ws is null or ws<>board_ws then return false; end if;
  if public.is_platform_admin(caller) then return true; end if;
  select role into member_role from public.work_board_members where board_id=p_board_id and user_id=caller;
  if p_required='manage' then return member_role='owner'; end if;
  if p_required='edit' then return member_role in ('owner','editor'); end if;
  return member_role in ('owner','editor','viewer');
end $$;
revoke all on function public.work_board_access(uuid,text) from public;

create or replace function public.work_board_log(p_board_id uuid,p_type text,p_message text,p_entity_type text default null,p_entity_id text default null,p_payload jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path=public as $$
begin
  insert into public.work_board_events(board_id,actor_id,event_type,message,entity_type,entity_id,payload)
  values(p_board_id,auth.uid(),p_type,left(coalesce(p_message,''),500),p_entity_type,p_entity_id,coalesce(p_payload,'{}'::jsonb));
end $$;
revoke all on function public.work_board_log(uuid,text,text,text,text,jsonb) from public;

create or replace function public.wm_list_boards(p_status text default 'active')
returns table(id uuid,name text,description text,status text,member_role text,item_count bigint,updated_at timestamptz,created_at timestamptz)
language sql stable security definer set search_path=public as $$
  select b.id,b.name,b.description,b.status,
    case when public.is_platform_admin(auth.uid()) then 'owner' else m.role end as member_role,
    (select count(*) from public.work_board_items i where i.board_id=b.id and i.archived_at is null) as item_count,
    b.updated_at,b.created_at
  from public.work_boards b
  left join public.work_board_members m on m.board_id=b.id and m.user_id=auth.uid()
  where b.workspace_id=public.current_workspace_id(auth.uid())
    and b.status=coalesce(nullif(p_status,''),'active')
    and (public.is_platform_admin(auth.uid()) or m.user_id is not null)
  order by b.updated_at desc,b.created_at desc;
$$;

create or replace function public.wm_get_board(p_board_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare out_json jsonb; caller uuid:=auth.uid();
begin
  if not public.work_board_access(p_board_id,'view') then raise exception 'Board access denied' using errcode='42501'; end if;
  select jsonb_build_object(
    'board',to_jsonb(b) || jsonb_build_object('member_role',case when public.is_platform_admin(caller) then 'owner' else m.role end,'view_mode',coalesce(m.view_mode,'table')),
    'groups',coalesce((select jsonb_agg(to_jsonb(g) order by g.position,g.id) from public.work_board_groups g where g.board_id=b.id),'[]'::jsonb),
    'items',coalesce((select jsonb_agg(to_jsonb(i) order by i.position,i.id) from public.work_board_items i where i.board_id=b.id),'[]'::jsonb),
    'members',coalesce((select jsonb_agg(jsonb_build_object('user_id',bm.user_id,'role',bm.role,'display_name',p.display_name,'email',p.email) order by p.display_name,p.email) from public.work_board_members bm join public.profiles p on p.id=bm.user_id where bm.board_id=b.id),'[]'::jsonb)
  ) into out_json
  from public.work_boards b left join public.work_board_members m on m.board_id=b.id and m.user_id=caller where b.id=p_board_id;
  return out_json;
end $$;

create or replace function public.wm_create_board(p_name text,p_description text default '') returns uuid
language plpgsql security definer set search_path=public as $$
declare caller uuid:=auth.uid(); ws uuid; bid uuid; gid uuid;
begin
  if caller is null then raise exception 'Authentication required' using errcode='42501'; end if;
  ws:=public.current_workspace_id(caller); if ws is null then raise exception 'Workspace membership required' using errcode='42501'; end if;
  if char_length(btrim(coalesce(p_name,''))) not between 1 and 120 then raise exception 'Board name must contain 1-120 characters'; end if;
  insert into public.work_boards(workspace_id,name,description,created_by,updated_by) values(ws,btrim(p_name),left(coalesce(p_description,''),1200),caller,caller) returning id into bid;
  insert into public.work_board_members(board_id,user_id,role,added_by) values(bid,caller,'owner',caller);
  insert into public.work_board_groups(board_id,title,position) values(bid,'Main group',0) returning id into gid;
  perform public.work_board_log(bid,'board.created','Board created','board',bid::text,jsonb_build_object('name',btrim(p_name)));
  return bid;
end $$;

create or replace function public.wm_update_board(p_board_id uuid,p_name text,p_description text) returns void
language plpgsql security definer set search_path=public as $$
begin
  if not public.work_board_access(p_board_id,'edit') then raise exception 'Board edit access denied' using errcode='42501'; end if;
  if char_length(btrim(coalesce(p_name,''))) not between 1 and 120 then raise exception 'Board name must contain 1-120 characters'; end if;
  update public.work_boards set name=btrim(p_name),description=left(coalesce(p_description,''),1200),updated_by=auth.uid(),updated_at=now() where id=p_board_id;
  perform public.work_board_log(p_board_id,'board.updated','Board details updated','board',p_board_id::text,'{}');
end $$;

create or replace function public.wm_set_board_status(p_board_id uuid,p_status text) returns void
language plpgsql security definer set search_path=public as $$
begin
  if p_status not in ('active','archived','trashed') then raise exception 'Unsupported board status'; end if;
  if not public.work_board_access(p_board_id,'manage') then raise exception 'Board management access denied' using errcode='42501'; end if;
  update public.work_boards set status=p_status,archived_at=case when p_status='archived' then now() else null end,trashed_at=case when p_status='trashed' then now() else null end,updated_by=auth.uid(),updated_at=now() where id=p_board_id;
  perform public.work_board_log(p_board_id,'board.'||p_status,case p_status when 'active' then 'Board restored' when 'archived' then 'Board archived' else 'Board moved to trash' end,'board',p_board_id::text,'{}');
end $$;

create or replace function public.wm_delete_board_permanently(p_board_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare st text;
begin
  if not public.work_board_access(p_board_id,'manage') then raise exception 'Board management access denied' using errcode='42501'; end if;
  select status into st from public.work_boards where id=p_board_id;
  if st<>'trashed' then raise exception 'Only trashed boards can be permanently deleted'; end if;
  delete from public.work_boards where id=p_board_id;
end $$;

create or replace function public.wm_duplicate_board(p_board_id uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare src public.work_boards%rowtype; new_id uuid; g record; new_gid uuid; caller uuid:=auth.uid();
begin
  if not public.work_board_access(p_board_id,'view') then raise exception 'Board access denied' using errcode='42501'; end if;
  select * into src from public.work_boards where id=p_board_id;
  insert into public.work_boards(workspace_id,name,description,created_by,updated_by) values(src.workspace_id,left(src.name||' copy',120),src.description,caller,caller) returning id into new_id;
  insert into public.work_board_members(board_id,user_id,role,added_by) values(new_id,caller,'owner',caller);
  insert into public.work_board_members(board_id,user_id,role,added_by)
    select new_id,bm.user_id,case when bm.role='owner' then 'editor' else bm.role end,caller
    from public.work_board_members bm where bm.board_id=p_board_id and bm.user_id<>caller
    on conflict(board_id,user_id) do nothing;
  for g in select * from public.work_board_groups where board_id=p_board_id order by position loop
    insert into public.work_board_groups(board_id,title,accent_color,position) values(new_id,g.title,coalesce(g.accent_color,'#5b7cfa'),g.position) returning id into new_gid;
    insert into public.work_board_items(board_id,group_id,title,status,assignee_id,due_date,notes,position,created_by,updated_by)
      select new_id,new_gid,title,status,assignee_id,due_date,notes,position,caller,caller from public.work_board_items where group_id=g.id and archived_at is null;
  end loop;
  perform public.work_board_log(new_id,'board.created','Board duplicated','board',new_id::text,jsonb_build_object('source_board_id',p_board_id));
  return new_id;
end $$;

create or replace function public.wm_add_board_group(p_board_id uuid,p_title text) returns uuid
language plpgsql security definer set search_path=public as $$
declare gid uuid; pos integer;
begin
  if not public.work_board_access(p_board_id,'edit') then raise exception 'Board edit access denied' using errcode='42501'; end if;
  if char_length(btrim(coalesce(p_title,''))) not between 1 and 120 then raise exception 'Group title is required'; end if;
  select coalesce(max(position),-1)+1 into pos from public.work_board_groups where board_id=p_board_id;
  insert into public.work_board_groups(board_id,title,accent_color,position) values(p_board_id,btrim(p_title),(array['#5b7cfa','#7c5ce7','#e06083','#dc7a34','#2f9e73','#2186a8','#8b6b45','#65758b'])[(pos % 8)+1],pos) returning id into gid;
  update public.work_boards set updated_at=now(),updated_by=auth.uid() where id=p_board_id;
  perform public.work_board_log(p_board_id,'group.created','Group added','group',gid::text,jsonb_build_object('title',btrim(p_title)));
  return gid;
end $$;

create or replace function public.wm_update_board_group(p_group_id uuid,p_title text) returns void
language plpgsql security definer set search_path=public as $$
declare bid uuid;
begin
  select board_id into bid from public.work_board_groups where id=p_group_id;
  if bid is null or not public.work_board_access(bid,'edit') then raise exception 'Board edit access denied' using errcode='42501'; end if;
  update public.work_board_groups set title=btrim(p_title),updated_at=now() where id=p_group_id;
  update public.work_boards set updated_at=now(),updated_by=auth.uid() where id=bid;
  perform public.work_board_log(bid,'group.updated','Group renamed','group',p_group_id::text,jsonb_build_object('title',btrim(p_title)));
end $$;

create or replace function public.wm_delete_board_group(p_group_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare bid uuid; cnt integer;
begin
  select board_id into bid from public.work_board_groups where id=p_group_id;
  if bid is null or not public.work_board_access(bid,'edit') then raise exception 'Board edit access denied' using errcode='42501'; end if;
  select count(*) into cnt from public.work_board_groups where board_id=bid;
  if cnt<=1 then raise exception 'A board must keep at least one group'; end if;
  delete from public.work_board_groups where id=p_group_id;
  update public.work_boards set updated_at=now(),updated_by=auth.uid() where id=bid;
  perform public.work_board_log(bid,'group.deleted','Group deleted','group',p_group_id::text,'{}');
end $$;

create or replace function public.wm_add_board_item(p_board_id uuid,p_group_id uuid,p_title text) returns uuid
language plpgsql security definer set search_path=public as $$
declare iid uuid; pos integer;
begin
  if not public.work_board_access(p_board_id,'edit') then raise exception 'Board edit access denied' using errcode='42501'; end if;
  if not exists(select 1 from public.work_board_groups where id=p_group_id and board_id=p_board_id) then raise exception 'Group does not belong to board'; end if;
  if char_length(btrim(coalesce(p_title,''))) not between 1 and 240 then raise exception 'Item title is required'; end if;
  select coalesce(max(position),-1)+1 into pos from public.work_board_items where group_id=p_group_id and archived_at is null;
  insert into public.work_board_items(board_id,group_id,title,position,created_by,updated_by) values(p_board_id,p_group_id,btrim(p_title),pos,auth.uid(),auth.uid()) returning id into iid;
  update public.work_boards set updated_at=now(),updated_by=auth.uid() where id=p_board_id;
  perform public.work_board_log(p_board_id,'item.created','Item added','item',iid::text,jsonb_build_object('title',btrim(p_title)));
  return iid;
end $$;

create or replace function public.wm_update_board_item(p_item_id uuid,p_title text,p_status text,p_assignee_id uuid,p_due_date date,p_notes text) returns void
language plpgsql security definer set search_path=public as $$
declare bid uuid;
begin
  select board_id into bid from public.work_board_items where id=p_item_id;
  if bid is null or not public.work_board_access(bid,'edit') then raise exception 'Board edit access denied' using errcode='42501'; end if;
  if p_status not in ('not_started','in_progress','blocked','done') then raise exception 'Unsupported item status'; end if;
  if p_assignee_id is not null and not exists(select 1 from public.work_board_members where board_id=bid and user_id=p_assignee_id) then raise exception 'Assignee must be a board member'; end if;
  update public.work_board_items set title=btrim(p_title),status=p_status,assignee_id=p_assignee_id,due_date=p_due_date,notes=left(coalesce(p_notes,''),5000),updated_by=auth.uid(),updated_at=now() where id=p_item_id;
  update public.work_boards set updated_at=now(),updated_by=auth.uid() where id=bid;
  perform public.work_board_log(bid,'item.updated','Item updated','item',p_item_id::text,jsonb_build_object('status',p_status));
end $$;

create or replace function public.wm_move_board_item(p_item_id uuid,p_group_id uuid,p_position integer,p_status text default null) returns void
language plpgsql security definer set search_path=public as $$
declare bid uuid;
begin
  select board_id into bid from public.work_board_items where id=p_item_id;
  if bid is null or not public.work_board_access(bid,'edit') then raise exception 'Board edit access denied' using errcode='42501'; end if;
  if not exists(select 1 from public.work_board_groups where id=p_group_id and board_id=bid) then raise exception 'Target group does not belong to board'; end if;
  update public.work_board_items set group_id=p_group_id,position=greatest(0,coalesce(p_position,0)),status=coalesce(nullif(p_status,''),status),updated_by=auth.uid(),updated_at=now() where id=p_item_id;
  update public.work_boards set updated_at=now(),updated_by=auth.uid() where id=bid;
  perform public.work_board_log(bid,'item.moved','Item moved','item',p_item_id::text,jsonb_build_object('group_id',p_group_id,'position',p_position,'status',p_status));
end $$;

create or replace function public.wm_set_board_item_archived(p_item_id uuid,p_archived boolean) returns void
language plpgsql security definer set search_path=public as $$
declare bid uuid;
begin
  select board_id into bid from public.work_board_items where id=p_item_id;
  if bid is null or not public.work_board_access(bid,'edit') then raise exception 'Board edit access denied' using errcode='42501'; end if;
  update public.work_board_items set archived_at=case when p_archived then now() else null end,updated_by=auth.uid(),updated_at=now() where id=p_item_id;
  update public.work_boards set updated_at=now(),updated_by=auth.uid() where id=bid;
  perform public.work_board_log(bid,case when p_archived then 'item.archived' else 'item.restored' end,case when p_archived then 'Item archived' else 'Item restored' end,'item',p_item_id::text,'{}');
end $$;

create or replace function public.wm_set_board_view(p_board_id uuid,p_view text) returns void
language plpgsql security definer set search_path=public as $$
begin
  if p_view not in ('table','kanban') then raise exception 'Unsupported board view'; end if;
  if not public.work_board_access(p_board_id,'view') then raise exception 'Board access denied' using errcode='42501'; end if;
  insert into public.work_board_members(board_id,user_id,role,view_mode,added_by)
    select p_board_id,auth.uid(),'viewer',p_view,auth.uid()
    where public.is_platform_admin(auth.uid()) and not exists(select 1 from public.work_board_members where board_id=p_board_id and user_id=auth.uid())
  on conflict(board_id,user_id) do update set view_mode=excluded.view_mode,updated_at=now();
  update public.work_board_members set view_mode=p_view,updated_at=now() where board_id=p_board_id and user_id=auth.uid();
end $$;

create or replace function public.wm_add_board_member(p_board_id uuid,p_email text,p_role text default 'viewer') returns void
language plpgsql security definer set search_path=public as $$
declare target uuid;
begin
  if not public.work_board_access(p_board_id,'manage') then raise exception 'Board management access denied' using errcode='42501'; end if;
  if p_role not in ('editor','viewer') then raise exception 'Select Editor or Viewer'; end if;
  select id into target from public.profiles where lower(email)=lower(btrim(p_email)) and status='active';
  if target is null then raise exception 'No active Work Management account was found for that email'; end if;
  insert into public.work_board_members(board_id,user_id,role,added_by) values(p_board_id,target,p_role,auth.uid())
  on conflict(board_id,user_id) do update set role=excluded.role,updated_at=now();
  perform public.work_board_log(p_board_id,'member.updated','Board membership updated','member',target::text,jsonb_build_object('role',p_role));
end $$;

create or replace function public.wm_remove_board_member(p_board_id uuid,p_user_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare role_now text;
begin
  if not public.work_board_access(p_board_id,'manage') then raise exception 'Board management access denied' using errcode='42501'; end if;
  select role into role_now from public.work_board_members where board_id=p_board_id and user_id=p_user_id;
  if role_now='owner' then raise exception 'Board owner cannot be removed'; end if;
  delete from public.work_board_members where board_id=p_board_id and user_id=p_user_id;
  perform public.work_board_log(p_board_id,'member.removed','Board member removed','member',p_user_id::text,'{}');
end $$;

create or replace function public.wm_list_board_events(p_board_id uuid,p_limit integer default 80) returns table(id bigint,event_type text,message text,entity_type text,entity_id text,payload jsonb,created_at timestamptz,actor_id uuid,actor_name text,actor_email text)
language sql stable security definer set search_path=public as $$
  select e.id,e.event_type,e.message,e.entity_type,e.entity_id,e.payload,e.created_at,e.actor_id,coalesce(p.display_name,p.email),p.email
  from public.work_board_events e join public.profiles p on p.id=e.actor_id
  where e.board_id=p_board_id and public.work_board_access(p_board_id,'view')
  order by e.id desc limit least(greatest(coalesce(p_limit,80),1),200);
$$;

-- Only authenticated clients may call the board API; each function performs server-side authorization.
revoke all on function public.wm_list_boards(text) from public;
revoke all on function public.wm_get_board(uuid) from public;
revoke all on function public.wm_create_board(text,text) from public;
revoke all on function public.wm_update_board(uuid,text,text) from public;
revoke all on function public.wm_set_board_status(uuid,text) from public;
revoke all on function public.wm_delete_board_permanently(uuid) from public;
revoke all on function public.wm_duplicate_board(uuid) from public;
revoke all on function public.wm_add_board_group(uuid,text) from public;
revoke all on function public.wm_update_board_group(uuid,text) from public;
revoke all on function public.wm_delete_board_group(uuid) from public;
revoke all on function public.wm_add_board_item(uuid,uuid,text) from public;
revoke all on function public.wm_update_board_item(uuid,text,text,uuid,date,text) from public;
revoke all on function public.wm_move_board_item(uuid,uuid,integer,text) from public;
revoke all on function public.wm_set_board_item_archived(uuid,boolean) from public;
revoke all on function public.wm_set_board_view(uuid,text) from public;
revoke all on function public.wm_add_board_member(uuid,text,text) from public;
revoke all on function public.wm_remove_board_member(uuid,uuid) from public;
revoke all on function public.wm_list_board_events(uuid,integer) from public;

grant execute on function public.wm_list_boards(text),public.wm_get_board(uuid),public.wm_create_board(text,text),public.wm_update_board(uuid,text,text),public.wm_set_board_status(uuid,text),public.wm_delete_board_permanently(uuid),public.wm_duplicate_board(uuid),public.wm_add_board_group(uuid,text),public.wm_update_board_group(uuid,text),public.wm_delete_board_group(uuid),public.wm_add_board_item(uuid,uuid,text),public.wm_update_board_item(uuid,text,text,uuid,date,text),public.wm_move_board_item(uuid,uuid,integer,text),public.wm_set_board_item_archived(uuid,boolean),public.wm_set_board_view(uuid,text),public.wm_add_board_member(uuid,text,text),public.wm_remove_board_member(uuid,uuid),public.wm_list_board_events(uuid,integer) to authenticated;

commit;
-- Work Management v1.20.0 — flexible board columns and typed item values
begin;

create table if not exists public.work_board_columns (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.work_boards(id) on delete cascade,
  column_key text not null,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  data_type text not null check (data_type in ('text','long_text','number','status','dropdown','date','people','checkbox','url','email','timeline')),
  system_key text check (system_key is null or system_key in ('title','status','assignee','due_date','notes')),
  position integer not null default 0 check (position >= 0),
  visible boolean not null default true,
  required boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(board_id,column_key)
);
create unique index if not exists work_board_columns_name_ci_idx on public.work_board_columns(board_id,lower(name));
create unique index if not exists work_board_columns_system_idx on public.work_board_columns(board_id,system_key) where system_key is not null;
create index if not exists work_board_columns_position_idx on public.work_board_columns(board_id,position,id);

create table if not exists public.work_board_item_values (
  item_id uuid not null references public.work_board_items(id) on delete cascade,
  column_id uuid not null references public.work_board_columns(id) on delete cascade,
  value jsonb,
  updated_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now(),
  primary key(item_id,column_id)
);
create index if not exists work_board_item_values_column_idx on public.work_board_item_values(column_id,item_id);

alter table public.work_board_columns enable row level security;
alter table public.work_board_item_values enable row level security;
revoke all on public.work_board_columns,public.work_board_item_values from anon,authenticated;

create or replace function public.work_board_seed_default_columns(p_board_id uuid,p_actor uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
  insert into public.work_board_columns(board_id,column_key,name,data_type,system_key,position,visible,required,config,created_by,updated_by)
  values
    (p_board_id,'title','Item','text','title',0,true,true,'{}'::jsonb,p_actor,p_actor),
    (p_board_id,'status','Status','status','status',1,true,false,jsonb_build_object('options',jsonb_build_array('Not started','In progress','Blocked','Done')),p_actor,p_actor),
    (p_board_id,'assignee','Assignee','people','assignee',2,true,false,'{}'::jsonb,p_actor,p_actor),
    (p_board_id,'due_date','Due','date','due_date',3,true,false,'{}'::jsonb,p_actor,p_actor),
    (p_board_id,'notes','Notes','long_text','notes',4,false,false,'{}'::jsonb,p_actor,p_actor)
  on conflict(board_id,column_key) do nothing;
end $$;
revoke all on function public.work_board_seed_default_columns(uuid,uuid) from public;

-- Existing boards receive the same schema as newly-created boards.
do $$
declare b record;
begin
  for b in select id,created_by from public.work_boards loop
    perform public.work_board_seed_default_columns(b.id,b.created_by);
  end loop;
end $$;

create or replace function public.work_board_normalize_column_config(p_type text,p_config jsonb) returns jsonb
language plpgsql immutable set search_path=public as $$
declare cfg jsonb:=coalesce(p_config,'{}'::jsonb); options jsonb; clean jsonb:='[]'::jsonb; x jsonb; label text;
begin
  if p_type not in ('text','long_text','number','status','dropdown','date','people','checkbox','url','email','timeline') then
    raise exception 'Unsupported column type';
  end if;
  if p_type in ('status','dropdown') then
    options:=cfg->'options';
    if options is null or jsonb_typeof(options)<>'array' or jsonb_array_length(options)=0 then
      options:=case when p_type='status' then jsonb_build_array('Not started','In progress','Blocked','Done') else jsonb_build_array('Option 1','Option 2') end;
    end if;
    if jsonb_array_length(options)>50 then raise exception 'A choice column can contain at most 50 options'; end if;
    for x in select value from jsonb_array_elements(options) loop
      if jsonb_typeof(x)<>'string' then raise exception 'Choice options must be text'; end if;
      label:=btrim(x#>>'{}');
      if char_length(label) not between 1 and 80 then raise exception 'Choice options must contain 1-80 characters'; end if;
      if exists(select 1 from jsonb_array_elements_text(clean) as e(value) where lower(e.value)=lower(label)) then raise exception 'Choice options must be unique'; end if;
      clean:=clean||jsonb_build_array(label);
    end loop;
    return jsonb_build_object('options',clean);
  end if;
  return '{}'::jsonb;
end $$;
revoke all on function public.work_board_normalize_column_config(text,jsonb) from public;

create or replace function public.work_board_validate_column_value(p_board_id uuid,p_column_id uuid,p_value jsonb) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare c public.work_board_columns%rowtype; t text; u uuid; d date; start_d date; end_d date; is_empty boolean:=false;
begin
  select * into c from public.work_board_columns where id=p_column_id and board_id=p_board_id;
  if c.id is null then raise exception 'Column does not belong to board'; end if;
  if p_value is null or p_value='null'::jsonb then
    if c.required then raise exception '% is required',c.name; end if;
    return null;
  end if;

  if c.data_type in ('text','long_text','status','dropdown','date','people','url','email') then
    if jsonb_typeof(p_value)<>'string' then raise exception '% requires a text value',c.name; end if;
    t:=btrim(p_value#>>'{}'); is_empty:=(t='');
    if is_empty then
      if c.required then raise exception '% is required',c.name; end if;
      return null;
    end if;
  end if;

  case c.data_type
    when 'text' then
      if char_length(t)>1000 then raise exception '% is limited to 1000 characters',c.name; end if;
      return to_jsonb(t);
    when 'long_text' then
      if char_length(t)>5000 then raise exception '% is limited to 5000 characters',c.name; end if;
      return to_jsonb(t);
    when 'number' then
      if jsonb_typeof(p_value)<>'number' then raise exception '% requires a number',c.name; end if;
      return p_value;
    when 'checkbox' then
      if jsonb_typeof(p_value)<>'boolean' then raise exception '% requires true or false',c.name; end if;
      return p_value;
    when 'status' then
      if c.system_key='status' then
        if t not in ('not_started','in_progress','blocked','done') then raise exception 'Unsupported item status'; end if;
      elsif not exists(select 1 from jsonb_array_elements_text(c.config->'options') as o(value) where o.value=t) then
        raise exception 'Select a valid option for %',c.name;
      end if;
      return to_jsonb(t);
    when 'dropdown' then
      if not exists(select 1 from jsonb_array_elements_text(c.config->'options') as o(value) where o.value=t) then raise exception 'Select a valid option for %',c.name; end if;
      return to_jsonb(t);
    when 'date' then
      begin d:=t::date; exception when others then raise exception '% requires a valid date',c.name; end;
      return to_jsonb(d::text);
    when 'people' then
      begin u:=t::uuid; exception when others then raise exception '% requires a valid board member',c.name; end;
      if not exists(select 1 from public.work_board_members where board_id=p_board_id and user_id=u) then raise exception 'Assignee must be a board member'; end if;
      return to_jsonb(u::text);
    when 'url' then
      if t !~* '^https?://[^[:space:]]+$' or char_length(t)>2000 then raise exception '% requires a valid http(s) URL',c.name; end if;
      return to_jsonb(t);
    when 'email' then
      if t !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or char_length(t)>320 then raise exception '% requires a valid email address',c.name; end if;
      return to_jsonb(lower(t));
    when 'timeline' then
      if jsonb_typeof(p_value)<>'object' then raise exception '% requires a start/end date range',c.name; end if;
      if coalesce(p_value->>'start','')='' and coalesce(p_value->>'end','')='' then
        if c.required then raise exception '% is required',c.name; end if;
        return null;
      end if;
      begin start_d:=(p_value->>'start')::date; end_d:=(p_value->>'end')::date; exception when others then raise exception '% requires valid start and end dates',c.name; end;
      if end_d<start_d then raise exception '% end date cannot be before its start date',c.name; end if;
      return jsonb_build_object('start',start_d::text,'end',end_d::text);
    else raise exception 'Unsupported column type';
  end case;
end $$;
revoke all on function public.work_board_validate_column_value(uuid,uuid,jsonb) from public;

create or replace function public.wm_add_board_column(p_board_id uuid,p_name text,p_data_type text,p_config jsonb default '{}'::jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare cid uuid; pos integer; nm text:=btrim(coalesce(p_name,'')); cfg jsonb;
begin
  if not public.work_board_access(p_board_id,'edit') then raise exception 'Board edit access denied' using errcode='42501'; end if;
  if char_length(nm) not between 1 and 80 then raise exception 'Column name must contain 1-80 characters'; end if;
  if exists(select 1 from public.work_board_columns where board_id=p_board_id and lower(name)=lower(nm)) then raise exception 'A column named "%" already exists',nm; end if;
  if (select count(*) from public.work_board_columns where board_id=p_board_id)>=30 then raise exception 'A board can contain at most 30 columns'; end if;
  cfg:=public.work_board_normalize_column_config(p_data_type,p_config);
  select coalesce(max(position),-1)+1 into pos from public.work_board_columns where board_id=p_board_id;
  insert into public.work_board_columns(board_id,column_key,name,data_type,position,config,created_by,updated_by)
  values(p_board_id,'custom:'||gen_random_uuid()::text,nm,p_data_type,pos,cfg,auth.uid(),auth.uid()) returning id into cid;
  update public.work_boards set updated_at=now(),updated_by=auth.uid() where id=p_board_id;
  perform public.work_board_log(p_board_id,'column.created','Column added','column',cid::text,jsonb_build_object('name',nm,'data_type',p_data_type));
  return cid;
end $$;

create or replace function public.wm_update_board_column(p_column_id uuid,p_name text,p_config jsonb,p_visible boolean default true) returns void
language plpgsql security definer set search_path=public as $$
declare c public.work_board_columns%rowtype; nm text:=btrim(coalesce(p_name,'')); cfg jsonb; bad bigint;
begin
  select * into c from public.work_board_columns where id=p_column_id;
  if c.id is null or not public.work_board_access(c.board_id,'edit') then raise exception 'Board edit access denied' using errcode='42501'; end if;
  if char_length(nm) not between 1 and 80 then raise exception 'Column name must contain 1-80 characters'; end if;
  if exists(select 1 from public.work_board_columns where board_id=c.board_id and id<>c.id and lower(name)=lower(nm)) then raise exception 'A column named "%" already exists',nm; end if;
  cfg:=case when c.system_key='status' then c.config else public.work_board_normalize_column_config(c.data_type,p_config) end;
  if c.system_key='title' then p_visible:=true; end if;
  if c.data_type in ('status','dropdown') and c.system_key is null then
    select count(*) into bad from public.work_board_item_values v
      where v.column_id=c.id and v.value is not null and not exists(select 1 from jsonb_array_elements_text(cfg->'options') as o(value) where o.value=(v.value#>>'{}'));
    if bad>0 then raise exception 'Existing values use options that would be removed. Update those items first.'; end if;
  end if;
  update public.work_board_columns set name=nm,config=cfg,visible=coalesce(p_visible,true),updated_by=auth.uid(),updated_at=now() where id=c.id;
  update public.work_boards set updated_at=now(),updated_by=auth.uid() where id=c.board_id;
  perform public.work_board_log(c.board_id,'column.updated','Column updated','column',c.id::text,jsonb_build_object('name',nm,'visible',p_visible));
end $$;

create or replace function public.wm_move_board_column(p_column_id uuid,p_position integer) returns void
language plpgsql security definer set search_path=public as $$
declare c public.work_board_columns%rowtype; target integer; old integer;
begin
  select * into c from public.work_board_columns where id=p_column_id;
  if c.id is null or not public.work_board_access(c.board_id,'edit') then raise exception 'Board edit access denied' using errcode='42501'; end if;
  target:=greatest(0,least(coalesce(p_position,0),(select greatest(count(*)-1,0) from public.work_board_columns where board_id=c.board_id)));
  old:=c.position;
  if target=old then return; end if;
  if target<old then
    update public.work_board_columns set position=position+1 where board_id=c.board_id and id<>c.id and position>=target and position<old;
  else
    update public.work_board_columns set position=position-1 where board_id=c.board_id and id<>c.id and position>old and position<=target;
  end if;
  update public.work_board_columns set position=target,updated_by=auth.uid(),updated_at=now() where id=c.id;
  update public.work_boards set updated_at=now(),updated_by=auth.uid() where id=c.board_id;
end $$;

create or replace function public.wm_delete_board_column(p_column_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare c public.work_board_columns%rowtype;
begin
  select * into c from public.work_board_columns where id=p_column_id;
  if c.id is null or not public.work_board_access(c.board_id,'edit') then raise exception 'Board edit access denied' using errcode='42501'; end if;
  if c.system_key is not null then raise exception 'Core board columns cannot be deleted. Hide or rename this column instead.'; end if;
  delete from public.work_board_columns where id=c.id;
  update public.work_board_columns set position=position-1 where board_id=c.board_id and position>c.position;
  update public.work_boards set updated_at=now(),updated_by=auth.uid() where id=c.board_id;
  perform public.work_board_log(c.board_id,'column.deleted','Column deleted','column',c.id::text,jsonb_build_object('name',c.name,'data_type',c.data_type));
end $$;

create or replace function public.wm_set_board_cell(p_item_id uuid,p_column_id uuid,p_value jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare i public.work_board_items%rowtype; c public.work_board_columns%rowtype; v jsonb; t text; u uuid; d date;
begin
  select * into i from public.work_board_items where id=p_item_id;
  if i.id is null or not public.work_board_access(i.board_id,'edit') then raise exception 'Board edit access denied' using errcode='42501'; end if;
  select * into c from public.work_board_columns where id=p_column_id and board_id=i.board_id;
  if c.id is null then raise exception 'Column does not belong to this board'; end if;
  v:=public.work_board_validate_column_value(i.board_id,c.id,p_value);

  if c.system_key is not null then
    t:=case when v is null then null else v#>>'{}' end;
    case c.system_key
      when 'title' then
        if t is null or char_length(t) not between 1 and 240 then raise exception 'Item name must contain 1-240 characters'; end if;
        update public.work_board_items set title=t,updated_by=auth.uid(),updated_at=now() where id=i.id;
      when 'status' then
        update public.work_board_items set status=t,updated_by=auth.uid(),updated_at=now() where id=i.id;
      when 'assignee' then
        u:=case when t is null then null else t::uuid end;
        update public.work_board_items set assignee_id=u,updated_by=auth.uid(),updated_at=now() where id=i.id;
      when 'due_date' then
        d:=case when t is null then null else t::date end;
        update public.work_board_items set due_date=d,updated_by=auth.uid(),updated_at=now() where id=i.id;
      when 'notes' then
        update public.work_board_items set notes=coalesce(t,''),updated_by=auth.uid(),updated_at=now() where id=i.id;
    end case;
  else
    if v is null then
      delete from public.work_board_item_values where item_id=i.id and column_id=c.id;
    else
      insert into public.work_board_item_values(item_id,column_id,value,updated_by,updated_at)
      values(i.id,c.id,v,auth.uid(),now())
      on conflict(item_id,column_id) do update set value=excluded.value,updated_by=excluded.updated_by,updated_at=now();
    end if;
  end if;
  update public.work_boards set updated_at=now(),updated_by=auth.uid() where id=i.board_id;
  perform public.work_board_log(i.board_id,'item.cell_updated','Item column updated','item',i.id::text,jsonb_build_object('column_id',c.id,'column_name',c.name,'column_key',c.column_key));
end $$;

-- Return the current schema and custom values together with the existing board payload.
create or replace function public.wm_get_board(p_board_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare out_json jsonb; caller uuid:=auth.uid();
begin
  if not public.work_board_access(p_board_id,'view') then raise exception 'Board access denied' using errcode='42501'; end if;
  select jsonb_build_object(
    'board',to_jsonb(b) || jsonb_build_object('member_role',case when public.is_platform_admin(caller) then 'owner' else m.role end,'view_mode',coalesce(m.view_mode,'table')),
    'groups',coalesce((select jsonb_agg(to_jsonb(g) order by g.position,g.id) from public.work_board_groups g where g.board_id=b.id),'[]'::jsonb),
    'items',coalesce((select jsonb_agg(to_jsonb(i) order by i.position,i.id) from public.work_board_items i where i.board_id=b.id),'[]'::jsonb),
    'members',coalesce((select jsonb_agg(jsonb_build_object('user_id',bm.user_id,'role',bm.role,'display_name',p.display_name,'email',p.email) order by p.display_name,p.email) from public.work_board_members bm join public.profiles p on p.id=bm.user_id where bm.board_id=b.id),'[]'::jsonb),
    'columns',coalesce((select jsonb_agg(to_jsonb(c) order by c.position,c.id) from public.work_board_columns c where c.board_id=b.id),'[]'::jsonb),
    'values',coalesce((select jsonb_agg(jsonb_build_object('item_id',v.item_id,'column_id',v.column_id,'value',v.value,'updated_at',v.updated_at)) from public.work_board_item_values v join public.work_board_columns c on c.id=v.column_id where c.board_id=b.id),'[]'::jsonb)
  ) into out_json
  from public.work_boards b left join public.work_board_members m on m.board_id=b.id and m.user_id=caller where b.id=p_board_id;
  return out_json;
end $$;

-- Newly-created boards receive a schema immediately.
create or replace function public.wm_create_board(p_name text,p_description text default '') returns uuid
language plpgsql security definer set search_path=public as $$
declare caller uuid:=auth.uid(); ws uuid; bid uuid; gid uuid;
begin
  if caller is null then raise exception 'Authentication required' using errcode='42501'; end if;
  ws:=public.current_workspace_id(caller); if ws is null then raise exception 'Workspace membership required' using errcode='42501'; end if;
  if char_length(btrim(coalesce(p_name,''))) not between 1 and 120 then raise exception 'Board name must contain 1-120 characters'; end if;
  insert into public.work_boards(workspace_id,name,description,created_by,updated_by) values(ws,btrim(p_name),left(coalesce(p_description,''),1200),caller,caller) returning id into bid;
  insert into public.work_board_members(board_id,user_id,role,added_by) values(bid,caller,'owner',caller);
  insert into public.work_board_groups(board_id,title,position) values(bid,'Main group',0) returning id into gid;
  perform public.work_board_seed_default_columns(bid,caller);
  perform public.work_board_log(bid,'board.created','Board created','board',bid::text,jsonb_build_object('name',btrim(p_name)));
  return bid;
end $$;

-- Board duplication now clones schema and custom values as well as core item fields.
create or replace function public.wm_duplicate_board(p_board_id uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare src public.work_boards%rowtype; new_id uuid; g record; i record; new_gid uuid; new_iid uuid; caller uuid:=auth.uid();
begin
  if not public.work_board_access(p_board_id,'view') then raise exception 'Board access denied' using errcode='42501'; end if;
  select * into src from public.work_boards where id=p_board_id;
  insert into public.work_boards(workspace_id,name,description,created_by,updated_by) values(src.workspace_id,left(src.name||' copy',120),src.description,caller,caller) returning id into new_id;
  insert into public.work_board_members(board_id,user_id,role,added_by) values(new_id,caller,'owner',caller);
  insert into public.work_board_members(board_id,user_id,role,added_by)
    select new_id,bm.user_id,case when bm.role='owner' then 'editor' else bm.role end,caller from public.work_board_members bm where bm.board_id=p_board_id and bm.user_id<>caller
    on conflict(board_id,user_id) do nothing;
  insert into public.work_board_columns(board_id,column_key,name,data_type,system_key,position,visible,required,config,created_by,updated_by)
    select new_id,column_key,name,data_type,system_key,position,visible,required,config,caller,caller from public.work_board_columns where board_id=p_board_id order by position,id;
  if not exists(select 1 from public.work_board_columns where board_id=new_id) then perform public.work_board_seed_default_columns(new_id,caller); end if;
  for g in select * from public.work_board_groups where board_id=p_board_id order by position loop
    insert into public.work_board_groups(board_id,title,accent_color,position) values(new_id,g.title,coalesce(g.accent_color,'#5b7cfa'),g.position) returning id into new_gid;
    for i in select * from public.work_board_items where group_id=g.id and archived_at is null order by position,id loop
      insert into public.work_board_items(board_id,group_id,title,status,assignee_id,due_date,notes,position,created_by,updated_by)
      values(new_id,new_gid,i.title,i.status,i.assignee_id,i.due_date,i.notes,i.position,caller,caller) returning id into new_iid;
      insert into public.work_board_item_values(item_id,column_id,value,updated_by)
      select new_iid,nc.id,v.value,caller
      from public.work_board_item_values v
      join public.work_board_columns sc on sc.id=v.column_id
      join public.work_board_columns nc on nc.board_id=new_id and nc.column_key=sc.column_key
      where v.item_id=i.id;
    end loop;
  end loop;
  perform public.work_board_log(new_id,'board.created','Board duplicated','board',new_id::text,jsonb_build_object('source_board_id',p_board_id));
  return new_id;
end $$;

revoke all on function public.wm_add_board_column(uuid,text,text,jsonb) from public;
revoke all on function public.wm_update_board_column(uuid,text,jsonb,boolean) from public;
revoke all on function public.wm_move_board_column(uuid,integer) from public;
revoke all on function public.wm_delete_board_column(uuid) from public;
revoke all on function public.wm_set_board_cell(uuid,uuid,jsonb) from public;

grant execute on function public.wm_add_board_column(uuid,text,text,jsonb),public.wm_update_board_column(uuid,text,jsonb,boolean),public.wm_move_board_column(uuid,integer),public.wm_delete_board_column(uuid),public.wm_set_board_cell(uuid,uuid,jsonb) to authenticated;

commit;

-- Work Management v1.21.0 — board column productivity and per-user view preferences
begin;

alter table public.work_board_members
  add column if not exists preferences jsonb not null default '{}'::jsonb;

create or replace function public.work_board_validate_preferences(p_board_id uuid,p_preferences jsonb) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare p jsonb:=coalesce(p_preferences,'{}'::jsonb); cid uuid; key text; val jsonb; clean_filters jsonb:='{}'::jsonb; clean_wrap jsonb:='[]'::jsonb;
begin
  if jsonb_typeof(p)<>'object' then raise exception 'Board preferences must be an object'; end if;
  if p ? 'sort_column_id' and coalesce(p->>'sort_column_id','')<>'' then
    begin cid:=(p->>'sort_column_id')::uuid; exception when others then raise exception 'Invalid sort column'; end;
    if not exists(select 1 from public.work_board_columns where id=cid and board_id=p_board_id) then raise exception 'Sort column does not belong to board'; end if;
  end if;
  if coalesce(p->>'sort_direction','') not in ('','asc','desc') then raise exception 'Unsupported sort direction'; end if;
  if p ? 'column_filters' then
    if jsonb_typeof(p->'column_filters')<>'object' then raise exception 'Column filters must be an object'; end if;
    for key,val in select * from jsonb_each(p->'column_filters') loop
      begin cid:=key::uuid; exception when others then continue; end;
      if exists(select 1 from public.work_board_columns where id=cid and board_id=p_board_id) and jsonb_typeof(val)='string' and char_length(val#>>'{}')<=240 then
        clean_filters:=clean_filters||jsonb_build_object(key,val#>>'{}');
      end if;
    end loop;
  end if;
  if p ? 'wrap_columns' then
    if jsonb_typeof(p->'wrap_columns')<>'array' then raise exception 'Wrap columns must be an array'; end if;
    select coalesce(jsonb_agg(to_jsonb(x.id::text)),'[]'::jsonb) into clean_wrap
    from public.work_board_columns x
    where x.board_id=p_board_id and x.id::text in (select value from jsonb_array_elements_text(p->'wrap_columns'));
  end if;
  return jsonb_build_object(
    'sort_column_id',nullif(p->>'sort_column_id',''),
    'sort_direction',case when p->>'sort_direction' in ('asc','desc') then p->>'sort_direction' else null end,
    'column_filters',clean_filters,
    'wrap_columns',clean_wrap
  );
end $$;
revoke all on function public.work_board_validate_preferences(uuid,jsonb) from public;

create or replace function public.wm_get_board_preferences(p_board_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare result jsonb;
begin
  if not public.work_board_access(p_board_id,'view') then raise exception 'Board access denied' using errcode='42501'; end if;
  select preferences into result from public.work_board_members where board_id=p_board_id and user_id=auth.uid();
  return public.work_board_validate_preferences(p_board_id,coalesce(result,'{}'::jsonb));
end $$;

create or replace function public.wm_set_board_preferences(p_board_id uuid,p_preferences jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare clean jsonb;
begin
  if not public.work_board_access(p_board_id,'view') then raise exception 'Board access denied' using errcode='42501'; end if;
  clean:=public.work_board_validate_preferences(p_board_id,p_preferences);
  insert into public.work_board_members(board_id,user_id,role,added_by,preferences)
    select p_board_id,auth.uid(),'viewer',auth.uid(),clean
    where public.is_platform_admin(auth.uid()) and not exists(select 1 from public.work_board_members where board_id=p_board_id and user_id=auth.uid())
  on conflict(board_id,user_id) do update set preferences=excluded.preferences,updated_at=now();
  update public.work_board_members set preferences=clean,updated_at=now() where board_id=p_board_id and user_id=auth.uid();
  return clean;
end $$;

create or replace function public.wm_add_board_column_at(p_board_id uuid,p_name text,p_data_type text,p_config jsonb default '{}'::jsonb,p_position integer default null) returns uuid
language plpgsql security definer set search_path=public as $$
declare cid uuid; pos integer; nm text:=btrim(coalesce(p_name,'')); cfg jsonb; cnt integer;
begin
  if not public.work_board_access(p_board_id,'edit') then raise exception 'Board edit access denied' using errcode='42501'; end if;
  if char_length(nm) not between 1 and 80 then raise exception 'Column name must contain 1-80 characters'; end if;
  if exists(select 1 from public.work_board_columns where board_id=p_board_id and lower(name)=lower(nm)) then raise exception 'A column named "%" already exists',nm; end if;
  select count(*) into cnt from public.work_board_columns where board_id=p_board_id;
  if cnt>=30 then raise exception 'A board can contain at most 30 columns'; end if;
  cfg:=public.work_board_normalize_column_config(p_data_type,p_config);
  pos:=case when p_position is null then cnt else greatest(0,least(p_position,cnt)) end;
  update public.work_board_columns set position=position+1 where board_id=p_board_id and position>=pos;
  insert into public.work_board_columns(board_id,column_key,name,data_type,position,config,created_by,updated_by)
  values(p_board_id,'custom_'||replace(gen_random_uuid()::text,'-',''),nm,p_data_type,pos,cfg,auth.uid(),auth.uid()) returning id into cid;
  update public.work_boards set updated_at=now(),updated_by=auth.uid() where id=p_board_id;
  perform public.work_board_log(p_board_id,'column.created','Column added','column',cid::text,jsonb_build_object('name',nm,'data_type',p_data_type,'position',pos));
  return cid;
end $$;

create or replace function public.wm_duplicate_board_column(p_column_id uuid,p_with_values boolean default false) returns uuid
language plpgsql security definer set search_path=public as $$
declare c public.work_board_columns%rowtype; new_id uuid; nm text; n integer:=1; v jsonb; item record;
begin
  select * into c from public.work_board_columns where id=p_column_id;
  if c.id is null or not public.work_board_access(c.board_id,'edit') then raise exception 'Board edit access denied' using errcode='42501'; end if;
  if (select count(*) from public.work_board_columns where board_id=c.board_id)>=30 then raise exception 'A board can contain at most 30 columns'; end if;
  nm:=left(c.name||' copy',80);
  while exists(select 1 from public.work_board_columns where board_id=c.board_id and lower(name)=lower(nm)) loop n:=n+1; nm:=left(c.name||' copy '||n,80); end loop;
  new_id:=public.wm_add_board_column_at(c.board_id,nm,c.data_type,c.config,c.position+1);
  if p_with_values then
    for item in select * from public.work_board_items where board_id=c.board_id loop
      if c.system_key='title' then v:=to_jsonb(item.title);
      elsif c.system_key='status' then v:=to_jsonb(case item.status when 'not_started' then 'Not started' when 'in_progress' then 'In progress' when 'blocked' then 'Blocked' when 'done' then 'Done' else item.status end);
      elsif c.system_key='assignee' then v:=case when item.assignee_id is null then null else to_jsonb(item.assignee_id::text) end;
      elsif c.system_key='due_date' then v:=case when item.due_date is null then null else to_jsonb(item.due_date::text) end;
      elsif c.system_key='notes' then v:=case when item.notes='' then null else to_jsonb(item.notes) end;
      else select value into v from public.work_board_item_values where item_id=item.id and column_id=c.id; end if;
      if v is not null then
        insert into public.work_board_item_values(item_id,column_id,value,updated_by) values(item.id,new_id,public.work_board_validate_column_value(c.board_id,new_id,v),auth.uid())
        on conflict(item_id,column_id) do update set value=excluded.value,updated_by=excluded.updated_by,updated_at=now();
      end if;
      v:=null;
    end loop;
  end if;
  perform public.work_board_log(c.board_id,'column.duplicated','Column duplicated','column',new_id::text,jsonb_build_object('source_column_id',c.id,'with_values',p_with_values));
  return new_id;
end $$;

create or replace function public.wm_change_board_column_type(p_column_id uuid,p_data_type text,p_config jsonb default '{}'::jsonb,p_clear_values boolean default false) returns void
language plpgsql security definer set search_path=public as $$
declare c public.work_board_columns%rowtype; cfg jsonb; has_values boolean;
begin
  select * into c from public.work_board_columns where id=p_column_id;
  if c.id is null or not public.work_board_access(c.board_id,'edit') then raise exception 'Board edit access denied' using errcode='42501'; end if;
  if c.system_key is not null then raise exception 'Core column types cannot be changed'; end if;
  cfg:=public.work_board_normalize_column_config(p_data_type,p_config);
  select exists(select 1 from public.work_board_item_values where column_id=c.id and value is not null) into has_values;
  if c.data_type<>p_data_type and has_values and not p_clear_values then
    if not (c.data_type in ('text','long_text') and p_data_type in ('text','long_text')) then
      raise exception 'This column contains values. Choose to clear existing values before changing its type.';
    end if;
  end if;
  if p_clear_values and c.data_type<>p_data_type then delete from public.work_board_item_values where column_id=c.id; end if;
  update public.work_board_columns set data_type=p_data_type,config=cfg,updated_by=auth.uid(),updated_at=now() where id=c.id;
  update public.work_boards set updated_at=now(),updated_by=auth.uid() where id=c.board_id;
  perform public.work_board_log(c.board_id,'column.type_changed','Column type changed','column',c.id::text,jsonb_build_object('name',c.name,'from',c.data_type,'to',p_data_type,'cleared_values',p_clear_values));
end $$;

revoke all on function public.wm_get_board_preferences(uuid) from public;
revoke all on function public.wm_set_board_preferences(uuid,jsonb) from public;
revoke all on function public.wm_add_board_column_at(uuid,text,text,jsonb,integer) from public;
revoke all on function public.wm_duplicate_board_column(uuid,boolean) from public;
revoke all on function public.wm_change_board_column_type(uuid,text,jsonb,boolean) from public;
grant execute on function public.wm_get_board_preferences(uuid),public.wm_set_board_preferences(uuid,jsonb),public.wm_add_board_column_at(uuid,text,text,jsonb,integer),public.wm_duplicate_board_column(uuid,boolean),public.wm_change_board_column_type(uuid,text,jsonb,boolean) to authenticated;

commit;


-- Work Management v1.21.4 — flexible board creation with optional starting columns
begin;

-- New boards no longer receive a fixed Item/Status/Assignee/Due schema.
create or replace function public.wm_create_board(p_name text,p_description text default '') returns uuid
language plpgsql security definer set search_path=public as $$
declare caller uuid:=auth.uid(); ws uuid; bid uuid;
begin
  if caller is null then raise exception 'Authentication required' using errcode='42501'; end if;
  ws:=public.current_workspace_id(caller); if ws is null then raise exception 'Workspace membership required' using errcode='42501'; end if;
  if char_length(btrim(coalesce(p_name,''))) not between 1 and 120 then raise exception 'Board name must contain 1-120 characters'; end if;
  insert into public.work_boards(workspace_id,name,description,created_by,updated_by)
  values(ws,btrim(p_name),left(coalesce(p_description,''),1200),caller,caller) returning id into bid;
  insert into public.work_board_members(board_id,user_id,role,added_by) values(bid,caller,'owner',caller);
  insert into public.work_board_groups(board_id,title,position) values(bid,'Main group',0);
  perform public.work_board_log(bid,'board.created','Board created','board',bid::text,jsonb_build_object('name',btrim(p_name),'starting_columns',0));
  return bid;
end $$;

-- Atomic creation path used by the redesigned New Board workflow. p_columns is an
-- array of {name,data_type,config}; an empty array intentionally creates an empty board.
create or replace function public.wm_create_board_configured(
  p_name text,
  p_description text default '',
  p_columns jsonb default '[]'::jsonb
) returns uuid
language plpgsql security definer set search_path=public as $$
declare caller uuid:=auth.uid(); ws uuid; bid uuid; col jsonb; nm text; dtype text; cfg jsonb; pos integer:=0; key text;
begin
  if caller is null then raise exception 'Authentication required' using errcode='42501'; end if;
  ws:=public.current_workspace_id(caller); if ws is null then raise exception 'Workspace membership required' using errcode='42501'; end if;
  if char_length(btrim(coalesce(p_name,''))) not between 1 and 120 then raise exception 'Board name must contain 1-120 characters'; end if;
  if p_columns is null then p_columns:='[]'::jsonb; end if;
  if jsonb_typeof(p_columns)<>'array' then raise exception 'Starting columns must be an array'; end if;
  if jsonb_array_length(p_columns)>30 then raise exception 'A board can contain at most 30 columns'; end if;

  insert into public.work_boards(workspace_id,name,description,created_by,updated_by)
  values(ws,btrim(p_name),left(coalesce(p_description,''),1200),caller,caller) returning id into bid;
  insert into public.work_board_members(board_id,user_id,role,added_by) values(bid,caller,'owner',caller);
  insert into public.work_board_groups(board_id,title,position) values(bid,'Main group',0);

  for col in select value from jsonb_array_elements(p_columns) loop
    nm:=btrim(coalesce(col->>'name',''));
    dtype:=btrim(coalesce(col->>'data_type',''));
    if char_length(nm) not between 1 and 80 then raise exception 'Column name must contain 1-80 characters'; end if;
    if exists(select 1 from public.work_board_columns where board_id=bid and lower(name)=lower(nm)) then raise exception 'Starting column names must be unique'; end if;
    cfg:=public.work_board_normalize_column_config(dtype,coalesce(col->'config','{}'::jsonb));
    key:='col_'||replace(gen_random_uuid()::text,'-','');
    insert into public.work_board_columns(board_id,column_key,name,data_type,system_key,position,visible,required,config,created_by,updated_by)
    values(bid,key,nm,dtype,null,pos,true,false,cfg,caller,caller);
    pos:=pos+1;
  end loop;

  perform public.work_board_log(bid,'board.created','Board created','board',bid::text,jsonb_build_object('name',btrim(p_name),'starting_columns',pos));
  return bid;
end $$;

-- Duplicating an intentionally empty board must preserve its empty schema rather
-- than silently recreating the legacy default columns.
create or replace function public.wm_duplicate_board(p_board_id uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare src public.work_boards%rowtype; new_id uuid; g record; i record; new_gid uuid; new_iid uuid; caller uuid:=auth.uid();
begin
  if not public.work_board_access(p_board_id,'view') then raise exception 'Board access denied' using errcode='42501'; end if;
  select * into src from public.work_boards where id=p_board_id;
  insert into public.work_boards(workspace_id,name,description,created_by,updated_by) values(src.workspace_id,left(src.name||' copy',120),src.description,caller,caller) returning id into new_id;
  insert into public.work_board_members(board_id,user_id,role,added_by) values(new_id,caller,'owner',caller);
  insert into public.work_board_members(board_id,user_id,role,added_by)
    select new_id,bm.user_id,case when bm.role='owner' then 'editor' else bm.role end,caller from public.work_board_members bm where bm.board_id=p_board_id and bm.user_id<>caller
    on conflict(board_id,user_id) do nothing;
  insert into public.work_board_columns(board_id,column_key,name,data_type,system_key,position,visible,required,config,created_by,updated_by)
    select new_id,column_key,name,data_type,system_key,position,visible,required,config,caller,caller from public.work_board_columns where board_id=p_board_id order by position,id;
  for g in select * from public.work_board_groups where board_id=p_board_id order by position loop
    insert into public.work_board_groups(board_id,title,accent_color,position) values(new_id,g.title,coalesce(g.accent_color,'#5b7cfa'),g.position) returning id into new_gid;
    for i in select * from public.work_board_items where group_id=g.id and archived_at is null order by position,id loop
      insert into public.work_board_items(board_id,group_id,title,status,assignee_id,due_date,notes,position,created_by,updated_by)
      values(new_id,new_gid,i.title,i.status,i.assignee_id,i.due_date,i.notes,i.position,caller,caller) returning id into new_iid;
      insert into public.work_board_item_values(item_id,column_id,value,updated_by)
      select new_iid,nc.id,v.value,caller
      from public.work_board_item_values v
      join public.work_board_columns sc on sc.id=v.column_id
      join public.work_board_columns nc on nc.board_id=new_id and nc.column_key=sc.column_key
      where v.item_id=i.id;
    end loop;
  end loop;
  perform public.work_board_log(new_id,'board.created','Board duplicated','board',new_id::text,jsonb_build_object('source_board_id',p_board_id));
  return new_id;
end $$;

revoke all on function public.wm_create_board_configured(text,text,jsonb) from public;
grant execute on function public.wm_create_board_configured(text,text,jsonb) to authenticated;

commit;



-- Work Management v1.21.5 — backend capability marker and PostgREST schema refresh
create or replace function public.wm_board_backend_capabilities() returns jsonb
language sql stable security definer set search_path=public as $$
  select jsonb_build_object('schema_version','1.21.5','flexible_board_creation',true,'configured_create',true,'empty_boards',true,'removable_custom_columns',true);
$$;
revoke all on function public.wm_board_backend_capabilities() from public;
grant execute on function public.wm_board_backend_capabilities() to authenticated;
notify pgrst, 'reload schema';
-- Work Management v1.21.6 — collaborative item workspace
begin;

create table if not exists public.work_board_item_updates (
  id bigint generated by default as identity primary key,
  board_id uuid not null references public.work_boards(id) on delete cascade,
  item_id uuid not null references public.work_board_items(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 5000),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists work_board_item_updates_item_idx on public.work_board_item_updates(item_id,created_at desc,id desc);

create table if not exists public.work_board_item_files (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.work_boards(id) on delete cascade,
  item_id uuid not null references public.work_board_items(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null check (char_length(file_name) between 1 and 240),
  mime_type text not null default 'application/octet-stream',
  size_bytes bigint not null check (size_bytes between 0 and 20971520),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists work_board_item_files_item_idx on public.work_board_item_files(item_id,created_at desc);

alter table public.work_board_item_updates enable row level security;
alter table public.work_board_item_files enable row level security;
revoke all on public.work_board_item_updates, public.work_board_item_files from anon, authenticated;

create or replace function public.wm_get_board_item_workspace(p_item_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare bid uuid; result jsonb;
begin
  select board_id into bid from public.work_board_items where id=p_item_id;
  if bid is null or not public.work_board_access(bid,'view') then raise exception 'Board access denied' using errcode='42501'; end if;
  select jsonb_build_object(
    'updates',coalesce((select jsonb_agg(jsonb_build_object(
      'id',u.id,'body',u.body,'created_by',u.created_by,'created_at',u.created_at,'updated_at',u.updated_at,
      'author_name',coalesce(p.display_name,p.email),'author_email',p.email,'can_delete',(u.created_by=auth.uid() or public.work_board_access(bid,'manage'))
    ) order by u.created_at desc,u.id desc) from public.work_board_item_updates u join public.profiles p on p.id=u.created_by where u.item_id=p_item_id),'[]'::jsonb),
    'files',coalesce((select jsonb_agg(jsonb_build_object(
      'id',f.id,'file_name',f.file_name,'mime_type',f.mime_type,'size_bytes',f.size_bytes,'storage_path',f.storage_path,
      'created_by',f.created_by,'created_at',f.created_at,'author_name',coalesce(p.display_name,p.email),'can_delete',(f.created_by=auth.uid() or public.work_board_access(bid,'manage'))
    ) order by f.created_at desc) from public.work_board_item_files f join public.profiles p on p.id=f.created_by where f.item_id=p_item_id),'[]'::jsonb),
    'activity',coalesce((select jsonb_agg(jsonb_build_object(
      'id',e.id,'event_type',e.event_type,'message',e.message,'payload',e.payload,'created_at',e.created_at,
      'actor_name',coalesce(p.display_name,p.email),'actor_email',p.email
    ) order by e.id desc) from public.work_board_events e join public.profiles p on p.id=e.actor_id where e.board_id=bid and e.entity_type='item' and e.entity_id=p_item_id::text),'[]'::jsonb)
  ) into result;
  return result;
end $$;

create or replace function public.wm_add_board_item_update(p_item_id uuid,p_body text) returns bigint
language plpgsql security definer set search_path=public as $$
declare bid uuid; uid bigint;
begin
  select board_id into bid from public.work_board_items where id=p_item_id;
  if bid is null or not public.work_board_access(bid,'view') then raise exception 'Board access denied' using errcode='42501'; end if;
  if char_length(btrim(coalesce(p_body,''))) not between 1 and 5000 then raise exception 'Update must contain 1-5000 characters'; end if;
  insert into public.work_board_item_updates(board_id,item_id,body,created_by) values(bid,p_item_id,btrim(p_body),auth.uid()) returning id into uid;
  update public.work_boards set updated_at=now(),updated_by=auth.uid() where id=bid;
  perform public.work_board_log(bid,'item.update_added','Update posted','item',p_item_id::text,jsonb_build_object('update_id',uid));
  return uid;
end $$;

create or replace function public.wm_delete_board_item_update(p_update_id bigint) returns void
language plpgsql security definer set search_path=public as $$
declare row_now public.work_board_item_updates%rowtype;
begin
  select * into row_now from public.work_board_item_updates where id=p_update_id;
  if row_now.id is null or not public.work_board_access(row_now.board_id,'view') then raise exception 'Update not found'; end if;
  if row_now.created_by<>auth.uid() and not public.work_board_access(row_now.board_id,'manage') then raise exception 'Only the update author or board owner can delete this update' using errcode='42501'; end if;
  delete from public.work_board_item_updates where id=p_update_id;
  perform public.work_board_log(row_now.board_id,'item.update_deleted','Update deleted','item',row_now.item_id::text,jsonb_build_object('update_id',p_update_id));
end $$;

create or replace function public.wm_register_board_item_file(p_item_id uuid,p_storage_path text,p_file_name text,p_mime_type text,p_size_bytes bigint) returns uuid
language plpgsql security definer set search_path=public as $$
declare bid uuid; fid uuid;
begin
  select board_id into bid from public.work_board_items where id=p_item_id;
  if bid is null or not public.work_board_access(bid,'view') then raise exception 'Board access denied' using errcode='42501'; end if;
  if char_length(btrim(coalesce(p_file_name,''))) not between 1 and 240 then raise exception 'Invalid file name'; end if;
  if coalesce(p_size_bytes,-1) not between 0 and 20971520 then raise exception 'Files must be 20 MB or smaller'; end if;
  if p_storage_path not like bid::text||'/'||p_item_id::text||'/%' then raise exception 'Invalid file path'; end if;
  insert into public.work_board_item_files(board_id,item_id,storage_path,file_name,mime_type,size_bytes,created_by)
  values(bid,p_item_id,p_storage_path,btrim(p_file_name),left(coalesce(nullif(p_mime_type,''),'application/octet-stream'),160),p_size_bytes,auth.uid()) returning id into fid;
  update public.work_boards set updated_at=now(),updated_by=auth.uid() where id=bid;
  perform public.work_board_log(bid,'item.file_added','File attached','item',p_item_id::text,jsonb_build_object('file_id',fid,'file_name',btrim(p_file_name)));
  return fid;
end $$;

create or replace function public.wm_delete_board_item_file(p_file_id uuid) returns text
language plpgsql security definer set search_path=public as $$
declare row_now public.work_board_item_files%rowtype;
begin
  select * into row_now from public.work_board_item_files where id=p_file_id;
  if row_now.id is null or not public.work_board_access(row_now.board_id,'view') then raise exception 'File not found'; end if;
  if row_now.created_by<>auth.uid() and not public.work_board_access(row_now.board_id,'manage') then raise exception 'Only the uploader or board owner can remove this file' using errcode='42501'; end if;
  delete from public.work_board_item_files where id=p_file_id;
  perform public.work_board_log(row_now.board_id,'item.file_deleted','File removed','item',row_now.item_id::text,jsonb_build_object('file_id',p_file_id,'file_name',row_now.file_name));
  return row_now.storage_path;
end $$;

revoke all on function public.wm_get_board_item_workspace(uuid) from public;
revoke all on function public.wm_add_board_item_update(uuid,text) from public;
revoke all on function public.wm_delete_board_item_update(bigint) from public;
revoke all on function public.wm_register_board_item_file(uuid,text,text,text,bigint) from public;
revoke all on function public.wm_delete_board_item_file(uuid) from public;
grant execute on function public.wm_get_board_item_workspace(uuid) to authenticated;
grant execute on function public.wm_add_board_item_update(uuid,text) to authenticated;
grant execute on function public.wm_delete_board_item_update(bigint) to authenticated;
grant execute on function public.wm_register_board_item_file(uuid,text,text,text,bigint) to authenticated;
grant execute on function public.wm_delete_board_item_file(uuid) to authenticated;

-- Private Supabase Storage bucket used by item attachments.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('work-board-files','work-board-files',false,20971520,null)
on conflict(id) do update set public=false,file_size_limit=20971520;

drop policy if exists "wm board files read" on storage.objects;
drop policy if exists "wm board files insert" on storage.objects;
drop policy if exists "wm board files delete" on storage.objects;
create policy "wm board files read" on storage.objects for select to authenticated using (
  bucket_id='work-board-files' and public.work_board_access(((storage.foldername(name))[1])::uuid,'view')
);
create policy "wm board files insert" on storage.objects for insert to authenticated with check (
  bucket_id='work-board-files' and owner_id=auth.uid()::text and public.work_board_access(((storage.foldername(name))[1])::uuid,'view')
);
create policy "wm board files delete" on storage.objects for delete to authenticated using (
  bucket_id='work-board-files' and (owner_id=auth.uid()::text or public.work_board_access(((storage.foldername(name))[1])::uuid,'manage'))
);

create or replace function public.wm_board_backend_capabilities() returns jsonb
language sql stable security definer set search_path=public as $$
  select jsonb_build_object('schema_version','1.21.6','flexible_board_creation',true,'configured_create',true,'empty_boards',true,'removable_custom_columns',true,'item_workspace',true,'item_updates',true,'item_files',true,'item_activity',true);
$$;
revoke all on function public.wm_board_backend_capabilities() from public;
grant execute on function public.wm_board_backend_capabilities() to authenticated;
notify pgrst, 'reload schema';
commit;
-- Work Management v1.31.0 — interactive board engine
-- Adds persistent per-user table layout preferences, robust ordering, item duplication/deletion,
-- and group ordering while preserving existing authorization boundaries.
begin;

create or replace function public.work_board_validate_preferences(p_board_id uuid,p_preferences jsonb) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare
  p jsonb:=coalesce(p_preferences,'{}'::jsonb);
  clean_filters jsonb:='{}'::jsonb;
  clean_wrap jsonb:='[]'::jsonb;
  clean_widths jsonb:='{}'::jsonb;
  clean_collapsed jsonb:='[]'::jsonb;
  k text; val jsonb; cid uuid; gid uuid; width integer;
  sort_id uuid:=null;
  identity_width integer:=280;
begin
  if jsonb_typeof(p)<>'object' then p:='{}'::jsonb; end if;
  begin
    identity_width:=coalesce(nullif(p->>'item_name_width','')::integer,280);
  exception when others then
    identity_width:=280;
  end;
  begin
    sort_id:=nullif(p->>'sort_column_id','')::uuid;
  exception when others then
    sort_id:=null;
  end;

  if jsonb_typeof(p->'column_filters')='object' then
    for k,val in select key,value from jsonb_each(p->'column_filters') loop
      begin cid:=k::uuid; exception when others then continue; end;
      if exists(select 1 from public.work_board_columns where id=cid and board_id=p_board_id)
         and jsonb_typeof(val)='string' and char_length(val#>>'{}')<=240 then
        clean_filters:=clean_filters||jsonb_build_object(k,val);
      end if;
    end loop;
  end if;

  if jsonb_typeof(p->'wrap_columns')='array' then
    select coalesce(jsonb_agg(to_jsonb(x.id::text)),'[]'::jsonb) into clean_wrap
    from public.work_board_columns x
    where x.board_id=p_board_id and x.id::text in (select value from jsonb_array_elements_text(p->'wrap_columns'));
  end if;

  if jsonb_typeof(p->'column_widths')='object' then
    for k,val in select key,value from jsonb_each(p->'column_widths') loop
      begin cid:=k::uuid; exception when others then continue; end;
      if not exists(select 1 from public.work_board_columns where id=cid and board_id=p_board_id) then continue; end if;
      begin width:=(val#>>'{}')::integer; exception when others then continue; end;
      width:=greatest(96,least(width,720));
      clean_widths:=clean_widths||jsonb_build_object(k,width);
    end loop;
  end if;

  if jsonb_typeof(p->'collapsed_groups')='array' then
    select coalesce(jsonb_agg(to_jsonb(g.id::text)),'[]'::jsonb) into clean_collapsed
    from public.work_board_groups g
    where g.board_id=p_board_id and g.id::text in (select value from jsonb_array_elements_text(p->'collapsed_groups'));
  end if;

  identity_width:=greatest(180,least(coalesce(identity_width,280),720));

  return jsonb_build_object(
    'sort_column_id',case when sort_id is not null and exists(select 1 from public.work_board_columns where id=sort_id and board_id=p_board_id) then sort_id::text else null end,
    'sort_direction',case when p->>'sort_direction' in ('asc','desc') then p->>'sort_direction' else null end,
    'column_filters',clean_filters,
    'wrap_columns',clean_wrap,
    'column_widths',clean_widths,
    'item_name_width',identity_width,
    'collapsed_groups',clean_collapsed
  );
exception when others then
  -- Preference corruption must never break the board. Return a sanitized baseline while
  -- preserving any portions that were safely validated before the malformed value.
  return jsonb_build_object(
    'sort_column_id',null,
    'sort_direction',null,
    'column_filters',clean_filters,
    'wrap_columns',clean_wrap,
    'column_widths',clean_widths,
    'item_name_width',greatest(180,least(coalesce(identity_width,280),720)),
    'collapsed_groups',clean_collapsed
  );
end $$;

create or replace function public.wm_move_board_item(p_item_id uuid,p_group_id uuid,p_position integer,p_status text default null) returns void
language plpgsql security definer set search_path=public as $$
declare
  i public.work_board_items%rowtype;
  target_group public.work_board_groups%rowtype;
  target integer;
  target_count integer;
  next_status text;
begin
  select * into i from public.work_board_items where id=p_item_id for update;
  if i.id is null or not public.work_board_access(i.board_id,'edit') then raise exception 'Board edit access denied' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(i.board_id::text,0));
  select * into target_group from public.work_board_groups where id=p_group_id and board_id=i.board_id;
  if target_group.id is null then raise exception 'Target group does not belong to this board'; end if;
  next_status:=coalesce(nullif(p_status,''),i.status);
  if next_status not in ('not_started','in_progress','blocked','done') then raise exception 'Unsupported item status'; end if;

  -- Remove the source from its current ordering before inserting it at the destination.
  update public.work_board_items
     set position=position-1
   where board_id=i.board_id and group_id=i.group_id and id<>i.id and archived_at is null and position>i.position;

  select count(*) into target_count
    from public.work_board_items
   where board_id=i.board_id and group_id=p_group_id and id<>i.id and archived_at is null;
  target:=greatest(0,least(coalesce(p_position,target_count),target_count));

  update public.work_board_items
     set position=position+1
   where board_id=i.board_id and group_id=p_group_id and id<>i.id and archived_at is null and position>=target;

  update public.work_board_items
     set group_id=p_group_id,position=target,status=next_status,updated_by=auth.uid(),updated_at=now()
   where id=i.id;
  update public.work_boards set updated_at=now(),updated_by=auth.uid() where id=i.board_id;
  perform public.work_board_log(i.board_id,'item.moved','Item moved','item',i.id::text,jsonb_build_object('group_id',p_group_id,'position',target,'status',next_status));
end $$;

create or replace function public.wm_move_board_group(p_group_id uuid,p_position integer) returns void
language plpgsql security definer set search_path=public as $$
declare g public.work_board_groups%rowtype; target integer; old integer; cnt integer;
begin
  select * into g from public.work_board_groups where id=p_group_id for update;
  if g.id is null or not public.work_board_access(g.board_id,'edit') then raise exception 'Board edit access denied' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(g.board_id::text,0));
  select count(*) into cnt from public.work_board_groups where board_id=g.board_id;
  target:=greatest(0,least(coalesce(p_position,0),greatest(cnt-1,0)));
  old:=g.position;
  if target=old then return; end if;
  if target<old then
    update public.work_board_groups set position=position+1 where board_id=g.board_id and id<>g.id and position>=target and position<old;
  else
    update public.work_board_groups set position=position-1 where board_id=g.board_id and id<>g.id and position>old and position<=target;
  end if;
  update public.work_board_groups set position=target where id=g.id;
  update public.work_boards set updated_at=now(),updated_by=auth.uid() where id=g.board_id;
  perform public.work_board_log(g.board_id,'group.moved','Group reordered','group',g.id::text,jsonb_build_object('position',target));
end $$;

create or replace function public.wm_duplicate_board_item(p_item_id uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare
  src public.work_board_items%rowtype;
  new_id uuid;
  pos integer;
  nm text;
begin
  select * into src from public.work_board_items where id=p_item_id;
  if src.id is null or not public.work_board_access(src.board_id,'edit') then raise exception 'Board edit access denied' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(src.board_id::text,0));
  pos:=src.position+1;
  update public.work_board_items set position=position+1 where board_id=src.board_id and group_id=src.group_id and archived_at is null and position>=pos;
  nm:=left(src.title||' copy',240);
  insert into public.work_board_items(board_id,group_id,title,status,assignee_id,due_date,notes,position,created_by,updated_by,archived_at)
  values(src.board_id,src.group_id,nm,src.status,src.assignee_id,src.due_date,src.notes,pos,auth.uid(),auth.uid(),null)
  returning id into new_id;
  insert into public.work_board_item_values(item_id,column_id,value,updated_by,updated_at)
    select new_id,column_id,value,auth.uid(),now() from public.work_board_item_values where item_id=src.id;
  update public.work_boards set updated_at=now(),updated_by=auth.uid() where id=src.board_id;
  perform public.work_board_log(src.board_id,'item.duplicated','Item duplicated','item',new_id::text,jsonb_build_object('source_item_id',src.id,'title',nm));
  return new_id;
end $$;

create or replace function public.wm_delete_board_item(p_item_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare src public.work_board_items%rowtype;
begin
  select * into src from public.work_board_items where id=p_item_id;
  if src.id is null or not public.work_board_access(src.board_id,'edit') then raise exception 'Board edit access denied' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(src.board_id::text,0));
  if exists(select 1 from public.work_board_item_files where item_id=src.id) then
    raise exception 'Remove item files before permanently deleting the item';
  end if;
  perform public.work_board_log(src.board_id,'item.deleted','Item permanently deleted','item',src.id::text,jsonb_build_object('title',src.title,'group_id',src.group_id,'position',src.position));
  delete from public.work_board_items where id=src.id;
  update public.work_board_items set position=position-1 where board_id=src.board_id and group_id=src.group_id and archived_at is null and position>src.position;
  update public.work_boards set updated_at=now(),updated_by=auth.uid() where id=src.board_id;
end $$;

-- Legacy system-backed columns are no longer treated as permanent presentation requirements.
-- Deleting one removes its board column definition; the item's underlying canonical field remains
-- available to the Item Details model and can be surfaced again by future configuration if needed.
create or replace function public.wm_delete_board_column(p_column_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare c public.work_board_columns%rowtype;
begin
  select * into c from public.work_board_columns where id=p_column_id;
  if c.id is null or not public.work_board_access(c.board_id,'edit') then raise exception 'Board edit access denied' using errcode='42501'; end if;
  delete from public.work_board_columns where id=c.id;
  update public.work_board_columns set position=position-1 where board_id=c.board_id and position>c.position;
  update public.work_boards set updated_at=now(),updated_by=auth.uid() where id=c.board_id;
  perform public.work_board_log(c.board_id,'column.deleted','Column deleted','column',c.id::text,jsonb_build_object('name',c.name,'data_type',c.data_type,'system_key',c.system_key));
end $$;

create or replace function public.wm_board_backend_capabilities() returns jsonb
language sql stable security definer set search_path=public as $$
  select jsonb_build_object(
    'schema_version','1.31.0',
    'flexible_board_creation',true,
    'configured_create',true,
    'empty_boards',true,
    'removable_custom_columns',true,
    'item_workspace',true,
    'item_updates',true,
    'item_files',true,
    'item_activity',true,
    'interactive_table',true,
    'persistent_column_widths',true,
    'item_reordering',true,
    'item_duplication',true,
    'item_deletion',true,
    'group_reordering',true
  );
$$;

revoke all on function public.wm_move_board_group(uuid,integer) from public;
revoke all on function public.wm_duplicate_board_item(uuid) from public;
revoke all on function public.wm_delete_board_item(uuid) from public;
grant execute on function public.wm_move_board_group(uuid,integer),public.wm_duplicate_board_item(uuid),public.wm_delete_board_item(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;


-- Work Management v1.33.0 — grouped board-sheet accents and stable group identity.
begin;

alter table public.work_board_groups add column if not exists accent_color text;
update public.work_board_groups set accent_color='#5b7cfa' where accent_color is null or accent_color !~ '^#[0-9A-Fa-f]{6}$';
alter table public.work_board_groups alter column accent_color set default '#5b7cfa';
alter table public.work_board_groups alter column accent_color set not null;

create or replace function public.wm_set_board_group_accent(p_group_id uuid,p_accent_color text) returns void
language plpgsql security definer set search_path=public as $$
declare bid uuid; color text:=lower(btrim(coalesce(p_accent_color,'')));
begin
  select board_id into bid from public.work_board_groups where id=p_group_id;
  if bid is null or not public.work_board_access(bid,'edit') then raise exception 'Board edit access denied' using errcode='42501'; end if;
  if color !~ '^#[0-9a-f]{6}$' then raise exception 'Invalid group accent color'; end if;
  update public.work_board_groups set accent_color=color,updated_at=now() where id=p_group_id;
  update public.work_boards set updated_at=now(),updated_by=auth.uid() where id=bid;
  perform public.work_board_log(bid,'group.color_updated','Group color updated','group',p_group_id::text,jsonb_build_object('accent_color',color));
end $$;

create or replace function public.wm_board_backend_capabilities() returns jsonb
language sql stable security definer set search_path=public as $$
  select jsonb_build_object(
    'schema_version','1.33.0','flexible_board_creation',true,'configured_create',true,
    'empty_boards',true,'removable_custom_columns',true,'item_workspace',true,
    'item_updates',true,'item_files',true,'item_activity',true,'interactive_table',true,
    'persistent_column_widths',true,'item_reordering',true,'item_duplication',true,
    'item_deletion',true,'group_reordering',true,'group_accents',true
  );
$$;

revoke all on function public.wm_set_board_group_accent(uuid,text) from public;
grant execute on function public.wm_set_board_group_accent(uuid,text),public.wm_board_backend_capabilities() to authenticated;

commit;

-- Work Management v1.34.0 — configurable Status labels and stable label identifiers
begin;

-- Status is now a column-configured label reference. Null represents an intentionally empty status.
alter table public.work_board_items drop constraint if exists work_board_items_status_check;
alter table public.work_board_items alter column status drop not null;

-- Upgrade legacy Status column configs to label objects with stable per-column identifiers.
update public.work_board_columns c
set config = jsonb_build_object(
  'labels', jsonb_build_array(
    jsonb_build_object('id','not_started','name','Not started','color','#7f8a9a','active',true,'description','','position',0),
    jsonb_build_object('id','in_progress','name','In progress','color','#4f7df3','active',true,'description','','position',1),
    jsonb_build_object('id','blocked','name','Blocked','color','#e64f70','active',true,'description','','position',2),
    jsonb_build_object('id','done','name','Done','color','#23b784','active',true,'description','','position',3)
  ),
  'default_label_id','not_started'
)
where c.data_type='status' and c.system_key='status' and jsonb_typeof(c.config->'labels') is distinct from 'array';

do $$
declare c record; opts jsonb; built jsonb; entry text; idx integer; lid text; colors text[]:=array['#7f8a9a','#4f7df3','#e64f70','#23b784','#6d5bd0','#2a9bb8','#d9a227','#d54a9c'];
begin
  for c in select id,config from public.work_board_columns where data_type='status' and system_key is null and jsonb_typeof(config->'labels') is distinct from 'array' loop
    opts:=c.config->'options';
    if opts is null or jsonb_typeof(opts)<>'array' or jsonb_array_length(opts)=0 then
      opts:=jsonb_build_array('Not started','In progress','Blocked','Done');
    end if;
    built:='[]'::jsonb; idx:=0;
    for entry in select value from jsonb_array_elements_text(opts) loop
      lid:='status_'||substr(md5(c.id::text||':'||lower(entry)),1,20);
      built:=built||jsonb_build_array(jsonb_build_object('id',lid,'name',entry,'color',colors[(idx % array_length(colors,1))+1],'active',true,'description','','position',idx));
      idx:=idx+1;
    end loop;
    update public.work_board_columns set config=jsonb_build_object('labels',built,'default_label_id',case when jsonb_array_length(built)>0 then built->0->>'id' else null end) where id=c.id;
    update public.work_board_item_values v
    set value=to_jsonb(label.id)
    from (
      select x->>'id' id,x->>'name' name from jsonb_array_elements(built) x
    ) label
    where v.column_id=c.id and v.value is not null and v.value#>>'{}'=label.name;
  end loop;
end $$;

create or replace function public.work_board_normalize_column_config(p_type text,p_config jsonb) returns jsonb
language plpgsql immutable set search_path=public as $$
declare cfg jsonb:=coalesce(p_config,'{}'::jsonb); options jsonb; clean jsonb:='[]'::jsonb; x jsonb; label text; id text; color text; active boolean; description text; pos integer:=0; default_id text;
begin
  if p_type not in ('text','long_text','number','status','dropdown','date','people','checkbox','url','email','timeline') then raise exception 'Unsupported column type'; end if;
  if p_type='status' then
    options:=cfg->'labels';
    if options is null or jsonb_typeof(options)<>'array' or jsonb_array_length(options)=0 then
      if jsonb_typeof(cfg->'options')='array' and jsonb_array_length(cfg->'options')>0 then
        options:='[]'::jsonb;
        pos:=0;
        for label in select value from jsonb_array_elements_text(cfg->'options') loop
          options:=options||jsonb_build_array(jsonb_build_object(
            'id','status_'||substr(md5(lower(btrim(label))),1,20),
            'name',btrim(label),
            'color',(array['#7f8a9a','#4f7df3','#e64f70','#23b784','#6d5bd0','#2a9bb8','#d9a227','#d54a9c'])[(pos % 8)+1],
            'active',true,'description',''
          ));
          pos:=pos+1;
        end loop;
        pos:=0;
      else
        options:=jsonb_build_array(
          jsonb_build_object('id','not_started','name','Not started','color','#7f8a9a','active',true,'description',''),
          jsonb_build_object('id','in_progress','name','In progress','color','#4f7df3','active',true,'description',''),
          jsonb_build_object('id','blocked','name','Blocked','color','#e64f70','active',true,'description',''),
          jsonb_build_object('id','done','name','Done','color','#23b784','active',true,'description','')
        );
      end if;
    end if;
    if jsonb_array_length(options)>50 then raise exception 'A Status column can contain at most 50 labels'; end if;
    for x in select value from jsonb_array_elements(options) loop
      if jsonb_typeof(x)<>'object' then raise exception 'Status labels must be objects'; end if;
      id:=btrim(coalesce(x->>'id','')); label:=btrim(coalesce(x->>'name','')); color:=lower(btrim(coalesce(x->>'color','#7f8a9a')));
      description:=left(btrim(coalesce(x->>'description','')),240); active:=coalesce((x->>'active')::boolean,true);
      if char_length(id) not between 1 and 96 or id !~ '^[A-Za-z0-9_:-]+$' then raise exception 'Status label IDs must contain only letters, numbers, underscore, colon, or hyphen'; end if;
      if char_length(label) not between 1 and 80 then raise exception 'Status label names must contain 1-80 characters'; end if;
      if color !~ '^#[0-9a-f]{6}$' then raise exception 'Status label colors must use six-digit hex values'; end if;
      if exists(select 1 from jsonb_array_elements(clean) e where lower(e->>'name')=lower(label)) then raise exception 'Status label names must be unique'; end if;
      if exists(select 1 from jsonb_array_elements(clean) e where e->>'id'=id) then raise exception 'Status label IDs must be unique'; end if;
      clean:=clean||jsonb_build_array(jsonb_build_object('id',id,'name',label,'color',color,'active',active,'description',description,'position',pos)); pos:=pos+1;
    end loop;
    if not exists(select 1 from jsonb_array_elements(clean) e where coalesce((e->>'active')::boolean,true)) then raise exception 'Keep at least one active status label'; end if;
    default_id:=nullif(btrim(coalesce(cfg->>'default_label_id','')),'');
    if default_id is null or not exists(select 1 from jsonb_array_elements(clean) e where e->>'id'=default_id and coalesce((e->>'active')::boolean,true)) then
      select e->>'id' into default_id from jsonb_array_elements(clean) e where coalesce((e->>'active')::boolean,true) limit 1;
    end if;
    return jsonb_build_object('labels',clean,'default_label_id',default_id);
  elsif p_type='dropdown' then
    options:=cfg->'options';
    if options is null or jsonb_typeof(options)<>'array' or jsonb_array_length(options)=0 then options:=jsonb_build_array('Option 1','Option 2'); end if;
    if jsonb_array_length(options)>50 then raise exception 'A choice column can contain at most 50 options'; end if;
    for x in select value from jsonb_array_elements(options) loop
      if jsonb_typeof(x)<>'string' then raise exception 'Choice options must be text'; end if;
      label:=btrim(x#>>'{}');
      if char_length(label) not between 1 and 80 then raise exception 'Choice options must contain 1-80 characters'; end if;
      if exists(select 1 from jsonb_array_elements_text(clean) as e(value) where lower(e.value)=lower(label)) then raise exception 'Choice options must be unique'; end if;
      clean:=clean||jsonb_build_array(label);
    end loop;
    return jsonb_build_object('options',clean);
  end if;
  return '{}'::jsonb;
end $$;
revoke all on function public.work_board_normalize_column_config(text,jsonb) from public;

create or replace function public.work_board_validate_column_value(p_board_id uuid,p_column_id uuid,p_value jsonb) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare c public.work_board_columns%rowtype; t text; u uuid; d date; start_d date; end_d date; is_empty boolean:=false;
begin
  select * into c from public.work_board_columns where id=p_column_id and board_id=p_board_id;
  if c.id is null then raise exception 'Column does not belong to board'; end if;
  if p_value is null or p_value='null'::jsonb then if c.required then raise exception '% is required',c.name; end if; return null; end if;
  if c.data_type in ('text','long_text','status','dropdown','date','people','url','email') then
    if jsonb_typeof(p_value)<>'string' then raise exception '% requires a text value',c.name; end if;
    t:=btrim(p_value#>>'{}'); is_empty:=(t=''); if is_empty then if c.required then raise exception '% is required',c.name; end if; return null; end if;
  end if;
  case c.data_type
    when 'text' then if char_length(t)>1000 then raise exception '% is limited to 1000 characters',c.name; end if; return to_jsonb(t);
    when 'long_text' then if char_length(t)>5000 then raise exception '% is limited to 5000 characters',c.name; end if; return to_jsonb(t);
    when 'number' then if jsonb_typeof(p_value)<>'number' then raise exception '% requires a number',c.name; end if; return p_value;
    when 'checkbox' then if jsonb_typeof(p_value)<>'boolean' then raise exception '% requires true or false',c.name; end if; return p_value;
    when 'status' then
      if not exists(select 1 from jsonb_array_elements(c.config->'labels') e where e->>'id'=t) then raise exception 'Select a valid status for %',c.name; end if;
      return to_jsonb(t);
    when 'dropdown' then if not exists(select 1 from jsonb_array_elements_text(c.config->'options') o(value) where o.value=t) then raise exception 'Select a valid option for %',c.name; end if; return to_jsonb(t);
    when 'date' then begin d:=t::date; exception when others then raise exception '% requires a valid date',c.name; end; return to_jsonb(d::text);
    when 'people' then begin u:=t::uuid; exception when others then raise exception '% requires a valid board member',c.name; end; if not exists(select 1 from public.work_board_members where board_id=p_board_id and user_id=u) then raise exception 'Assignee must be a board member'; end if; return to_jsonb(u::text);
    when 'url' then if t !~* '^https?://[^[:space:]]+$' or char_length(t)>2000 then raise exception '% requires a valid http(s) URL',c.name; end if; return to_jsonb(t);
    when 'email' then if t !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or char_length(t)>320 then raise exception '% requires a valid email address',c.name; end if; return to_jsonb(lower(t));
    when 'timeline' then
      if jsonb_typeof(p_value)<>'object' then raise exception '% requires a start/end date range',c.name; end if;
      if coalesce(p_value->>'start','')='' and coalesce(p_value->>'end','')='' then if c.required then raise exception '% is required',c.name; end if; return null; end if;
      begin start_d:=(p_value->>'start')::date; end_d:=(p_value->>'end')::date; exception when others then raise exception '% requires valid start and end dates',c.name; end;
      if end_d<start_d then raise exception '% end date cannot be before its start date',c.name; end if;
      return jsonb_build_object('start',start_d::text,'end',end_d::text);
    else raise exception 'Unsupported column type';
  end case;
end $$;

create or replace function public.wm_update_board_column(p_column_id uuid,p_name text,p_config jsonb,p_visible boolean default true) returns void
language plpgsql security definer set search_path=public as $$
declare c public.work_board_columns%rowtype; nm text:=btrim(coalesce(p_name,'')); cfg jsonb; bad bigint;
begin
  select * into c from public.work_board_columns where id=p_column_id;
  if c.id is null or not public.work_board_access(c.board_id,'edit') then raise exception 'Board edit access denied' using errcode='42501'; end if;
  if char_length(nm) not between 1 and 80 then raise exception 'Column name must contain 1-80 characters'; end if;
  if exists(select 1 from public.work_board_columns where board_id=c.board_id and id<>c.id and lower(name)=lower(nm)) then raise exception 'A column named "%" already exists',nm; end if;
  cfg:=public.work_board_normalize_column_config(c.data_type,p_config);
  if c.system_key='title' then p_visible:=true; end if;
  if c.data_type='status' then
    if c.system_key='status' then
      select count(*) into bad from public.work_board_items i where i.board_id=c.board_id and i.status is not null and not exists(select 1 from jsonb_array_elements(cfg->'labels') e where e->>'id'=i.status);
    else
      select count(*) into bad from public.work_board_item_values v where v.column_id=c.id and v.value is not null and not exists(select 1 from jsonb_array_elements(cfg->'labels') e where e->>'id'=(v.value#>>'{}'));
    end if;
    if bad>0 then raise exception 'Existing items use labels that would be removed. Use Manage labels so affected values can be handled safely.'; end if;
  elsif c.data_type='dropdown' and c.system_key is null then
    select count(*) into bad from public.work_board_item_values v where v.column_id=c.id and v.value is not null and not exists(select 1 from jsonb_array_elements_text(cfg->'options') o(value) where o.value=(v.value#>>'{}'));
    if bad>0 then raise exception 'Existing values use options that would be removed. Update those items first.'; end if;
  end if;
  update public.work_board_columns set name=nm,config=cfg,visible=coalesce(p_visible,true),updated_by=auth.uid(),updated_at=now() where id=c.id;
  update public.work_boards set updated_at=now(),updated_by=auth.uid() where id=c.board_id;
  perform public.work_board_log(c.board_id,'column.updated','Column updated','column',c.id::text,jsonb_build_object('name',nm,'visible',p_visible));
end $$;

create or replace function public.wm_set_board_status_labels(p_column_id uuid,p_labels jsonb,p_default_label_id text default null) returns jsonb
language plpgsql security definer set search_path=public as $$
declare c public.work_board_columns%rowtype; cfg jsonb; default_id text; cleared bigint:=0;
begin
  select * into c from public.work_board_columns where id=p_column_id;
  if c.id is null or not public.work_board_access(c.board_id,'edit') then raise exception 'Board edit access denied' using errcode='42501'; end if;
  if c.data_type<>'status' then raise exception 'This column is not a Status column'; end if;
  cfg:=public.work_board_normalize_column_config('status',jsonb_build_object('labels',coalesce(p_labels,'[]'::jsonb),'default_label_id',p_default_label_id));
  default_id:=cfg->>'default_label_id';
  if c.system_key='status' then
    update public.work_board_items i set status=null,updated_by=auth.uid(),updated_at=now()
      where i.board_id=c.board_id and i.status is not null and not exists(select 1 from jsonb_array_elements(cfg->'labels') e where e->>'id'=i.status);
    get diagnostics cleared = row_count;
  else
    delete from public.work_board_item_values v where v.column_id=c.id and v.value is not null and not exists(select 1 from jsonb_array_elements(cfg->'labels') e where e->>'id'=(v.value#>>'{}'));
    get diagnostics cleared = row_count;
  end if;
  update public.work_board_columns set config=cfg,updated_by=auth.uid(),updated_at=now() where id=c.id;
  update public.work_boards set updated_at=now(),updated_by=auth.uid() where id=c.board_id;
  perform public.work_board_log(c.board_id,'column.status_labels_updated','Status labels updated','column',c.id::text,jsonb_build_object('label_count',jsonb_array_length(cfg->'labels'),'default_label_id',default_id,'cleared_values',cleared));
  return cfg;
end $$;

create or replace function public.wm_add_board_item(p_board_id uuid,p_group_id uuid,p_title text) returns uuid
language plpgsql security definer set search_path=public as $$
declare iid uuid; pos integer; initial_status text:='not_started';
begin
  if not public.work_board_access(p_board_id,'edit') then raise exception 'Board edit access denied' using errcode='42501'; end if;
  if not exists(select 1 from public.work_board_groups where id=p_group_id and board_id=p_board_id) then raise exception 'Group does not belong to board'; end if;
  if char_length(btrim(coalesce(p_title,''))) not between 1 and 240 then raise exception 'Item title is required'; end if;
  select c.config->>'default_label_id' into initial_status from public.work_board_columns c where c.board_id=p_board_id and c.system_key='status' and c.data_type='status' limit 1;
  initial_status:=coalesce(initial_status,'not_started');
  select coalesce(max(position),-1)+1 into pos from public.work_board_items where group_id=p_group_id and archived_at is null;
  insert into public.work_board_items(board_id,group_id,title,status,position,created_by,updated_by) values(p_board_id,p_group_id,btrim(p_title),initial_status,pos,auth.uid(),auth.uid()) returning id into iid;
  update public.work_boards set updated_at=now(),updated_by=auth.uid() where id=p_board_id;
  perform public.work_board_log(p_board_id,'item.created','Item added','item',iid::text,jsonb_build_object('title',btrim(p_title),'status',initial_status));
  return iid;
end $$;

create or replace function public.wm_update_board_item(p_item_id uuid,p_title text,p_status text,p_assignee_id uuid,p_due_date date,p_notes text) returns void
language plpgsql security definer set search_path=public as $$
declare bid uuid; status_col public.work_board_columns%rowtype;
begin
  select board_id into bid from public.work_board_items where id=p_item_id;
  if bid is null or not public.work_board_access(bid,'edit') then raise exception 'Board edit access denied' using errcode='42501'; end if;
  select * into status_col from public.work_board_columns where board_id=bid and system_key='status' and data_type='status' limit 1;
  if p_status is not null then
    if status_col.id is not null then
      if not exists(select 1 from jsonb_array_elements(status_col.config->'labels') e where e->>'id'=p_status) then raise exception 'Unsupported item status'; end if;
    elsif p_status not in ('not_started','in_progress','blocked','done') then raise exception 'Unsupported item status'; end if;
  end if;
  if p_assignee_id is not null and not exists(select 1 from public.work_board_members where board_id=bid and user_id=p_assignee_id) then raise exception 'Assignee must be a board member'; end if;
  update public.work_board_items set title=btrim(p_title),status=p_status,assignee_id=p_assignee_id,due_date=p_due_date,notes=left(coalesce(p_notes,''),5000),updated_by=auth.uid(),updated_at=now() where id=p_item_id;
  update public.work_boards set updated_at=now(),updated_by=auth.uid() where id=bid;
  perform public.work_board_log(bid,'item.updated','Item updated','item',p_item_id::text,jsonb_build_object('status',p_status));
end $$;

create or replace function public.wm_move_board_item(p_item_id uuid,p_group_id uuid,p_position integer,p_status text default null) returns void
language plpgsql security definer set search_path=public as $$
declare bid uuid; status_col public.work_board_columns%rowtype;
begin
  select board_id into bid from public.work_board_items where id=p_item_id;
  if bid is null or not public.work_board_access(bid,'edit') then raise exception 'Board edit access denied' using errcode='42501'; end if;
  if not exists(select 1 from public.work_board_groups where id=p_group_id and board_id=bid) then raise exception 'Target group does not belong to board'; end if;
  if p_status is not null and p_status<>'' then
    select * into status_col from public.work_board_columns where board_id=bid and system_key='status' and data_type='status' limit 1;
    if status_col.id is not null and not exists(select 1 from jsonb_array_elements(status_col.config->'labels') e where e->>'id'=p_status) then raise exception 'Unsupported item status'; end if;
    if status_col.id is null and p_status not in ('not_started','in_progress','blocked','done') then raise exception 'Unsupported item status'; end if;
  end if;
  update public.work_board_items set group_id=p_group_id,position=greatest(0,coalesce(p_position,0)),status=case when p_status is null then status when p_status='' then null else p_status end,updated_by=auth.uid(),updated_at=now() where id=p_item_id;
  update public.work_boards set updated_at=now(),updated_by=auth.uid() where id=bid;
  perform public.work_board_log(bid,'item.moved','Item moved','item',p_item_id::text,jsonb_build_object('group_id',p_group_id,'position',p_position,'status',p_status));
end $$;

-- Duplicating a Status column with values copies stable label IDs, not visible text.
create or replace function public.wm_duplicate_board_column(p_column_id uuid,p_with_values boolean default false) returns uuid
language plpgsql security definer set search_path=public as $$
declare c public.work_board_columns%rowtype; new_id uuid; nm text; n integer:=1; v jsonb; item record;
begin
  select * into c from public.work_board_columns where id=p_column_id;
  if c.id is null or not public.work_board_access(c.board_id,'edit') then raise exception 'Board edit access denied' using errcode='42501'; end if;
  if (select count(*) from public.work_board_columns where board_id=c.board_id)>=30 then raise exception 'A board can contain at most 30 columns'; end if;
  nm:=left(c.name||' copy',80); while exists(select 1 from public.work_board_columns where board_id=c.board_id and lower(name)=lower(nm)) loop n:=n+1; nm:=left(c.name||' copy '||n,80); end loop;
  new_id:=public.wm_add_board_column_at(c.board_id,nm,c.data_type,c.config,c.position+1);
  if p_with_values then
    for item in select * from public.work_board_items where board_id=c.board_id loop
      if c.system_key='title' then v:=to_jsonb(item.title);
      elsif c.system_key='status' then v:=case when item.status is null then null else to_jsonb(item.status) end;
      elsif c.system_key='assignee' then v:=case when item.assignee_id is null then null else to_jsonb(item.assignee_id::text) end;
      elsif c.system_key='due_date' then v:=case when item.due_date is null then null else to_jsonb(item.due_date::text) end;
      elsif c.system_key='notes' then v:=case when item.notes='' then null else to_jsonb(item.notes) end;
      else select value into v from public.work_board_item_values where item_id=item.id and column_id=c.id; end if;
      if v is not null then insert into public.work_board_item_values(item_id,column_id,value,updated_by) values(item.id,new_id,public.work_board_validate_column_value(c.board_id,new_id,v),auth.uid()) on conflict(item_id,column_id) do update set value=excluded.value,updated_by=excluded.updated_by,updated_at=now(); end if;
      v:=null;
    end loop;
  end if;
  perform public.work_board_log(c.board_id,'column.duplicated','Column duplicated','column',new_id::text,jsonb_build_object('source_column_id',c.id,'with_values',p_with_values));
  return new_id;
end $$;

create or replace function public.wm_board_backend_capabilities() returns jsonb
language sql stable security definer set search_path=public as $$
  select jsonb_build_object(
    'schema_version','1.34.0','flexible_board_creation',true,'configured_create',true,
    'empty_boards',true,'removable_custom_columns',true,'item_workspace',true,
    'item_updates',true,'item_files',true,'item_activity',true,'interactive_table',true,
    'persistent_column_widths',true,'item_reordering',true,'item_duplication',true,
    'item_deletion',true,'group_reordering',true,'group_accents',true,
    'configurable_status_labels',true,'stable_status_label_ids',true
  );
$$;

revoke all on function public.wm_set_board_status_labels(uuid,jsonb,text) from public;
grant execute on function public.wm_set_board_status_labels(uuid,jsonb,text) to authenticated;
grant execute on function public.wm_update_board_column(uuid,text,jsonb,boolean),public.wm_add_board_item(uuid,uuid,text),public.wm_update_board_item(uuid,text,text,uuid,date,text),public.wm_move_board_item(uuid,uuid,integer,text),public.wm_duplicate_board_column(uuid,boolean),public.wm_board_backend_capabilities() to authenticated;

-- ---------------------------------------------------------------------------
-- v1.41.0 transactional backup/restore runtime authority
-- ---------------------------------------------------------------------------
create or replace function public.wm_restore_board_backup_v4(p_snapshot jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare
  caller uuid:=auth.uid();
  ws uuid;
  b jsonb:=coalesce(p_snapshot->'board','{}'::jsonb);
  target_board_id uuid;
  existing_ws uuid;
  member jsonb;
  grp jsonb;
  col jsonb;
  item jsonb;
  cell jsonb;
  old_user text;
  resolved_user uuid;
  assignee uuid;
  member_map jsonb:='{}'::jsonb;
  column_type text;
  column_config jsonb;
  cell_value jsonb;
  status_column uuid;
  status_value text;
begin
  if caller is null then raise exception 'Authentication required' using errcode='42501'; end if;
  ws:=public.current_workspace_id(caller);
  if ws is null then raise exception 'Workspace membership required' using errcode='42501'; end if;
  if jsonb_typeof(p_snapshot)<>'object' then raise exception 'Board backup must be an object' using errcode='22023'; end if;
  if jsonb_typeof(coalesce(p_snapshot->'groups','[]'::jsonb))<>'array'
     or jsonb_typeof(coalesce(p_snapshot->'members','[]'::jsonb))<>'array'
     or jsonb_typeof(coalesce(p_snapshot->'columns','[]'::jsonb))<>'array'
     or jsonb_typeof(coalesce(p_snapshot->'items','[]'::jsonb))<>'array'
     or jsonb_typeof(coalesce(p_snapshot->'values','[]'::jsonb))<>'array' then
    raise exception 'Board backup collections must be arrays' using errcode='22023';
  end if;
  begin target_board_id:=(b->>'id')::uuid; exception when others then raise exception 'Board backup identifier is invalid' using errcode='22023'; end;
  if char_length(btrim(coalesce(b->>'name',''))) not between 1 and 120 then raise exception 'Board backup name is invalid' using errcode='22023'; end if;
  if coalesce(b->>'status','active') not in ('active','archived','trashed') then raise exception 'Board backup status is invalid' using errcode='22023'; end if;

  select workspace_id into existing_ws from public.work_boards where id=target_board_id;
  if existing_ws is not null and existing_ws<>ws then raise exception 'Board identifier belongs to another workspace' using errcode='42501'; end if;
  if existing_ws=ws and not public.work_board_access(target_board_id,'manage') then raise exception 'Board owner access is required to replace an existing board' using errcode='42501'; end if;
  if existing_ws=ws then delete from public.work_boards where id=target_board_id; end if;

  insert into public.work_boards(id,workspace_id,name,description,status,created_by,updated_by,archived_at,trashed_at,created_at,updated_at)
  values(
    target_board_id,ws,btrim(b->>'name'),left(coalesce(b->>'description',''),1200),coalesce(b->>'status','active'),caller,caller,
    case when b->>'status'='archived' then now() else null end,
    case when b->>'status'='trashed' then now() else null end,
    now(),now()
  );

  -- Resolve member references by email in the current workspace instead of trusting
  -- user UUIDs from an imported file. The old UUID -> current UUID map is then used
  -- for assignees and People-column values.
  for member in select value from jsonb_array_elements(coalesce(p_snapshot->'members','[]'::jsonb)) loop
    old_user:=nullif(member->>'user_id','');
    select p.id into resolved_user
      from public.profiles p join public.workspace_members wm on wm.user_id=p.id and wm.workspace_id=ws and wm.active=true
      where p.status='active' and lower(p.email)=lower(btrim(coalesce(member->>'email','')))
      limit 1;
    if resolved_user is null then raise exception 'Board member % cannot be resolved in this workspace',coalesce(member->>'email',old_user,'unknown') using errcode='22023'; end if;
    if old_user is not null then member_map:=member_map||jsonb_build_object(old_user,resolved_user::text); end if;
    insert into public.work_board_members(board_id,user_id,role,view_mode,added_by)
    values(
      target_board_id,resolved_user,
      case when resolved_user=caller then 'owner' else case when member->>'role' in ('owner','editor','viewer') then member->>'role' else 'viewer' end end,
      case when resolved_user=caller and b->>'view_mode' in ('table','kanban') then b->>'view_mode' else 'table' end,
      caller
    ) on conflict(board_id,user_id) do update set role=excluded.role,view_mode=excluded.view_mode,updated_at=now();
  end loop;
  insert into public.work_board_members(board_id,user_id,role,view_mode,added_by)
  values(target_board_id,caller,'owner',case when b->>'view_mode' in ('table','kanban') then b->>'view_mode' else 'table' end,caller)
  on conflict(board_id,user_id) do update set role='owner',view_mode=excluded.view_mode,updated_at=now();

  for grp in select value from jsonb_array_elements(coalesce(p_snapshot->'groups','[]'::jsonb)) loop
    insert into public.work_board_groups(id,board_id,title,accent_color,position,created_at,updated_at)
    values(
      (grp->>'id')::uuid,target_board_id,btrim(grp->>'title'),coalesce(nullif(grp->>'accent_color',''),'#5b7cfa'),
      greatest(0,coalesce((grp->>'position')::integer,0)),now(),now()
    );
  end loop;

  for col in select value from jsonb_array_elements(coalesce(p_snapshot->'columns','[]'::jsonb)) loop
    column_type:=col->>'data_type';
    column_config:=public.work_board_normalize_column_config(column_type,coalesce(col->'config','{}'::jsonb));
    insert into public.work_board_columns(id,board_id,column_key,name,data_type,system_key,position,visible,required,config,created_by,updated_by,created_at,updated_at)
    values(
      (col->>'id')::uuid,target_board_id,btrim(col->>'column_key'),btrim(col->>'name'),column_type,nullif(col->>'system_key',''),
      greatest(0,coalesce((col->>'position')::integer,0)),coalesce((col->>'visible')::boolean,true),coalesce((col->>'required')::boolean,false),
      column_config,caller,caller,now(),now()
    );
  end loop;
  select id into status_column from public.work_board_columns where board_id=target_board_id and system_key='status' limit 1;

  for item in select value from jsonb_array_elements(coalesce(p_snapshot->'items','[]'::jsonb)) loop
    assignee:=null;
    if nullif(item->>'assignee_id','') is not null then
      begin assignee:=nullif(member_map->>(item->>'assignee_id'),'')::uuid; exception when others then assignee:=null; end;
      if assignee is null then raise exception 'Board item assignee cannot be resolved' using errcode='22023'; end if;
    end if;
    if not exists(
      select 1 from public.work_board_groups g where g.id=(item->>'group_id')::uuid and g.board_id=target_board_id
    ) then raise exception 'Board item references a group outside the restored board' using errcode='22023'; end if;
    status_value:=nullif(item->>'status','');
    if status_value is not null and status_column is null then
      raise exception 'Board item has a Status value but no system Status column exists' using errcode='22023';
    end if;
    if status_value is not null and status_column is not null then
      if not exists(
        select 1 from public.work_board_columns c, jsonb_array_elements(c.config->'labels') label
        where c.id=status_column and label->>'id'=status_value
      ) then raise exception 'Board item references an invalid Status label' using errcode='22023'; end if;
    end if;
    insert into public.work_board_items(id,board_id,group_id,title,status,assignee_id,due_date,notes,position,archived_at,created_by,updated_by,created_at,updated_at)
    values(
      (item->>'id')::uuid,target_board_id,(item->>'group_id')::uuid,btrim(item->>'title'),status_value,assignee,
      nullif(item->>'due_date','')::date,left(coalesce(item->>'notes',''),5000),greatest(0,coalesce((item->>'position')::integer,0)),
      case when coalesce((item->>'archived')::boolean,false) or nullif(item->>'archived_at','') is not null then now() else null end,
      caller,caller,now(),now()
    );
  end loop;

  for cell in select value from jsonb_array_elements(coalesce(p_snapshot->'values','[]'::jsonb)) loop
    if not exists(
      select 1 from public.work_board_items i where i.id=(cell->>'item_id')::uuid and i.board_id=target_board_id
    ) then raise exception 'Board cell references an item outside the restored board' using errcode='22023'; end if;
    select data_type into column_type from public.work_board_columns where id=(cell->>'column_id')::uuid and board_id=target_board_id;
    if column_type is null then raise exception 'Board cell references an unknown column' using errcode='22023'; end if;
    cell_value:=cell->'value';
    if column_type='people' and cell_value is not null and jsonb_typeof(cell_value)='string' then
      old_user:=cell_value#>>'{}';
      if nullif(old_user,'') is not null then
        if nullif(member_map->>old_user,'') is null then raise exception 'People column value cannot be resolved to a board member' using errcode='22023'; end if;
        cell_value:=to_jsonb(member_map->>old_user);
      end if;
    end if;
    cell_value:=public.work_board_validate_column_value(target_board_id,(cell->>'column_id')::uuid,cell_value);
    if cell_value is not null then
      insert into public.work_board_item_values(item_id,column_id,value,updated_by,updated_at)
      values((cell->>'item_id')::uuid,(cell->>'column_id')::uuid,cell_value,caller,now());
    end if;
  end loop;

  if jsonb_typeof(p_snapshot->'preferences')='object' then
    update public.work_board_members
      set preferences=public.work_board_validate_preferences(target_board_id,p_snapshot->'preferences'),updated_at=now()
      where board_id=target_board_id and user_id=caller;
  end if;

  perform public.work_board_log(target_board_id,'board.restored_from_backup','Board restored from Work Management backup','board',target_board_id::text,jsonb_build_object('backupVersion',4));
  return target_board_id;
end $$;

create or replace function public.wm_restore_workspace_backup_v4(
  p_module_data jsonb default '{}'::jsonb,
  p_activity_data jsonb default '{}'::jsonb,
  p_boards jsonb default '[]'::jsonb
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  module_entry record;
  state_row jsonb;
  activity_entry record;
  board_snapshot jsonb;
  board_result uuid;
  state_result jsonb;
  restored bigint:=0;
  board_count bigint:=0;
  activity_count bigint:=0;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if jsonb_typeof(coalesce(p_module_data,'{}'::jsonb))<>'object' then raise exception 'Module backup data must be an object' using errcode='22023'; end if;
  if jsonb_typeof(coalesce(p_activity_data,'{}'::jsonb))<>'object' then raise exception 'Activity backup data must be an object' using errcode='22023'; end if;
  if jsonb_typeof(coalesce(p_boards,'[]'::jsonb))<>'array' then raise exception 'Board backup data must be an array' using errcode='22023'; end if;

  for module_entry in select key,value from jsonb_each(coalesce(p_module_data,'{}'::jsonb)) loop
    if jsonb_typeof(module_entry.value)<>'array' then raise exception 'Module backup rows must be arrays' using errcode='22023'; end if;
    for state_row in select value from jsonb_array_elements(module_entry.value) loop
      state_result:=public.put_module_state(
        module_entry.key,
        state_row->>'state_key',
        state_row->>'value',
        case when state_row->>'scope'='user' then 'user' else 'shared' end,
        null
      );
      if state_result->>'state_key' is distinct from state_row->>'state_key' or coalesce((state_result->>'revision')::bigint,0)<1 then
        raise exception 'Module state restore verification failed for %',coalesce(state_row->>'state_key','unknown') using errcode='22023';
      end if;
      restored:=restored+1;
    end loop;
  end loop;

  for activity_entry in select key,value from jsonb_each(coalesce(p_activity_data,'{}'::jsonb)) loop
    if activity_entry.key<>'fueltrack-plus' then raise exception 'Unsupported activity backup module %',activity_entry.key using errcode='22023'; end if;
    if jsonb_typeof(activity_entry.value)<>'array' then raise exception 'Activity backup rows must be arrays' using errcode='22023'; end if;
    if jsonb_array_length(activity_entry.value)>0 then
      activity_count:=activity_count+coalesce(public.import_fueltrack_activity_backup(activity_entry.value),0);
    end if;
  end loop;

  for board_snapshot in select value from jsonb_array_elements(coalesce(p_boards,'[]'::jsonb)) loop
    board_result:=public.wm_restore_board_backup_v4(board_snapshot);
    if board_result is null or board_result::text is distinct from board_snapshot->'board'->>'id' then
      raise exception 'Board restore verification failed' using errcode='22023';
    end if;
    board_count:=board_count+1;
  end loop;

  return jsonb_build_object('verified',true,'restored',restored+activity_count+board_count,'moduleRows',restored,'activityRows',activity_count,'boards',board_count);
end $$;

revoke all on function public.wm_restore_board_backup_v4(jsonb) from public;
revoke all on function public.wm_restore_workspace_backup_v4(jsonb,jsonb,jsonb) from public;
grant execute on function public.wm_restore_workspace_backup_v4(jsonb,jsonb,jsonb) to authenticated;

notify pgrst, 'reload schema';
commit;
