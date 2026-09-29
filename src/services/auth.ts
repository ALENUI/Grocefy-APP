import { ServiceError, toServiceError, unwrap } from './errors';
import { getSupabaseClient } from './supabase';

export type SignUpInput = { email: string; password: string; username: string; displayName?: string; defaultCurrency: string };

/** The signup trigger creates the profile and settings from this metadata; the currency falls back to XAF if unknown. */
export async function signUp({ email, password, username, displayName, defaultCurrency }: SignUpInput) {
  if (!(await isUsernameAvailable(username))) throw new ServiceError('USERNAME_TAKEN', 'That username is already taken.');
  const { data, error } = await getSupabaseClient().auth.signUp({
    email, password, options: { data: { username, display_name: displayName ?? username, default_currency: defaultCurrency } }
  });
  if (error) throw toServiceError(error);
  return data;
}

export async function signIn(email: string, password: string) {
  const { data, error } = await getSupabaseClient().auth.signInWithPassword({ email, password });
  if (error) throw new ServiceError('UNAUTHORIZED', error.message);
  return data;
}

export async function signOut() {
  const { error } = await getSupabaseClient().auth.signOut();
  if (error) throw toServiceError(error);
}

export async function requestPasswordReset(email: string, redirectTo?: string) {
  const { error } = await getSupabaseClient().auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw toServiceError(error);
}

export async function isUsernameAvailable(username: string): Promise<boolean> {
  return unwrap(await getSupabaseClient().rpc('is_username_available', { candidate: username }));
}
