import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('APP_ORIGIN')?.trim() || 'https://buddika-a-silva.github.io',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
};
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const temporaryPassword = () => `AxA1-${crypto.randomUUID()}-${crypto.getRandomValues(new Uint32Array(1))[0].toString(16)}`;

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return response({ error: 'Method not allowed' }, 405);
  try {
    const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
    if (!token) return response({ error: 'Unauthorized' }, 401);
    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: { user: caller }, error: callerError } = await admin.auth.getUser(token);
    if (callerError || !caller) return response({ error: 'Unauthorized' }, 401);
    const { data: actor } = await admin.from('profiles').select('id,organisation_id,role,is_active,can_manage_users').eq('id', caller.id).maybeSingle();
    if (!actor?.is_active || !['super_admin', 'assigner'].includes(actor.role)) return response({ error: 'Forbidden' }, 403);
    const input = await request.json();
    if (input.action === 'set-scope') {
      if (actor.role !== 'super_admin' || typeof input.assigner_id !== 'string' || !Array.isArray(input.end_user_ids) || input.end_user_ids.some((id: unknown) => typeof id !== 'string')) return response({ error: 'Forbidden' }, 403);
      const { error: scopeError } = await admin.rpc('set_assigner_scope', { actor_id: actor.id, target_assigner: input.assigner_id, target_users: input.end_user_ids });
      if (scopeError) return response({ error: 'Could not update scope' }, 409);
      return response({ updated: true });
    }
    if (input.action === 'reset-password') {
      if (typeof input.user_id !== 'string') return response({ error: 'Invalid account' }, 400);
      const { data: target } = await admin.from('profiles').select('id,username,role,is_active,deleted_at,organisation_id,must_reset_password').eq('id', input.user_id).maybeSingle();
      if (!target || target.organisation_id !== actor.organisation_id || !target.is_active || target.deleted_at) return response({ error: 'Account not found or inactive' }, 404);
      if (actor.role !== 'super_admin') {
        if (target.role !== 'end_user' || !actor.can_manage_users) return response({ error: 'Forbidden' }, 403);
        const { data: scope } = await admin.from('permissions').select('id').eq('organisation_id', actor.organisation_id).eq('assigner_id', actor.id).eq('end_user_id', target.id).maybeSingle();
        if (!scope) return response({ error: 'Forbidden' }, 403);
      }
      const password = temporaryPassword();
      const { error: profileError } = await admin.from('profiles').update({ must_reset_password: true, updated_by: actor.id }).eq('id', target.id).eq('organisation_id', actor.organisation_id);
      if (profileError) return response({ error: 'Could not set the required password reset' }, 409);
      const { error: passwordError } = await admin.auth.admin.updateUserById(target.id, { password });
      if (passwordError) {
        await admin.from('profiles').update({ must_reset_password: target.must_reset_password, updated_by: actor.id }).eq('id', target.id).eq('organisation_id', actor.organisation_id);
        console.error('admin-user-upsert password reset failed', { code: passwordError.code ?? 'unknown' });
        return response({ error: 'Could not reset password' }, 409);
      }
      const { error: auditError } = await admin.from('audit_events').insert({ organisation_id: actor.organisation_id, actor_id: actor.id, action: 'profile.temporary_password_issued', entity_type: 'profile', entity_id: target.id, details: { username: target.username } });
      if (auditError) console.error('admin-user-upsert password reset audit failed', { code: auditError.code });
      return response({ id: target.id, username: target.username, temporary_password: password });
    }
    const { id, email, username, full_name, role, recovery_email, phone, employee_id, department, language, timezone, is_active = true, can_manage_users = false } = input;
    if (!['assigner', 'end_user'].includes(role) || typeof username !== 'string' || !/^[a-z0-9._-]{3,40}$/.test(username) || typeof full_name !== 'string' || full_name.trim().length < 2) return response({ error: 'Invalid profile details' }, 400);
    const { data: duplicate } = await admin.from('profiles').select('id').eq('username', username.toLowerCase()).neq('id', typeof id === 'string' ? id : '00000000-0000-0000-0000-000000000000').maybeSingle();
    if (duplicate) return response({ error: 'Username is already in use' }, 409);
    const normalizedEmail = typeof email === 'string' && email.trim() ? email.trim().toLowerCase() : null;
    if (normalizedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) return response({ error: 'Enter a valid email address or leave it blank' }, 400);
    if (actor.role === 'assigner') {
      if (role !== 'end_user' || !actor.can_manage_users) return response({ error: 'Forbidden' }, 403);
    }
    if (id) {
      const { data: target } = await admin.from('profiles').select('id,role,is_active,organisation_id,can_manage_users').eq('id', id).maybeSingle();
      if (!target || target.organisation_id !== actor.organisation_id) return response({ error: 'Not found' }, 404);
      if (actor.role !== 'super_admin' && (target.role !== 'end_user' || role !== 'end_user')) return response({ error: 'Forbidden' }, 403);
      if (actor.role === 'assigner') {
        const { data: scope } = await admin.from('permissions').select('id').eq('organisation_id', actor.organisation_id).eq('assigner_id', actor.id).eq('end_user_id', id).maybeSingle();
        if (!scope) return response({ error: 'Forbidden' }, 403);
      }
      if (target.role === 'super_admin' && (role !== 'super_admin' || is_active === false)) {
        const { count } = await admin.from('profiles').select('id', { count: 'exact', head: true }).eq('organisation_id', actor.organisation_id).eq('role', 'super_admin').eq('is_active', true).is('deleted_at', null);
        if ((count ?? 0) <= 1) return response({ error: 'At least one active Super Admin is required' }, 409);
      }
      const { error } = await admin.from('profiles').update({ username: username.toLowerCase(), full_name: full_name.trim(), recovery_email, phone, employee_id, department, role, language: language === 'ro' ? 'ro' : 'en', timezone, is_active, can_manage_users: actor.role === 'super_admin' && role === 'assigner' ? Boolean(can_manage_users) : target.role === 'assigner' ? target.can_manage_users : false, deleted_at: is_active ? null : new Date().toISOString(), updated_by: actor.id }).eq('id', id).eq('organisation_id', actor.organisation_id);
      if (error) return response({ error: 'Could not update profile' }, 409);
      if (role === 'end_user' && actor.role === 'assigner') {
        const { error: permissionError } = await admin.from('permissions').upsert({ organisation_id: actor.organisation_id, assigner_id: actor.id, end_user_id: id, can_manage_users: false, created_by: actor.id }, { onConflict: 'assigner_id,end_user_id' });
        if (permissionError) return response({ error: 'Could not set user permissions' }, 409);
      }
      return response({ id });
    }
    const password = temporaryPassword();
    const authEmail = normalizedEmail ?? `${crypto.randomUUID()}@no-email.axa-cleaning.invalid`;
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: authEmail,
      password,
      email_confirm: true,
      user_metadata: { username: username.toLowerCase(), full_name: full_name.trim() },
    });
    const newUser = created.user;
    if (createError || !newUser) {
      console.error('admin-user-upsert auth account creation failed', { code: createError?.code ?? 'unknown' });
      return response({ error: 'Could not create account. Check whether the email is already registered.' }, 409);
    }
    const { error: profileError } = await admin.from('profiles').insert({ id: newUser.id, organisation_id: actor.organisation_id, username: username.toLowerCase(), full_name: full_name.trim(), recovery_email: normalizedEmail, phone, employee_id, department, role, language: language === 'ro' ? 'ro' : 'en', timezone: timezone ?? 'Europe/Bucharest', is_active: true, must_reset_password: true, can_manage_users: actor.role === 'super_admin' && role === 'assigner' && Boolean(can_manage_users), created_by: actor.id });
    if (profileError) {
      console.error('admin-user-upsert profile creation failed', { code: profileError.code });
      await admin.auth.admin.deleteUser(newUser.id);
      return response({ error: profileError.code === '23505' ? 'Username or employee ID is already in use' : 'Could not save the account profile' }, 409);
    }
    if (actor.role === 'assigner') {
      const { error: permissionError } = await admin.from('permissions').insert({ organisation_id: actor.organisation_id, assigner_id: actor.id, end_user_id: newUser.id, can_manage_users: false, created_by: actor.id });
      if (permissionError) {
        console.error('admin-user-upsert permission creation failed', { code: permissionError.code });
        await admin.from('profiles').delete().eq('id', newUser.id);
        await admin.auth.admin.deleteUser(newUser.id);
        return response({ error: 'Could not set user permissions' }, 409);
      }
    }
    const { error: auditError } = await admin.from('audit_events').insert({ organisation_id: actor.organisation_id, actor_id: actor.id, action: 'profile.account_created', entity_type: 'profile', entity_id: newUser.id, details: { username: username.toLowerCase(), role, email_provided: Boolean(normalizedEmail) } });
    if (auditError) {
      console.error('admin-user-upsert audit event creation failed', { code: auditError.code });
      await admin.from('permissions').delete().eq('end_user_id', newUser.id).eq('organisation_id', actor.organisation_id);
      await admin.from('profiles').delete().eq('id', newUser.id);
      await admin.auth.admin.deleteUser(newUser.id);
      return response({ error: 'Could not record account creation' }, 409);
    }
    return response({ id: newUser.id, username: username.toLowerCase(), temporary_password: password }, 201);
  } catch (error) {
    console.error('admin-user-upsert request failed', error instanceof Error ? error.name : 'Unknown error');
    return response({ error: 'Request could not be processed' }, 400);
  }
});