import { router, Stack, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionProvider, useSession } from '@/src/session';
import { Loading, palette, styles } from '@/src/ui';

// Screens reachable while signed out. reset-password stays reachable after its email link signs the user in.
const publicScreens = ['sign-in', 'sign-up', 'forgot-password', 'auth-callback', 'reset-password'];

function AuthGate() {
  const { status } = useSession();
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
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.cream } }}>
    <Stack.Screen name="(auth)"/><Stack.Screen name="(tabs)"/>
    <Stack.Screen name="create-list" options={{ presentation: 'modal' }}/>
  </Stack>;
}

export default function Layout() {
  return <SafeAreaProvider><SessionProvider><StatusBar style="dark"/><AuthGate/></SessionProvider></SafeAreaProvider>;
}
