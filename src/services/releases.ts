import { unwrap } from './errors';
import { getSupabaseClient, Tables } from './supabase';

export type AppRelease = Tables<'app_releases'>;

/** The newest published build for a platform, or null when none has been published yet. Works signed out. */
export async function fetchLatestRelease(platform: 'ios' | 'android'): Promise<AppRelease | null> {
  return unwrap(await getSupabaseClient().from('app_releases').select('*').eq('platform', platform)
    .order('build_number', { ascending: false }).limit(1).maybeSingle());
}
