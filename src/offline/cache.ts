import AsyncStorage from '@react-native-async-storage/async-storage';

// Last-known server data per signed-in user, shown when the device is offline. Cleared on sign-out so another
// person using the phone never sees the previous user's lists.
let owner: string | null = null;
const prefix = (user: string) => `grocefy:cache:${user}:`;

export function setCacheOwner(userId: string | null) { owner = userId; }

export async function readCache<T>(key: string): Promise<{ value: T; savedAt: string } | null> {
  if (!owner) return null;
  try {
    const raw = await AsyncStorage.getItem(prefix(owner) + key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export async function writeCache<T>(key: string, value: T): Promise<void> {
  if (!owner) return;
  try { await AsyncStorage.setItem(prefix(owner) + key, JSON.stringify({ value, savedAt: new Date().toISOString() })); } catch { /* caching is best-effort */ }
}

export async function clearCache(userId: string): Promise<void> {
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(prefix(userId)));
    if (keys.length) await AsyncStorage.multiRemove(keys);
  } catch { /* best-effort */ }
}
