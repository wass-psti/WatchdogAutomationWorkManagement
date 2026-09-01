-- Apply this migration to an existing Work Management v1.12.x Supabase project.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end; $$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at before update on public.profiles for each row execute function public.touch_updated_at();

drop trigger if exists module_roles_touch_updated_at on public.module_role_assignments;
create trigger module_roles_touch_updated_at before update on public.module_role_assignments for each row execute function public.touch_updated_at();

create or replace function public.update_own_profile(p_display_name text)
returns setof public.profiles
language plpgsql security definer set search_path=public as $$
declare clean_name text := regexp_replace(trim(coalesce(p_display_name,'')), '\\s+', ' ', 'g');
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if char_length(clean_name) < 2 or char_length(clean_name) > 80 then
    raise exception 'Display name must contain between 2 and 80 characters';
  end if;
  return query update public.profiles set display_name=clean_name
    where id=auth.uid() and status='active' returning *;
end;
$$;
revoke all on function public.update_own_profile(text) from public;
grant execute on function public.update_own_profile(text) to authenticated;
