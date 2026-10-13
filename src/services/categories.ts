import { unwrap } from './errors';
import { getSupabaseClient, Tables } from './supabase';

export type Category = Tables<'categories'>;

/** Default categories plus the caller's own active custom categories, defaults first. */
export async function fetchCategories(userId: string): Promise<Category[]> {
  const rows = unwrap(await getSupabaseClient().from('categories').select('*').is('archived_at', null).order('name'));
  return rows.filter((category) => category.is_default || category.user_id === userId)
    .sort((a, b) => Number(b.is_default) - Number(a.is_default) || a.name.localeCompare(b.name));
}

/** Re-adding the name of an archived category restores it, keeping one category (and its history) per name. */
export async function createCategory(userId: string, name: string): Promise<Category> {
  const client = getSupabaseClient();
  const [archived] = unwrap(await client.from('categories').select('*').eq('user_id', userId).eq('name', name.trim()).not('archived_at', 'is', null).limit(1));
  if (archived) return unwrap(await client.from('categories').update({ archived_at: null }).eq('id', archived.id).select('*').single());
  return unwrap(await client.from('categories').insert({ user_id: userId, name: name.trim(), is_default: false }).select('*').single());
}

/** Only the creator can rename a custom category. Finalized monthly reports keep the name they were issued with. */
export async function renameCategory(categoryId: string, name: string): Promise<Category> {
  return unwrap(await getSupabaseClient().from('categories').update({ name: name.trim() }).eq('id', categoryId).select('*').single());
}

/** Hides the category from pickers; items, purchases, and reports that use it are unchanged. */
export async function archiveCategory(categoryId: string): Promise<void> {
  unwrap(await getSupabaseClient().from('categories').update({ archived_at: new Date().toISOString() }).eq('id', categoryId).select('id').single());
}
