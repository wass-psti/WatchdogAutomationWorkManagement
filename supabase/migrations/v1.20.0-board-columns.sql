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

revoke all on function public.wm_add_board_column(uuid,text,text,jsonb) from public;
revoke all on function public.wm_update_board_column(uuid,text,jsonb,boolean) from public;
revoke all on function public.wm_move_board_column(uuid,integer) from public;
revoke all on function public.wm_delete_board_column(uuid) from public;
revoke all on function public.wm_set_board_cell(uuid,uuid,jsonb) from public;

grant execute on function public.wm_add_board_column(uuid,text,text,jsonb),public.wm_update_board_column(uuid,text,jsonb,boolean),public.wm_move_board_column(uuid,integer),public.wm_delete_board_column(uuid),public.wm_set_board_cell(uuid,uuid,jsonb) to authenticated;

commit;
