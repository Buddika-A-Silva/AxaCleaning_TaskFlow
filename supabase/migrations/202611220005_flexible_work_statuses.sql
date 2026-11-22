alter function public.transition_task(uuid,public.task_status,text,integer)
  rename to transition_task_legacy;
revoke all on function public.transition_task_legacy(uuid,public.task_status,text,integer)
  from public,anon,authenticated;

create function public.transition_task(
  target_task uuid,
  next_status public.task_status,
  reason text default null,
  expected_version integer default null
)
returns public.tasks
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.profiles;
  task_row public.tasks;
  prior_status public.task_status;
  allowed boolean := false;
begin
  select * into actor
  from public.profiles
  where id=(select auth.uid()) and is_active and deleted_at is null;
  if actor.id is null then
    raise exception 'Not authorized' using errcode='42501';
  end if;

  select * into task_row
  from public.tasks
  where id=target_task and organisation_id=actor.organisation_id and deleted_at is null
  for update;
  if task_row.id is null or task_row.is_draft then
    raise exception 'Task is unavailable' using errcode='P0002';
  end if;
  if expected_version is not null and task_row.version<>expected_version then
    raise exception 'Task changed; refresh and retry' using errcode='40001';
  end if;

  if next_status not in ('pending','in_progress','on_hold','skipped','returned') then
    return public.transition_task_legacy(target_task,next_status,reason,expected_version);
  end if;

  if actor.role='end_user' then
    if not exists(
      select 1 from public.task_assignments a
      where a.task_id=task_row.id and a.profile_id=actor.id
    ) then
      raise exception 'Not assigned to this task' using errcode='42501';
    end if;
    if exists(
      select 1 from public.task_assignments a
      where a.task_id=task_row.id and a.profile_id=actor.id
        and a.worker_submitted_at is not null
    ) then
      raise exception 'Your work has already been submitted; ask the assigner to reopen the task' using errcode='42501';
    end if;
    allowed := task_row.status in ('pending','in_progress','on_hold','skipped','returned');
  elsif actor.role in ('assigner','super_admin')
    and (actor.role='super_admin' or task_row.assigner_id=actor.id or exists(
      select 1 from public.permissions pm
      where pm.assigner_id=actor.id and pm.end_user_id=task_row.assignee_id
        and pm.organisation_id=task_row.organisation_id
    )) then
    allowed := task_row.status in ('pending','in_progress','on_hold','skipped','returned')
      or (task_row.status in ('submitted','verified') and next_status='returned');
  end if;
  if not allowed then
    raise exception 'Transition not allowed' using errcode='42501';
  end if;
  if next_status in ('on_hold','skipped','returned')
    and length(trim(coalesce(reason,'')))<10 then
    raise exception 'A comment of at least 10 characters is required' using errcode='22023';
  end if;
  if task_row.status=next_status then
    return task_row;
  end if;

  prior_status:=task_row.status;
  if next_status='returned' and actor.role in ('assigner','super_admin') then
    update public.task_assignments set worker_submitted_at=null
    where task_id=task_row.id;
  end if;
  if prior_status='verified' and next_status='returned' then
    perform set_config('app.allow_verified_reopen','true',true);
  end if;

  update public.tasks
  set status=next_status,version=version+1,updated_at=now(),updated_by=actor.id
  where id=task_row.id returning * into task_row;
  insert into public.task_status_history(organisation_id,task_id,from_status,to_status,comment,actor_id)
  values(task_row.organisation_id,task_row.id,prior_status,next_status,nullif(trim(reason),''),actor.id);
  insert into public.task_comments(organisation_id,task_id,author_id,body)
  values(task_row.organisation_id,task_row.id,actor.id,
    coalesce(nullif(trim(reason),''),format('Status changed from %s to %s.',prior_status,next_status)));

  if next_status='returned' and actor.role in ('assigner','super_admin') then
    insert into public.task_reviews(organisation_id,task_id,reviewer_id,decision,comment,snapshot)
    values(task_row.organisation_id,task_row.id,actor.id,
      case when prior_status='verified' then 'reopened' else 'returned' end,
      nullif(trim(reason),''),
      jsonb_build_object('budget_limit',task_row.budget_limit,'currency',task_row.currency));
  end if;

  insert into public.notifications(organisation_id,recipient_id,task_id,title,body)
  select task_row.organisation_id,recipient_id,task_row.id,'task.status_changed',
    jsonb_build_object('status',next_status,'reference',task_row.reference)::text
  from (
    select a.profile_id as recipient_id
    from public.task_assignments a
    where a.task_id=task_row.id and a.profile_id<>actor.id
    union
    select task_row.assigner_id
    where actor.role='end_user' and task_row.assigner_id<>actor.id
  ) recipients;
  return task_row;
end
$$;

revoke all on function public.transition_task(uuid,public.task_status,text,integer)
  from public,anon;
grant execute on function public.transition_task(uuid,public.task_status,text,integer)
  to authenticated;
