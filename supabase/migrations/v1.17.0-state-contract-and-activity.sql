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
