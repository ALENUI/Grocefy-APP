import { Stack } from 'expo-router';
import { palette } from '@/src/ui';

// Signed-out starts land on sign-in, not on the first file alphabetically (auth-callback).
export const unstable_settings = { initialRouteName: 'sign-in' };

export default function AuthLayout() { return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.cream } }}/>; }
