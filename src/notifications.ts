import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { registerPushToken, unregisterPushToken } from './services/push';

const tokenKey = 'grocefy:push-token';

// Show notifications while the app is open too; the list itself also updates live.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: false, shouldSetBadge: false })
});

export type RegistrationResult = 'registered' | 'denied' | 'unsupported' | 'not-configured';

const projectId = () => (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ?? Constants.easConfig?.projectId;

/**
 * Registers this phone for push notifications. With `ask`, the system permission prompt is shown if needed;
 * without it (e.g. at sign-in), registration only happens when permission was already granted.
 */
export async function registerDevice({ ask }: { ask: boolean }): Promise<RegistrationResult> {
  if (!Device.isDevice || (Platform.OS !== 'ios' && Platform.OS !== 'android')) return 'unsupported';
  if (!projectId()) return 'not-configured';
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

const openTarget = (response: Notifications.NotificationResponse | null) => {
  const url = response?.notification.request.content.data?.url;
  if (typeof url === 'string' && url.startsWith('/')) router.push(url as never);
};

/** Opens the screen a tapped notification refers to, including the one that launched the app. */
export function useNotificationRouting(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    Notifications.getLastNotificationResponseAsync().then(openTarget).catch(() => undefined);
    const subscription = Notifications.addNotificationResponseReceivedListener(openTarget);
    return () => subscription.remove();
  }, [enabled]);
}
