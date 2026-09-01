-- Work Management v1.43.0 — production hardening
-- Authorization defense-in-depth for workspace/Board operations.
-- Disabled accounts must lose effective workspace access immediately even while
-- a previously issued JWT is still unexpired.

begin;

create or replace function public.current_workspace_id(p_user_id uuid default auth.uid())
returns uuid language sql stable security definer set search_path=public as $$
  select wm.workspace_id
  from public.workspace_members wm
  join public.profiles p on p.id=wm.user_id
  where wm.user_id=p_user_id
    and wm.active=true
    and p.status='active'
  order by wm.created_at asc
  limit 1;
$$;

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

-- Keep helper functions unavailable as arbitrary public RPCs. Existing internal
-- SECURITY DEFINER callers continue to resolve them through the public schema.
revoke all on function public.current_workspace_id(uuid) from public;
revoke all on function public.work_board_access(uuid,text) from public;

grant execute on function public.current_workspace_id(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
