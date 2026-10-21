alter table public.profiles
  add column job_position text not null default 'employee'
    check (job_position in ('employee', 'manager')),
  add column manager_id uuid references public.profiles(id) on delete set null;

create index profiles_manager_id_idx on public.profiles(manager_id) where manager_id is not null;

create or replace function public.validate_profile_reporting_line()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  has_cycle boolean;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('profile-reporting:' || new.organisation_id::text, 0)
  );

  if new.manager_id is not null then
    if new.manager_id = new.id then
      raise exception 'A user cannot report to themselves' using errcode = '23514';
    end if;

    if not exists (
      select 1
      from public.profiles manager
      where manager.id = new.manager_id
        and manager.organisation_id = new.organisation_id
        and manager.job_position = 'manager'
    ) then
      raise exception 'The reporting manager must be a manager in the same organisation' using errcode = '23514';
    end if;

    with recursive manager_chain(id, manager_id, path) as (
      select manager.id, manager.manager_id, array[manager.id]
      from public.profiles manager
      where manager.id = new.manager_id
        and manager.organisation_id = new.organisation_id
      union all
      select manager.id, manager.manager_id, chain.path || manager.id
      from public.profiles manager
      join manager_chain chain on manager.id = chain.manager_id
      where manager.organisation_id = new.organisation_id
        and not manager.id = any(chain.path)
    )
    select exists(select 1 from manager_chain where id = new.id)
    into has_cycle;

    if has_cycle then
      raise exception 'The reporting change would create a management cycle' using errcode = '23514';
    end if;
  end if;

  if new.job_position <> 'manager' and exists (
    select 1 from public.profiles report where report.manager_id = new.id
  ) then
    raise exception 'A manager with direct reports cannot be changed to Employee' using errcode = '23514';
  end if;

  if tg_op = 'UPDATE'
    and new.organisation_id is distinct from old.organisation_id
    and exists (select 1 from public.profiles report where report.manager_id = new.id) then
    raise exception 'A manager with direct reports cannot be moved to another organisation' using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger profiles_validate_reporting_line
before insert or update of organisation_id, job_position, manager_id
on public.profiles
for each row execute function public.validate_profile_reporting_line();
revoke all on function public.validate_profile_reporting_line() from public, anon, authenticated;

create or replace function public.audit_profile_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.profiles;
  actor_id uuid;
  action_name text;
begin
  target := case when tg_op = 'DELETE' then old else new end;
  actor_id := coalesce((select auth.uid()), target.updated_by, target.created_by);
  action_name := case
    when tg_op = 'INSERT' then 'profile.created'
    when tg_op = 'DELETE' then 'profile.deleted'
    when old.role is distinct from new.role then 'profile.role_changed'
    when old.is_active is distinct from new.is_active then 'profile.account_state_changed'
    when old.job_position is distinct from new.job_position
      or old.manager_id is distinct from new.manager_id then 'profile.reporting_line_changed'
    else 'profile.updated'
  end;
  insert into public.audit_events(organisation_id, actor_id, action, entity_type, entity_id, details)
  values (
    target.organisation_id,
    actor_id,
    action_name,
    'profile',
    target.id,
    jsonb_build_object(
      'role', target.role,
      'job_position', target.job_position,
      'manager_id', target.manager_id,
      'is_active', target.is_active,
      'username', target.username
    )
  );
  return coalesce(new, old);
end;
$$;
