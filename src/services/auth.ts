import * as Linking from 'expo-linking';
import { ServiceError, toServiceError, unwrap } from './errors';
import { getSupabaseClient } from './supabase';

export type SignUpInput = { email: string; password: string; username: string; displayName?: string; defaultCurrency: string };

/** Deep link that email links (confirmation, password reset) return to. Must be allow-listed in Supabase Auth → URL Configuration. */
export const authRedirectUrl = (path: 'auth-callback' | 'reset-password') => Linking.createURL(`/${path}`);

/**
 * The signup trigger creates the profile and settings from this metadata; the currency falls back to XAF if unknown.
 * Returns whether a session was created immediately (false when email confirmation is required).
 */
export async function signUp({ email, password, username, displayName, defaultCurrency }: SignUpInput): Promise<{ signedIn: boolean }> {
  if (!(await isUsernameAvailable(username))) throw new ServiceError('USERNAME_TAKEN', 'That username is already taken.');
  const { data, error } = await getSupabaseClient().auth.signUp({
    email: email.trim(), password,
    options: { data: { username, display_name: displayName?.trim() || username, default_currency: defaultCurrency }, emailRedirectTo: authRedirectUrl('auth-callback') }
  });
  if (error) throw toServiceError(error);
  return { signedIn: Boolean(data.session) };
}

export async function signIn(email: string, password: string) {
  const { data, error } = await getSupabaseClient().auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw new ServiceError('UNAUTHORIZED', error.message);
  return data;
}

export async function signOut() {
  const { error } = await getSupabaseClient().auth.signOut();
  if (error) throw toServiceError(error);
}

export async function requestPasswordReset(email: string) {
  const { error } = await getSupabaseClient().auth.resetPasswordForEmail(email.trim(), { redirectTo: authRedirectUrl('reset-password') });
  if (error) throw toServiceError(error);
}

/** Completes an email link (PKCE) by exchanging its one-time code for a session. */
export async function completeEmailLink(code: string) {
  const { error } = await getSupabaseClient().auth.exchangeCodeForSession(code);
  if (error) throw new ServiceError('UNAUTHORIZED', error.message);
}

export async function updatePassword(password: string) {
  const { error } = await getSupabaseClient().auth.updateUser({ password });
  if (error) throw toServiceError(error);
}

export async function isUsernameAvailable(username: string): Promise<boolean> {
  return unwrap(await getSupabaseClient().rpc('is_username_available', { candidate: username }));
}
