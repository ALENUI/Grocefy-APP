import { unwrap } from './errors';
import { getSupabaseClient, Tables } from './supabase';

export type Category = Tables<'categories'>;

/** Default categories plus the caller's own active custom categories, defaults first. */
export async function fetchCategories(userId: string): Promise<Category[]> {
  const rows = unwrap(await getSupabaseClient().from('categories').select('*').is('archived_at', null).order('name'));
  return rows.filter((category) => category.is_default || category.user_id === userId)
    .sort((a, b) => Number(b.is_default) - Number(a.is_default) || a.name.localeCompare(b.name));
}

export async function createCategory(userId: string, name: string): Promise<Category> {
  return unwrap(await getSupabaseClient().from('categories').insert({ user_id: userId, name: name.trim(), is_default: false }).select('*').single());
}
