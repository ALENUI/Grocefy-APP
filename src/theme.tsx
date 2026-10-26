import { router, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme, View } from 'react-native';
import { readThemePreference, saveThemePreference, ThemePreference } from './themePreference';
import { applyColorScheme, ColorScheme, colorScheme, palette } from './ui';
import { redrawWidget } from './widget';

export type { ThemePreference } from './themePreference';
const Context = createContext<{ preference: ThemePreference; scheme: ColorScheme; setPreference: (preference: ThemePreference) => void } | undefined>(undefined);

/** Light, dark, or following the phone. The choice is kept on this phone. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    readThemePreference().then(setPreferenceState).finally(() => setLoaded(true));
  }, []);
  const scheme: ColorScheme = preference === 'system' ? (system === 'dark' ? 'dark' : 'light') : preference;
  // Before anything below renders, so every screen reads the right colors.
  if (scheme !== colorScheme) applyColorScheme(scheme);
  // The home-screen widget follows the same choice.
  const setPreference = (next: ThemePreference) => { setPreferenceState(next); saveThemePreference(next).then(redrawWidget); };
  // A moment's wait for the saved choice avoids flashing the other theme at startup.
  if (!loaded) return null;
  return <Context.Provider value={{ preference, scheme, setPreference }}>{children}</Context.Provider>;
}

export function useTheme() {
  const value = useContext(Context);
  if (!value) throw new Error('useTheme must be used inside ThemeProvider');
  return value;
}

/**
 * Screens read colors while rendering, so a theme change remounts them, then returns to the screen that was open
 * (the Settings tab, where the theme is changed). Sessions, offline changes, and cached data live above and are kept.
 */
export function Themed({ children }: { children: React.ReactNode }) {
  const { scheme } = useTheme();
  const pathname = usePathname();
  const [shown, setShown] = useState(scheme);
  const [returnTo, setReturnTo] = useState<string | null>(null);
  if (shown !== scheme) { setShown(scheme); setReturnTo(pathname); }
  useEffect(() => {
    if (!returnTo) return;
    // After the remount, once the navigator is back.
    const timer = setTimeout(() => { setReturnTo(null); if (returnTo !== '/') router.replace(returnTo as never); }, 0);
    return () => clearTimeout(timer);
  }, [returnTo]);
  return <View key={scheme} style={{ flex: 1, backgroundColor: palette.cream }}><StatusBar style={scheme === 'dark' ? 'light' : 'dark'}/>{children}</View>;
}
