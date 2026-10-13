import AsyncStorage from '@react-native-async-storage/async-storage';
import { isRunningInExpoGo } from 'expo';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import type * as NotificationsModule from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { registerPushToken, unregisterPushToken } from './services/push';

const tokenKey = 'grocefy:push-token';

/**
 * Push needs a development or production build on Android: since SDK 55, merely importing expo-notifications in Expo
 * Go on Android throws. The module is therefore never imported at the top level; it is loaded on first use, and only
 * where push can work. Everywhere else every function here is a safe no-op.
 */
export const pushSupportedHere = !(Platform.OS === 'android' && isRunningInExpoGo());

let notifications: typeof NotificationsModule | null | undefined;
function loadNotifications(): typeof NotificationsModule | null {
  if (notifications !== undefined) return notifications;
  notifications = null;
  if (!pushSupportedHere) return notifications;
  try {
    // A lazy require keeps the module out of app start-up (see pushSupportedHere).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const loaded: typeof NotificationsModule = require('expo-notifications');
    // Show notifications while the app is open too; the list itself also updates live.
    loaded.setNotificationHandler({
      handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false })
    });
    notifications = loaded;
  } catch {
    notifications = null;
  }
  return notifications;
}

export type RegistrationResult = 'registered' | 'denied' | 'unsupported' | 'expo-go' | 'not-configured';

const projectId = () => (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ?? Constants.easConfig?.projectId;

/**
 * Registers this phone for push notifications. With `ask`, the system permission prompt is shown if needed;
 * without it (e.g. at sign-in), registration only happens when permission was already granted.
 */
export async function registerDevice({ ask }: { ask: boolean }): Promise<RegistrationResult> {
  if (!pushSupportedHere) return 'expo-go';
  if (!Device.isDevice || (Platform.OS !== 'ios' && Platform.OS !== 'android')) return 'unsupported';
  if (!projectId()) return 'not-configured';
  const Notifications = loadNotifications();
  if (!Notifications) return 'unsupported';
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', { name: 'Grocefy', importance: Notifications.AndroidImportance.DEFAULT });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted' && ask) status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return 'denied';
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: projectId() });
  await registerPushToken(token, Platform.OS);
  await AsyncStorage.setItem(tokenKey, token);
  return 'registered';
}

/** Stops pushes to this phone (call before signing out, while still authenticated). */
export async function unregisterDevice(): Promise<void> {
  const token = await AsyncStorage.getItem(tokenKey);
  if (!token) return;
  await unregisterPushToken(token);
  await AsyncStorage.removeItem(tokenKey);
}

/** The system permission state, or null where push is unavailable (e.g. Expo Go on Android). */
export async function pushPermissionStatus(): Promise<'granted' | 'denied' | 'undetermined' | null> {
  const Notifications = loadNotifications();
  if (!Notifications) return null;
  return (await Notifications.getPermissionsAsync()).status as 'granted' | 'denied' | 'undetermined';
}

const openTarget = (response: NotificationsModule.NotificationResponse | null) => {
  const url = response?.notification.request.content.data?.url;
  if (typeof url === 'string' && url.startsWith('/')) router.push(url as never);
};

/** Opens the screen a tapped notification refers to, including the one that launched the app. */
export function useNotificationRouting(enabled: boolean) {
  useEffect(() => {
    const Notifications = enabled ? loadNotifications() : null;
    if (!Notifications) return;
    Notifications.getLastNotificationResponseAsync().then(openTarget).catch(() => undefined);
    const subscription = Notifications.addNotificationResponseReceivedListener(openTarget);
    return () => subscription.remove();
  }, [enabled]);
}
