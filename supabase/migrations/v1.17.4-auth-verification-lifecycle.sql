-- Work Management v1.17.4
-- Durable email-verification lifecycle projection for Supabase Auth.
-- Safe to run after the v1.17.3 migrations. No user credentials or tokens are stored here.

alter table public.profiles
  add column if not exists email_verified_at timestamptz;

-- Backfill the public account projection from the authoritative auth.users state.
update public.profiles p
set email_verified_at = u.email_confirmed_at
from auth.users u
where u.id = p.id
  and p.email_verified_at is distinct from u.email_confirmed_at;

create or replace function public.sync_profile_email_verification()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  update public.profiles
  set email = lower(coalesce(new.email, email)),
      email_verified_at = new.email_confirmed_at,
      updated_at = now()
  where id = new.id;
  return new;
end;
$$;

-- The user-profile creation trigger is named on_auth_user_created. PostgreSQL executes
-- same-event triggers in name order, so the zz_ prefix ensures the profile row exists
-- before the initial projection sync. Updates cover the normal email-confirmation path.
drop trigger if exists zz_on_auth_user_verification_sync on auth.users;
create trigger zz_on_auth_user_verification_sync
after insert or update of email_confirmed_at, email on auth.users
for each row execute function public.sync_profile_email_verification();

revoke all on function public.sync_profile_email_verification() from public;

comment on column public.profiles.email_verified_at is
  'Projection of auth.users.email_confirmed_at. Supabase Auth remains authoritative.';
