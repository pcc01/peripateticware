/**
 * app/_layout.tsx  —  Peripateticware Root Layout (Phase 6)
 *
 * Replaces the default Expo scaffold layout with:
 *   • GestureHandlerRootView  (required by @gorhom/bottom-sheet and swipe gestures)
 *   • Auth guard              (redirects to /login when unauthenticated)
 *   • All Phase 6 Stack screens registered
 */

import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { Stack, useRouter, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useEffect } from 'react'
import { useAuthStore } from '@/stores/authStore'

// ─────────────────────────────────────────────────────────────────────────────
// Auth guard — runs on every navigation change
// ─────────────────────────────────────────────────────────────────────────────
function AuthGuard() {
  const { isAuthenticated } = useAuthStore()
  const segments = useSegments()
  const router = useRouter()

  useEffect(() => {
    const inAuthScreen = segments[0] === 'login'

    if (!isAuthenticated && !inAuthScreen) {
      // Not logged in → redirect to login
      router.replace('/login')
    } else if (isAuthenticated && inAuthScreen) {
      // Already logged in → skip login screen
      router.replace('/(tabs)')
    }
  }, [isAuthenticated, segments])

  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// Root layout
// ─────────────────────────────────────────────────────────────────────────────
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthGuard />

      <Stack screenOptions={{ headerShown: false }}>
        {/* Tab shell */}
        <Stack.Screen name="(tabs)" />

        {/* Auth */}
        <Stack.Screen name="login" />

        {/* Activity discovery → session phases */}
        <Stack.Screen name="activity/[id]" />
        <Stack.Screen name="session/[id]/orient" />
        <Stack.Screen name="session/[id]/inquiry" />
        <Stack.Screen name="session/[id]/reflect" />

        {/* Capture modals */}
        <Stack.Screen
          name="capture/audio"
          options={{ presentation: 'modal' }}
        />
        <Stack.Screen
          name="capture/video"
          options={{ presentation: 'modal' }}
        />
        <Stack.Screen
          name="capture/drawing"
          options={{ presentation: 'modal' }}
        />

        {/* Aristotelian Peri chat */}
        <Stack.Screen name="chat/[sessionId]" />
      </Stack>

      <StatusBar style="auto" />
    </GestureHandlerRootView>
  )
}
