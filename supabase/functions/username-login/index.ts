import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('APP_ORIGIN')?.trim() || 'https://buddika-a-silva.github.io',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
};
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

async function digest(value: string, salt: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${salt}\u0000${value}`);
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(hash, byte => byte.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return response({ error: 'Method not allowed' }, 405);
  try {
    const { identifier, password } = await request.json();
    if (typeof identifier !== 'string' || typeof password !== 'string' || !identifier.trim() || password.length < 1 || password.length > 1024) return response({ error: 'Invalid credentials' }, 400);
    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const salt = Deno.env.get('LOGIN_RATE_LIMIT_SALT');
    if (!salt || salt.length < 32) return response({ error: 'Invalid credentials' }, 401);
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const networkAddress = request.headers.get('cf-connecting-ip') ?? request.headers.get('x-real-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
    const networkKey = await digest(networkAddress, salt);
    const attemptKey = await digest(`${networkAddress}\u0000${identifier.trim().toLowerCase()}`, salt);
    const { data: networkAllowed, error: networkRateError } = await admin.rpc('check_login_rate_limit', { target_hash: networkKey });
    const { data: attemptAllowed, error: attemptRateError } = await admin.rpc('check_login_rate_limit', { target_hash: attemptKey });
    if (networkRateError || attemptRateError || networkAllowed !== true || attemptAllowed !== true) return response({ error: 'Invalid credentials' }, 429);
    let email = identifier.trim().toLowerCase();
    if (!email.includes('@')) {
      const { data: profile } = await admin.from('profiles').select('id,is_active,deleted_at').eq('username', email).maybeSingle();
      if (!profile?.is_active || profile.deleted_at) return response({ error: 'Invalid credentials' }, 401);
      const { data: authUser } = await admin.auth.admin.getUserById(profile.id);
      email = authUser.user?.email ?? '';
    }
    if (!email) return response({ error: 'Invalid credentials' }, 401);
    // GoTrue applies the project's configured login throttling to this password grant.
    const publicClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await publicClient.auth.signInWithPassword({ email, password });
    if (error || !data.session) return response({ error: 'Invalid credentials' }, 401);
    const { data: profile } = await admin.from('profiles').select('is_active,deleted_at').eq('id', data.user.id).maybeSingle();
    if (!profile?.is_active || profile.deleted_at) {
      await publicClient.auth.signOut();
      return response({ error: 'Invalid credentials' }, 401);
    }
    await Promise.all([admin.rpc('clear_login_rate_limit', { target_hash: networkKey }), admin.rpc('clear_login_rate_limit', { target_hash: attemptKey })]);
    return response({ access_token: data.session.access_token, refresh_token: data.session.refresh_token, expires_in: data.session.expires_in });
  } catch {
    return response({ error: 'Invalid credentials' }, 401);
  }
});