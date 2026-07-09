// Ortak HTTP yardımcıları — CORS, JSON yanıt, service-role client, JWT'den uid çözme.
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export function preflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  return null;
}

// Service-role client — RLS'i bypass eder (sunucu otoritesi).
export function getAdmin(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );
}

// invoke çağrısındaki kullanıcı JWT'sinden uid çözer (Authorization: Bearer <jwt>).
export async function resolveUserId(req: Request, admin: SupabaseClient): Promise<string | null> {
  const authHeader = req.headers.get('Authorization') || req.headers.get('authorization') || '';
  if (authHeader.startsWith('Bearer ')) {
    const jwt = authHeader.slice(7);
    const { data } = await admin.auth.getUser(jwt);
    if (data?.user?.id) return data.user.id;
  }
  return null;
}

// Basit bellek-içi rate limit (instance başına).
const lastCall = new Map<string, number>();
export function isRateLimited(key: string, ms = 2000): boolean {
  const now = Date.now();
  const prev = lastCall.get(key) || 0;
  lastCall.set(key, now);
  return now - prev < ms;
}
