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
  if photo_type='completion' and actor.id<>task_row.assignee_id and not exists(
    select 1 from public.task_assignments a where a.task_id=task_row.id and a.profile_id=actor.id
  ) then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  if task_row.status in ('verified','cancelled') or (photo_type='assignment' and task_row.status='submitted')
    or photo_path !~ ('^'||actor.organisation_id::text||'/'||photo_task_id::text||'/')
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

drop policy if exists proof_object_insert on storage.objects;
create policy proof_object_insert on storage.objects for insert to authenticated with check (
  bucket_id='task-proofs' and (storage.foldername(name))[1]=(select public.current_org_id())::text
  and exists(select 1 from public.tasks t where t.id=((storage.foldername(name))[2])::uuid
    and t.organisation_id=(select public.current_org_id())
    and (
      ((storage.foldername(name))[3]='assignment'
        and t.status in ('pending','in_progress','on_hold','skipped','returned')
        and t.assigner_id=(select auth.uid()) and public.current_app_role() in ('assigner','super_admin'))
      or ((storage.foldername(name))[3]='completion'
        and t.status in ('pending','in_progress','on_hold','skipped','returned','submitted')
        and (t.assignee_id=(select auth.uid()) or exists(
          select 1 from public.task_assignments a where a.task_id=t.id and a.profile_id=(select auth.uid())
        )))
      or ((storage.foldername(name))[3] is null
        and t.status in ('pending','in_progress','on_hold','skipped','returned')
        and exists(
        select 1 from public.task_assignments a where a.task_id=t.id and a.profile_id=(select auth.uid())
      ))
    )
  )
);
