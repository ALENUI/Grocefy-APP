import { ErrorBoundaryProps, router, Stack, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppUpdateProvider } from '@/src/appUpdate';
import { registerDevice, useNotificationRouting } from '@/src/notifications';
import { OfflineBanner } from '@/src/offline/OfflineBanner';
import { OfflineProvider } from '@/src/offline/OfflineProvider';
import { SessionProvider, useSession } from '@/src/session';
import { Button, Loading, palette, styles } from '@/src/ui';
import { features } from '@/src/features';
import { setTimezone } from '@/src/services/settings';

// Screens reachable while signed out. reset-password stays reachable after its email link signs the user in.
const publicScreens = ['sign-in', 'sign-up', 'forgot-password', 'auth-callback', 'reset-password'];
// Every other route needs a signed-in user. A route missing here would render unprotected, so keep it in sync with app/.
const protectedScreens = ['categories', 'group/[id]', 'groups', 'inbox', 'list/[id]', 'members', 'prices', 'product/[id]'];

function AuthGate() {
  const { status, settings } = useSession();
  const pushOn = features.pushNotifications && settings?.push_notifications;
  const { userId, refreshAccount } = useSession();
  const timezoneMissing = status === 'signedIn' && !!settings && !settings.timezone;
  useEffect(() => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (timezoneMissing && userId && zone) setTimezone(userId, zone).then(refreshAccount).catch(() => undefined);
  }, [timezoneMissing, userId, refreshAccount]);
  useNotificationRouting(status === 'signedIn');
  // Refresh this phone's push registration after sign-in, without prompting (the prompt is shown from Settings).
  useEffect(() => { if (status === 'signedIn' && pushOn) registerDevice({ ask: false }).catch(() => undefined); }, [status, pushOn]);
  const segments = useSegments() as string[];
  const screen = segments[0] === '(auth)' ? segments[1] : undefined;
  const onPublicScreen = !!screen && publicScreens.includes(screen);

  useEffect(() => {
    if (status === 'signedOut' && !onPublicScreen) router.replace('/sign-in');
    if (status === 'signedIn' && onPublicScreen && screen !== 'reset-password' && screen !== 'auth-callback') router.replace('/');
  }, [status, onPublicScreen, screen]);

  if (status === 'unconfigured') return <View style={[styles.screen, { justifyContent: 'center', padding: 24 }]}><Text style={styles.title}>Grocefy is not configured</Text>
    <Text style={[styles.subtitle, { lineHeight: 21 }]}>Copy .env.example to .env and set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY, then restart Expo.</Text></View>;
  if (status === 'loading') return <View style={[styles.screen, { justifyContent: 'center' }]}><Loading/></View>;
  // Screens behind sign-in are protected, so they never render without a user (they rely on useUserId). Signed out,
  // the router falls back to the (auth) screens; signed in, those stay reachable for the email-link flows.
  return <View style={{ flex: 1 }}><Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.cream } }}>
    <Stack.Protected guard={status === 'signedIn'}>
      <Stack.Screen name="(tabs)"/>
      <Stack.Screen name="create-list" options={{ presentation: 'modal' }}/>
      {protectedScreens.map((name) => <Stack.Screen key={name} name={name}/>)}
    </Stack.Protected>
    <Stack.Screen name="(auth)"/>
  </Stack>{status === 'signedIn' && <OfflineBanner/>}</View>;
}

/** Shown instead of a blank screen if a screen throws while rendering; the session is kept. */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return <View style={[styles.screen, { justifyContent: 'center', padding: 24, gap: 14 }]}>
    <Text style={styles.title}>Something went wrong</Text>
    <Text style={[styles.subtitle, { lineHeight: 21 }]}>This screen hit an unexpected problem. Your lists and purchases are safe.</Text>
    {__DEV__ && <Text style={{ color: palette.red, fontSize: 12 }}>{error.message}</Text>}
    <Button label="Try again" icon="refresh" onPress={retry}/>
    <Button label="Go to my lists" variant="soft" onPress={() => router.replace('/')}/>
  </View>;
}

export default function Layout() {
  return <GestureHandlerRootView style={{ flex: 1 }}><KeyboardProvider><SafeAreaProvider><SessionProvider><OfflineProvider><StatusBar style="dark"/><AppUpdateProvider><AuthGate/></AppUpdateProvider></OfflineProvider></SessionProvider></SafeAreaProvider></KeyboardProvider></GestureHandlerRootView>;
}
