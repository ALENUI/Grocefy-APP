import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { ColorValue } from 'react-native';
import { features } from '@/src/features';
import { palette } from '@/src/ui';

const icon = (name: keyof typeof Ionicons.glyphMap) => function TabIcon({ color, size }: { color: ColorValue; size: number }) { return <Ionicons name={name} color={color} size={size}/>; };

// Hidden features keep their routes but lose their tab (href: null).
export default function TabsLayout() {
  return <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: palette.green, tabBarInactiveTintColor: palette.muted, tabBarStyle: { backgroundColor: palette.surface, borderTopColor: palette.line, height: 64, paddingTop: 6 }, sceneStyle: { backgroundColor: palette.cream } }}>
    <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: icon('home-outline') }}/>
    <Tabs.Screen name="lists" options={{ title: 'To buy', tabBarIcon: icon('cart-outline') }}/>
    <Tabs.Screen name="history" options={{ title: 'History', tabBarIcon: icon('time-outline'), href: features.purchaseHistory ? undefined : null }}/>
    <Tabs.Screen name="reports" options={{ title: 'Reports', tabBarIcon: icon('pie-chart-outline'), href: features.financeReports ? undefined : null }}/>
    <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: icon('settings-outline') }}/>
  </Tabs>;
}
