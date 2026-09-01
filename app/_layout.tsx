import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GrocefyProvider } from '@/src/store';
export default function Layout() { return <GrocefyProvider><StatusBar style="dark"/><Stack screenOptions={{ headerShown: false }}><Stack.Screen name="(tabs)"/><Stack.Screen name="list/[id]" options={{ presentation: 'card' }}/><Stack.Screen name="create-list" options={{ presentation: 'modal' }}/></Stack></GrocefyProvider>; }
