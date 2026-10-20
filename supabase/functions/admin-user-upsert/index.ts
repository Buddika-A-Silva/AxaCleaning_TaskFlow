import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('APP_ORIGIN')?.trim() || 'https://buddika-a-silva.github.io',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
};
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

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
    const { id, email, username, full_name, role, recovery_email, phone, employee_id, department, language, timezone, is_active = true, can_manage_users = false } = input;
    if (!['assigner', 'end_user'].includes(role) || typeof username !== 'string' || !/^[a-z0-9._-]{3,40}$/.test(username) || typeof full_name !== 'string' || full_name.trim().length < 2) return response({ error: 'Invalid profile details' }, 400);
    const { data: duplicate } = await admin.from('profiles').select('id').eq('username', username.toLowerCase()).neq('id', typeof id === 'string' ? id : '00000000-0000-0000-0000-000000000000').maybeSingle();
    if (duplicate) return response({ error: 'Username is already in use' }, 409);
    if (!id && (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) return response({ error: 'A valid email is required for invitations' }, 400);
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
    const appOrigin = (Deno.env.get('APP_ORIGIN') ?? 'https://buddika-a-silva.github.io').replace(/\/$/, '');
    const inviteRedirectUrl = Deno.env.get('INVITE_REDIRECT_URL') ?? `${appOrigin}/AxaCleaning_TaskFlow/reset-password`;
    let redirectOrigin: string;
    try { redirectOrigin = new URL(inviteRedirectUrl).origin; } catch { return response({ error: 'Invitation redirect is not configured' }, 500); }
    if (redirectOrigin !== appOrigin) return response({ error: 'Invitation redirect is not configured' }, 500);
    const { data: invitation, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: inviteRedirectUrl,
      data: { username: username.toLowerCase(), full_name: full_name.trim() },
    });
    const invitedUser = invitation.user;
    if (inviteError || !invitedUser) return response({ error: 'Could not create invitation' }, 409);
    const { error: profileError } = await admin.from('profiles').insert({ id: invitedUser.id, organisation_id: actor.organisation_id, username: username.toLowerCase(), full_name: full_name.trim(), recovery_email, phone, employee_id, department, role, language: language === 'ro' ? 'ro' : 'en', timezone: timezone ?? 'Europe/Bucharest', is_active: true, must_reset_password: true, can_manage_users: actor.role === 'super_admin' && role === 'assigner' && Boolean(can_manage_users), created_by: actor.id });
    if (profileError) {
      await admin.auth.admin.deleteUser(invitedUser.id);
      return response({ error: 'Could not create profile' }, 409);
    }
    if (actor.role === 'assigner') {
      const { error: permissionError } = await admin.from('permissions').insert({ organisation_id: actor.organisation_id, assigner_id: actor.id, end_user_id: invitedUser.id, can_manage_users: false, created_by: actor.id });
      if (permissionError) {
        await admin.from('profiles').delete().eq('id', invitedUser.id);
        await admin.auth.admin.deleteUser(invitedUser.id);
        return response({ error: 'Could not set user permissions' }, 409);
      }
    }
    const { error: invitationError } = await admin.from('user_invitations').insert({ organisation_id: actor.organisation_id, email, username: username.toLowerCase(), role, invited_by: actor.id, expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() });
    if (invitationError) {
      await admin.from('profiles').delete().eq('id', invitedUser.id);
      await admin.auth.admin.deleteUser(invitedUser.id);
      return response({ error: 'Could not save invitation' }, 409);
    }
    return response({ id: invitedUser.id }, 201);
  } catch {
    return response({ error: 'Request could not be processed' }, 400);
  }
});