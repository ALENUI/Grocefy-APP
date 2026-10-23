import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
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
// Downloaded installers live in the cache as grocefy-<build>.apk and are deleted at the next launch.
const apkPrefix = 'grocefy-';
// A direct APK link is installed in the app; anything else (the Expo build page) opens in the browser.
const isApkUrl = (url: string) => /\.apk(\?|$)/i.test(url);
const FLAG_GRANT_READ_URI_PERMISSION = 1;

/** Downloads the APK, reporting progress (0..1), then opens Android's installer for it. */
async function downloadAndInstall(release: AppRelease, onProgress: (fraction: number) => void) {
  const target = `${FileSystem.cacheDirectory}${apkPrefix}${release.build_number}.apk`;
  await FileSystem.deleteAsync(target, { idempotent: true });
  const task = FileSystem.createDownloadResumable(release.download_url, target, {}, ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
    if (totalBytesExpectedToWrite > 0) onProgress(totalBytesWritten / totalBytesExpectedToWrite);
  });
  const result = await task.downloadAsync();
  if (!result || result.status !== 200) throw new Error(`Download failed (${result?.status ?? 'no response'})`);
  // The installer reads the file through a content:// link this app grants it access to.
  const contentUri = await FileSystem.getContentUriAsync(result.uri);
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', { data: contentUri, type: 'application/vnd.android.package-archive', flags: FLAG_GRANT_READ_URI_PERMISSION });
}

async function deleteOldInstallers() {
  if (!FileSystem.cacheDirectory) return;
  const names = await FileSystem.readDirectoryAsync(FileSystem.cacheDirectory);
  await Promise.all(names.filter((name) => name.startsWith(apkPrefix) && name.endsWith('.apk'))
    .map((name) => FileSystem.deleteAsync(`${FileSystem.cacheDirectory}${name}`, { idempotent: true })));
}

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
  // null when idle; 0..1 while the new version downloads.
  const [progress, setProgress] = useState<number | null>(null);
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
    deleteOldInstallers().catch(() => undefined);
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') autoCheck(); });
    return () => subscription.remove();
  }, [check]);

  const later = () => {
    setOpen(false);
    if (available) AsyncStorage.setItem(snoozeKey, JSON.stringify({ build: available.build_number, at: Date.now() })).catch(() => undefined);
  };
  const openInBrowser = (release: AppRelease) => Linking.openURL(release.download_url).catch(() => Alert.alert('Could not open the download', 'Check your connection and try again.'));
  // The APK downloads inside the app and Android's installer opens on it; the user confirms with Install (Android
  // never lets an app replace itself silently). It installs over this version: same signing key, data kept.
  // Without a direct APK link (or if the download fails) the download page opens in the browser instead.
  const install = async () => {
    if (!available) return;
    if (!isApkUrl(available.download_url)) { setOpen(false); openInBrowser(available); return; }
    setProgress(0);
    try {
      await downloadAndInstall(available, setProgress);
      setOpen(false);
    } catch {
      Alert.alert('Could not download the update', 'Check your connection and try again, or download it in your browser.', [
        { text: 'Cancel', style: 'cancel' }, { text: 'Open in browser', onPress: () => { setOpen(false); openInBrowser(available); } }]);
    } finally { setProgress(null); }
  };
  const downloading = progress !== null;

  return <AppUpdateContext.Provider value={{ available, check, prompt: () => setOpen(true) }}>
    {children}
    <Sheet visible={open && !!available} title="Update available" subtitle={available ? `Version ${available.version} (build ${available.build_number}) is ready. You have ${installedVersionLabel}.` : undefined} onClose={later}>
      {available?.notes && <View style={{ backgroundColor: palette.pale, padding: 12, borderRadius: 11 }}>
        <Text style={{ color: palette.green, fontWeight: '800', marginBottom: 4 }}>{"What's new"}</Text>
        <Text style={{ color: palette.ink, lineHeight: 20 }}>{available.notes}</Text></View>}
      <Text style={{ color: palette.muted, lineHeight: 20 }}>The new version downloads, then Android asks you to install it. Your lists and account stay as they are. The first time, Android may ask you to allow Grocefy to install updates.</Text>
      {downloading && <View style={{ gap: 6 }}>
        <View style={{ height: 8, backgroundColor: palette.pale, borderRadius: 4, overflow: 'hidden' }}><View style={{ height: 8, width: `${Math.round(progress * 100)}%`, backgroundColor: palette.green }}/></View>
        <Text style={{ color: palette.muted, fontSize: 13 }}>Downloading… {Math.round(progress * 100)}%</Text></View>}
      <Button label={downloading ? 'Downloading…' : 'Update now'} icon="cloud-download-outline" onPress={install} loading={downloading}/>
      <Button label="Later" variant="soft" onPress={later} disabled={downloading}/>
    </Sheet>
  </AppUpdateContext.Provider>;
}
