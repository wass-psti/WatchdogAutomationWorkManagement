-- Work Management v1.34.0 — configurable Status labels and stable label identifiers
begin;

-- Status is now a column-configured label reference. Null represents an intentionally empty status.
alter table public.work_board_items drop constraint if exists work_board_items_status_check;
alter table public.work_board_items alter column status drop not null;

-- Upgrade legacy Status column configs to label objects with stable per-column identifiers.
update public.work_board_columns c
set config = jsonb_build_object(
  'labels', jsonb_build_array(
    jsonb_build_object('id','not_started','name','Not started','color','#7f8a9a','active',true,'description','','position',0),
    jsonb_build_object('id','in_progress','name','In progress','color','#4f7df3','active',true,'description','','position',1),
    jsonb_build_object('id','blocked','name','Blocked','color','#e64f70','active',true,'description','','position',2),
    jsonb_build_object('id','done','name','Done','color','#23b784','active',true,'description','','position',3)
  ),
  'default_label_id','not_started'
)
where c.data_type='status' and c.system_key='status' and jsonb_typeof(c.config->'labels') is distinct from 'array';

do $$
declare c record; opts jsonb; built jsonb; entry text; idx integer; lid text; colors text[]:=array['#7f8a9a','#4f7df3','#e64f70','#23b784','#6d5bd0','#2a9bb8','#d9a227','#d54a9c'];
begin
  for c in select id,config from public.work_board_columns where data_type='status' and system_key is null and jsonb_typeof(config->'labels') is distinct from 'array' loop
    opts:=c.config->'options';
    if opts is null or jsonb_typeof(opts)<>'array' or jsonb_array_length(opts)=0 then
      opts:=jsonb_build_array('Not started','In progress','Blocked','Done');
    end if;
    built:='[]'::jsonb; idx:=0;
    for entry in select value from jsonb_array_elements_text(opts) loop
      lid:='status_'||substr(md5(c.id::text||':'||lower(entry)),1,20);
      built:=built||jsonb_build_array(jsonb_build_object('id',lid,'name',entry,'color',colors[(idx % array_length(colors,1))+1],'active',true,'description','','position',idx));
      idx:=idx+1;
    end loop;
    update public.work_board_columns set config=jsonb_build_object('labels',built,'default_label_id',case when jsonb_array_length(built)>0 then built->0->>'id' else null end) where id=c.id;
    update public.work_board_item_values v
    set value=to_jsonb(label.id)
    from (
      select x->>'id' id,x->>'name' name from jsonb_array_elements(built) x
    ) label
    where v.column_id=c.id and v.value is not null and v.value#>>'{}'=label.name;
  end loop;
end $$;

create or replace function public.work_board_normalize_column_config(p_type text,p_config jsonb) returns jsonb
language plpgsql immutable set search_path=public as $$
declare cfg jsonb:=coalesce(p_config,'{}'::jsonb); options jsonb; clean jsonb:='[]'::jsonb; x jsonb; label text; id text; color text; active boolean; description text; pos integer:=0; default_id text;
begin
  if p_type not in ('text','long_text','number','status','dropdown','date','people','checkbox','url','email','timeline') then raise exception 'Unsupported column type'; end if;
  if p_type='status' then
    options:=cfg->'labels';
    if options is null or jsonb_typeof(options)<>'array' or jsonb_array_length(options)=0 then
      if jsonb_typeof(cfg->'options')='array' and jsonb_array_length(cfg->'options')>0 then
        options:='[]'::jsonb;
        pos:=0;
        for label in select value from jsonb_array_elements_text(cfg->'options') loop
          options:=options||jsonb_build_array(jsonb_build_object(
            'id','status_'||substr(md5(lower(btrim(label))),1,20),
            'name',btrim(label),
            'color',(array['#7f8a9a','#4f7df3','#e64f70','#23b784','#6d5bd0','#2a9bb8','#d9a227','#d54a9c'])[(pos % 8)+1],
            'active',true,'description',''
          ));
          pos:=pos+1;
        end loop;
        pos:=0;
      else
        options:=jsonb_build_array(
          jsonb_build_object('id','not_started','name','Not started','color','#7f8a9a','active',true,'description',''),
          jsonb_build_object('id','in_progress','name','In progress','color','#4f7df3','active',true,'description',''),
          jsonb_build_object('id','blocked','name','Blocked','color','#e64f70','active',true,'description',''),
          jsonb_build_object('id','done','name','Done','color','#23b784','active',true,'description','')
        );
      end if;
    end if;
    if jsonb_array_length(options)>50 then raise exception 'A Status column can contain at most 50 labels'; end if;
    for x in select value from jsonb_array_elements(options) loop
      if jsonb_typeof(x)<>'object' then raise exception 'Status labels must be objects'; end if;
      id:=btrim(coalesce(x->>'id','')); label:=btrim(coalesce(x->>'name','')); color:=lower(btrim(coalesce(x->>'color','#7f8a9a')));
      description:=left(btrim(coalesce(x->>'description','')),240); active:=coalesce((x->>'active')::boolean,true);
      if char_length(id) not between 1 and 96 or id !~ '^[A-Za-z0-9_:-]+$' then raise exception 'Status label IDs must contain only letters, numbers, underscore, colon, or hyphen'; end if;
      if char_length(label) not between 1 and 80 then raise exception 'Status label names must contain 1-80 characters'; end if;
      if color !~ '^#[0-9a-f]{6}$' then raise exception 'Status label colors must use six-digit hex values'; end if;
      if exists(select 1 from jsonb_array_elements(clean) e where lower(e->>'name')=lower(label)) then raise exception 'Status label names must be unique'; end if;
      if exists(select 1 from jsonb_array_elements(clean) e where e->>'id'=id) then raise exception 'Status label IDs must be unique'; end if;
      clean:=clean||jsonb_build_array(jsonb_build_object('id',id,'name',label,'color',color,'active',active,'description',description,'position',pos)); pos:=pos+1;
    end loop;
    if not exists(select 1 from jsonb_array_elements(clean) e where coalesce((e->>'active')::boolean,true)) then raise exception 'Keep at least one active status label'; end if;
    default_id:=nullif(btrim(coalesce(cfg->>'default_label_id','')),'');
    if default_id is null or not exists(select 1 from jsonb_array_elements(clean) e where e->>'id'=default_id and coalesce((e->>'active')::boolean,true)) then
      select e->>'id' into default_id from jsonb_array_elements(clean) e where coalesce((e->>'active')::boolean,true) limit 1;
    end if;
    return jsonb_build_object('labels',clean,'default_label_id',default_id);
  elsif p_type='dropdown' then
    options:=cfg->'options';
    if options is null or jsonb_typeof(options)<>'array' or jsonb_array_length(options)=0 then options:=jsonb_build_array('Option 1','Option 2'); end if;
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
  if p_value is null or p_value='null'::jsonb then if c.required then raise exception '% is required',c.name; end if; return null; end if;
  if c.data_type in ('text','long_text','status','dropdown','date','people','url','email') then
    if jsonb_typeof(p_value)<>'string' then raise exception '% requires a text value',c.name; end if;
    t:=btrim(p_value#>>'{}'); is_empty:=(t=''); if is_empty then if c.required then raise exception '% is required',c.name; end if; return null; end if;
  end if;
  case c.data_type
    when 'text' then if char_length(t)>1000 then raise exception '% is limited to 1000 characters',c.name; end if; return to_jsonb(t);
    when 'long_text' then if char_length(t)>5000 then raise exception '% is limited to 5000 characters',c.name; end if; return to_jsonb(t);
    when 'number' then if jsonb_typeof(p_value)<>'number' then raise exception '% requires a number',c.name; end if; return p_value;
    when 'checkbox' then if jsonb_typeof(p_value)<>'boolean' then raise exception '% requires true or false',c.name; end if; return p_value;
    when 'status' then
      if not exists(select 1 from jsonb_array_elements(c.config->'labels') e where e->>'id'=t) then raise exception 'Select a valid status for %',c.name; end if;
      return to_jsonb(t);
    when 'dropdown' then if not exists(select 1 from jsonb_array_elements_text(c.config->'options') o(value) where o.value=t) then raise exception 'Select a valid option for %',c.name; end if; return to_jsonb(t);
    when 'date' then begin d:=t::date; exception when others then raise exception '% requires a valid date',c.name; end; return to_jsonb(d::text);
    when 'people' then begin u:=t::uuid; exception when others then raise exception '% requires a valid board member',c.name; end; if not exists(select 1 from public.work_board_members where board_id=p_board_id and user_id=u) then raise exception 'Assignee must be a board member'; end if; return to_jsonb(u::text);
    when 'url' then if t !~* '^https?://[^[:space:]]+$' or char_length(t)>2000 then raise exception '% requires a valid http(s) URL',c.name; end if; return to_jsonb(t);
    when 'email' then if t !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or char_length(t)>320 then raise exception '% requires a valid email address',c.name; end if; return to_jsonb(lower(t));
    when 'timeline' then
      if jsonb_typeof(p_value)<>'object' then raise exception '% requires a start/end date range',c.name; end if;
      if coalesce(p_value->>'start','')='' and coalesce(p_value->>'end','')='' then if c.required then raise exception '% is required',c.name; end if; return null; end if;
      begin start_d:=(p_value->>'start')::date; end_d:=(p_value->>'end')::date; exception when others then raise exception '% requires valid start and end dates',c.name; end;
      if end_d<start_d then raise exception '% end date cannot be before its start date',c.name; end if;
      return jsonb_build_object('start',start_d::text,'end',end_d::text);
    else raise exception 'Unsupported column type';
  end case;
end $$;

create or replace function public.wm_update_board_column(p_column_id uuid,p_name text,p_config jsonb,p_visible boolean default true) returns void
language plpgsql security definer set search_path=public as $$
declare c public.work_board_columns%rowtype; nm text:=btrim(coalesce(p_name,'')); cfg jsonb; bad bigint;
begin
  select * into c from public.work_board_columns where id=p_column_id;
  if c.id is null or not public.work_board_access(c.board_id,'edit') then raise exception 'Board edit access denied' using errcode='42501'; end if;
  if char_length(nm) not between 1 and 80 then raise exception 'Column name must contain 1-80 characters'; end if;
  if exists(select 1 from public.work_board_columns where board_id=c.board_id and id<>c.id and lower(name)=lower(nm)) then raise exception 'A column named "%" already exists',nm; end if;
  cfg:=public.work_board_normalize_column_config(c.data_type,p_config);
  if c.system_key='title' then p_visible:=true; end if;
  if c.data_type='status' then
    if c.system_key='status' then
      select count(*) into bad from public.work_board_items i where i.board_id=c.board_id and i.status is not null and not exists(select 1 from jsonb_array_elements(cfg->'labels') e where e->>'id'=i.status);
    else
      select count(*) into bad from public.work_board_item_values v where v.column_id=c.id and v.value is not null and not exists(select 1 from jsonb_array_elements(cfg->'labels') e where e->>'id'=(v.value#>>'{}'));
    end if;
    if bad>0 then raise exception 'Existing items use labels that would be removed. Use Manage labels so affected values can be handled safely.'; end if;
  elsif c.data_type='dropdown' and c.system_key is null then
    select count(*) into bad from public.work_board_item_values v where v.column_id=c.id and v.value is not null and not exists(select 1 from jsonb_array_elements_text(cfg->'options') o(value) where o.value=(v.value#>>'{}'));
    if bad>0 then raise exception 'Existing values use options that would be removed. Update those items first.'; end if;
  end if;
  update public.work_board_columns set name=nm,config=cfg,visible=coalesce(p_visible,true),updated_by=auth.uid(),updated_at=now() where id=c.id;
  update public.work_boards set updated_at=now(),updated_by=auth.uid() where id=c.board_id;
  perform public.work_board_log(c.board_id,'column.updated','Column updated','column',c.id::text,jsonb_build_object('name',nm,'visible',p_visible));
end $$;

create or replace function public.wm_set_board_status_labels(p_column_id uuid,p_labels jsonb,p_default_label_id text default null) returns jsonb
language plpgsql security definer set search_path=public as $$
declare c public.work_board_columns%rowtype; cfg jsonb; default_id text; cleared bigint:=0;
begin
  select * into c from public.work_board_columns where id=p_column_id;
  if c.id is null or not public.work_board_access(c.board_id,'edit') then raise exception 'Board edit access denied' using errcode='42501'; end if;
  if c.data_type<>'status' then raise exception 'This column is not a Status column'; end if;
  cfg:=public.work_board_normalize_column_config('status',jsonb_build_object('labels',coalesce(p_labels,'[]'::jsonb),'default_label_id',p_default_label_id));
  default_id:=cfg->>'default_label_id';
  if c.system_key='status' then
    update public.work_board_items i set status=null,updated_by=auth.uid(),updated_at=now()
      where i.board_id=c.board_id and i.status is not null and not exists(select 1 from jsonb_array_elements(cfg->'labels') e where e->>'id'=i.status);
    get diagnostics cleared = row_count;
  else
    delete from public.work_board_item_values v where v.column_id=c.id and v.value is not null and not exists(select 1 from jsonb_array_elements(cfg->'labels') e where e->>'id'=(v.value#>>'{}'));
    get diagnostics cleared = row_count;
  end if;
  update public.work_board_columns set config=cfg,updated_by=auth.uid(),updated_at=now() where id=c.id;
  update public.work_boards set updated_at=now(),updated_by=auth.uid() where id=c.board_id;
  perform public.work_board_log(c.board_id,'column.status_labels_updated','Status labels updated','column',c.id::text,jsonb_build_object('label_count',jsonb_array_length(cfg->'labels'),'default_label_id',default_id,'cleared_values',cleared));
  return cfg;
end $$;

create or replace function public.wm_add_board_item(p_board_id uuid,p_group_id uuid,p_title text) returns uuid
language plpgsql security definer set search_path=public as $$
declare iid uuid; pos integer; initial_status text:='not_started';
begin
  if not public.work_board_access(p_board_id,'edit') then raise exception 'Board edit access denied' using errcode='42501'; end if;
  if not exists(select 1 from public.work_board_groups where id=p_group_id and board_id=p_board_id) then raise exception 'Group does not belong to board'; end if;
  if char_length(btrim(coalesce(p_title,''))) not between 1 and 240 then raise exception 'Item title is required'; end if;
  select c.config->>'default_label_id' into initial_status from public.work_board_columns c where c.board_id=p_board_id and c.system_key='status' and c.data_type='status' limit 1;
  initial_status:=coalesce(initial_status,'not_started');
  select coalesce(max(position),-1)+1 into pos from public.work_board_items where group_id=p_group_id and archived_at is null;
  insert into public.work_board_items(board_id,group_id,title,status,position,created_by,updated_by) values(p_board_id,p_group_id,btrim(p_title),initial_status,pos,auth.uid(),auth.uid()) returning id into iid;
  update public.work_boards set updated_at=now(),updated_by=auth.uid() where id=p_board_id;
  perform public.work_board_log(p_board_id,'item.created','Item added','item',iid::text,jsonb_build_object('title',btrim(p_title),'status',initial_status));
  return iid;
end $$;

create or replace function public.wm_update_board_item(p_item_id uuid,p_title text,p_status text,p_assignee_id uuid,p_due_date date,p_notes text) returns void
language plpgsql security definer set search_path=public as $$
declare bid uuid; status_col public.work_board_columns%rowtype;
begin
  select board_id into bid from public.work_board_items where id=p_item_id;
  if bid is null or not public.work_board_access(bid,'edit') then raise exception 'Board edit access denied' using errcode='42501'; end if;
  select * into status_col from public.work_board_columns where board_id=bid and system_key='status' and data_type='status' limit 1;
  if p_status is not null then
    if status_col.id is not null then
      if not exists(select 1 from jsonb_array_elements(status_col.config->'labels') e where e->>'id'=p_status) then raise exception 'Unsupported item status'; end if;
    elsif p_status not in ('not_started','in_progress','blocked','done') then raise exception 'Unsupported item status'; end if;
  end if;
  if p_assignee_id is not null and not exists(select 1 from public.work_board_members where board_id=bid and user_id=p_assignee_id) then raise exception 'Assignee must be a board member'; end if;
  update public.work_board_items set title=btrim(p_title),status=p_status,assignee_id=p_assignee_id,due_date=p_due_date,notes=left(coalesce(p_notes,''),5000),updated_by=auth.uid(),updated_at=now() where id=p_item_id;
  update public.work_boards set updated_at=now(),updated_by=auth.uid() where id=bid;
  perform public.work_board_log(bid,'item.updated','Item updated','item',p_item_id::text,jsonb_build_object('status',p_status));
end $$;

create or replace function public.wm_move_board_item(p_item_id uuid,p_group_id uuid,p_position integer,p_status text default null) returns void
language plpgsql security definer set search_path=public as $$
declare bid uuid; status_col public.work_board_columns%rowtype;
begin
  select board_id into bid from public.work_board_items where id=p_item_id;
  if bid is null or not public.work_board_access(bid,'edit') then raise exception 'Board edit access denied' using errcode='42501'; end if;
  if not exists(select 1 from public.work_board_groups where id=p_group_id and board_id=bid) then raise exception 'Target group does not belong to board'; end if;
  if p_status is not null and p_status<>'' then
    select * into status_col from public.work_board_columns where board_id=bid and system_key='status' and data_type='status' limit 1;
    if status_col.id is not null and not exists(select 1 from jsonb_array_elements(status_col.config->'labels') e where e->>'id'=p_status) then raise exception 'Unsupported item status'; end if;
    if status_col.id is null and p_status not in ('not_started','in_progress','blocked','done') then raise exception 'Unsupported item status'; end if;
  end if;
  update public.work_board_items set group_id=p_group_id,position=greatest(0,coalesce(p_position,0)),status=case when p_status is null then status when p_status='' then null else p_status end,updated_by=auth.uid(),updated_at=now() where id=p_item_id;
  update public.work_boards set updated_at=now(),updated_by=auth.uid() where id=bid;
  perform public.work_board_log(bid,'item.moved','Item moved','item',p_item_id::text,jsonb_build_object('group_id',p_group_id,'position',p_position,'status',p_status));
end $$;

-- Duplicating a Status column with values copies stable label IDs, not visible text.
create or replace function public.wm_duplicate_board_column(p_column_id uuid,p_with_values boolean default false) returns uuid
language plpgsql security definer set search_path=public as $$
declare c public.work_board_columns%rowtype; new_id uuid; nm text; n integer:=1; v jsonb; item record;
begin
  select * into c from public.work_board_columns where id=p_column_id;
  if c.id is null or not public.work_board_access(c.board_id,'edit') then raise exception 'Board edit access denied' using errcode='42501'; end if;
  if (select count(*) from public.work_board_columns where board_id=c.board_id)>=30 then raise exception 'A board can contain at most 30 columns'; end if;
  nm:=left(c.name||' copy',80); while exists(select 1 from public.work_board_columns where board_id=c.board_id and lower(name)=lower(nm)) loop n:=n+1; nm:=left(c.name||' copy '||n,80); end loop;
  new_id:=public.wm_add_board_column_at(c.board_id,nm,c.data_type,c.config,c.position+1);
  if p_with_values then
    for item in select * from public.work_board_items where board_id=c.board_id loop
      if c.system_key='title' then v:=to_jsonb(item.title);
      elsif c.system_key='status' then v:=case when item.status is null then null else to_jsonb(item.status) end;
      elsif c.system_key='assignee' then v:=case when item.assignee_id is null then null else to_jsonb(item.assignee_id::text) end;
      elsif c.system_key='due_date' then v:=case when item.due_date is null then null else to_jsonb(item.due_date::text) end;
      elsif c.system_key='notes' then v:=case when item.notes='' then null else to_jsonb(item.notes) end;
      else select value into v from public.work_board_item_values where item_id=item.id and column_id=c.id; end if;
      if v is not null then insert into public.work_board_item_values(item_id,column_id,value,updated_by) values(item.id,new_id,public.work_board_validate_column_value(c.board_id,new_id,v),auth.uid()) on conflict(item_id,column_id) do update set value=excluded.value,updated_by=excluded.updated_by,updated_at=now(); end if;
      v:=null;
    end loop;
  end if;
  perform public.work_board_log(c.board_id,'column.duplicated','Column duplicated','column',new_id::text,jsonb_build_object('source_column_id',c.id,'with_values',p_with_values));
  return new_id;
end $$;

create or replace function public.wm_board_backend_capabilities() returns jsonb
language sql stable security definer set search_path=public as $$
  select jsonb_build_object(
    'schema_version','1.34.0','flexible_board_creation',true,'configured_create',true,
    'empty_boards',true,'removable_custom_columns',true,'item_workspace',true,
    'item_updates',true,'item_files',true,'item_activity',true,'interactive_table',true,
    'persistent_column_widths',true,'item_reordering',true,'item_duplication',true,
    'item_deletion',true,'group_reordering',true,'group_accents',true,
    'configurable_status_labels',true,'stable_status_label_ids',true
  );
$$;

revoke all on function public.wm_set_board_status_labels(uuid,jsonb,text) from public;
grant execute on function public.wm_set_board_status_labels(uuid,jsonb,text) to authenticated;
grant execute on function public.wm_update_board_column(uuid,text,jsonb,boolean),public.wm_add_board_item(uuid,uuid,text),public.wm_update_board_item(uuid,text,text,uuid,date,text),public.wm_move_board_item(uuid,uuid,integer,text),public.wm_duplicate_board_column(uuid,boolean),public.wm_board_backend_capabilities() to authenticated;

notify pgrst, 'reload schema';
commit;
