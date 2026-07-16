// app/(tabs)/_layout.tsx
// Four-tab navigator: Discover · Journal · Progress · Settings

import React from 'react';
import { Text } from 'react-native';
import { Tabs } from 'expo-router';
import { useTheme } from '@/src/theme/ThemeContext';

function TabIcon({ emoji, size }: { emoji: string; size: number }) {
  return <Text style={{ fontSize: size * 0.75, lineHeight: size }}>{emoji}</Text>;
}

export default function TabLayout() {
  const { theme } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme.surface,
          borderTopColor: theme.border,
        },
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.textFaint,
        tabBarLabelStyle: { fontFamily: theme.fontBody, fontSize: 11 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Discover', tabBarButtonTestID: 'tab-discover', tabBarIcon: ({ size }) => <TabIcon emoji="🗺" size={size} /> }}
      />
      <Tabs.Screen
        name="journal"
        options={{ title: 'Journal', tabBarButtonTestID: 'tab-journal', tabBarIcon: ({ size }) => <TabIcon emoji="📓" size={size} /> }}
      />
      <Tabs.Screen
        name="progress"
        options={{ title: 'Progress', tabBarButtonTestID: 'tab-progress', tabBarIcon: ({ size }) => <TabIcon emoji="🌱" size={size} /> }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: 'Settings', tabBarButtonTestID: 'tab-settings', tabBarIcon: ({ size }) => <TabIcon emoji="⚙️" size={size} /> }}
      />
    </Tabs>
  );
}
