import { Ionicons } from '@expo/vector-icons';
import { theme } from '@syncrolly/config';
import { Tabs } from 'expo-router';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        sceneStyle: {
          backgroundColor: theme.colors.background
        },
        tabBarActiveTintColor: theme.colors.primaryStrong,
        tabBarInactiveTintColor: '#6b7280',
        tabBarStyle: {
          height: 80,
          paddingTop: 8,
          paddingBottom: 14,
          paddingHorizontal: 24,
          backgroundColor: 'rgba(255,255,255,0.92)',
          borderTopColor: '#eef1f5',
          borderTopWidth: 1
        },
        tabBarItemStyle: {
          borderRadius: 12
        },
        tabBarActiveBackgroundColor: '#eff4ff',
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '500'
        },
        tabBarIcon: ({ color, focused, size }) => {
          const iconName = (() => {
            if (route.name === 'clients') return 'grid';
            if (route.name === 'index') return focused ? 'chatbubble' : 'chatbubble-outline';
            if (route.name === 'content') return focused ? 'bar-chart' : 'bar-chart-outline';
            return focused ? 'person' : 'person-outline';
          })();

          return <Ionicons name={iconName} size={size ?? 20} color={color} />;
        }
      })}
    >
      <Tabs.Screen name="clients" options={{ title: 'Feed' }} />
      <Tabs.Screen name="index" options={{ title: 'Inbox' }} />
      <Tabs.Screen name="content" options={{ title: 'Stats' }} />
      <Tabs.Screen name="settings" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
