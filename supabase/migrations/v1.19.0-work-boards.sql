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
    insert into public.work_board_groups(board_id,title,position) values(new_id,g.title,g.position) returning id into new_gid;
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
  insert into public.work_board_groups(board_id,title,position) values(p_board_id,btrim(p_title),pos) returning id into gid;
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
