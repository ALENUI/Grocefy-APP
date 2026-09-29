// Delivers queued transactional emails (invitations, monthly reports) from public.email_outbox.
// Invoked every minute by pg_cron (see migration 20260929130000_email_outbox.sql) with the x-worker-secret header.
//
// Secrets (supabase secrets set …):
//   EMAIL_WORKER_SECRET  shared secret required on every request
//   EMAIL_PROVIDER       "resend" (default when RESEND_API_KEY is set) or "log" for development
//   RESEND_API_KEY, EMAIL_FROM   e.g. EMAIL_FROM="Grocefy <notifications@your-domain>"
//   APP_URL              link target in emails (default grocefy://)
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the Edge Runtime.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { createProvider } from '../_shared/email/providers.ts';
import { createSupabaseStore, ServiceClient } from '../_shared/email/supabase-store.ts';
import { processOutbox } from '../_shared/email/worker.ts';

const env = (name: string) => Deno.env.get(name) ?? undefined;

// Constant-time comparison so the secret cannot be recovered through response timing.
function secretMatches(provided: string | null, expected: string): boolean {
  if (provided === null) return false;
  const a = new TextEncoder().encode(provided);
  const b = new TextEncoder().encode(expected);
  let difference = a.length ^ b.length;
  for (let index = 0; index < b.length; index++) difference |= (a[index] ?? 0) ^ b[index];
  return difference === 0;
}

Deno.serve(async (request) => {
  const secret = env('EMAIL_WORKER_SECRET');
  if (!secret) return Response.json({ error: 'EMAIL_WORKER_SECRET is not configured' }, { status: 500 });
  if (request.method !== 'POST' || !secretMatches(request.headers.get('x-worker-secret'), secret)) return Response.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  try {
    const client = createClient(env('SUPABASE_URL')!, env('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
    const provider = createProvider({ EMAIL_PROVIDER: env('EMAIL_PROVIDER'), RESEND_API_KEY: env('RESEND_API_KEY'), EMAIL_FROM: env('EMAIL_FROM') });
    const result = await processOutbox(createSupabaseStore(client as unknown as ServiceClient), provider, { appUrl: env('APP_URL') ?? 'grocefy://' });
    return Response.json({ provider: provider.name, ...result });
  } catch (error) {
    console.error('[send-emails] batch failed:', error instanceof Error ? error.message : error);
    return Response.json({ error: 'WORKER_FAILED' }, { status: 500 });
  }
});
