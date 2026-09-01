-- Work Management v1.41.0 — transactional typed backup/restore authority
begin;

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

commit;
