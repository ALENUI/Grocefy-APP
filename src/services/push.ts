import { unwrap } from './errors';
import { getSupabaseClient, Tables } from './supabase';

/** Registers this device's Expo push token for the signed-in user (moving it if another user had it). */
export async function registerPushToken(token: string, platform: 'ios' | 'android'): Promise<void> {
  const { error } = await getSupabaseClient().rpc('register_push_token', { token, platform });
  if (error) unwrap({ data: null, error });
}

export async function unregisterPushToken(token: string): Promise<void> {
  const { error } = await getSupabaseClient().rpc('unregister_push_token', { token });
  if (error) unwrap({ data: null, error });
}

/** Turns all pushes on or off for the user (every device). */
export async function setPushNotifications(userId: string, enabled: boolean): Promise<Tables<'user_settings'>> {
  return unwrap(await getSupabaseClient().from('user_settings').update({ push_notifications: enabled }).eq('user_id', userId).select('*').single());
}
