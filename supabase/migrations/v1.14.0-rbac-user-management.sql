-- Work Management v1.14.0 RBAC + User Management migration.
-- Run once in Supabase SQL Editor when upgrading from v1.13.x.

-- Remove the legacy role constraint before translating legacy values. Existing v1.12/v1.13
-- databases reject the new values (for example `employee`) while that old CHECK remains active.
alter table public.profiles drop constraint if exists profiles_platform_role_check;

-- Normalize legacy roles only after the incompatible constraint has been removed.
update public.profiles set platform_role = case platform_role
  when 'platform_admin' then 'admin_general_manager'
  when 'manager' then 'supervisor'
  when 'user' then 'employee'
  else platform_role
end
where platform_role in ('platform_admin','manager','user');

alter table public.profiles alter column platform_role set default 'employee';
alter table public.profiles add constraint profiles_platform_role_check
  check (platform_role in ('admin_general_manager','hr','supervisor','employee'));

create or replace function public.is_platform_admin(check_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.profiles where id=check_user and platform_role='admin_general_manager' and status='active');
$$;

create or replace function public.sync_module_roles(p_user_id uuid, p_platform_role text, p_assigned_by uuid default null)
returns void language plpgsql security definer set search_path=public as $$
begin
  if p_platform_role not in ('admin_general_manager','hr','supervisor','employee') then raise exception 'Unsupported Work Management role'; end if;
  insert into public.module_role_assignments(user_id,module_id,role,enabled,assigned_by) values
    (p_user_id,'time-tracker',case p_platform_role when 'admin_general_manager' then 'System Admin' when 'hr' then 'HR' when 'supervisor' then 'Supervisor' else 'Employee' end,true,p_assigned_by),
    (p_user_id,'fueltrack-plus',case p_platform_role when 'admin_general_manager' then 'Admin' else 'User' end,true,p_assigned_by),
    (p_user_id,'tradelink',case p_platform_role when 'admin_general_manager' then 'General Manager' when 'supervisor' then 'Sales Supervisor' else 'User' end,true,p_assigned_by)
  on conflict (user_id,module_id) do update set role=excluded.role,enabled=true,assigned_by=excluded.assigned_by,updated_at=now();
end;
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public as $$
declare initial_role text := case when lower(coalesce(new.email,''))='lmsenagan@watchdogautomation.com.ph' then 'admin_general_manager' else 'employee' end;
begin
  insert into public.profiles(id,email,display_name,platform_role,status)
  values(new.id,lower(coalesce(new.email,'')),coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'),''),split_part(coalesce(new.email,''),'@',1)),initial_role,'active')
  on conflict (id) do update set email=excluded.email,platform_role=case when lower(excluded.email)='lmsenagan@watchdogautomation.com.ph' then 'admin_general_manager' else public.profiles.platform_role end;
  perform public.sync_module_roles(new.id,initial_role,null);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

update public.profiles set platform_role='admin_general_manager',status='active'
where lower(email)='lmsenagan@watchdogautomation.com.ph';

do $$ declare r record; begin
  for r in select id,platform_role from public.profiles loop perform public.sync_module_roles(r.id,r.platform_role,null); end loop;
end $$;

create or replace function public.list_user_directory()
returns table(id uuid,email text,display_name text,platform_role text,status text,created_at timestamptz,updated_at timestamptz)
language plpgsql security definer set search_path=public as $$
begin
  if not public.is_platform_admin() then raise exception 'Administrator access required'; end if;
  return query select p.id,p.email,p.display_name,p.platform_role,p.status,p.created_at,p.updated_at from public.profiles p order by lower(coalesce(p.display_name,p.email)),lower(p.email);
end;
$$;

create or replace function public.admin_set_user_access(p_user_id uuid,p_platform_role text,p_status text)
returns setof public.profiles language plpgsql security definer set search_path=public as $$
declare target public.profiles%rowtype; active_admins integer;
begin
  if not public.is_platform_admin() then raise exception 'Administrator access required'; end if;
  if p_platform_role not in ('admin_general_manager','hr','supervisor','employee') then raise exception 'Unsupported role'; end if;
  if p_status not in ('active','disabled') then raise exception 'Unsupported account status'; end if;
  select * into target from public.profiles where id=p_user_id for update;
  if not found then raise exception 'User account not found'; end if;
  if lower(target.email)='lmsenagan@watchdogautomation.com.ph' and (p_platform_role<>'admin_general_manager' or p_status<>'active') then raise exception 'The bootstrap administrator cannot be demoted or disabled'; end if;
  if p_user_id=auth.uid() and p_status='disabled' then raise exception 'You cannot disable your own active administrator account'; end if;
  if target.platform_role='admin_general_manager' and target.status='active' and (p_platform_role<>'admin_general_manager' or p_status<>'active') then
    select count(*) into active_admins from public.profiles where platform_role='admin_general_manager' and status='active';
    if active_admins<=1 then raise exception 'At least one active Admin/General Manager is required'; end if;
  end if;
  update public.profiles set platform_role=p_platform_role,status=p_status where id=p_user_id;
  perform public.sync_module_roles(p_user_id,p_platform_role,auth.uid());
  return query select * from public.profiles where id=p_user_id;
end;
$$;

revoke all on function public.sync_module_roles(uuid,text,uuid) from public;
revoke all on function public.list_user_directory() from public;
revoke all on function public.admin_set_user_access(uuid,text,text) from public;
grant execute on function public.list_user_directory() to authenticated;
grant execute on function public.admin_set_user_access(uuid,text,text) to authenticated;


-- v1.16.0 bootstrap reconciliation. This is intentionally callable by authenticated
-- clients, but it can only promote the caller when the caller's own persisted email
-- matches the fixed bootstrap administrator identity. No arbitrary role value is accepted.
create or replace function public.claim_bootstrap_admin()
returns setof public.profiles
language plpgsql security definer set search_path=public as $$
declare
  caller uuid := auth.uid();
  target public.profiles%rowtype;
begin
  if caller is null then raise exception 'Authentication required'; end if;
  select * into target from public.profiles where id=caller for update;
  if not found then raise exception 'User profile not found'; end if;
  if lower(coalesce(target.email,'')) <> 'lmsenagan@watchdogautomation.com.ph' then
    raise exception 'Bootstrap administrator reconciliation is not permitted for this account';
  end if;
  update public.profiles
     set platform_role='admin_general_manager', status='active'
   where id=caller;
  perform public.sync_module_roles(caller,'admin_general_manager',caller);
  return query select * from public.profiles where id=caller;
end;
$$;

revoke all on function public.claim_bootstrap_admin() from public;
grant execute on function public.claim_bootstrap_admin() to authenticated;
