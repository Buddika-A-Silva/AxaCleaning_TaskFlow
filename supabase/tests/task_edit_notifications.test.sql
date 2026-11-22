-- Local-only workflow test; run after `supabase db reset` with the synthetic seed.
create extension if not exists pgtap with schema extensions;
begin;
select plan(5);

insert into public.task_assignments(task_id,profile_id,organisation_id,assigned_hours)
values(
  '30000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000003',
  '20000000-0000-4000-8000-000000000001',
  120
)
on conflict(task_id,profile_id) do nothing;

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select is((public.update_cleaning_task(
  '30000000-0000-4000-8000-000000000001',
  1,
  'TF-1001',
  'Prepare the client welcome kits - revised',
  'Assemble welcome kits and confirm the revised count.',
  'high',
  current_date,
  current_date+2,
  120,
  array['10000000-0000-4000-8000-000000000003'::uuid,'10000000-0000-4000-8000-000000000004'::uuid],
  jsonb_build_array(jsonb_build_object(
    'area_id',(select id from public.cleaning_areas where organisation_id='20000000-0000-4000-8000-000000000001' order by sort_order limit 1),
    'subtask_id',null,
    'assigned_hours',null
  )),
  '[]'::jsonb,
  '{"customer_name":"Test Customer","apartment_number":"12","apartment_block":"A","customer_address":"12 Test Street","customer_phone":"12345"}'::jsonb,
  120,
  'EUR'
)).title,'Prepare the client welcome kits - revised','assigner can update assigned task details');

reset role;
select is((select count(*) from public.task_assignments
  where task_id='30000000-0000-4000-8000-000000000001'),
  2::bigint,'task team membership is updated');
select is((select count(*) from public.notifications
  where task_id='30000000-0000-4000-8000-000000000001' and title='task.updated'),
  2::bigint,'both workers receive task update notifications');
select ok((select (body::jsonb->'changes') ? 'title' from public.notifications
  where task_id='30000000-0000-4000-8000-000000000001' and title='task.updated' limit 1),
  'notification describes changed task fields');

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select throws_ok($$select public.update_cleaning_task(
  '30000000-0000-4000-8000-000000000001',
  1,
  'TF-1001',
  'Prepare the client welcome kits - revised',
  'Assemble welcome kits and confirm the revised count.',
  'high',
  current_date,
  current_date+2,
  120,
  array['10000000-0000-4000-8000-000000000003'::uuid,'10000000-0000-4000-8000-000000000004'::uuid],
  jsonb_build_array(jsonb_build_object(
    'area_id',(select id from public.cleaning_areas where organisation_id='20000000-0000-4000-8000-000000000001' order by sort_order limit 1),
    'subtask_id',null,
    'assigned_hours',null
  )),
  '[]'::jsonb,
  '{"customer_name":"Test Customer","apartment_number":"12","apartment_block":"A","customer_address":"12 Test Street","customer_phone":"12345"}'::jsonb,
  120,
  'EUR'
)$$,'40001',null,'stale task versions cannot overwrite newer edits');

select * from finish();
rollback;
