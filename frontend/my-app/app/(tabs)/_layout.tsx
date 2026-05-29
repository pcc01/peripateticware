/**
 * app/(tabs)/_layout.tsx  —  Peripateticware Tab Bar (Phase 6)
 *
 * Replaces the default Expo Home/Explore tabs with the three Phase 6 tabs:
 *   Activities  (index)
 *   Journal
 *   Progress
 */

import { Tabs } from 'expo-router'
import { Platform } from 'react-native'
import { HapticTab } from '@/components/haptic-tab'

// Design tokens from Hi-Fi spec
const ACCENT   = '#4a7c59'   // Field Guide green
const INACTIVE = '#8b9467'   // Muted olive
const TAB_BG   = '#faf7f2'   // Warm beige
const BORDER   = '#e8e4dc'

// Inline emoji icon helper — avoids @expo/vector-icons dependency issues
function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  const { Text } = require('react-native')
  return (
    <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.55 }}>
      {emoji}
    </Text>
  )
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarActiveTintColor: ACCENT,
        tabBarInactiveTintColor: INACTIVE,
        tabBarStyle: {
          backgroundColor: TAB_BG,
          borderTopColor: BORDER,
          borderTopWidth: 1,
          height: Platform.OS === 'ios' ? 88 : 64,
          paddingBottom: Platform.OS === 'ios' ? 24 : 8,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          letterSpacing: 0.3,
        },
      }}
    >
      {/* Tab 1: Activity discovery map + list */}
      <Tabs.Screen
        name="index"
        options={{
          title: 'Activities',
          tabBarIcon: ({ focused }) => (
            <TabIcon emoji="🗺️" focused={focused} />
          ),
        }}
      />

      {/* Tab 2: Evidence + reflection journal */}
      <Tabs.Screen
        name="journal"
        options={{
          title: 'Journal',
          tabBarIcon: ({ focused }) => (
            <TabIcon emoji="📓" focused={focused} />
          ),
        }}
      />

      {/* Tab 3: Progress dashboard */}
      <Tabs.Screen
        name="progress"
        options={{
          title: 'Progress',
          tabBarIcon: ({ focused }) => (
            <TabIcon emoji="📊" focused={focused} />
          ),
        }}
      />
    </Tabs>
  )
}
