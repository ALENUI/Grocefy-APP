import { unwrap } from './errors';
import { getSupabaseClient, Tables } from './supabase';

export type Currency = Tables<'currencies'>;
export type UserSettings = Tables<'user_settings'>;
export type Profile = Tables<'profiles'>;

/** Active ISO 4217 currencies from the server registry. */
export async function fetchCurrencies(): Promise<Currency[]> {
  return unwrap(await getSupabaseClient().from('currencies').select('*').order('code'));
}

export async function fetchProfile(userId: string): Promise<Profile> {
  return unwrap(await getSupabaseClient().from('profiles').select('*').eq('id', userId).single());
}

export async function updateProfile(userId: string, changes: Partial<Pick<Profile, 'display_name' | 'username' | 'avatar_url'>>): Promise<Profile> {
  return unwrap(await getSupabaseClient().from('profiles').update(changes).eq('id', userId).select('*').single());
}

export async function fetchSettings(userId: string): Promise<UserSettings> {
  return unwrap(await getSupabaseClient().from('user_settings').select('*').eq('user_id', userId).single());
}

/** Applies to new lists only; existing lists and purchases keep their own currency. */
export async function setDefaultCurrency(userId: string, currencyCode: string): Promise<UserSettings> {
  return unwrap(await getSupabaseClient().from('user_settings').update({ default_currency: currencyCode }).eq('user_id', userId).select('*').single());
}

/** IANA timezone used for monthly report boundaries. */
export async function setTimezone(userId: string, timezone: string): Promise<UserSettings> {
  return unwrap(await getSupabaseClient().from('user_settings').update({ timezone }).eq('user_id', userId).select('*').single());
}
