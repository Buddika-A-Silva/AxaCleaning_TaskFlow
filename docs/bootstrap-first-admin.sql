-- ONE-TIME PRODUCTION BOOTSTRAP — run in the Supabase SQL Editor as the project owner.
-- First add the intended Super Admin as an Auth user from Supabase Dashboard > Authentication > Users.
-- Set a temporary password there; this script requires the user to change it at first sign-in.
-- Replace all three values below with that person's real email, username, and full name.
-- This script stores no password and does not send an email.
-- Run only once, before any active Super Admin profile exists. Do not add this SQL to CI.

do $bootstrap$
declare
  bootstrap_email text := lower(trim('buddikaashansilva@hotmail.com'));
  bootstrap_username text := lower(trim('Ashan'));
  bootstrap_full_name text := trim('Buddika Ashan Silva');
  auth_user_id uuid;
  organisation_uuid uuid;
begin
  if bootstrap_email like 'replace_with_%'
    or bootstrap_username like 'replace_with_%'
    or bootstrap_full_name like 'replace_with_%'
    or bootstrap_email = '' or bootstrap_username = '' or bootstrap_full_name = '' then
    raise exception 'Replace the bootstrap email, username, and full name before running this script.';
  end if;

  if bootstrap_username !~ '^[a-z0-9._-]{3,40}$' then
    raise exception 'Username must be 3-40 lowercase letters, digits, dots, underscores, or hyphens.';
  end if;

  perform pg_advisory_xact_lock(hashtext('axa-cleaning-first-super-admin'));

  if exists (
    select 1 from public.profiles
    where role = 'super_admin' and is_active and deleted_at is null
  ) then
    raise exception 'An active Super Admin already exists. Use People > Add user instead.';
  end if;

  select id into auth_user_id
  from auth.users
  where lower(email) = bootstrap_email
  order by created_at desc
  limit 1;

  if auth_user_id is null then
    raise exception 'No Supabase Auth user found for this email. First add the user in Authentication > Users.';
  end if;

  if exists(select 1 from public.profiles where id = auth_user_id) then
    raise exception 'This Auth user already has a profile.';
  end if;
  if exists(select 1 from public.profiles where username = bootstrap_username) then
    raise exception 'That username is already in use.';
  end if;

  select id into organisation_uuid
  from public.organisations
  where name = 'AXA Cleaning' and deleted_at is null
  order by created_at
  limit 1;

  if organisation_uuid is null then
    insert into public.organisations(name, default_currency, timezone)
    values ('AXA Cleaning', 'EUR', 'Europe/Bucharest')
    returning id into organisation_uuid;
  end if;

  insert into public.profiles (
    id, organisation_id, username, full_name, recovery_email, role,
    language, timezone, is_active, must_reset_password, can_manage_users
  ) values (
    auth_user_id, organisation_uuid, bootstrap_username, bootstrap_full_name,
    bootstrap_email, 'super_admin', 'en', 'Europe/Bucharest', true, true, false
  );

  insert into public.audit_events (
    organisation_id, actor_id, action, entity_type, entity_id, details
  ) values (
    organisation_uuid, auth_user_id, 'profile.first_super_admin_bootstrapped',
    'profile', auth_user_id, jsonb_build_object('username', bootstrap_username)
  );
end
$bootstrap$;
