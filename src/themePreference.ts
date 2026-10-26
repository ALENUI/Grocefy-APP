import AsyncStorage from '@react-native-async-storage/async-storage';

/** Light, dark, or following the phone. Kept on this phone; read by the app (src/theme.tsx) and the widget. */
export type ThemePreference = 'system' | 'light' | 'dark';
const storageKey = 'grocefy:theme';

export async function readThemePreference(): Promise<ThemePreference> {
  try {
    const saved = await AsyncStorage.getItem(storageKey);
    return saved === 'light' || saved === 'dark' ? saved : 'system';
  } catch { return 'system'; }
}

export async function saveThemePreference(preference: ThemePreference): Promise<void> {
  try { await AsyncStorage.setItem(storageKey, preference); } catch { /* the choice still applies until restart */ }
}
