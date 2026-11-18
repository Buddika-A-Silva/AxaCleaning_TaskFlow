create or replace function public.create_cleaning_task(
  task_reference text, task_title text, task_description text,
  task_priority public.task_priority, task_start date, task_due date,
  task_assigned_hours numeric, assignee_ids uuid[], service_selections jsonb,
  equipment_items jsonb, customer jsonb, task_budget numeric default null,
  task_currency text default 'EUR', task_is_draft boolean default false
)
returns public.tasks language plpgsql security definer set search_path='' as $$
declare actor public.profiles; created public.tasks; assignee uuid; selection jsonb; item jsonb;
begin
  select * into actor from public.profiles where id=(select auth.uid()) and is_active and deleted_at is null;
  if actor.id is null or actor.role not in ('assigner','super_admin') then raise exception 'Not authorized' using errcode='42501'; end if;
  if not task_is_draft and coalesce(array_length(assignee_ids,1),0)<1 then raise exception 'Select at least one assignee' using errcode='22023'; end if;
  if length(trim(coalesce(customer->>'customer_name','')))<2 or length(trim(coalesce(customer->>'apartment_number','')))<1
    or length(trim(coalesce(customer->>'apartment_block','')))<1 or length(trim(coalesce(customer->>'customer_address','')))<3
    or length(trim(coalesce(customer->>'customer_phone','')))<5 then raise exception 'Complete all customer details' using errcode='22023'; end if;
  if task_due < task_start or (task_assigned_hours is not null and task_assigned_hours <= 0) then
    raise exception 'Set valid dates and a positive task estimate when provided' using errcode='22023';
  end if;
  if coalesce(jsonb_array_length(service_selections),0)<1 then
    raise exception 'Select at least one cleaning service' using errcode='22023';
  end if;
  if exists(
    select 1 from jsonb_array_elements(coalesce(service_selections,'[]'::jsonb)) entry
    where nullif(entry->>'assigned_hours','') is not null
      and case
        when (entry->>'assigned_hours') ~ '^[0-9]+([.][0-9]{1,2})?$' then (entry->>'assigned_hours')::numeric <= 0
        else true
      end
  ) then raise exception 'Enter positive service estimates or leave them blank' using errcode='22023'; end if;

  foreach assignee in array coalesce(assignee_ids,'{}'::uuid[]) loop
    if not exists(select 1 from public.profiles p where p.id=assignee and p.organisation_id=actor.organisation_id and p.role='end_user' and p.is_active and p.deleted_at is null) then raise exception 'Invalid assignee' using errcode='42501'; end if;
    if actor.role='assigner' and not exists(select 1 from public.permissions pm where pm.organisation_id=actor.organisation_id and pm.assigner_id=actor.id and pm.end_user_id=assignee) then raise exception 'Assignee outside permitted scope' using errcode='42501'; end if;
  end loop;

  insert into public.tasks(
    organisation_id,reference,title,description,assignee_id,assigner_id,priority,start_date,due_date,
    budget_limit,currency,assigned_hours,customer_name,apartment_number,apartment_block,
    customer_address,customer_phone,tags,created_by
  ) values(
    actor.organisation_id,trim(task_reference),trim(task_title),coalesce(task_description,''),coalesce(assignee_ids[1],actor.id),
    actor.id,task_priority,task_start,task_due,task_budget,task_currency,task_assigned_hours,
    trim(coalesce(customer->>'customer_name','')),nullif(trim(coalesce(customer->>'apartment_number','')),''),
    nullif(trim(coalesce(customer->>'apartment_block','')),''),nullif(trim(coalesce(customer->>'customer_address','')),''),
    nullif(trim(coalesce(customer->>'customer_phone','')),''),'{}',actor.id
  ) returning * into created;

  update public.tasks set is_draft=task_is_draft, assignee_id=coalesce(assignee_ids[1],actor.id)
    where id=created.id returning * into created;
  if not task_is_draft then
    foreach assignee in array assignee_ids loop
      insert into public.task_assignments(task_id,profile_id,organisation_id,assigned_hours)
        values(created.id,assignee,actor.organisation_id,task_assigned_hours);
    end loop;
  end if;
  insert into public.task_status_history(organisation_id,task_id,from_status,to_status,actor_id)
    values(actor.organisation_id,created.id,null,'pending',actor.id);

  for selection in select * from jsonb_array_elements(coalesce(service_selections,'[]'::jsonb)) loop
    if not exists(
      select 1 from public.cleaning_areas a
      where a.id=(selection->>'area_id')::uuid and a.organisation_id=actor.organisation_id and a.is_active
        and (nullif(selection->>'subtask_id','') is null or exists(
          select 1 from public.cleaning_subtasks s where s.id=(selection->>'subtask_id')::uuid
            and s.area_id=a.id and s.organisation_id=actor.organisation_id and s.is_active
        ))
    ) then raise exception 'Invalid cleaning service' using errcode='22023'; end if;
    insert into public.task_service_selections(
      organisation_id,task_id,area_id,subtask_id,assigned_hours
    ) values(
      actor.organisation_id,created.id,(selection->>'area_id')::uuid,
      nullif(selection->>'subtask_id','')::uuid,
      nullif(selection->>'assigned_hours','')::numeric
    );
  end loop;

  for item in select * from jsonb_array_elements(coalesce(equipment_items,'[]'::jsonb)) loop
    if not exists(select 1 from public.cleaning_equipment e where e.id=(item->>'equipment_id')::uuid and e.organisation_id=actor.organisation_id and e.is_active) then
      raise exception 'Invalid equipment selection' using errcode='22023';
    end if;
    insert into public.task_equipment(task_id,equipment_id,organisation_id,quantity)
      values(created.id,(item->>'equipment_id')::uuid,actor.organisation_id,
        greatest(1,coalesce((item->>'quantity')::integer,1)));
  end loop;
  return created;
end $$;
revoke all on function public.create_cleaning_task(text,text,text,public.task_priority,date,date,numeric,uuid[],jsonb,jsonb,jsonb,numeric,text,boolean) from public,anon;
grant execute on function public.create_cleaning_task(text,text,text,public.task_priority,date,date,numeric,uuid[],jsonb,jsonb,jsonb,numeric,text,boolean) to authenticated;

create or replace function public.finalize_cleaning_task(target_task uuid, assignee_ids uuid[])
returns public.tasks language plpgsql security definer set search_path='' as $$
declare actor public.profiles; task_row public.tasks; assignee uuid; selection_row public.task_service_selections;
begin
  select * into actor from public.profiles where id=(select auth.uid()) and is_active and deleted_at is null;
  select * into task_row from public.tasks where id=target_task and organisation_id=actor.organisation_id and deleted_at is null for update;
  if actor.id is null or actor.role not in ('assigner','super_admin') or task_row.id is null
    or (actor.role='assigner' and task_row.assigner_id<>actor.id) then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  if not task_row.is_draft then raise exception 'Task is already finalized' using errcode='22023'; end if;
  if length(trim(coalesce(task_row.customer_name,'')))<2 or length(trim(coalesce(task_row.apartment_number,'')))<1
    or length(trim(coalesce(task_row.apartment_block,'')))<1 or length(trim(coalesce(task_row.customer_address,'')))<3
    or length(trim(coalesce(task_row.customer_phone,'')))<5
    or coalesce(array_length(assignee_ids,1),0)<1 then
    raise exception 'Complete customer details and select at least one worker before finalizing' using errcode='22023';
  end if;
  if not exists(select 1 from public.task_service_selections s where s.task_id=task_row.id) then
    raise exception 'Select at least one cleaning service before finalizing' using errcode='22023';
  end if;
  foreach assignee in array assignee_ids loop
    if not exists(select 1 from public.profiles p where p.id=assignee and p.organisation_id=actor.organisation_id and p.role='end_user' and p.is_active and p.deleted_at is null) then
      raise exception 'Invalid assignee' using errcode='42501';
    end if;
    if actor.role='assigner' and not exists(select 1 from public.permissions pm where pm.organisation_id=actor.organisation_id and pm.assigner_id=actor.id and pm.end_user_id=assignee) then
      raise exception 'Assignee outside permitted scope' using errcode='42501';
    end if;
  end loop;
  if cardinality(assignee_ids)<>(select count(distinct selected_id) from unnest(assignee_ids) as selected(selected_id)) then
    raise exception 'Duplicate assignee' using errcode='22023';
  end if;
  update public.tasks set assignee_id=assignee_ids[1],is_draft=false,updated_by=actor.id,updated_at=now(),version=version+1
    where id=task_row.id returning * into task_row;
  foreach assignee in array assignee_ids loop
    insert into public.task_assignments(task_id,profile_id,organisation_id,assigned_hours)
      values(task_row.id,assignee,actor.organisation_id,task_row.assigned_hours);
  end loop;
  for selection_row in select * from public.task_service_selections where task_id=task_row.id loop
    foreach assignee in array assignee_ids loop
      insert into public.task_service_logs(organisation_id,task_id,selection_id,profile_id)
        values(actor.organisation_id,task_row.id,selection_row.id,assignee);
    end loop;
  end loop;
  return task_row;
end $$;
revoke all on function public.finalize_cleaning_task(uuid,uuid[]) from public,anon;
grant execute on function public.finalize_cleaning_task(uuid,uuid[]) to authenticated;
