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
    insert into public.work_board_groups(board_id,title,position) values(new_id,g.title,g.position) returning id into new_gid;
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
