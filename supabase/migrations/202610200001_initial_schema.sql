create extension if not exists pgcrypto;

create type public.app_role as enum ('super_admin', 'assigner', 'end_user');
create type public.task_status as enum ('pending', 'in_progress', 'on_hold', 'skipped', 'submitted', 'verified', 'returned', 'cancelled');
create type public.task_priority as enum ('low', 'medium', 'high', 'urgent');

create table public.organisations (
  id uuid primary key default gen_random_uuid(), name text not null check (length(trim(name)) between 2 and 120),
  default_currency text not null default 'EUR' check (default_currency ~ '^[A-Z]{3}$'), timezone text not null default 'Europe/Bucharest',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade, organisation_id uuid not null references public.organisations(id),
  username text not null unique check (username = lower(username) and length(username) between 3 and 40), full_name text not null check (length(trim(full_name)) between 2 and 120),
  recovery_email text, phone text, employee_id text, department text, role public.app_role not null,
  language text not null default 'en' check (language in ('en','ro')), timezone text not null default 'Europe/Bucharest',
  is_active boolean not null default true, must_reset_password boolean not null default true, can_manage_users boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
  created_by uuid references public.profiles(id), updated_by uuid references public.profiles(id),
  unique (organisation_id, employee_id)
);
create table public.permissions (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id),
  assigner_id uuid not null references public.profiles(id), end_user_id uuid not null references public.profiles(id),
  can_manage_users boolean not null default false, created_at timestamptz not null default now(), created_by uuid not null references public.profiles(id),
  unique (assigner_id, end_user_id), check (assigner_id <> end_user_id)
);
create table public.tasks (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id), reference text not null,
  title text not null check (length(trim(title)) between 3 and 150), description text not null check (length(description) <= 10000),
  assignee_id uuid not null references public.profiles(id), assigner_id uuid not null references public.profiles(id),
  priority public.task_priority not null default 'medium', status public.task_status not null default 'pending',
  start_date date not null default current_date, due_date date not null, budget_limit numeric(14,2) check (budget_limit is null or budget_limit >= 0),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'), tags text[] not null default '{}', version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
  created_by uuid not null references public.profiles(id), updated_by uuid references public.profiles(id),
  unique (organisation_id, reference), check (due_date >= start_date)
);
create table public.task_status_history (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id),
  task_id uuid not null references public.tasks(id) on delete cascade, from_status public.task_status, to_status public.task_status not null,
  comment text, actor_id uuid not null references public.profiles(id), created_at timestamptz not null default now()
);
create table public.task_comments (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id),
  task_id uuid not null references public.tasks(id) on delete cascade, author_id uuid not null references public.profiles(id),
  body text not null check (length(trim(body)) between 1 and 4000), created_at timestamptz not null default now(), deleted_at timestamptz
);
create table public.expense_lines (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id),
  task_id uuid not null references public.tasks(id) on delete cascade, expense_date date not null,
  category text not null check (length(trim(category)) between 2 and 80), description text not null check (length(trim(description)) between 3 and 300),
  quantity numeric(12,3) not null default 1 check (quantity > 0), unit_amount numeric(14,2) not null check (unit_amount > 0),
  line_total numeric(16,2) generated always as (round(quantity * unit_amount, 2)) stored,
  created_by uuid not null references public.profiles(id), updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create table public.expense_proofs (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id),
  task_id uuid not null references public.tasks(id) on delete cascade, expense_line_id uuid references public.expense_lines(id) on delete cascade,
  object_path text not null unique, original_name text not null,
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp','application/pdf')),
  size_bytes bigint not null check (size_bytes between 1 and 10485760), uploaded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(), deleted_at timestamptz
);
create table public.task_reviews (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id),
  task_id uuid not null references public.tasks(id) on delete cascade, reviewer_id uuid not null references public.profiles(id),
  decision text not null check (decision in ('verified','returned','reopened','cancelled')), comment text, snapshot jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create table public.notifications (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id),
  recipient_id uuid not null references public.profiles(id), task_id uuid references public.tasks(id) on delete cascade,
  title text not null, body text not null, read_at timestamptz, created_at timestamptz not null default now()
);
create table public.audit_events (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id), actor_id uuid references public.profiles(id),
  action text not null, entity_type text not null, entity_id uuid, details jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create table public.login_rate_limits (
  bucket_hash text primary key check (bucket_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null default now(),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  blocked_until timestamptz,
  updated_at timestamptz not null default now()
);
create table public.user_invitations (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id), email text not null,
  username text not null, role public.app_role not null check (role <> 'super_admin'), invited_by uuid not null references public.profiles(id),
  expires_at timestamptz not null, accepted_at timestamptz, created_at timestamptz not null default now(), unique (organisation_id, username)
);

alter table public.login_rate_limits enable row level security;
revoke all on public.login_rate_limits from anon,authenticated;
grant select,insert,update,delete on public.login_rate_limits to service_role;

create or replace function public.check_login_rate_limit(target_hash text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare current_bucket public.login_rate_limits; v_now timestamptz := now();
begin
  if target_hash !~ '^[0-9a-f]{64}$' then return false; end if;
  insert into public.login_rate_limits(bucket_hash,window_started_at,attempt_count,blocked_until,updated_at)
    values(target_hash,v_now,1,null,v_now)
  on conflict(bucket_hash) do update set
    window_started_at=case when public.login_rate_limits.window_started_at < v_now-interval '15 minutes' then v_now else public.login_rate_limits.window_started_at end,
    attempt_count=case when public.login_rate_limits.window_started_at < v_now-interval '15 minutes' then 1 else public.login_rate_limits.attempt_count+1 end,
    blocked_until=case when public.login_rate_limits.blocked_until > v_now then public.login_rate_limits.blocked_until
      when public.login_rate_limits.window_started_at < v_now-interval '15 minutes' then null
      when public.login_rate_limits.attempt_count+1 >= 10 then v_now+interval '15 minutes'
      else public.login_rate_limits.blocked_until end,
    updated_at=v_now returning * into current_bucket;
  return current_bucket.attempt_count < 10 and (current_bucket.blocked_until is null or current_bucket.blocked_until <= v_now);
end $$;
revoke all on function public.check_login_rate_limit(text) from public,anon,authenticated;
grant execute on function public.check_login_rate_limit(text) to service_role;

create or replace function public.clear_login_rate_limit(target_hash text) returns void language sql security definer set search_path = '' as $$
  delete from public.login_rate_limits where bucket_hash=target_hash
$$;
revoke all on function public.clear_login_rate_limit(text) from public,anon,authenticated;
grant execute on function public.clear_login_rate_limit(text) to service_role;

create index profiles_org_role_active_idx on public.profiles (organisation_id, role, is_active) where deleted_at is null;
create index permissions_assigner_user_idx on public.permissions (organisation_id, assigner_id, end_user_id);
create index tasks_assignee_status_due_idx on public.tasks (organisation_id, assignee_id, status, due_date) where deleted_at is null;
create index tasks_assigner_status_due_idx on public.tasks (organisation_id, assigner_id, status, due_date) where deleted_at is null;
create index tasks_due_idx on public.tasks (organisation_id, due_date);
create index task_history_chronology_idx on public.task_status_history (task_id, created_at);
create index task_comments_chronology_idx on public.task_comments (task_id, created_at);
create index expense_lines_task_date_idx on public.expense_lines (organisation_id, task_id, expense_date) where deleted_at is null;
create index audit_org_time_idx on public.audit_events (organisation_id, created_at desc);
create index notifications_recipient_idx on public.notifications (recipient_id, created_at desc);

create or replace function public.current_org_id() returns uuid language sql stable security definer set search_path = '' as $$
  select p.organisation_id from public.profiles p where p.id = (select auth.uid()) and p.is_active and p.deleted_at is null
$$;
create or replace function public.current_app_role() returns public.app_role language sql stable security definer set search_path = '' as $$
  select p.role from public.profiles p where p.id = (select auth.uid()) and p.is_active and p.deleted_at is null
$$;
create or replace function public.can_access_task(target_task uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.tasks t where t.id=target_task and t.organisation_id=public.current_org_id() and t.deleted_at is null
    and (t.assignee_id=(select auth.uid()) or t.assigner_id=(select auth.uid()) or public.current_app_role()='super_admin'
    or exists(select 1 from public.permissions pm where pm.organisation_id=t.organisation_id and pm.assigner_id=(select auth.uid()) and pm.end_user_id=t.assignee_id)))
$$;
create or replace function public.is_admin_of_org(target_org uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select target_org=public.current_org_id() and public.current_app_role()='super_admin'
$$;
create or replace function public.get_dashboard_metrics()
returns table(total_tasks bigint,pending_tasks bigint,in_progress_tasks bigint,on_hold_tasks bigint,overdue_tasks bigint,submitted_tasks bigint,verified_tasks bigint,over_budget_tasks bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if public.current_app_role() is null or public.current_app_role() not in ('assigner','super_admin') then raise exception 'Not authorized' using errcode='42501'; end if;
  return query
    with scoped as (
      select t.id,t.status,t.due_date,t.budget_limit,coalesce(sum(e.line_total),0)::numeric as spent
      from public.tasks t left join public.expense_lines e on e.task_id=t.id and e.deleted_at is null
      where t.organisation_id=public.current_org_id() and t.deleted_at is null and public.can_access_task(t.id)
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

create or replace function public.export_tasks_csv(task_assignee uuid default null, task_status_filter public.task_status default null, task_priority_filter public.task_priority default null, date_from date default null, date_to date default null, due_month date default null, search_term text default null, over_budget_only boolean default false)
returns table(reference text,title text,status public.task_status,priority public.task_priority,due_date date,assignee_name text,budget numeric,spent numeric,currency text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if public.current_app_role() is null then raise exception 'Not authorized' using errcode='42501'; end if;
  if date_from is not null and date_to is not null and date_to < date_from then raise exception 'Invalid date range' using errcode='22023'; end if;
  return query
  with scoped as (
    select t.id,t.reference,t.title,t.status,t.priority,t.due_date,t.assignee_id,t.budget_limit,t.currency,
      p.full_name as assignee_name,coalesce(sum(e.line_total),0)::numeric as spent
    from public.tasks t join public.profiles p on p.id=t.assignee_id
      left join public.expense_lines e on e.task_id=t.id and e.deleted_at is null
    where t.organisation_id=public.current_org_id() and t.deleted_at is null and public.can_access_task(t.id)
      and (task_assignee is null or t.assignee_id=task_assignee)
      and (task_status_filter is null or t.status=task_status_filter)
      and (task_priority_filter is null or t.priority=task_priority_filter)
      and (date_from is null or t.due_date>=date_from) and (date_to is null or t.due_date<=date_to)
      and (due_month is null or date_trunc('month',t.due_date)::date=date_trunc('month',due_month)::date)
      and (search_term is null or t.reference ilike '%'||left(search_term,100)||'%' or t.title ilike '%'||left(search_term,100)||'%' or t.description ilike '%'||left(search_term,100)||'%')
    group by t.id,p.full_name
  )
  select s.reference,s.title,s.status,s.priority,s.due_date,s.assignee_name,s.budget_limit,s.spent,s.currency
  from scoped s where not over_budget_only or (s.budget_limit is not null and s.spent>s.budget_limit)
  order by s.due_date,s.reference limit 10000;
end $$;
revoke all on function public.export_tasks_csv(uuid,public.task_status,public.task_priority,date,date,date,text,boolean) from public,anon;
grant execute on function public.export_tasks_csv(uuid,public.task_status,public.task_priority,date,date,date,text,boolean) to authenticated;

revoke all on all tables in schema public from anon, authenticated;
do $$ declare t text; begin
  foreach t in array array['organisations','profiles','permissions','tasks','task_status_history','task_comments','expense_lines','expense_proofs','task_reviews','notifications','audit_events','user_invitations'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

grant select on public.organisations, public.profiles, public.permissions, public.tasks, public.task_status_history, public.task_comments, public.expense_lines, public.expense_proofs, public.task_reviews, public.notifications, public.audit_events, public.user_invitations to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant update (language, timezone) on public.profiles to authenticated;

create policy org_read_tenant on public.organisations for select to authenticated using (id=(select public.current_org_id()));
create policy org_manage_admin on public.organisations for all to authenticated using (public.is_admin_of_org(id)) with check (public.is_admin_of_org(id));
create policy profile_read_tenant on public.profiles for select to authenticated using (
  organisation_id=(select public.current_org_id()) and (
    id=(select auth.uid()) or (select public.current_app_role())='super_admin'
    or ((select public.current_app_role())='assigner' and exists (
      select 1 from public.permissions pm where pm.organisation_id=profiles.organisation_id
        and pm.assigner_id=(select auth.uid()) and pm.end_user_id=profiles.id
    ))
  )
);
create policy profile_update_self_preferences on public.profiles for update to authenticated
  using (id=(select auth.uid()) and organisation_id=(select public.current_org_id()))
  with check (id=(select auth.uid()) and organisation_id=(select public.current_org_id())
    and role=(select public.current_app_role()) and is_active
    and must_reset_password=(select p.must_reset_password from public.profiles p where p.id=(select auth.uid()))
    and can_manage_users=(select p.can_manage_users from public.profiles p where p.id=(select auth.uid()))
    and deleted_at is null);
create policy profile_admin_manage on public.profiles for all to authenticated using (public.is_admin_of_org(organisation_id)) with check (public.is_admin_of_org(organisation_id));
create policy permission_admin_read on public.permissions for select to authenticated using (organisation_id=(select public.current_org_id()) and ((select public.current_app_role())='super_admin' or assigner_id=(select auth.uid())));
create policy permission_admin_manage on public.permissions for all to authenticated using (public.is_admin_of_org(organisation_id)) with check (public.is_admin_of_org(organisation_id));
create policy task_read_scope on public.tasks for select to authenticated using (public.can_access_task(id));
create policy task_insert_scope on public.tasks for insert to authenticated with check (organisation_id=(select public.current_org_id()) and assigner_id=(select auth.uid()) and (select public.current_app_role()) in ('assigner','super_admin') and (public.current_app_role()='super_admin' or exists(select 1 from public.permissions pm where pm.assigner_id=(select auth.uid()) and pm.end_user_id=assignee_id and pm.organisation_id=organisation_id)));
create policy history_read_task on public.task_status_history for select to authenticated using (public.can_access_task(task_id));
create policy comments_read_task on public.task_comments for select to authenticated using (public.can_access_task(task_id));
create policy expenses_read_task on public.expense_lines for select to authenticated using (public.can_access_task(task_id));
create policy expenses_insert_own_task on public.expense_lines for insert to authenticated with check (organisation_id=(select public.current_org_id()) and created_by=(select auth.uid()) and exists(select 1 from public.tasks t where t.id=task_id and t.assignee_id=(select auth.uid()) and t.status in ('pending','in_progress','on_hold','skipped','returned')));
create policy expenses_update_own_task on public.expense_lines for update to authenticated using (created_by=(select auth.uid()) and exists(select 1 from public.tasks t where t.id=task_id and t.assignee_id=(select auth.uid()) and t.status in ('pending','in_progress','on_hold','skipped','returned'))) with check (created_by=(select auth.uid()) and public.can_access_task(task_id));
create policy expenses_delete_own_task on public.expense_lines for delete to authenticated using (created_by=(select auth.uid()) and exists(select 1 from public.tasks t where t.id=task_id and t.assignee_id=(select auth.uid()) and t.status in ('pending','in_progress','on_hold','skipped','returned')));
create policy proofs_read_task on public.expense_proofs for select to authenticated using (public.can_access_task(task_id));
create policy reviews_read_task on public.task_reviews for select to authenticated using (public.can_access_task(task_id));
create policy notifications_read_own on public.notifications for select to authenticated using (recipient_id=(select auth.uid()) and organisation_id=(select public.current_org_id()));
create policy notifications_update_own on public.notifications for update to authenticated using (recipient_id=(select auth.uid())) with check (recipient_id=(select auth.uid()));
create policy audit_admin_read on public.audit_events for select to authenticated using (public.is_admin_of_org(organisation_id));
create policy invitations_admin_read on public.user_invitations for select to authenticated using (public.is_admin_of_org(organisation_id));

-- Task changes use constrained RPC functions rather than direct authenticated UPDATE grants.
create or replace function public.create_task(task_reference text, task_title text, task_description text, task_assignee uuid, task_priority public.task_priority, task_start date, task_due date, task_budget numeric, task_currency text, task_tags text[] default '{}')
returns public.tasks language plpgsql security definer set search_path = '' as $$
declare actor public.profiles; created public.tasks;
begin
  select * into actor from public.profiles where id=(select auth.uid()) and is_active and deleted_at is null;
  if actor.id is null or actor.role not in ('assigner','super_admin') then raise exception 'Not authorized' using errcode='42501'; end if;
  if length(trim(task_title)) not between 3 and 150 or task_due < task_start or (task_budget is not null and task_budget < 0) or task_currency !~ '^[A-Z]{3}$' then raise exception 'Invalid task details' using errcode='22023'; end if;
  if not exists(select 1 from public.profiles p where p.id=task_assignee and p.organisation_id=actor.organisation_id and p.role='end_user' and p.is_active and p.deleted_at is null) then raise exception 'Invalid assignee' using errcode='42501'; end if;
  if actor.role='assigner' and not exists(select 1 from public.permissions pm where pm.organisation_id=actor.organisation_id and pm.assigner_id=actor.id and pm.end_user_id=task_assignee) then raise exception 'Assignee is outside your permitted scope' using errcode='42501'; end if;
  insert into public.tasks(organisation_id,reference,title,description,assignee_id,assigner_id,priority,start_date,due_date,budget_limit,currency,tags,created_by)
    values(actor.organisation_id,trim(task_reference),trim(task_title),task_description,task_assignee,actor.id,task_priority,task_start,task_due,task_budget,task_currency,coalesce(task_tags,'{}'),actor.id) returning * into created;
  insert into public.task_status_history(organisation_id,task_id,from_status,to_status,actor_id) values(actor.organisation_id,created.id,null,'pending',actor.id);
  return created;
end $$;
revoke all on function public.create_task(text,text,text,uuid,public.task_priority,date,date,numeric,text,text[]) from public,anon;
grant execute on function public.create_task(text,text,text,uuid,public.task_priority,date,date,numeric,text,text[]) to authenticated;

create or replace function public.save_expense_line(line_task_id uuid, line_id uuid, line_date date, line_category text, line_description text, line_quantity numeric, line_unit_amount numeric)
returns public.expense_lines language plpgsql security definer set search_path = '' as $$
declare actor public.profiles; task_row public.tasks; result public.expense_lines;
begin
  select * into actor from public.profiles where id=(select auth.uid()) and is_active and deleted_at is null;
  select * into task_row from public.tasks where id=line_task_id and organisation_id=actor.organisation_id and assignee_id=actor.id and status in ('pending','in_progress','on_hold','skipped','returned') and deleted_at is null for update;
  if actor.id is null or task_row.id is null or actor.role<>'end_user' then raise exception 'Not authorized' using errcode='42501'; end if;
  if line_quantity<=0 or line_unit_amount<=0 or length(trim(line_category)) not between 2 and 80 or length(trim(line_description)) not between 3 and 300 then raise exception 'Invalid expense details' using errcode='22023'; end if;
  if line_id is null then
    insert into public.expense_lines(organisation_id,task_id,expense_date,category,description,quantity,unit_amount,created_by)
      values(actor.organisation_id,line_task_id,line_date,trim(line_category),trim(line_description),line_quantity,line_unit_amount,actor.id) returning * into result;
  else
    update public.expense_lines set expense_date=line_date,category=trim(line_category),description=trim(line_description),quantity=line_quantity,unit_amount=line_unit_amount,updated_by=actor.id
      where id=line_id and task_id=line_task_id and created_by=actor.id and deleted_at is null returning * into result;
    if result.id is null then raise exception 'Expense not found' using errcode='P0002'; end if;
  end if;
  return result;
end $$;
revoke all on function public.save_expense_line(uuid,uuid,date,text,text,numeric,numeric) from public,anon;
grant execute on function public.save_expense_line(uuid,uuid,date,text,text,numeric,numeric) to authenticated;

create or replace function public.discard_expense_line(line_id uuid) returns void language plpgsql security definer set search_path = '' as $$
declare actor public.profiles;
begin
  select * into actor from public.profiles where id=(select auth.uid()) and is_active and deleted_at is null;
  if actor.id is null or actor.role<>'end_user' then raise exception 'Not authorized' using errcode='42501'; end if;
  update public.expense_lines e set deleted_at=now(),updated_by=actor.id
    where e.id=line_id and e.created_by=actor.id and e.organisation_id=actor.organisation_id and e.deleted_at is null
      and exists(select 1 from public.tasks t where t.id=e.task_id and t.assignee_id=actor.id and t.status in ('pending','in_progress','on_hold','skipped','returned'));
end $$;
revoke all on function public.discard_expense_line(uuid) from public,anon;
grant execute on function public.discard_expense_line(uuid) to authenticated;

create or replace function public.complete_password_reset() returns void language plpgsql security definer set search_path = '' as $$
declare actor public.profiles;
begin
  update public.profiles set must_reset_password=false, updated_at=now(), updated_by=(select auth.uid())
    where id=(select auth.uid()) and is_active and deleted_at is null returning * into actor;
  if actor.id is null then raise exception 'Not authorized' using errcode='42501'; end if;
  insert into public.audit_events(organisation_id,actor_id,action,entity_type,entity_id,details)
    values(actor.organisation_id,actor.id,'profile.password_reset_completed','profile',actor.id,'{}'::jsonb);
end $$;
revoke all on function public.complete_password_reset() from public,anon;
grant execute on function public.complete_password_reset() to authenticated;

create or replace function public.set_assigner_scope(actor_id uuid, target_assigner uuid, target_users uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare actor public.profiles; assigner public.profiles; requested_count integer;
begin
  select * into actor from public.profiles where id=actor_id and is_active and role='super_admin' and deleted_at is null;
  if actor.id is null then raise exception 'Not authorized' using errcode='42501'; end if;
  select * into assigner from public.profiles where id=target_assigner and organisation_id=actor.organisation_id and role='assigner' and is_active and deleted_at is null for update;
  if assigner.id is null then raise exception 'Invalid assigner' using errcode='22023'; end if;
  requested_count := coalesce(array_length(target_users,1),0);
  if requested_count > 500 then raise exception 'Too many scope members' using errcode='22023'; end if;
  if exists(select 1 from unnest(coalesce(target_users,'{}'::uuid[])) target_id left join public.profiles p on p.id=target_id and p.organisation_id=actor.organisation_id and p.role='end_user' and p.is_active and p.deleted_at is null where p.id is null) then raise exception 'Invalid end-user scope' using errcode='22023'; end if;
  delete from public.permissions where organisation_id=actor.organisation_id and assigner_id=assigner.id;
  insert into public.permissions(organisation_id,assigner_id,end_user_id,can_manage_users,created_by)
    select actor.organisation_id,assigner.id,target_id,false,actor.id from unnest(coalesce(target_users,'{}'::uuid[])) target_id;
  insert into public.audit_events(organisation_id,actor_id,action,entity_type,entity_id,details)
    values(actor.organisation_id,actor.id,'assigner.scope_changed','profile',assigner.id,jsonb_build_object('end_user_count',requested_count));
end $$;
revoke all on function public.set_assigner_scope(uuid,uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.set_assigner_scope(uuid,uuid,uuid[]) to service_role;

create or replace function public.register_expense_proof(proof_task_id uuid, proof_expense_id uuid, proof_path text, proof_name text, proof_mime text, proof_size bigint)
returns public.expense_proofs language plpgsql security definer set search_path = '' as $$
declare actor public.profiles; task_row public.tasks; result public.expense_proofs;
begin
  select * into actor from public.profiles where id=(select auth.uid()) and is_active and deleted_at is null;
  select * into task_row from public.tasks where id=proof_task_id and organisation_id=actor.organisation_id and assignee_id=actor.id and status in ('pending','in_progress','on_hold','skipped','returned') and deleted_at is null;
  if actor.id is null or task_row.id is null or actor.role<>'end_user' then raise exception 'Not authorized' using errcode='42501'; end if;
  if proof_path !~ ('^'||actor.organisation_id::text||'/'||proof_task_id::text||'/') or proof_mime not in ('image/jpeg','image/png','image/webp','application/pdf') or proof_size not between 1 and 10485760 then raise exception 'Invalid proof metadata' using errcode='22023'; end if;
  if proof_expense_id is not null and not exists(select 1 from public.expense_lines e where e.id=proof_expense_id and e.task_id=proof_task_id and e.created_by=actor.id) then raise exception 'Invalid expense line' using errcode='42501'; end if;
  if not exists(select 1 from storage.objects o where o.bucket_id='task-proofs' and o.name=proof_path) then raise exception 'Uploaded file not found' using errcode='P0002'; end if;
  insert into public.expense_proofs(organisation_id,task_id,expense_line_id,object_path,original_name,mime_type,size_bytes,uploaded_by)
    values(actor.organisation_id,proof_task_id,proof_expense_id,proof_path,proof_name,proof_mime,proof_size,actor.id) returning * into result;
  return result;
end $$;
revoke all on function public.register_expense_proof(uuid,uuid,text,text,text,bigint) from public,anon;
grant execute on function public.register_expense_proof(uuid,uuid,text,text,text,bigint) to authenticated;

create or replace function public.transition_task(target_task uuid, next_status public.task_status, reason text default null, expected_version integer default null)
returns public.tasks language plpgsql security definer set search_path = '' as $$
declare t public.tasks; actor public.profiles; allowed boolean := false; prior_status public.task_status;
begin
  select * into actor from public.profiles where id=(select auth.uid()) and is_active and deleted_at is null;
  if actor.id is null then raise exception 'Not authorized' using errcode='42501'; end if;
  select * into t from public.tasks where id=target_task and organisation_id=actor.organisation_id and deleted_at is null for update;
  if t.id is null then raise exception 'Task not found' using errcode='P0002'; end if;
  if expected_version is not null and t.version <> expected_version then raise exception 'Task changed; refresh and retry' using errcode='40001'; end if;
  if next_status in ('on_hold','skipped','returned') and length(trim(coalesce(reason,''))) < 10 then raise exception 'A comment of at least 10 characters is required' using errcode='22023'; end if;
  if actor.role='end_user' and t.assignee_id=actor.id then
    allowed := (t.status in ('pending','returned','on_hold','skipped') and next_status='in_progress') or (t.status in ('pending','in_progress','returned') and next_status in ('on_hold','skipped')) or (t.status in ('pending','in_progress','on_hold','skipped','returned') and next_status='submitted');
  elsif actor.role in ('assigner','super_admin') and (actor.role='super_admin' or t.assigner_id=actor.id or exists(select 1 from public.permissions pm where pm.assigner_id=actor.id and pm.end_user_id=t.assignee_id and pm.organisation_id=t.organisation_id)) then
    allowed := (t.status='submitted' and next_status in ('verified','returned')) or (t.status='pending' and next_status='cancelled') or (actor.role='super_admin' and t.status not in ('verified','cancelled') and next_status='cancelled') or (actor.role='super_admin' and t.status='verified' and next_status='returned');
  end if;
  if not allowed then raise exception 'Transition not allowed' using errcode='42501'; end if;
  if next_status='returned' and length(trim(coalesce(reason,''))) < 10 then raise exception 'A return comment of at least 10 characters is required' using errcode='22023'; end if;
  if next_status='cancelled' and length(trim(coalesce(reason,''))) < 1 then raise exception 'A cancellation reason is required' using errcode='22023'; end if;
  if next_status='submitted' and exists(
    select 1 from public.expense_lines e where e.task_id=t.id and e.deleted_at is null
      and not exists(select 1 from public.expense_proofs p where p.expense_line_id=e.id and p.deleted_at is null)
  ) then raise exception 'Each expense line requires proof before submission' using errcode='23514'; end if;
  prior_status := t.status;
  if prior_status='verified' and actor.role='super_admin' then perform set_config('app.allow_verified_reopen','true',true); end if;
  update public.tasks set status=next_status, version=version+1, updated_at=now(), updated_by=actor.id where id=t.id returning * into t;
  insert into public.task_status_history(organisation_id,task_id,from_status,to_status,comment,actor_id) values(t.organisation_id,t.id,prior_status,next_status,nullif(trim(reason),''),actor.id);
  insert into public.task_comments(organisation_id,task_id,author_id,body)
    values(t.organisation_id,t.id,actor.id,coalesce(nullif(trim(reason),''),format('Status changed from %s to %s.',prior_status,next_status)));
  if next_status in ('verified','returned') then
    insert into public.task_reviews(organisation_id,task_id,reviewer_id,decision,comment,snapshot)
      values(t.organisation_id,t.id,actor.id,case when prior_status='verified' then 'reopened' else next_status::text end,nullif(trim(reason),''),
        jsonb_build_object('budget_limit',t.budget_limit,'currency',t.currency,'expense_total',(select coalesce(sum(e.line_total),0) from public.expense_lines e where e.task_id=t.id and e.deleted_at is null)));
  elsif next_status='cancelled' then
    insert into public.task_reviews(organisation_id,task_id,reviewer_id,decision,comment) values(t.organisation_id,t.id,actor.id,'cancelled',nullif(trim(reason),''));
  end if;
  insert into public.notifications(organisation_id,recipient_id,task_id,title,body)
    values(t.organisation_id,case when actor.id=t.assignee_id then t.assigner_id else t.assignee_id end,t.id,'task.status_changed',jsonb_build_object('status',next_status,'reference',t.reference)::text);
  return t;
end $$;
revoke all on function public.transition_task(uuid,public.task_status,text,integer) from public, anon;
grant execute on function public.transition_task(uuid,public.task_status,text,integer) to authenticated;

create or replace function public.prevent_verified_task_mutation() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status='verified' and current_setting('app.allow_verified_reopen',true) is distinct from 'true' then raise exception 'Verified tasks are immutable; use audited reopen' using errcode='42501'; end if;
  return new;
end $$;
create trigger tasks_verified_guard before update on public.tasks for each row execute function public.prevent_verified_task_mutation();

create or replace function public.audit_task_changes() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_events(organisation_id,actor_id,action,entity_type,entity_id,details)
  values(coalesce(new.organisation_id,old.organisation_id),coalesce((select auth.uid()),new.updated_by,new.created_by),
    case when tg_op='INSERT' then 'task.created'
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
create trigger tasks_audit_after_write after insert or update or delete on public.tasks for each row execute function public.audit_task_changes();

create or replace function public.audit_profile_changes() returns trigger language plpgsql security definer set search_path = '' as $$
declare target public.profiles; actor_id uuid; action_name text;
begin
  target := case when tg_op='DELETE' then old else new end;
  actor_id := coalesce((select auth.uid()), target.updated_by, target.created_by);
  action_name := case when tg_op='INSERT' then 'profile.created' when tg_op='DELETE' then 'profile.deleted' when old.role is distinct from new.role then 'profile.role_changed' when old.is_active is distinct from new.is_active then 'profile.account_state_changed' else 'profile.updated' end;
  insert into public.audit_events(organisation_id,actor_id,action,entity_type,entity_id,details)
    values(target.organisation_id,actor_id,action_name,'profile',target.id,jsonb_build_object('role',target.role,'is_active',target.is_active,'username',target.username));
  return coalesce(new,old);
end $$;
create trigger profiles_audit_after_write after insert or update or delete on public.profiles for each row execute function public.audit_profile_changes();

create or replace function public.audit_permission_changes() returns trigger language plpgsql security definer set search_path = '' as $$
declare target public.permissions; actor_id uuid;
begin
  target := case when tg_op='DELETE' then old else new end;
  actor_id := coalesce((select auth.uid()),target.created_by);
  insert into public.audit_events(organisation_id,actor_id,action,entity_type,entity_id,details)
    values(target.organisation_id,actor_id,case when tg_op='DELETE' then 'permission.deleted' else 'permission.changed' end,'permission',target.id,jsonb_build_object('assigner_id',target.assigner_id,'end_user_id',target.end_user_id,'can_manage_users',target.can_manage_users));
  return coalesce(new,old);
end $$;
create trigger permissions_audit_after_write after insert or update or delete on public.permissions for each row execute function public.audit_permission_changes();
create or replace function public.set_updated_at() returns trigger language plpgsql set search_path = '' as $$ begin new.updated_at=now(); return new; end $$;
create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger expense_lines_updated_at before update on public.expense_lines for each row execute function public.set_updated_at();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('task-proofs','task-proofs',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict(id) do update set public=false,file_size_limit=10485760,allowed_mime_types=array['image/jpeg','image/png','image/webp','application/pdf'];
create policy proof_object_read on storage.objects for select to authenticated using (bucket_id='task-proofs' and exists(select 1 from public.expense_proofs p where p.object_path=name and public.can_access_task(p.task_id)));
create policy proof_object_insert on storage.objects for insert to authenticated with check (
  bucket_id='task-proofs' and (storage.foldername(name))[1]=(select public.current_org_id())::text
  and exists(select 1 from public.tasks t where t.id=((storage.foldername(name))[2])::uuid and t.organisation_id=(select public.current_org_id()) and t.assignee_id=(select auth.uid()) and t.status in ('pending','in_progress','on_hold','skipped','returned'))
);
create policy proof_object_delete on storage.objects for delete to authenticated using (
  bucket_id='task-proofs' and (storage.foldername(name))[1]=(select public.current_org_id())::text
  and exists(select 1 from public.tasks t where t.id=((storage.foldername(name))[2])::uuid and t.assignee_id=(select auth.uid()) and t.status in ('pending','in_progress','on_hold','skipped','returned'))
);

revoke all on function public.current_org_id() from public,anon;
revoke all on function public.current_app_role() from public,anon;
revoke all on function public.can_access_task(uuid) from public,anon;
revoke all on function public.is_admin_of_org(uuid) from public,anon;
grant execute on function public.current_org_id(),public.current_app_role(),public.can_access_task(uuid),public.is_admin_of_org(uuid) to authenticated;
