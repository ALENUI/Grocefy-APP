import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';
import { Database } from './database.types';

export type GrocefyClient = SupabaseClient<Database>;
export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];
export type Views<T extends keyof Database['public']['Views']> = Database['public']['Views'][T]['Row'];
export type MemberRoleWithOwner = Database['public']['Enums']['member_role'];

let client: GrocefyClient | undefined;

export const isSupabaseConfigured = () => Boolean(process.env.EXPO_PUBLIC_SUPABASE_URL && process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

/**
 * Creates the authenticated client only when safe public configuration is present.
 * Server-role credentials must never appear in this application.
 */
export function getSupabaseClient(): GrocefyClient {
  if (client) return client;
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error('Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.');
  // PKCE lets email links (confirmation, password reset) return to the app as grocefy://…?code=…
  const created = createClient<Database>(url, anonKey, {
    auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false, flowType: 'pkce' }
  });
  // Refresh tokens only while the app is in the foreground, as recommended for React Native.
  AppState.addEventListener('change', (state) => { if (state === 'active') created.auth.startAutoRefresh(); else created.auth.stopAutoRefresh(); });
  client = created;
  return client;
}
