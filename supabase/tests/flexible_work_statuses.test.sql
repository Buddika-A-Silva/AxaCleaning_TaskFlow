-- Local-only workflow tests; run after `supabase db reset` with the synthetic seed.
create extension if not exists pgtap with schema extensions;
begin;
select plan(10);

insert into public.task_assignments(task_id,profile_id,organisation_id)
values
  ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000001'),
  ('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000001'),
  ('30000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000001')
on conflict(task_id,profile_id) do nothing;

update public.task_assignments
set worker_submitted_at=now()
where task_id='30000000-0000-4000-8000-000000000001'
  and profile_id='10000000-0000-4000-8000-000000000003';
update public.task_assignments
set worker_submitted_at=now()
where task_id='30000000-0000-4000-8000-000000000003'
  and profile_id='10000000-0000-4000-8000-000000000003';
update public.tasks set status='verified'
where id='30000000-0000-4000-8000-000000000003';

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000004',true);
select is((public.transition_task('30000000-0000-4000-8000-000000000002','pending')).status,
  'pending'::public.task_status,'worker can move a task back to pending');
select throws_ok($$select public.transition_task('30000000-0000-4000-8000-000000000002','skipped','No')$$,
  '22023',null,'reason-required statuses reject short comments');
select is((public.transition_task('30000000-0000-4000-8000-000000000002','on_hold','Waiting for site access')).status,
  'on_hold'::public.task_status,'worker can move task to on hold');
select is((public.transition_task('30000000-0000-4000-8000-000000000002','pending')).status,
  'pending'::public.task_status,'worker can move task back from on hold');

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
select throws_ok($$select public.transition_task('30000000-0000-4000-8000-000000000001','in_progress')$$,
  '42501',null,'worker cannot change status after submitting their work');

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select is((public.transition_task('30000000-0000-4000-8000-000000000002','skipped','Waiting for site access')).status,
  'skipped'::public.task_status,'assigner can change a work status');
select is((public.transition_task('30000000-0000-4000-8000-000000000002','pending')).status,
  'pending'::public.task_status,'assigner can move task back to pending');
select throws_ok($$select public.transition_task('30000000-0000-4000-8000-000000000003','returned','Too short')$$,
  '22023',null,'reopening a verified task requires an explanatory comment');
select is((public.transition_task('30000000-0000-4000-8000-000000000003','returned','Please complete the outstanding work')).status,
  'returned'::public.task_status,'assigner can reopen a verified task');
select is((select count(*) from public.task_assignments
  where task_id='30000000-0000-4000-8000-000000000003' and worker_submitted_at is not null),
  0::bigint,'reopening clears prior worker submissions');

select * from finish();
rollback;
