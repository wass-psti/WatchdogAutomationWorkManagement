-- Work Management v1.17.3
-- Transactional TimeTracker attendance lifecycle.
-- Run after v1.17.0-state-contract-and-activity.sql. Safe to re-run.
--
-- Clock In/Clock Out correctness no longer depends on expiring browser/device leases.
-- PostgreSQL serializes attendance actions per workspace+account inside the same
-- transaction that validates and commits the authoritative attendance record.

create or replace function public.commit_timetracker_attendance_action(
  p_action text,
  p_record_id text,
  p_location text,
  p_department text,
  p_geo jsonb,
  p_work_note text,
  p_attendance_policy jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  caller uuid := auth.uid();
  ws uuid;
  actor_id text;
  actor_name text;
  owner text := '*';
  normalized_action text := lower(trim(coalesce(p_action,'')));
  current_value text;
  current_revision bigint := 0;
  current_state jsonb;
  records jsonb;
  active_count integer := 0;
  active_record jsonb;
  active_id text;
  committed_at timestamptz := clock_timestamp();
  committed_at_text text;
  record_id text;
  note_text text := nullif(trim(coalesce(p_work_note,'')),'');
  new_record jsonb;
  updated_records jsonb;
  updated_state jsonb;
  result_revision bigint;
  result_updated_at timestamptz;
  visible_value text;
  backup_revision bigint;
begin
  if caller is null then
    raise exception 'authentication required' using errcode='42501';
  end if;
  if not public.has_module_access('time-tracker',caller) then
    raise exception 'module access denied' using errcode='42501';
  end if;
  if normalized_action not in ('clock-in','clock-out') then
    raise exception 'invalid attendance action' using errcode='22023';
  end if;
  if nullif(trim(coalesce(p_location,'')),'') is null or nullif(trim(coalesce(p_department,'')),'') is null then
    raise exception 'location and department are required' using errcode='22023';
  end if;
  if p_geo is null or jsonb_typeof(p_geo)<>'object' or coalesce(p_geo->>'status','')<>'captured' then
    raise exception 'valid captured GPS evidence is required' using errcode='22023';
  end if;
  if note_text is not null and length(note_text)>500 then
    raise exception 'work note exceeds maximum length' using errcode='22023';
  end if;

  ws := public.current_workspace_id(caller);
  if ws is null then
    raise exception 'workspace membership is required' using errcode='42501';
  end if;
  actor_id := 'cloud:'||caller::text;
  select coalesce(p.display_name,p.email,'Authenticated User') into actor_name
    from public.profiles p where p.id=caller;

  -- Permanent concurrency boundary: this transaction-scoped advisory lock cannot
  -- survive a failed request, tab close, refresh, navigation, or authentication
  -- change. It is automatically released by PostgreSQL at transaction end.
  perform pg_advisory_xact_lock(hashtextextended(ws::text||':time-tracker:attendance:'||caller::text,0));

  select e.value,e.revision into current_value,current_revision
    from public.module_state_entries e
    where e.workspace_id=ws
      and e.module_id='time-tracker'
      and e.state_key='timetracker.attendance.v1'
      and e.scope='shared'
      and e.owner_key=owner
    for update;

  if current_value is null then
    current_state := jsonb_build_object('version',1,'records','[]'::jsonb,'selection',jsonb_build_object('location','','department',''));
    current_revision := 0;
  else
    begin
      current_state := current_value::jsonb;
    exception when others then
      raise exception 'authoritative attendance state is malformed' using errcode='22023';
    end;
  end if;

  if jsonb_typeof(current_state)<>'object' or jsonb_typeof(coalesce(current_state->'records','[]'::jsonb))<>'array' then
    raise exception 'authoritative attendance state has an invalid shape' using errcode='22023';
  end if;
  records := coalesce(current_state->'records','[]'::jsonb);

  select count(*)
    into active_count
    from jsonb_array_elements(records) x
    where x->>'ownerId'=actor_id
      and (x->'clockOut' is null or x->'clockOut'='null'::jsonb);
  select x into active_record
    from jsonb_array_elements(records) x
    where x->>'ownerId'=actor_id
      and (x->'clockOut' is null or x->'clockOut'='null'::jsonb)
    limit 1;

  committed_at_text := to_char(committed_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');

  if normalized_action='clock-in' then
    if active_count>0 then
      raise exception 'WM_ATTENDANCE_ACTIVE_EXISTS' using errcode='P0001';
    end if;

    record_id := gen_random_uuid()::text;
    new_record := jsonb_build_object(
      'id',record_id,
      'ownerId',actor_id,
      'ownerName',actor_name,
      'clockIn',jsonb_build_object(
        'location',trim(p_location),
        'department',trim(p_department),
        'timestamp',committed_at_text,
        'geo',p_geo
      ) || case when note_text is not null then jsonb_build_object('workNote',note_text) else '{}'::jsonb end,
      'clockOut','null'::jsonb,
      'createdAt',committed_at_text,
      'updatedAt',committed_at_text
    );
    if note_text is not null then new_record := new_record || jsonb_build_object('note',note_text); end if;
    if p_attendance_policy is not null and jsonb_typeof(p_attendance_policy)='object' then
      new_record := new_record || jsonb_build_object('attendancePolicy',p_attendance_policy);
    end if;
    updated_records := jsonb_build_array(new_record) || records;

  else
    if active_count=0 then
      raise exception 'WM_ATTENDANCE_NO_ACTIVE' using errcode='P0001';
    end if;
    if active_count<>1 then
      raise exception 'authoritative attendance contains multiple active sessions for this account' using errcode='22023';
    end if;
    active_id := active_record->>'id';
    if nullif(trim(coalesce(p_record_id,'')),'') is not null and active_id<>trim(p_record_id) then
      raise exception 'WM_ATTENDANCE_SESSION_CHANGED' using errcode='P0001';
    end if;

    select coalesce(jsonb_agg(
      case when elem->>'id'=active_id then
        (
          elem
          || jsonb_build_object(
            'clockOut', jsonb_build_object(
              'location',trim(p_location),
              'department',trim(p_department),
              'timestamp',committed_at_text,
              'geo',p_geo
            ) || case when note_text is not null then jsonb_build_object('workNote',note_text) else '{}'::jsonb end,
            'updatedAt',committed_at_text
          )
          || case
               when note_text is not null then jsonb_build_object(
                 'note', concat_ws(' • ',nullif(trim(coalesce(elem->>'note','')),''),note_text)
               ) else '{}'::jsonb
             end
          || case
               when p_attendance_policy is not null and jsonb_typeof(p_attendance_policy)='object'
                 then jsonb_build_object('attendancePolicy',p_attendance_policy)
               else '{}'::jsonb
             end
        )
      else elem end
      order by ord
    ),'[]'::jsonb)
    into updated_records
    from jsonb_array_elements(records) with ordinality a(elem,ord);

    select elem into new_record from jsonb_array_elements(updated_records) elem where elem->>'id'=active_id limit 1;
  end if;

  updated_state := jsonb_set(current_state,'{records}',updated_records,true);
  updated_state := jsonb_set(updated_state,'{selection}',jsonb_build_object('location','','department',''),true);

  if not public.module_state_invariants_valid('time-tracker','timetracker.attendance.v1',updated_state::text) then
    raise exception 'attendance transaction violates data integrity invariants' using errcode='22023';
  end if;

  -- Maintain the rolling recovery copy in the same transaction. It never becomes
  -- runtime authority automatically, but remains available for explicit recovery.
  if current_value is not null then
    insert into public.module_state_entries(workspace_id,module_id,state_key,scope,owner_key,value,revision,updated_by,updated_at)
    values(ws,'time-tracker','timetracker.attendance.v1.backup','shared','*',current_value,1,caller,now())
    on conflict on constraint module_state_entries_pkey do update
      set value=excluded.value,
          revision=public.module_state_entries.revision+1,
          updated_by=caller,
          updated_at=now()
    returning revision into backup_revision;
  end if;

  insert into public.module_state_entries(workspace_id,module_id,state_key,scope,owner_key,value,revision,updated_by,updated_at)
  values(ws,'time-tracker','timetracker.attendance.v1','shared','*',updated_state::text,1,caller,now())
  on conflict on constraint module_state_entries_pkey do update
    set value=excluded.value,
        revision=public.module_state_entries.revision+1,
        updated_by=caller,
        updated_at=now()
  returning revision,updated_at into result_revision,result_updated_at;

  visible_value := public.module_state_visible_value('time-tracker','timetracker.attendance.v1',updated_state::text,caller);
  if normalized_action='clock-in' then
    -- new_record already points at the committed server-created record.
    null;
  else
    select elem into new_record from jsonb_array_elements(updated_records) elem where elem->>'id'=active_id limit 1;
  end if;

  return jsonb_build_object(
    'state_key','timetracker.attendance.v1',
    'action',normalized_action,
    'revision',result_revision,
    'updated_at',result_updated_at,
    'value',visible_value,
    'record',new_record,
    'committed_at',committed_at_text
  );
end;
$$;

-- Attendance no longer uses lease rows. Remove any stale leases left by v1.17.0-v1.17.2.
delete from public.module_operation_locks
where module_id='time-tracker' and lock_key like 'attendance-action:%';

revoke all on function public.commit_timetracker_attendance_action(text,text,text,text,jsonb,text,jsonb) from public;
grant execute on function public.commit_timetracker_attendance_action(text,text,text,text,jsonb,text,jsonb) to authenticated;

-- Legacy local-era attendance records occasionally have no stable ownerId. The old
-- client migration assigned every such record to whichever account opened TimeTracker
-- first. In a shared multi-user workspace that can falsely create an active session
-- for the wrong account. Preserve those records without claiming them by assigning a
-- deterministic non-user legacy owner marker per record.
do $$
declare rec record; j jsonb; normalized_records jsonb;
begin
  for rec in
    select e.workspace_id,e.module_id,e.state_key,e.scope,e.owner_key,e.value
    from public.module_state_entries e
    where e.module_id='time-tracker'
      and e.state_key in ('timetracker.attendance.v1','timetracker.attendance.v1.backup')
  loop
    begin
      j := rec.value::jsonb;
      if jsonb_typeof(j)<>'object' or jsonb_typeof(coalesce(j->'records','[]'::jsonb))<>'array' then continue; end if;

      select coalesce(jsonb_agg(
        case
          when nullif(trim(coalesce(elem->>'ownerId','')),'') is null then
            elem
            || jsonb_build_object(
              'ownerId','legacy:unassigned:'||coalesce(nullif(trim(elem->>'id'),''),md5(elem::text)),
              'ownerName',coalesce(nullif(trim(elem->>'ownerName'),''),'Legacy unassigned')
            )
          else elem
        end
        order by ord
      ),'[]'::jsonb)
      into normalized_records
      from jsonb_array_elements(coalesce(j->'records','[]'::jsonb)) with ordinality a(elem,ord);

      if normalized_records is distinct from coalesce(j->'records','[]'::jsonb) then
        update public.module_state_entries e
          set value=jsonb_set(j,'{records}',normalized_records,true)::text,
              revision=e.revision+1,
              updated_at=now()
          where e.workspace_id=rec.workspace_id
            and e.module_id=rec.module_id
            and e.state_key=rec.state_key
            and e.scope=rec.scope
            and e.owner_key=rec.owner_key;
      end if;
    exception when others then
      raise notice 'Skipped malformed TimeTracker legacy attendance state in workspace % key %: %',rec.workspace_id,rec.state_key,sqlerrm;
    end;
  end loop;
end;
$$;
