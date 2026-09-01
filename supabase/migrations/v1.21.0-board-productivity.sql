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
