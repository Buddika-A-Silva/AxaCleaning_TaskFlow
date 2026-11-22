create or replace function public.update_cleaning_task(
  target_task uuid,
  expected_version integer,
  task_reference text,
  task_title text,
  task_description text,
  task_priority public.task_priority,
  task_start date,
  task_due date,
  task_assigned_hours numeric,
  assignee_ids uuid[],
  service_selections jsonb,
  equipment_items jsonb,
  customer jsonb,
  task_budget numeric,
  task_currency text
)
returns public.tasks
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.profiles;
  task_row public.tasks;
  updated_task public.tasks;
  assignee uuid;
  selection jsonb;
  item jsonb;
  service_id uuid;
  old_assignee_ids uuid[];
  new_assignee_ids uuid[];
  prior_services jsonb;
  current_services jsonb;
  prior_equipment jsonb;
  current_equipment jsonb;
  changed_fields text[] := '{}';
  required_assignees integer;
begin
  select * into actor
  from public.profiles
  where id=(select auth.uid()) and is_active and deleted_at is null;

  select * into task_row
  from public.tasks
  where id=target_task and organisation_id=actor.organisation_id and deleted_at is null
  for update;

  if actor.id is null or actor.role not in ('assigner','super_admin')
    or task_row.id is null
    or (actor.role='assigner' and task_row.assigner_id<>actor.id) then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  if expected_version is not null and task_row.version<>expected_version then
    raise exception 'Task changed; refresh and retry' using errcode='40001';
  end if;
  if task_row.is_draft or task_row.status not in ('pending','in_progress','on_hold','skipped','returned') then
    raise exception 'This task can no longer be edited' using errcode='42501';
  end if;
  if exists(select 1 from public.task_assignments a where a.task_id=target_task and a.worker_submitted_at is not null) then
    raise exception 'Task cannot be edited after a worker submits work' using errcode='42501';
  end if;
  if task_reference is null or length(trim(task_reference))<1
    or task_title is null or length(trim(task_title)) not between 3 and 150
    or length(coalesce(task_description,''))>10000
    or task_priority is null
    or task_start is null or task_due is null or task_due<task_start
    or (task_assigned_hours is not null and (task_assigned_hours<=0 or task_assigned_hours>9999.99))
    or (task_budget is not null and task_budget<0)
    or task_currency is null or task_currency !~ '^[A-Z]{3}$' then
    raise exception 'Invalid task details' using errcode='22023';
  end if;
  if jsonb_typeof(customer) is distinct from 'object'
    or length(trim(coalesce(customer->>'customer_name','')))<2
    or length(trim(coalesce(customer->>'apartment_number','')))<1
    or length(trim(coalesce(customer->>'apartment_block','')))<1
    or length(trim(coalesce(customer->>'customer_address','')))<3
    or length(trim(coalesce(customer->>'customer_phone','')))<5 then
    raise exception 'Complete all customer details' using errcode='22023';
  end if;
  if coalesce(cardinality(assignee_ids),0)<1
    or cardinality(assignee_ids)<>(select count(distinct selected_id) from unnest(assignee_ids) as assignees(selected_id)) then
    raise exception 'Select at least one unique assignee' using errcode='22023';
  end if;
  if jsonb_typeof(service_selections) is distinct from 'array'
    or jsonb_array_length(service_selections)<1
    or jsonb_typeof(equipment_items) is distinct from 'array' then
    raise exception 'Invalid service or equipment selection' using errcode='22023';
  end if;

  for assignee in select selected_id from unnest(assignee_ids) as assignees(selected_id) loop
    if not exists(
      select 1 from public.profiles p
      where p.id=assignee and p.organisation_id=actor.organisation_id
        and p.role='end_user'
        and ((p.is_active and p.deleted_at is null) or exists(
          select 1 from public.task_assignments existing_assignment
          where existing_assignment.task_id=target_task and existing_assignment.profile_id=p.id
        ))
    ) then
      raise exception 'Invalid assignee' using errcode='42501';
    end if;
    if actor.role='assigner' and not exists(
      select 1 from public.permissions pm
      where pm.organisation_id=actor.organisation_id
        and pm.assigner_id=actor.id and pm.end_user_id=assignee
    ) and not exists(
      select 1 from public.task_assignments existing_assignment
      where existing_assignment.task_id=target_task and existing_assignment.profile_id=assignee
    ) then
      raise exception 'Assignee outside permitted scope' using errcode='42501';
    end if;
  end loop;

  select coalesce(array_agg(a.profile_id order by a.profile_id),'{}'::uuid[])
  into old_assignee_ids
  from public.task_assignments a where a.task_id=target_task;
  select coalesce(array_agg(distinct selected_id order by selected_id),'{}'::uuid[])
  into new_assignee_ids from unnest(assignee_ids) as assignees(selected_id);

  select coalesce(jsonb_agg(jsonb_build_object(
    'area_id',s.area_id,'subtask_id',s.subtask_id,'assigned_hours',s.assigned_hours
  ) order by s.area_id,s.subtask_id),'[]'::jsonb)
  into prior_services
  from public.task_service_selections s where s.task_id=target_task;
  select coalesce(jsonb_agg(jsonb_build_object(
    'equipment_id',e.equipment_id,'quantity',e.quantity
  ) order by e.equipment_id),'[]'::jsonb)
  into prior_equipment
  from public.task_equipment e where e.task_id=target_task;

  select count(*) into required_assignees
  from (
    select (entry->>'area_id')::uuid as area_id,
      nullif(entry->>'subtask_id','')::uuid as subtask_id
    from jsonb_array_elements(service_selections) as entries(entry)
    group by 1,2
  ) selected_services;
  if required_assignees<>jsonb_array_length(service_selections) then
    raise exception 'Duplicate cleaning service selection' using errcode='22023';
  end if;

  for selection in select entry from jsonb_array_elements(service_selections) as entries(entry) loop
    if not exists(
      select 1 from public.cleaning_areas a
      where a.id=(selection->>'area_id')::uuid and a.organisation_id=actor.organisation_id
        and (
          (a.is_active and (nullif(selection->>'subtask_id','') is null or exists(
            select 1 from public.cleaning_subtasks s
            where s.id=(selection->>'subtask_id')::uuid and s.area_id=a.id
              and s.organisation_id=actor.organisation_id and s.is_active
          )))
          or exists(
            select 1 from public.task_service_selections existing_service
            where existing_service.task_id=target_task and existing_service.area_id=a.id
              and existing_service.subtask_id is not distinct from nullif(selection->>'subtask_id','')::uuid
          )
        )
    ) then
      raise exception 'Invalid cleaning service' using errcode='22023';
    end if;
    if nullif(selection->>'assigned_hours','') is not null
      and ((selection->>'assigned_hours') !~ '^[0-9]+([.][0-9]{1,2})?$'
        or (selection->>'assigned_hours')::numeric<=0) then
      raise exception 'Invalid service estimate' using errcode='22023';
    end if;
  end loop;

  if exists(
    select 1 from public.task_service_selections s
    where s.task_id=target_task
      and not exists(
        select 1 from jsonb_array_elements(service_selections) as requested(entry)
        where (entry->>'area_id')::uuid=s.area_id
          and nullif(entry->>'subtask_id','')::uuid is not distinct from s.subtask_id
      )
      and exists(select 1 from public.task_service_logs l where l.selection_id=s.id)
  ) then
    raise exception 'A service with worker progress cannot be removed' using errcode='23514';
  end if;

  select count(*) into required_assignees
  from (
    select (entry->>'equipment_id')::uuid as equipment_id
    from jsonb_array_elements(equipment_items) as entries(entry)
    group by 1
  ) selected_equipment;
  if required_assignees<>jsonb_array_length(equipment_items) then
    raise exception 'Duplicate equipment selection' using errcode='22023';
  end if;

  for item in select entry from jsonb_array_elements(equipment_items) as entries(entry) loop
    if not exists(
      select 1 from public.cleaning_equipment e
      where e.id=(item->>'equipment_id')::uuid
        and e.organisation_id=actor.organisation_id
        and (e.is_active or exists(
          select 1 from public.task_equipment existing_item
          where existing_item.task_id=target_task and existing_item.equipment_id=e.id
        ))
    ) or coalesce(item->>'quantity','') !~ '^[1-9][0-9]*$' then
      raise exception 'Invalid equipment selection' using errcode='22023';
    end if;
    if exists(
      select 1 from public.task_equipment current_item
      where current_item.task_id=target_task
        and current_item.equipment_id=(item->>'equipment_id')::uuid
        and current_item.returned_quantity> (item->>'quantity')::integer
    ) then
      raise exception 'Equipment quantity cannot be below the number already returned' using errcode='23514';
    end if;
  end loop;
  if exists(
    select 1 from public.task_equipment current_item
    where current_item.task_id=target_task
      and current_item.returned_quantity>0
      and not exists(
        select 1 from jsonb_array_elements(equipment_items) as requested(entry)
        where (entry->>'equipment_id')::uuid=current_item.equipment_id
      )
  ) then
    raise exception 'Equipment that has been returned cannot be removed' using errcode='23514';
  end if;

  delete from public.task_assignments a
  where a.task_id=target_task and not (a.profile_id=any(assignee_ids));
  insert into public.task_assignments(task_id,profile_id,organisation_id,assigned_hours)
  select target_task,selected_id,actor.organisation_id,task_assigned_hours
  from unnest(assignee_ids) as assignees(selected_id)
  on conflict(task_id,profile_id) do update
    set assigned_hours=excluded.assigned_hours
    where public.task_assignments.assigned_hours is distinct from excluded.assigned_hours;

  for selection in select entry from jsonb_array_elements(service_selections) as entries(entry) loop
    select s.id into service_id from public.task_service_selections s
    where s.task_id=target_task
      and s.area_id=(selection->>'area_id')::uuid
      and s.subtask_id is not distinct from nullif(selection->>'subtask_id','')::uuid
    for update;
    if service_id is null then
      insert into public.task_service_selections(
        organisation_id,task_id,area_id,subtask_id,assigned_hours
      ) values(
        actor.organisation_id,target_task,(selection->>'area_id')::uuid,
        nullif(selection->>'subtask_id','')::uuid,
        nullif(selection->>'assigned_hours','')::numeric
      );
    else
      update public.task_service_selections
      set assigned_hours=nullif(selection->>'assigned_hours','')::numeric,
        updated_at=now()
      where id=service_id
        and assigned_hours is distinct from nullif(selection->>'assigned_hours','')::numeric;
      service_id := null;
    end if;
  end loop;
  delete from public.task_service_selections s
  where s.task_id=target_task
    and not exists(
      select 1 from jsonb_array_elements(service_selections) as requested(entry)
      where (entry->>'area_id')::uuid=s.area_id
        and nullif(entry->>'subtask_id','')::uuid is not distinct from s.subtask_id
    );

  for item in select entry from jsonb_array_elements(equipment_items) as entries(entry) loop
    insert into public.task_equipment(task_id,equipment_id,organisation_id,quantity)
    values(target_task,(item->>'equipment_id')::uuid,actor.organisation_id,(item->>'quantity')::integer)
    on conflict(task_id,equipment_id) do update set quantity=excluded.quantity
      where public.task_equipment.quantity is distinct from excluded.quantity;
  end loop;
  delete from public.task_equipment current_item
  where current_item.task_id=target_task
    and not exists(
      select 1 from jsonb_array_elements(equipment_items) as requested(entry)
      where (entry->>'equipment_id')::uuid=current_item.equipment_id
    );

  select coalesce(jsonb_agg(jsonb_build_object(
    'area_id',s.area_id,'subtask_id',s.subtask_id,'assigned_hours',s.assigned_hours
  ) order by s.area_id,s.subtask_id),'[]'::jsonb)
  into current_services
  from public.task_service_selections s where s.task_id=target_task;
  select coalesce(jsonb_agg(jsonb_build_object(
    'equipment_id',e.equipment_id,'quantity',e.quantity
  ) order by e.equipment_id),'[]'::jsonb)
  into current_equipment
  from public.task_equipment e where e.task_id=target_task;

  if task_row.reference is distinct from trim(task_reference) then changed_fields:=array_append(changed_fields,'reference'); end if;
  if task_row.title is distinct from trim(task_title) then changed_fields:=array_append(changed_fields,'title'); end if;
  if task_row.description is distinct from coalesce(task_description,'') then changed_fields:=array_append(changed_fields,'description'); end if;
  if task_row.priority is distinct from task_priority then changed_fields:=array_append(changed_fields,'priority'); end if;
  if task_row.start_date is distinct from task_start then changed_fields:=array_append(changed_fields,'start_date'); end if;
  if task_row.due_date is distinct from task_due then changed_fields:=array_append(changed_fields,'due_date'); end if;
  if task_row.assigned_hours is distinct from task_assigned_hours then changed_fields:=array_append(changed_fields,'assigned_hours'); end if;
  if task_row.budget_limit is distinct from task_budget then changed_fields:=array_append(changed_fields,'budget_limit'); end if;
  if task_row.currency is distinct from task_currency then changed_fields:=array_append(changed_fields,'currency'); end if;
  if task_row.customer_name is distinct from trim(customer->>'customer_name')
    or task_row.apartment_number is distinct from nullif(trim(customer->>'apartment_number'),'')
    or task_row.apartment_block is distinct from nullif(trim(customer->>'apartment_block'),'')
    or task_row.customer_address is distinct from nullif(trim(customer->>'customer_address'),'')
    or task_row.customer_phone is distinct from nullif(trim(customer->>'customer_phone'),'') then
    changed_fields:=array_append(changed_fields,'customer');
  end if;
  if old_assignee_ids is distinct from new_assignee_ids then changed_fields:=array_append(changed_fields,'team'); end if;
  if prior_services is distinct from current_services then changed_fields:=array_append(changed_fields,'services'); end if;
  if prior_equipment is distinct from current_equipment then changed_fields:=array_append(changed_fields,'equipment'); end if;
  if cardinality(changed_fields)=0 then return task_row; end if;

  update public.tasks set
    reference=trim(task_reference),title=trim(task_title),description=coalesce(task_description,''),
    assignee_id=case when task_row.assignee_id=any(assignee_ids) then task_row.assignee_id else assignee_ids[1] end,
    priority=task_priority,start_date=task_start,due_date=task_due,
    budget_limit=task_budget,currency=task_currency,assigned_hours=task_assigned_hours,
    customer_name=trim(customer->>'customer_name'),
    apartment_number=nullif(trim(customer->>'apartment_number'),''),
    apartment_block=nullif(trim(customer->>'apartment_block'),''),
    customer_address=nullif(trim(customer->>'customer_address'),''),
    customer_phone=nullif(trim(customer->>'customer_phone'),''),
    version=version+1,updated_at=now(),updated_by=actor.id
  where id=target_task returning * into updated_task;

  for assignee in
    select distinct recipient_id
    from unnest(old_assignee_ids || assignee_ids) as recipients(recipient_id)
  loop
    insert into public.notifications(organisation_id,recipient_id,task_id,title,body)
    values(
      actor.organisation_id,assignee,
      case when assignee=any(assignee_ids) then target_task else null end,
      'task.updated',
      jsonb_build_object(
        'reference',updated_task.reference,
        'changes',changed_fields,
        'removed_from_team',not (assignee=any(assignee_ids))
      )::text
    );
  end loop;
  return updated_task;
end
$$;

revoke all on function public.update_cleaning_task(
  uuid,integer,text,text,text,public.task_priority,date,date,numeric,uuid[],jsonb,jsonb,jsonb,numeric,text
) from public,anon;
grant execute on function public.update_cleaning_task(
  uuid,integer,text,text,text,public.task_priority,date,date,numeric,uuid[],jsonb,jsonb,jsonb,numeric,text
) to authenticated;

do $$
begin
  if not exists(
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end
$$;
