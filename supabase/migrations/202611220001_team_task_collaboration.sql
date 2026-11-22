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
    if not exists(select 1 from public.task_photos p where p.task_id=task_row.id and p.photo_type='completion') then
      raise exception 'At least one completion photo must be uploaded for this task before submission' using errcode='23514';
    end if;
    if exists(select 1 from public.task_assignments a cross join public.task_service_selections s
      where a.task_id=task_row.id and s.task_id=task_row.id and not exists(
        select 1 from public.task_service_logs l where l.selection_id=s.id and l.profile_id=a.profile_id
      )) then
      raise exception 'Every assigned worker must record each service before submission' using errcode='23514';
    end if;
    if exists(select 1 from public.task_assignments a join public.task_service_logs l on l.task_id=a.task_id and l.profile_id=a.profile_id
      where a.task_id=task_row.id and l.actual_hours is null) then
      raise exception 'Every assigned worker must enter worked hours for every service before submission' using errcode='23514';
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
      join public.task_assignments a on a.task_id=l.task_id and a.profile_id=l.profile_id
      where l.task_id=task_row.id and (
        (not l.is_completed or l.actual_hours>s.assigned_hours) and length(trim(coalesce(l.worker_comment,'')))<3
      )
    ) or exists(
      select 1 from public.task_service_logs l join public.task_assignments a on a.task_id=l.task_id and a.profile_id=l.profile_id
      where l.task_id=task_row.id group by l.profile_id,a.assigned_hours
      having sum(l.actual_hours)>coalesce(a.assigned_hours,task_row.assigned_hours,999999)
        and length(trim(coalesce(max(l.worker_comment),'')))<3
    ) then
      raise exception 'Every worker must explain incomplete services or hours above the estimate in a comment' using errcode='23514';
    end if;
    if exists(select 1 from public.expense_lines e where e.task_id=task_row.id and e.deleted_at is null
      and not exists(select 1 from public.expense_proofs p where p.expense_line_id=e.id and p.deleted_at is null)) then
      raise exception 'Each expense line requires proof before submission' using errcode='23514';
    end if;
  end if;
  prior_status:=task_row.status;
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

do $$
declare
  table_name text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise exception 'The supabase_realtime publication is required for team task updates';
  end if;

  foreach table_name in array array[
    'task_service_logs',
    'task_photos',
    'task_equipment',
    'expense_lines',
    'expense_proofs',
    'task_status_history'
  ] loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end
$$;
