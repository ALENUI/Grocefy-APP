import { Stack } from 'expo-router';
import { palette } from '@/src/ui';

export default function AuthLayout() { return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.cream } }}/>; }
