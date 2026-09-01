-- Work Management v1.33.0 — grouped board-sheet accent persistence.
begin;

alter table public.work_board_groups add column if not exists accent_color text;
update public.work_board_groups
set accent_color='#5b7cfa'
where accent_color is null or accent_color !~ '^#[0-9A-Fa-f]{6}$';
alter table public.work_board_groups alter column accent_color set default '#5b7cfa';
alter table public.work_board_groups alter column accent_color set not null;

create or replace function public.wm_set_board_group_accent(p_group_id uuid,p_accent_color text) returns void
language plpgsql security definer set search_path=public as $$
declare bid uuid; color text:=lower(btrim(coalesce(p_accent_color,'')));
begin
  select board_id into bid from public.work_board_groups where id=p_group_id;
  if bid is null or not public.work_board_access(bid,'edit') then
    raise exception 'Board edit access denied' using errcode='42501';
  end if;
  if color !~ '^#[0-9a-f]{6}$' then raise exception 'Invalid group accent color'; end if;
  update public.work_board_groups set accent_color=color,updated_at=now() where id=p_group_id;
  update public.work_boards set updated_at=now(),updated_by=auth.uid() where id=bid;
  perform public.work_board_log(bid,'group.color_updated','Group color updated','group',p_group_id::text,jsonb_build_object('accent_color',color));
end $$;


create or replace function public.wm_add_board_group(p_board_id uuid,p_title text) returns uuid
language plpgsql security definer set search_path=public as $$
declare gid uuid; pos integer; color text;
begin
  if not public.work_board_access(p_board_id,'edit') then raise exception 'Board edit access denied' using errcode='42501'; end if;
  if char_length(btrim(coalesce(p_title,''))) not between 1 and 120 then raise exception 'Group title is required'; end if;
  select coalesce(max(position),-1)+1 into pos from public.work_board_groups where board_id=p_board_id;
  color:=(array['#5b7cfa','#7c5ce7','#e06083','#dc7a34','#2f9e73','#2186a8','#8b6b45','#65758b'])[(pos % 8)+1];
  insert into public.work_board_groups(board_id,title,accent_color,position) values(p_board_id,btrim(p_title),color,pos) returning id into gid;
  update public.work_boards set updated_at=now(),updated_by=auth.uid() where id=p_board_id;
  perform public.work_board_log(p_board_id,'group.created','Group added','group',gid::text,jsonb_build_object('title',btrim(p_title),'accent_color',color));
  return gid;
end $$;

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
    insert into public.work_board_groups(board_id,title,accent_color,position) values(new_id,g.title,coalesce(g.accent_color,'#5b7cfa'),g.position) returning id into new_gid;
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

create or replace function public.wm_board_backend_capabilities() returns jsonb
language sql stable security definer set search_path=public as $$
  select jsonb_build_object(
    'schema_version','1.33.0','flexible_board_creation',true,'configured_create',true,
    'empty_boards',true,'removable_custom_columns',true,'item_workspace',true,
    'interactive_table',true,'persistent_column_widths',true,'item_reordering',true,
    'item_duplication',true,'item_deletion',true,'group_reordering',true,'group_accents',true
  );
$$;

revoke all on function public.wm_set_board_group_accent(uuid,text) from public;
grant execute on function public.wm_set_board_group_accent(uuid,text),public.wm_add_board_group(uuid,text),public.wm_duplicate_board(uuid),public.wm_board_backend_capabilities() to authenticated;

notify pgrst, 'reload schema';
commit;
