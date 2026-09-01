-- Work Management v1.14.1 RBAC migration-order repair.
-- Use this when the v1.14.0 migration failed with SQLSTATE 23514 / profiles_platform_role_check.
-- Safe to run after a failed v1.14.0 attempt and safe to re-run on an already migrated database.

begin;

alter table public.profiles drop constraint if exists profiles_platform_role_check;

update public.profiles
set platform_role = case platform_role
  when 'platform_admin' then 'admin_general_manager'
  when 'manager' then 'supervisor'
  when 'user' then 'employee'
  else platform_role
end
where platform_role in ('platform_admin','manager','user');

alter table public.profiles alter column platform_role set default 'employee';

alter table public.profiles add constraint profiles_platform_role_check
  check (platform_role in ('admin_general_manager','hr','supervisor','employee'));

-- Re-run the full v1.14 RBAC migration after this repair so functions, RPCs,
-- bootstrap-admin promotion, module-role synchronization, and grants are installed.
commit;
