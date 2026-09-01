-- Work Management v1.16.0
-- Server-backed state for TimeTracker, FuelTrack+, and TradeLink.
-- Run after the v1.16.0 RBAC reconciliation migration.

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

create index if not exists module_state_entries_module_idx
  on public.module_state_entries(module_id, updated_at desc);

alter table public.module_state_entries enable row level security;
revoke all on public.module_state_entries from anon, authenticated;

create or replace function public.has_module_access(p_module_id text, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_user_id is not null and (
    public.is_platform_admin(p_user_id)
    or exists (
      select 1 from public.module_role_assignments m
      where m.user_id = p_user_id and m.module_id = p_module_id and m.enabled = true
    )
  );
$$;

create or replace function public.module_state_key_allowed(p_module_id text, p_state_key text)
returns boolean
language sql
immutable
as $$
  select case p_module_id
    when 'time-tracker' then p_state_key ~ '^timetracker\.'
    when 'fueltrack-plus' then p_state_key ~ '^fueltrackplus\.'
    when 'tradelink' then p_state_key ~ '^tradelink_'
    else false
  end;
$$;

create or replace function public.list_module_state(p_module_id text)
returns table(state_key text, value text, scope text, revision bigint, updated_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then raise exception 'authentication required' using errcode='42501'; end if;
  if not public.has_module_access(p_module_id, caller) then raise exception 'module access denied' using errcode='42501'; end if;
  return query
    select e.state_key, e.value, e.scope, e.revision, e.updated_at
    from public.module_state_entries e
    where e.module_id = p_module_id
      and (e.scope = 'shared' or (e.scope = 'user' and e.owner_key = caller::text));
end;
$$;

create or replace function public.put_module_state(
  p_module_id text,
  p_state_key text,
  p_value text,
  p_scope text default 'shared'
)
returns table(state_key text, revision bigint, updated_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  owner text;
begin
  if caller is null then raise exception 'authentication required' using errcode='42501'; end if;
  if not public.has_module_access(p_module_id, caller) then raise exception 'module access denied' using errcode='42501'; end if;
  if p_scope not in ('shared','user') then raise exception 'invalid state scope'; end if;
  if not public.module_state_key_allowed(p_module_id, p_state_key) then raise exception 'state key is not valid for module'; end if;
  if p_value is null or octet_length(p_value) > 26214400 then raise exception 'state value is empty or exceeds 25 MB'; end if;
  owner := case when p_scope='user' then caller::text else '*' end;

  insert into public.module_state_entries(module_id,state_key,scope,owner_key,value,revision,updated_by,updated_at)
  values(p_module_id,p_state_key,p_scope,owner,p_value,1,caller,now())
  on conflict(module_id,state_key,scope,owner_key)
  do update set value=excluded.value, revision=public.module_state_entries.revision+1, updated_by=caller, updated_at=now();

  return query select e.state_key,e.revision,e.updated_at
    from public.module_state_entries e
    where e.module_id=p_module_id and e.state_key=p_state_key and e.scope=p_scope and e.owner_key=owner;
end;
$$;

create or replace function public.delete_module_state(
  p_module_id text,
  p_state_key text,
  p_scope text default 'shared'
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  owner text;
  affected integer;
begin
  if caller is null then raise exception 'authentication required' using errcode='42501'; end if;
  if not public.has_module_access(p_module_id, caller) then raise exception 'module access denied' using errcode='42501'; end if;
  if p_scope not in ('shared','user') then raise exception 'invalid state scope'; end if;
  if not public.module_state_key_allowed(p_module_id, p_state_key) then raise exception 'state key is not valid for module'; end if;
  owner := case when p_scope='user' then caller::text else '*' end;
  delete from public.module_state_entries
    where module_id=p_module_id and state_key=p_state_key and scope=p_scope and owner_key=owner;
  get diagnostics affected = row_count;
  return affected > 0;
end;
$$;

revoke all on function public.has_module_access(text,uuid) from public;
revoke all on function public.list_module_state(text) from public;
revoke all on function public.put_module_state(text,text,text,text) from public;
revoke all on function public.delete_module_state(text,text,text) from public;
grant execute on function public.has_module_access(text,uuid) to authenticated;
grant execute on function public.list_module_state(text) to authenticated;
grant execute on function public.put_module_state(text,text,text,text) to authenticated;
grant execute on function public.delete_module_state(text,text,text) to authenticated;
