import AsyncStorage from '@react-native-async-storage/async-storage';

// Last-known server data per signed-in user: shown instantly when a screen opens (then refreshed in the background)
// and whenever the device is offline. Kept in memory and on the device; cleared on sign-out so another person using
// the phone never sees the previous user's lists.
type Entry<T> = { value: T; savedAt: string };
let owner: string | null = null;
const memory = new Map<string, Entry<unknown>>();
const prefix = (user: string) => `grocefy:cache:${user}:`;

export function setCacheOwner(userId: string | null) {
  if (userId !== owner) memory.clear();
  owner = userId;
}

/** Loads all of the user's saved data into memory in one read, so screens can render it on their first frame. */
export async function preloadCache(userId: string): Promise<void> {
  setCacheOwner(userId);
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(prefix(userId)));
    const rows = keys.length ? await AsyncStorage.multiGet(keys) : [];
    if (owner !== userId) return; // signed out meanwhile
    for (const [key, raw] of rows) {
      if (!raw) continue;
      try { memory.set(key.slice(prefix(userId).length), JSON.parse(raw)); } catch { /* skip a damaged entry */ }
    }
  } catch { /* the cache is best-effort */ }
}

/** The saved copy, if it is already in memory (synchronous). */
export function peekCache<T>(key: string): Entry<T> | null {
  return owner ? (memory.get(key) as Entry<T> | undefined) ?? null : null;
}

export async function readCache<T>(key: string): Promise<Entry<T> | null> {
  if (!owner) return null;
  const cached = peekCache<T>(key);
  if (cached) return cached;
  try {
    const raw = await AsyncStorage.getItem(prefix(owner) + key);
    const entry = raw ? JSON.parse(raw) as Entry<T> : null;
    if (entry) memory.set(key, entry);
    return entry;
  } catch { return null; }
}

export async function writeCache<T>(key: string, value: T): Promise<void> {
  if (!owner || value === undefined) return;
  const entry = { value, savedAt: new Date().toISOString() };
  memory.set(key, entry);
  try { await AsyncStorage.setItem(prefix(owner) + key, JSON.stringify(entry)); } catch { /* caching is best-effort */ }
}

export async function clearCache(userId: string): Promise<void> {
  if (owner === userId || owner === null) memory.clear();
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(prefix(userId)));
    if (keys.length) await AsyncStorage.multiRemove(keys);
  } catch { /* best-effort */ }
}
