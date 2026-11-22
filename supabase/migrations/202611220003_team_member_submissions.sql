alter table public.task_assignments
  add column if not exists worker_submitted_at timestamptz;

update public.task_assignments a
set worker_submitted_at = coalesce(a.worker_submitted_at, t.updated_at, now())
from public.tasks t
where t.id = a.task_id
  and t.status in ('submitted', 'verified')
  and a.worker_submitted_at is null;

do $$
begin
  if not exists (select 1 from pg_publication where pubname='supabase_realtime') then
    raise exception 'The supabase_realtime publication is required for task assignment updates';
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='task_assignments'
  ) then
    alter publication supabase_realtime add table public.task_assignments;
  end if;
end
$$;

create or replace function public.save_task_service_progress(
  target_task uuid, target_selection uuid, actual numeric, completed boolean,
  worker_comment_text text default null
)
returns public.task_service_logs language plpgsql security definer set search_path='' as $$
declare actor public.profiles; task_row public.tasks; service_log public.task_service_logs;
begin
  select * into actor from public.profiles
  where id=(select auth.uid()) and is_active and deleted_at is null;
  select * into task_row from public.tasks
  where id=target_task and organisation_id=actor.organisation_id and deleted_at is null
  for update;
  if actor.id is null or task_row.id is null or task_row.is_draft
    or task_row.status not in ('pending','in_progress','on_hold','skipped','returned')
    or not exists(
      select 1 from public.task_assignments ta
      where ta.task_id=target_task and ta.profile_id=actor.id and ta.worker_submitted_at is null
    ) then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  if actual is null or actual < 0 then raise exception 'Invalid duration' using errcode='22023'; end if;
  update public.task_service_logs l set
    actual_hours=actual, is_completed=completed,
    worker_comment=worker_comment_text, updated_at=now()
  where l.selection_id=target_selection and l.task_id=target_task and l.profile_id=actor.id
  returning * into service_log;
  if service_log.id is null then raise exception 'Service not found' using errcode='P0002'; end if;
  return service_log;
end $$;
revoke all on function public.save_task_service_progress(uuid,uuid,numeric,boolean,text) from public,anon;
grant execute on function public.save_task_service_progress(uuid,uuid,numeric,boolean,text) to authenticated;

create or replace function public.transition_task(target_task uuid, next_status public.task_status, reason text default null, expected_version integer default null)
returns public.tasks language plpgsql security definer set search_path = '' as $$
declare task_row public.tasks; actor public.profiles; allowed boolean := false; prior_status public.task_status;
begin
  select * into actor from public.profiles where id=(select auth.uid()) and is_active and deleted_at is null;
  if actor.id is null then raise exception 'Not authorized' using errcode='42501'; end if;
  select * into task_row from public.tasks where id=target_task and organisation_id=actor.organisation_id and deleted_at is null for update;
  if task_row.id is null or task_row.is_draft then raise exception 'Task is unavailable' using errcode='P0002'; end if;
  if expected_version is not null and task_row.version<>expected_version then raise exception 'Task changed; refresh and retry' using errcode='40001'; end if;
  if next_status in ('on_hold','skipped','returned') and length(trim(coalesce(reason,'')))<10 then
    raise exception 'A comment of at least 10 characters is required' using errcode='22023';
  end if;
  if actor.role='end_user' and exists(select 1 from public.task_assignments a where a.task_id=task_row.id and a.profile_id=actor.id) then
    if next_status='submitted' and current_setting('app.allow_worker_submit',true) is distinct from 'true' then
      raise exception 'Use the worker submission action' using errcode='42501';
    end if;
    if exists(select 1 from public.task_assignments a where a.task_id=task_row.id and a.profile_id=actor.id and a.worker_submitted_at is not null)
      and next_status<>'submitted' then
      raise exception 'Your work has already been submitted' using errcode='42501';
    end if;
    allowed := (task_row.status in ('pending','returned','on_hold','skipped') and next_status='in_progress')
      or (task_row.status in ('pending','in_progress','returned') and next_status in ('on_hold','skipped'))
      or (task_row.status in ('pending','in_progress','on_hold','skipped','returned') and next_status='submitted');
  elsif actor.role in ('assigner','super_admin') and (actor.role='super_admin' or task_row.assigner_id=actor.id or exists(
    select 1 from public.permissions pm where pm.assigner_id=actor.id and pm.end_user_id=task_row.assignee_id and pm.organisation_id=task_row.organisation_id
  )) then
    allowed := (task_row.status='submitted' and next_status in ('verified','returned'))
      or (task_row.status='pending' and next_status='cancelled')
      or (actor.role='super_admin' and task_row.status not in ('verified','cancelled') and next_status='cancelled')
      or (actor.role='super_admin' and task_row.status='verified' and next_status='returned');
  end if;
  if not allowed then raise exception 'Transition not allowed' using errcode='42501'; end if;
  if next_status='returned' and length(trim(coalesce(reason,'')))<10 then raise exception 'A return comment of at least 10 characters is required' using errcode='22023'; end if;
  if next_status='cancelled' and length(trim(coalesce(reason,'')))<1 then raise exception 'A cancellation reason is required' using errcode='22023'; end if;
  if next_status='submitted' then
    if not exists(select 1 from public.task_assignments a where a.task_id=task_row.id) then
      raise exception 'At least one worker must be assigned before submission' using errcode='23514';
    end if;
    if exists(select 1 from public.task_assignments a where a.task_id=task_row.id and a.worker_submitted_at is null) then
      raise exception 'Every assigned worker must submit their work before review' using errcode='23514';
    end if;
    if not exists(select 1 from public.task_photos p where p.task_id=task_row.id and p.photo_type='completion') then
      raise exception 'At least one completion photo must be uploaded for this task before submission' using errcode='23514';
    end if;
    if exists(
      select 1 from public.task_service_selections s
      where s.task_id=task_row.id and not exists(
        select 1 from public.task_service_logs l
        join public.task_assignments a on a.task_id=l.task_id and a.profile_id=l.profile_id
        where l.task_id=task_row.id and l.selection_id=s.id and l.actual_hours is not null
      )
    ) then
      raise exception 'Every selected service must have worked hours recorded by a team member before submission' using errcode='23514';
    end if;
    if length(trim(coalesce(reason,'')))>=3 then
      update public.task_service_logs l set worker_comment=coalesce(nullif(trim(l.worker_comment),''),trim(reason)),updated_at=now()
      from public.task_service_selections s where l.selection_id=s.id and l.profile_id=actor.id and l.task_id=task_row.id
        and (
          not l.is_completed
          or (s.assigned_hours is not null and l.actual_hours>s.assigned_hours)
          or exists(
            select 1 from public.task_assignments a
            where a.task_id=task_row.id and a.profile_id=l.profile_id
              and (select sum(sl.actual_hours) from public.task_service_logs sl
                where sl.task_id=task_row.id and sl.profile_id=l.profile_id)
                > coalesce(a.assigned_hours,task_row.assigned_hours,999999)
          )
        );
    end if;
    if exists(
      select 1 from public.task_service_logs l
      join public.task_service_selections s on s.id=l.selection_id
      where l.task_id=task_row.id and l.actual_hours is not null and (
        (
          not l.is_completed
          and not exists(
            select 1 from public.task_service_logs completed_log
            where completed_log.task_id=l.task_id and completed_log.selection_id=l.selection_id
              and completed_log.actual_hours is not null and completed_log.is_completed
          )
        )
        or (s.assigned_hours is not null and l.actual_hours>s.assigned_hours)
      )
      and length(trim(coalesce(nullif(trim(l.worker_comment),''),nullif(trim(reason),''),'')))<3
    ) or exists(
      select 1 from public.task_service_logs l
      join public.task_assignments a on a.task_id=l.task_id and a.profile_id=l.profile_id
      where l.task_id=task_row.id group by l.profile_id,a.assigned_hours
      having sum(l.actual_hours)>coalesce(a.assigned_hours,task_row.assigned_hours,999999)
        and length(trim(coalesce(max(nullif(trim(l.worker_comment),'')),nullif(trim(reason),''),'')))<3
    ) then
      raise exception 'Explain incomplete services or hours above the estimate in a comment' using errcode='23514';
    end if;
    if exists(select 1 from public.expense_lines e where e.task_id=task_row.id and e.deleted_at is null
      and not exists(select 1 from public.expense_proofs p where p.expense_line_id=e.id and p.deleted_at is null)) then
      raise exception 'Each expense line requires proof before submission' using errcode='23514';
    end if;
  end if;
  prior_status:=task_row.status;
  if next_status='returned' then
    update public.task_assignments set worker_submitted_at=null where task_id=task_row.id;
  end if;
  if prior_status='verified' and actor.role='super_admin' then perform set_config('app.allow_verified_reopen','true',true); end if;
  update public.tasks set status=next_status,version=version+1,updated_at=now(),updated_by=actor.id,
    worker_comment=case when next_status='submitted' then nullif(trim(reason),'') else worker_comment end
    where id=task_row.id returning * into task_row;
  insert into public.task_status_history(organisation_id,task_id,from_status,to_status,comment,actor_id)
    values(task_row.organisation_id,task_row.id,prior_status,next_status,nullif(trim(reason),''),actor.id);
  insert into public.task_comments(organisation_id,task_id,author_id,body)
    values(task_row.organisation_id,task_row.id,actor.id,coalesce(nullif(trim(reason),''),format('Status changed from %s to %s.',prior_status,next_status)));
  if next_status in ('verified','returned') then
    insert into public.task_reviews(organisation_id,task_id,reviewer_id,decision,comment,snapshot)
      values(task_row.organisation_id,task_row.id,actor.id,case when prior_status='verified' then 'reopened' else next_status::text end,nullif(trim(reason),''),jsonb_build_object('budget_limit',task_row.budget_limit,'currency',task_row.currency));
  elsif next_status='cancelled' then
    insert into public.task_reviews(organisation_id,task_id,reviewer_id,decision,comment)
      values(task_row.organisation_id,task_row.id,actor.id,'cancelled',nullif(trim(reason),''));
  end if;
  insert into public.notifications(organisation_id,recipient_id,task_id,title,body)
    select task_row.organisation_id,a.profile_id,task_row.id,'task.status_changed',
      jsonb_build_object('status',next_status,'reference',task_row.reference)::text
    from public.task_assignments a where a.task_id=task_row.id and a.profile_id<>actor.id;
  return task_row;
end $$;
revoke all on function public.transition_task(uuid,public.task_status,text,integer) from public,anon;
grant execute on function public.transition_task(uuid,public.task_status,text,integer) to authenticated;

create or replace function public.submit_task_work(target_task uuid, reason text default null, expected_version integer default null)
returns public.tasks language plpgsql security definer set search_path='' as $$
declare actor public.profiles; task_row public.tasks; assignment_row public.task_assignments;
begin
  select * into actor from public.profiles
  where id=(select auth.uid()) and is_active and deleted_at is null;
  if actor.id is null or actor.role<>'end_user' then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  select * into task_row from public.tasks
  where id=target_task and organisation_id=actor.organisation_id and deleted_at is null
  for update;
  if task_row.id is null or task_row.is_draft then
    raise exception 'Task is unavailable' using errcode='P0002';
  end if;
  if expected_version is not null and task_row.version<>expected_version then
    raise exception 'Task changed; refresh and retry' using errcode='40001';
  end if;
  select * into assignment_row from public.task_assignments
  where task_id=task_row.id and profile_id=actor.id
  for update;
  if assignment_row.task_id is null then
    raise exception 'Not assigned to this task' using errcode='42501';
  end if;
  if assignment_row.worker_submitted_at is not null then
    return task_row;
  end if;
  if task_row.status not in ('pending','in_progress','on_hold','skipped','returned') then
    raise exception 'Task is not accepting worker submissions' using errcode='42501';
  end if;
  update public.task_assignments set worker_submitted_at=now()
  where task_id=task_row.id and profile_id=actor.id;
  if exists(select 1 from public.task_assignments where task_id=task_row.id and worker_submitted_at is null) then
    insert into public.task_comments(organisation_id,task_id,author_id,body)
      values(task_row.organisation_id,task_row.id,actor.id,
        coalesce(nullif(trim(reason),''),format('%s submitted their part of the task.',coalesce(actor.full_name,'A team member'))));
    return task_row;
  end if;
  perform set_config('app.allow_worker_submit','true',true);
  return public.transition_task(target_task,'submitted'::public.task_status,reason,task_row.version);
end $$;
revoke all on function public.submit_task_work(uuid,text,integer) from public,anon;
grant execute on function public.submit_task_work(uuid,text,integer) to authenticated;
