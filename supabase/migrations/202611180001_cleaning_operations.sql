alter table public.tasks
  add column if not exists customer_name text,
  add column if not exists apartment_number text,
  add column if not exists apartment_block text,
  add column if not exists customer_address text,
  add column if not exists customer_phone text,
  add column if not exists assigned_hours numeric(6,2) check (assigned_hours is null or assigned_hours > 0),
  add column if not exists is_draft boolean not null default false;

create table public.cleaning_areas (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  name text not null check (length(trim(name)) between 2 and 80),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, name)
);

create table public.cleaning_subtasks (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  area_id uuid not null references public.cleaning_areas(id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 120),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (area_id, name)
);

create table public.cleaning_equipment (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  name text not null check (length(trim(name)) between 2 and 100),
  serial_required boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, name)
);

create table public.task_assignments (
  task_id uuid not null references public.tasks(id) on delete cascade,
  profile_id uuid not null references public.profiles(id),
  organisation_id uuid not null references public.organisations(id),
  assigned_hours numeric(6,2) check (assigned_hours is null or assigned_hours > 0),
  created_at timestamptz not null default now(),
  primary key (task_id, profile_id)
);

create table public.task_service_selections (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  task_id uuid not null references public.tasks(id) on delete cascade,
  area_id uuid not null references public.cleaning_areas(id),
  subtask_id uuid references public.cleaning_subtasks(id),
  assigned_hours numeric(6,2) check (assigned_hours is null or assigned_hours >= 0),
  actual_hours numeric(6,2) check (actual_hours is null or actual_hours >= 0),
  worker_comment text,
  is_completed boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.task_service_logs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  task_id uuid not null references public.tasks(id) on delete cascade,
  selection_id uuid not null references public.task_service_selections(id) on delete cascade,
  profile_id uuid not null references public.profiles(id),
  actual_hours numeric(6,2) check (actual_hours is null or actual_hours >= 0),
  worker_comment text,
  is_completed boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (selection_id, profile_id)
);

create table public.task_equipment (
  task_id uuid not null references public.tasks(id) on delete cascade,
  equipment_id uuid not null references public.cleaning_equipment(id),
  organisation_id uuid not null references public.organisations(id),
  quantity integer not null default 1 check (quantity > 0),
  returned_quantity integer check (returned_quantity is null or returned_quantity between 0 and quantity),
  primary key (task_id, equipment_id)
);

create table public.task_photos (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  task_id uuid not null references public.tasks(id) on delete cascade,
  photo_type text not null check (photo_type in ('assignment','completion')),
  object_path text not null unique,
  original_name text not null,
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp')),
  size_bytes bigint not null check (size_bytes between 1 and 10485760),
  uploaded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

insert into public.cleaning_areas(organisation_id,name,sort_order)
select o.id, area.name, area.sort_order
from public.organisations o
cross join (values
  ('Kitchen',1),('Bathroom',2),('Bedrooms',3),('Living/Family Rooms',4),
  ('Home Office',5),('Laundry / Utility Room',6),('Entryway / Porch',7)
) as area(name,sort_order)
on conflict (organisation_id,name) do nothing;

insert into public.cleaning_subtasks(organisation_id,area_id,name,sort_order)
select a.organisation_id,a.id,s.name,s.sort_order
from public.cleaning_areas a
cross join lateral (
  select name,sort_order
  from (values
    ('Wash dishes',1),('Clear and wipe table',2),('Wipe countertops and stove',3),
    ('Wipe the sink',4),('Sweep',5),('Clean fridge',6),('Clean oven and hood',7)
  ) as k(name,sort_order)
  where a.name='Kitchen'
  union all
  select name,sort_order
  from (values
    ('Spray shower with shower mist',1),('Clean mirror',2),('Wipe sink and counter',3),
    ('Clean toilet bowl and rim',4),('Mop',5),('Clean tub',6),('Clean outside of toilet',7)
  ) as b(name,sort_order)
  where a.name='Bathroom'
  union all
  select name,sort_order
  from (values
    ('Make bed',1),('Straighten nightstand',2),('Put clothes away',3),
    ('Change sheets',4),('Dust',5),('Vacuum',6)
  ) as r(name,sort_order)
  where a.name='Bedrooms'
  union all
  select name,sort_order
  from (values
    ('Clean up the clutter',1),('Straighten pillows/cushions',2),
    ('Straighten coffee/end tables',3),('Wipe spots on tables',4),('Dust',5),('Vacuum',6)
  ) as lr(name,sort_order)
  where a.name='Living/Family Rooms'
  union all
  select name,sort_order
  from (values
    ('Clean up the clutter',1),('Sort mail',2),('Dust',3),('Vacuum',4)
  ) as h(name,sort_order)
  where a.name='Home Office'
  union all
  select name,sort_order
  from (values
    ('Laundry - clothes',1),('Sweep',2),('Dust shelves',3),
    ('Wipe washer/dryer',4),('Clean sink/countertops',5),('Clean inside dryer',6),('Mop',7)
  ) as u(name,sort_order)
  where a.name='Laundry / Utility Room'
  union all
  select name,sort_order
  from (values
    ('Pick up clutter',1),('Sweep entry and steps',2),('Wash windows',3),('Wash handrails and door',4)
  ) as e(name,sort_order)
  where a.name='Entryway / Porch'
) s
on conflict (area_id,name) do nothing;

insert into public.cleaning_equipment(organisation_id,name)
select o.id,e.name
from public.organisations o
cross join (values ('Vacuum'),('Mop'),('Cleaning caddy'),('Ladder'),('Window squeegee'),('Steamer')) as e(name)
on conflict (organisation_id,name) do nothing;

alter table public.tasks
  add column if not exists worker_comment text;

create or replace function public.can_access_task(target_task uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.tasks t
    where t.id=target_task and t.organisation_id=public.current_org_id() and t.deleted_at is null
      and (
        t.assignee_id=(select auth.uid()) or t.assigner_id=(select auth.uid())
        or exists(select 1 from public.task_assignments ta where ta.task_id=t.id and ta.profile_id=(select auth.uid()))
        or public.current_app_role()='super_admin'
        or exists(select 1 from public.permissions pm
          where pm.organisation_id=t.organisation_id and pm.assigner_id=(select auth.uid())
            and pm.end_user_id=t.assignee_id)
      )
  )
$$;

create or replace function public.get_dashboard_metrics()
returns table(total_tasks bigint,pending_tasks bigint,in_progress_tasks bigint,on_hold_tasks bigint,overdue_tasks bigint,submitted_tasks bigint,verified_tasks bigint,over_budget_tasks bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if public.current_app_role() is null or public.current_app_role() not in ('assigner','super_admin') then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  return query
    with scoped as (
      select t.id,t.status,t.due_date,t.budget_limit,coalesce(sum(e.line_total),0)::numeric as spent
      from public.tasks t left join public.expense_lines e on e.task_id=t.id and e.deleted_at is null
      where t.organisation_id=public.current_org_id() and t.deleted_at is null and not t.is_draft and public.can_access_task(t.id)
      group by t.id
    )
    select count(*)::bigint,
      count(*) filter(where status='pending')::bigint,
      count(*) filter(where status='in_progress')::bigint,
      count(*) filter(where status='on_hold')::bigint,
      count(*) filter(where due_date<current_date and status not in ('submitted','verified','cancelled'))::bigint,
      count(*) filter(where status='submitted')::bigint,
      count(*) filter(where status='verified')::bigint,
      count(*) filter(where budget_limit is not null and spent>budget_limit)::bigint
    from scoped;
end $$;
revoke all on function public.get_dashboard_metrics() from public,anon;
grant execute on function public.get_dashboard_metrics() to authenticated;

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
  if task_due < task_start or task_assigned_hours is null or task_assigned_hours <= 0 then raise exception 'Set valid assigned hours and dates' using errcode='22023'; end if;
  if coalesce(jsonb_array_length(service_selections),0)<1 or exists(
    select 1 from jsonb_array_elements(coalesce(service_selections,'[]'::jsonb)) entry
    where nullif(entry->>'assigned_hours','') is null or (entry->>'assigned_hours')::numeric<=0
  ) then raise exception 'Select services and set their estimated hours' using errcode='22023'; end if;

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
    or length(trim(coalesce(task_row.customer_phone,'')))<5 or task_row.assigned_hours is null
    or coalesce(array_length(assignee_ids,1),0)<1 then
    raise exception 'Complete customer details, assigned hours and select at least one worker before finalizing' using errcode='22023';
  end if;
  if not exists(select 1 from public.task_service_selections s where s.task_id=task_row.id) then
    raise exception 'Select at least one cleaning service before finalizing' using errcode='22023';
  end if;
  if exists(select 1 from public.task_service_selections s where s.task_id=task_row.id and (s.assigned_hours is null or s.assigned_hours<=0)) then
    raise exception 'Set estimated hours for every selected service before finalizing' using errcode='22023';
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

create or replace function public.save_task_service_progress(
  target_task uuid, target_selection uuid, actual numeric, completed boolean,
  worker_comment_text text default null
)
returns public.task_service_logs language plpgsql security definer set search_path='' as $$
declare actor public.profiles; service_log public.task_service_logs;
begin
  select * into actor from public.profiles where id=(select auth.uid()) and is_active and deleted_at is null;
  if actor.id is null or not exists(
    select 1 from public.task_assignments ta join public.tasks t on t.id=ta.task_id
    where ta.task_id=target_task and ta.profile_id=actor.id and t.status in ('pending','in_progress','on_hold','skipped','returned') and not t.is_draft
  ) then raise exception 'Not authorized' using errcode='42501'; end if;
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

create or replace function public.save_task_equipment_return(target_task uuid, target_equipment uuid, returned integer)
returns public.task_equipment language plpgsql security definer set search_path='' as $$
declare actor public.profiles; result public.task_equipment; task_status public.task_status;
begin
  select * into actor from public.profiles where id=(select auth.uid()) and is_active and deleted_at is null;
  select t.status into task_status from public.tasks t join public.task_assignments a on a.task_id=t.id and a.profile_id=actor.id
    where t.id=target_task and t.organisation_id=actor.organisation_id and not t.is_draft and t.status in ('pending','in_progress','on_hold','skipped','returned');
  if actor.id is null or task_status is null then raise exception 'Not authorized' using errcode='42501'; end if;
  update public.task_equipment e set returned_quantity=returned
    where e.task_id=target_task and e.equipment_id=target_equipment and returned between 0 and e.quantity
    returning * into result;
  if result.task_id is null then raise exception 'Invalid equipment return quantity' using errcode='22023'; end if;
  return result;
end $$;
revoke all on function public.save_task_equipment_return(uuid,uuid,integer) from public,anon;
grant execute on function public.save_task_equipment_return(uuid,uuid,integer) to authenticated;

create or replace function public.register_task_photo(
  photo_task_id uuid, photo_type text, photo_path text, photo_name text, photo_mime text, photo_size bigint
)
returns public.task_photos language plpgsql security definer set search_path='' as $$
declare actor public.profiles; task_row public.tasks; result public.task_photos;
begin
  select * into actor from public.profiles where id=(select auth.uid()) and is_active and deleted_at is null;
  select * into task_row from public.tasks where id=photo_task_id and organisation_id=actor.organisation_id and deleted_at is null;
  if actor.id is null or task_row.id is null or photo_type not in ('assignment','completion') then
    raise exception 'Invalid task photo' using errcode='42501';
  end if;
  if photo_type='assignment' and (actor.role not in ('assigner','super_admin') or (actor.role='assigner' and task_row.assigner_id<>actor.id)) then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  if photo_type='completion' and not exists(select 1 from public.task_assignments a where a.task_id=task_row.id and a.profile_id=actor.id) then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  if task_row.status in ('submitted','verified','cancelled') or photo_path !~ ('^'||actor.organisation_id::text||'/'||photo_task_id::text||'/')
    or photo_mime not in ('image/jpeg','image/png','image/webp') or photo_size not between 1 and 10485760 then
    raise exception 'Invalid task photo' using errcode='22023';
  end if;
  if not exists(select 1 from storage.objects o where o.bucket_id='task-proofs' and o.name=photo_path) then
    raise exception 'Uploaded file not found' using errcode='P0002';
  end if;
  insert into public.task_photos(organisation_id,task_id,photo_type,object_path,original_name,mime_type,size_bytes,uploaded_by)
    values(actor.organisation_id,task_row.id,photo_type,photo_path,photo_name,photo_mime,photo_size,actor.id)
    returning * into result;
  return result;
end $$;
revoke all on function public.register_task_photo(uuid,text,text,text,text,bigint) from public,anon;
grant execute on function public.register_task_photo(uuid,text,text,text,text,bigint) to authenticated;

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
    if not exists(select 1 from public.task_assignments a where a.task_id=task_row.id) or exists(
      select 1 from public.task_assignments a where a.task_id=task_row.id
        and not exists(select 1 from public.task_photos p where p.task_id=task_row.id and p.photo_type='completion' and p.uploaded_by=a.profile_id)
    ) then
      raise exception 'Every assigned worker must upload a completion photo before submission' using errcode='23514';
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
      values(task_row.organisation_id,task_row.id,actor.id,case when prior_status='verified' then 'reopened' else next_status::text end,nullif(trim(reason),''),
        jsonb_build_object('budget_limit',task_row.budget_limit,'currency',task_row.currency));
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

alter table public.cleaning_areas enable row level security;
alter table public.cleaning_subtasks enable row level security;
alter table public.cleaning_equipment enable row level security;
alter table public.task_assignments enable row level security;
alter table public.task_service_selections enable row level security;
alter table public.task_service_logs enable row level security;
alter table public.task_equipment enable row level security;
alter table public.task_photos enable row level security;

create policy cleaning_areas_org on public.cleaning_areas for select to authenticated using (organisation_id=public.current_org_id());
create policy cleaning_areas_manage on public.cleaning_areas for all to authenticated using (public.is_admin_of_org(organisation_id)) with check (public.is_admin_of_org(organisation_id));
create policy cleaning_subtasks_org on public.cleaning_subtasks for select to authenticated using (organisation_id=public.current_org_id());
create policy cleaning_subtasks_manage on public.cleaning_subtasks for all to authenticated using (public.is_admin_of_org(organisation_id)) with check (public.is_admin_of_org(organisation_id));
create policy cleaning_equipment_org on public.cleaning_equipment for select to authenticated using (organisation_id=public.current_org_id());
create policy cleaning_equipment_manage on public.cleaning_equipment for all to authenticated using (public.is_admin_of_org(organisation_id)) with check (public.is_admin_of_org(organisation_id));
create policy task_assignments_access on public.task_assignments for select to authenticated using (organisation_id=public.current_org_id() and public.can_access_task(task_id));
create policy task_services_access on public.task_service_selections for select to authenticated using (organisation_id=public.current_org_id() and public.can_access_task(task_id));
create policy task_service_logs_access on public.task_service_logs for select to authenticated using (organisation_id=public.current_org_id() and public.can_access_task(task_id));
create policy task_equipment_access on public.task_equipment for select to authenticated using (organisation_id=public.current_org_id() and public.can_access_task(task_id));
create policy task_photos_access on public.task_photos for select to authenticated using (organisation_id=public.current_org_id() and public.can_access_task(task_id));

drop policy if exists profile_read_tenant on public.profiles;
create policy profile_read_tenant on public.profiles for select to authenticated using (
  organisation_id=(select public.current_org_id()) and (
    id=(select auth.uid()) or (select public.current_app_role())='super_admin'
    or ((select public.current_app_role())='assigner' and exists(
      select 1 from public.permissions pm where pm.organisation_id=profiles.organisation_id
        and pm.assigner_id=(select auth.uid()) and pm.end_user_id=profiles.id
    ))
    or ((select public.current_app_role())='end_user' and exists(
      select 1 from public.task_assignments mine join public.task_assignments teammate
        on teammate.task_id=mine.task_id and teammate.organisation_id=mine.organisation_id
      where mine.profile_id=(select auth.uid()) and teammate.profile_id=profiles.id
        and mine.organisation_id=profiles.organisation_id
    ))
  )
);

revoke all on public.cleaning_areas,public.cleaning_subtasks,public.cleaning_equipment,public.task_assignments,public.task_service_selections,public.task_service_logs,public.task_equipment,public.task_photos from anon;
grant select,insert,update,delete on public.cleaning_areas, public.cleaning_subtasks, public.cleaning_equipment to authenticated;
grant select on public.task_assignments, public.task_service_selections, public.task_service_logs, public.task_equipment, public.task_photos to authenticated;

drop policy if exists proof_object_read on storage.objects;
drop policy if exists proof_object_insert on storage.objects;
drop policy if exists proof_object_delete on storage.objects;
create policy proof_object_read on storage.objects for select to authenticated using (
  bucket_id='task-proofs' and (
    exists(select 1 from public.expense_proofs p where p.object_path=name and public.can_access_task(p.task_id))
    or exists(select 1 from public.task_photos p where p.object_path=name and public.can_access_task(p.task_id))
  )
);
create policy proof_object_insert on storage.objects for insert to authenticated with check (
  bucket_id='task-proofs' and (storage.foldername(name))[1]=(select public.current_org_id())::text
  and exists(select 1 from public.tasks t where t.id=((storage.foldername(name))[2])::uuid
    and t.organisation_id=(select public.current_org_id()) and t.status in ('pending','in_progress','on_hold','skipped','returned')
    and (
      ((storage.foldername(name))[3]='assignment' and t.assigner_id=(select auth.uid()) and public.current_app_role() in ('assigner','super_admin'))
      or ((storage.foldername(name))[3]='completion' and exists(
        select 1 from public.task_assignments a where a.task_id=t.id and a.profile_id=(select auth.uid())
      ))
      or ((storage.foldername(name))[3] is null and exists(
        select 1 from public.task_assignments a where a.task_id=t.id and a.profile_id=(select auth.uid())
      ))
    )
  )
);
create policy proof_object_delete on storage.objects for delete to authenticated using (
  bucket_id='task-proofs' and (storage.foldername(name))[1]=(select public.current_org_id())::text
  and exists(select 1 from public.tasks t where t.id=((storage.foldername(name))[2])::uuid
    and t.organisation_id=(select public.current_org_id()) and t.status in ('pending','in_progress','on_hold','skipped','returned')
    and (
      (t.assigner_id=(select auth.uid()) and public.current_app_role() in ('assigner','super_admin'))
      or exists(select 1 from public.task_assignments a where a.task_id=t.id and a.profile_id=(select auth.uid()))
    )
  )
);
