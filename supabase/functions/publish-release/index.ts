// Records a finished app build in public.app_releases so installed apps can offer it as an update.
// Called by the EAS workflow (.eas/workflows/build-android-on-main.yml) after each Android build, with the
// x-release-secret header.
//
// Secrets (supabase secrets set …):
//   RELEASE_PUBLISH_SECRET  shared with the EAS "preview" environment (same name there, secret visibility)
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the Edge Runtime.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { parseRelease } from '../_shared/release.ts';
import { secretMatches } from '../_shared/worker-auth.ts';

const env = (name: string) => Deno.env.get(name) ?? undefined;

Deno.serve(async (request) => {
  const secret = env('RELEASE_PUBLISH_SECRET');
  if (!secret) return Response.json({ error: 'RELEASE_PUBLISH_SECRET is not configured' }, { status: 500 });
  if (request.method !== 'POST' || !secretMatches(request.headers.get('x-release-secret'), secret)) return Response.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const release = parseRelease(await request.json().catch(() => ({})));
  if (!release) return Response.json({ error: 'VALIDATION_ERROR' }, { status: 400 });
  const client = createClient(env('SUPABASE_URL')!, env('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
  // Re-running the workflow for the same build replaces its row instead of failing.
  const { error } = await client.from('app_releases').upsert(release, { onConflict: 'platform,build_number' });
  if (error) {
    console.error('[publish-release] failed:', error.message);
    return Response.json({ error: 'PUBLISH_FAILED' }, { status: 500 });
  }
  return Response.json({ published: release });
});
