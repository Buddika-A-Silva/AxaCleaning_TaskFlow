-- Local-only workflow tests; run after `supabase db reset` with the synthetic seed.
create extension if not exists pgtap with schema extensions;
begin;
select plan(12);

insert into public.task_assignments(task_id,profile_id,organisation_id)
values
  ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000001'),
  ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000005','20000000-0000-4000-8000-000000000001'),
  ('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000001'),
  ('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000006','20000000-0000-4000-8000-000000000001')
on conflict(task_id,profile_id) do nothing;

insert into public.task_photos(organisation_id,task_id,photo_type,object_path,original_name,mime_type,size_bytes,uploaded_by)
values('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','completion',
  '20000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000001/completion/team-test.jpg',
  'team-test.jpg','image/jpeg',1,'10000000-0000-4000-8000-000000000003');

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
select is((public.submit_task_work('30000000-0000-4000-8000-000000000001')).status,
  'pending'::public.task_status,'first team member submission leaves task open');
select ok((select worker_submitted_at is not null from public.task_assignments
  where task_id='30000000-0000-4000-8000-000000000001' and profile_id='10000000-0000-4000-8000-000000000003'),
  'first team member is recorded as submitted');
select is((select status from public.tasks where id='30000000-0000-4000-8000-000000000001'),
  'pending'::public.task_status,'task status remains pending until every member submits');
select throws_ok($$select public.transition_task('30000000-0000-4000-8000-000000000001','submitted')$$,
  '42501',null,'workers cannot bypass their individual submission state');

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000005',true);
select is((public.submit_task_work('30000000-0000-4000-8000-000000000001')).status,
  'submitted'::public.task_status,'final team member moves task to review');
select ok((select bool_and(worker_submitted_at is not null) from public.task_assignments
  where task_id='30000000-0000-4000-8000-000000000001'),
  'all team members have a submission timestamp');

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select is((public.transition_task('30000000-0000-4000-8000-000000000001','returned','Please correct the recorded task details')).status,
  'returned'::public.task_status,'assigner can return submitted task');
select is((select count(*) from public.task_assignments
  where task_id='30000000-0000-4000-8000-000000000001' and worker_submitted_at is not null),
  0::bigint,'returning task clears team submission timestamps');

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000004',true);
select is((public.submit_task_work('30000000-0000-4000-8000-000000000002')).status,
  'in_progress'::public.task_status,'first member can submit before task-wide validation');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000006',true);
select throws_ok($$select public.submit_task_work('30000000-0000-4000-8000-000000000002')$$,
  '23514',null,'final member cannot submit without a completion photo');
select ok((select worker_submitted_at is null from public.task_assignments
  where task_id='30000000-0000-4000-8000-000000000002' and profile_id='10000000-0000-4000-8000-000000000006'),
  'failed final validation does not record the member submission');
select is((select status from public.tasks where id='30000000-0000-4000-8000-000000000002'),
  'in_progress'::public.task_status,'failed final validation leaves task open');

select * from finish();
rollback;
