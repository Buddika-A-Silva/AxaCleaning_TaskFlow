-- Local-only authorization tests; run after `supabase db reset` with the synthetic seed.
create extension if not exists pgtap with schema extensions;
begin;
select plan(6);

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000004',true);
select set_config('request.jwt.claim.role','authenticated',true);

select is((select count(*) from public.tasks where id='30000000-0000-4000-8000-000000000001'),0::bigint,'Sam cannot read Alex assigned task by ID');
select is((select count(*) from public.expense_lines where task_id='30000000-0000-4000-8000-000000000001'),0::bigint,'Sam cannot read Alex task expense lines');
select is((select count(*) from public.task_status_history where task_id='30000000-0000-4000-8000-000000000001'),0::bigint,'Sam cannot read Alex task history');
select is((select count(*) from public.audit_events),0::bigint,'End users cannot read audit events');
select throws_ok($$ update public.tasks set status='verified' where id='30000000-0000-4000-8000-000000000001' $$,'42501',null,'End users cannot update tasks directly');
select throws_ok($$ update public.tasks set status='verified' where id='30000000-0000-4000-8000-000000000002' $$,'42501',null,'Even the assigned end user cannot bypass the transition RPC');

select * from finish();
rollback;
