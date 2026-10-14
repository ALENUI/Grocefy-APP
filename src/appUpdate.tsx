import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Linking, Platform, Text, View } from 'react-native';
import { AppRelease, fetchLatestRelease } from './services/releases';
import { isSupabaseConfigured } from './services/supabase';
import { Button, palette, Sheet } from './ui';

// New builds are offered to installed Android APKs. Expo Go and development builds update through Metro instead.
const installedBuild = Number(Application.nativeBuildVersion);
export const updatesSupported = Platform.OS === 'android' && !__DEV__ && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient
  && Number.isInteger(installedBuild) && installedBuild > 0 && isSupabaseConfigured();
export const installedVersionLabel = `${Application.nativeApplicationVersion ?? '?'} (build ${Application.nativeBuildVersion ?? '?'})`;

// Automatic checks run at launch and when the app returns to the foreground, at most this often.
const checkEveryMs = 30 * 60 * 1000;
// "Later" hides the prompt for that build for a day; Settings still shows it.
const snoozeMs = 24 * 60 * 60 * 1000;
const snoozeKey = 'grocefy:update-snoozed';

/** The newer build found, null when this build is the latest, or 'failed' when the check could not run. */
type CheckResult = AppRelease | null | 'failed';
type AppUpdate = { available: AppRelease | null; check: () => Promise<CheckResult>; prompt: () => void };
const AppUpdateContext = createContext<AppUpdate>({ available: null, check: async () => null, prompt: () => undefined });
export const useAppUpdate = () => useContext(AppUpdateContext);

async function isSnoozed(build: number) {
  try {
    const raw = await AsyncStorage.getItem(snoozeKey);
    const snooze = raw ? JSON.parse(raw) as { build: number; at: number } : null;
    return !!snooze && snooze.build === build && Date.now() - snooze.at < snoozeMs;
  } catch { return false; }
}

/** Checks for a newer published build and asks the user to install it. */
export function AppUpdateProvider({ children }: { children: React.ReactNode }) {
  const [available, setAvailable] = useState<AppRelease | null>(null);
  const [open, setOpen] = useState(false);
  const lastCheck = useRef(0);

  const check = useCallback(async (): Promise<CheckResult> => {
    if (!updatesSupported) return null;
    try {
      const latest = await fetchLatestRelease('android');
      lastCheck.current = Date.now(); // only successful checks wait; an offline launch retries on the next foreground
      const newer = latest && latest.build_number > installedBuild ? latest : null;
      setAvailable(newer);
      return newer;
    } catch { return 'failed'; }
  }, []);

  useEffect(() => {
    if (!updatesSupported) return;
    const autoCheck = async () => {
      if (Date.now() - lastCheck.current < checkEveryMs) return;
      const newer = await check();
      if (newer && newer !== 'failed' && !(await isSnoozed(newer.build_number))) setOpen(true);
    };
    autoCheck();
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') autoCheck(); });
    return () => subscription.remove();
  }, [check]);

  const later = () => {
    setOpen(false);
    if (available) AsyncStorage.setItem(snoozeKey, JSON.stringify({ build: available.build_number, at: Date.now() })).catch(() => undefined);
  };
  // Android downloads the APK in the browser, then asks to install it over this version (same signing key, data kept).
  const install = () => {
    if (!available) return;
    setOpen(false);
    Linking.openURL(available.download_url).catch(() => Alert.alert('Could not open the download', 'Check your connection and try again.'));
  };

  return <AppUpdateContext.Provider value={{ available, check, prompt: () => setOpen(true) }}>
    {children}
    <Sheet visible={open && !!available} title="Update available" subtitle={available ? `Version ${available.version} (build ${available.build_number}) is ready. You have ${installedVersionLabel}.` : undefined} onClose={later}>
      {available?.notes && <View style={{ backgroundColor: palette.pale, padding: 12, borderRadius: 11 }}>
        <Text style={{ color: palette.green, fontWeight: '800', marginBottom: 4 }}>{"What's new"}</Text>
        <Text style={{ color: palette.ink, lineHeight: 20 }}>{available.notes}</Text></View>}
      <Text style={{ color: palette.muted, lineHeight: 20 }}>The new version downloads, then Android asks you to install it. Your lists and account stay as they are.</Text>
      <Button label="Update now" icon="cloud-download-outline" onPress={install}/>
      <Button label="Later" variant="soft" onPress={later}/>
    </Sheet>
  </AppUpdateContext.Provider>;
}
