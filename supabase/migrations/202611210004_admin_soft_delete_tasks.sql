create or replace function public.audit_task_changes()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_events(organisation_id,actor_id,action,entity_type,entity_id,details)
  values(coalesce(new.organisation_id,old.organisation_id),coalesce((select auth.uid()),new.updated_by,new.created_by),
    case when tg_op='INSERT' then 'task.created'
      when old.deleted_at is null and new.deleted_at is not null then 'task.deleted'
      when old.assignee_id is distinct from new.assignee_id then 'task.reassigned'
      when old.budget_limit is distinct from new.budget_limit then 'task.budget_changed'
      when old.status is distinct from new.status and new.status='submitted' then 'task.submitted'
      when old.status is distinct from new.status and new.status='verified' then 'task.verified'
      when old.status is distinct from new.status and new.status='returned' and old.status='verified' then 'task.reopened'
      when old.status is distinct from new.status and new.status='returned' then 'task.returned'
      when old.status is distinct from new.status then 'task.status_changed' else 'task.updated' end,
    'task',coalesce(new.id,old.id),jsonb_build_object('previous_status',case when tg_op='INSERT' then null else old.status end,'status',case when tg_op='DELETE' then null else new.status end,
      'previous_assignee',case when tg_op='INSERT' then null else old.assignee_id end,'assignee',case when tg_op='DELETE' then null else new.assignee_id end,
      'previous_budget',case when tg_op='INSERT' then null else old.budget_limit end,'budget',case when tg_op='DELETE' then null else new.budget_limit end));
  return coalesce(new,old);
end $$;

create or replace function public.delete_task(target_task uuid, expected_version integer default null)
returns public.tasks language plpgsql security definer set search_path = '' as $$
declare actor public.profiles; task_row public.tasks;
begin
  select * into actor from public.profiles
    where id=(select auth.uid()) and is_active and deleted_at is null;
  if actor.id is null or actor.role<>'super_admin' then
    raise exception 'Not authorized' using errcode='42501';
  end if;

  select * into task_row from public.tasks
    where id=target_task and organisation_id=actor.organisation_id and deleted_at is null
    for update;
  if task_row.id is null then
    raise exception 'Task is unavailable' using errcode='P0002';
  end if;
  if expected_version is not null and task_row.version<>expected_version then
    raise exception 'Task changed; refresh and retry' using errcode='40001';
  end if;

  perform set_config('app.allow_verified_reopen','true',true);
  update public.tasks
    set deleted_at=now(),version=version+1,updated_at=now(),updated_by=actor.id
    where id=task_row.id returning * into task_row;
  return task_row;
end $$;
revoke all on function public.delete_task(uuid,integer) from public,anon;
grant execute on function public.delete_task(uuid,integer) to authenticated;
