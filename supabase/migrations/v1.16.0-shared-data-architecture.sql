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
  select wm.workspace_id from public.workspace_members wm
  where wm.user_id=p_user_id and wm.active=true
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
