import { unwrap } from './errors';
import { getSupabaseClient, Tables } from './supabase';

export type Currency = Tables<'currencies'>;
export type UserSettings = Tables<'user_settings'>;

/** Active ISO 4217 currencies from the server registry. */
export async function fetchCurrencies(): Promise<Currency[]> {
  return unwrap(await getSupabaseClient().from('currencies').select('*').order('code'));
}

export async function fetchSettings(): Promise<UserSettings> {
  return unwrap(await getSupabaseClient().from('user_settings').select('*').single());
}

/** Applies to new lists only; existing lists and purchases keep their own currency. */
export async function setDefaultCurrency(userId: string, currencyCode: string): Promise<UserSettings> {
  return unwrap(await getSupabaseClient().from('user_settings').update({ default_currency: currencyCode }).eq('user_id', userId).select('*').single());
}
