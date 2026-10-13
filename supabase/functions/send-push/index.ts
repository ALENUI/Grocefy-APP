// Delivers queued push notifications from public.push_outbox through Expo's push service.
// Invoked every minute by pg_cron (see migration 20261005090000_push_notifications.sql) with the x-worker-secret header.
//
// Secrets (supabase secrets set …):
//   EMAIL_WORKER_SECRET  the shared worker secret (also used by send-emails)
//   PUSH_PROVIDER        "expo" (default) or "log" for development
//   EXPO_ACCESS_TOKEN    optional; required only if enhanced push security is enabled for the Expo project
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the Edge Runtime.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { createPushProvider } from '../_shared/push/providers.ts';
import { createSupabasePushStore, processPushOutbox, PushServiceClient } from '../_shared/push/worker.ts';
import { rejectUnauthorized } from '../_shared/worker-auth.ts';

const env = (name: string) => Deno.env.get(name) ?? undefined;

Deno.serve(async (request) => {
  const rejected = rejectUnauthorized(request, env('EMAIL_WORKER_SECRET'));
  if (rejected) return rejected;
  try {
    const client = createClient(env('SUPABASE_URL')!, env('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
    const provider = createPushProvider({ PUSH_PROVIDER: env('PUSH_PROVIDER'), EXPO_ACCESS_TOKEN: env('EXPO_ACCESS_TOKEN') });
    const result = await processPushOutbox(createSupabasePushStore(client as unknown as PushServiceClient), provider);
    return Response.json({ provider: provider.name, ...result });
  } catch (error) {
    console.error('[send-push] batch failed:', error instanceof Error ? error.message : error);
    return Response.json({ error: 'WORKER_FAILED' }, { status: 500 });
  }
});
