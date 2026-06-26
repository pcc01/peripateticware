import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { Stack, router, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as Font from 'expo-font';

import { ThemeProvider } from '@/src/theme/ThemeContext';
import { BandProvider } from '@/src/bands/BandContext';
import { AuthProvider, useAuth } from '@/src/stores/AuthContext';
import { initOfflineLayer } from '@/src/db/appInit';
import { useConnectivity } from '@/src/hooks/useConnectivity';

SplashScreen.preventAutoHideAsync().catch(() => {});

// ── Error boundary — shows crash details on screen ──────────────────
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <ScrollView style={{ flex: 1, backgroundColor: '#1a0000', padding: 24, paddingTop: 60 }}>
          <Text style={{ color: '#ff6b6b', fontSize: 18, fontWeight: 'bold', marginBottom: 12 }}>
            💥 App Crash
          </Text>
          <Text style={{ color: '#ffaaaa', fontSize: 14, marginBottom: 8 }}>
            {(this.state.error as Error).message}
          </Text>
          <Text style={{ color: '#ff8888', fontSize: 11, fontFamily: 'monospace' }}>
            {(this.state.error as Error).stack}
          </Text>
        </ScrollView>
      );
    }
    return this.props.children;
  }
}

// ── Auth guard ───────────────────────────────────────────────────────
function AuthGuard() {
  const { user, isLoading } = useAuth();
  useConnectivity();

  React.useEffect(() => {
    if (user) initOfflineLayer();
  }, [!!user]);

  const segments = useSegments();

  useEffect(() => {
    if (isLoading) return;
    const inOnboarding = segments[0] === '(onboarding)';
    const inLogin = segments[0] === 'login';
    const inAuth = inOnboarding || inLogin;
    if (!user && !inAuth) router.replace('/login');
    else if (user && inLogin) router.replace('/(tabs)');
  }, [user, isLoading, segments]);

  return null;
}

// ── Root layout ──────────────────────────────────────────────────────
export default function RootLayout() {
  const [appReady, setAppReady] = useState(false);

  useEffect(() => {
    async function prepare() {
      try {
        await Font.loadAsync({
          Lora_400Regular:       require('@expo-google-fonts/lora/Lora_400Regular.ttf'),
          Lora_600SemiBold:      require('@expo-google-fonts/lora/Lora_600SemiBold.ttf'),
          Lora_700Bold:          require('@expo-google-fonts/lora/Lora_700Bold.ttf'),
          DMSans_400Regular:     require('@expo-google-fonts/dm-sans/DMSans_400Regular.ttf'),
          DMSans_500Medium:      require('@expo-google-fonts/dm-sans/DMSans_500Medium.ttf'),
          DMSans_600SemiBold:    require('@expo-google-fonts/dm-sans/DMSans_600SemiBold.ttf'),
          DMMono_400Regular:     require('@expo-google-fonts/dm-mono/DMMono_400Regular.ttf'),
          DMMono_500Medium:      require('@expo-google-fonts/dm-mono/DMMono_500Medium.ttf'),
          ZillaSlab_400Regular:  require('@expo-google-fonts/zilla-slab/ZillaSlab_400Regular.ttf'),
          ZillaSlab_600SemiBold: require('@expo-google-fonts/zilla-slab/ZillaSlab_600SemiBold.ttf'),
          ZillaSlab_700Bold:     require('@expo-google-fonts/zilla-slab/ZillaSlab_700Bold.ttf'),
          Spectral_300Light:     require('@expo-google-fonts/spectral/Spectral_300Light.ttf'),
          Spectral_400Regular:   require('@expo-google-fonts/spectral/Spectral_400Regular.ttf'),
          Spectral_600SemiBold:  require('@expo-google-fonts/spectral/Spectral_600SemiBold.ttf'),
        });
      } catch (e) {
        console.warn('Font load error (non-fatal):', e);
      } finally {
        setAppReady(true);
      }
    }
    const timeout = setTimeout(() => setAppReady(true), 5000);
    prepare().finally(() => clearTimeout(timeout));
  }, []);

  const onLayout = useCallback(async () => {
    if (appReady) await SplashScreen.hideAsync().catch(() => {});
  }, [appReady]);

  if (!appReady) return null;

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <BandProvider>
          <AuthProvider>
            <Stack onLayout={onLayout} screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(tabs)"        options={{ headerShown: false }} />
              <Stack.Screen name="(onboarding)"  options={{ headerShown: false }} />
              <Stack.Screen name="login"         options={{ headerShown: false }} />
              <Stack.Screen name="activity/[id]" options={{ headerShown: false }} />
              <Stack.Screen name="modal"         options={{ presentation: 'modal' }} />
            </Stack>
            <AuthGuard />
            <StatusBar style="auto" />
          </AuthProvider>
        </BandProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
