-- LOCAL DEVELOPMENT ONLY. This seed is loaded only by `supabase start`/`supabase db reset`.
-- Synthetic users and credentials are not for production and must never be deployed.
-- Sample local credentials: admin@taskflow.local / TaskFlowLocal2026!
--                         assigner@taskflow.local / TaskFlowLocal2026!
--                         alex@taskflow.local / TaskFlowLocal2026!

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('10000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','admin@taskflow.local',crypt('TaskFlowLocal2026!',gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{"full_name":"Morgan Admin"}',now(),now()),
  ('10000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','assigner@taskflow.local',crypt('TaskFlowLocal2026!',gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{"full_name":"Taylor Manager"}',now(),now()),
  ('10000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','alex@taskflow.local',crypt('TaskFlowLocal2026!',gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{"full_name":"Alex Rivera"}',now(),now()),
  ('10000000-0000-4000-8000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','sam@taskflow.local',crypt('TaskFlowLocal2026!',gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{"full_name":"Sam Ionescu"}',now(),now())
on conflict (id) do nothing;

insert into public.organisations(id,name,default_currency,timezone)
values('20000000-0000-4000-8000-000000000001','Northstar Studio','EUR','Europe/Bucharest') on conflict(id) do nothing;

insert into public.profiles(id,organisation_id,username,full_name,recovery_email,role,language,is_active,must_reset_password,can_manage_users)
values
  ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','morgan.admin','Morgan Admin','admin@taskflow.local','super_admin','en',true,false,false),
  ('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','taylor.manager','Taylor Manager','assigner@taskflow.local','assigner','en',true,false,true),
  ('10000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000001','alex.rivera','Alex Rivera','alex@taskflow.local','end_user','en',true,false,false),
  ('10000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000001','sam.ionescu','Sam Ionescu','sam@taskflow.local','end_user','ro',true,false,false)
on conflict(id) do nothing;

insert into public.permissions(organisation_id,assigner_id,end_user_id,created_by)
values
  ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001')
on conflict(assigner_id,end_user_id) do nothing;

insert into public.tasks(id,organisation_id,reference,title,description,assignee_id,assigner_id,priority,status,start_date,due_date,budget_limit,currency,tags,created_by)
values
  ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','TF-1001','Prepare the client welcome kits','Assemble welcome kits for the new studio clients and confirm the count.','10000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000002','high','pending',current_date,current_date+2,120.00,'EUR',array['operations','clients'],'10000000-0000-4000-8000-000000000002'),
  ('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','TF-1002','Review supplier invoices','Check the latest supplier invoices and flag any discrepancies for the finance team.','10000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000002','medium','in_progress',current_date-1,current_date+1,250.00,'EUR',array['finance'],'10000000-0000-4000-8000-000000000002'),
  ('30000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000001','TF-1003','Reorganise the project archive','Sort completed project files and create the new shared folder structure.','10000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000002','low','submitted',current_date-2,current_date-1,80.00,'EUR',array['office'],'10000000-0000-4000-8000-000000000002')
on conflict(id) do nothing;

insert into public.task_status_history(organisation_id,task_id,from_status,to_status,actor_id)
values
 ('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',null,'pending','10000000-0000-4000-8000-000000000002'),
 ('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002',null,'pending','10000000-0000-4000-8000-000000000002'),
 ('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002','pending','in_progress','10000000-0000-4000-8000-000000000004'),
 ('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000003',null,'pending','10000000-0000-4000-8000-000000000002'),
 ('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000003','pending','submitted','10000000-0000-4000-8000-000000000003');

insert into public.expense_lines(id,organisation_id,task_id,expense_date,category,description,quantity,unit_amount,created_by)
values('40000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002',current_date,'Office supplies','Archive labels and folders',3,4.50,'10000000-0000-4000-8000-000000000004')
on conflict(id) do nothing;

insert into public.task_reviews(organisation_id,task_id,reviewer_id,decision,comment,snapshot)
values('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000002','returned','Please add the final folder count.',jsonb_build_object('budget_limit',80,'currency','EUR','expense_total',0));

insert into public.task_comments(organisation_id,task_id,author_id,body)
values('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000002','Please add the final folder count.');

insert into public.notifications(organisation_id,recipient_id,task_id,title,body)
values('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000003','task.status_changed','Returned for correction');

insert into public.audit_events(organisation_id,actor_id,action,entity_type,entity_id,details)
values('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','task.created','task','30000000-0000-4000-8000-000000000001',jsonb_build_object('status','pending'));
