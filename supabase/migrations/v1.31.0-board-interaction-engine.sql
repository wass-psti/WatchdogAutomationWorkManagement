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
