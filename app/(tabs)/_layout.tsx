import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { palette } from '@/src/ui';
const icon = (name: keyof typeof Ionicons.glyphMap) => ({ color, size }: { color: string; size: number }) => <Ionicons name={name} color={color} size={size}/>;
export default function TabsLayout() { return <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: palette.green, tabBarInactiveTintColor: '#87928A', tabBarStyle: { borderTopColor: '#E2E7E1', height: 64, paddingTop: 6 } }}><Tabs.Screen name="index" options={{ title: 'Lists', tabBarIcon: icon('list') }}/><Tabs.Screen name="history" options={{ title: 'History', tabBarIcon: icon('time') }}/><Tabs.Screen name="reports" options={{ title: 'Reports', tabBarIcon: icon('pie-chart') }}/><Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: icon('settings') }}/></Tabs>; }
