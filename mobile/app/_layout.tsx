import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, LogBox } from 'react-native';
import { Stack, router, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as Font from 'expo-font';

// Side-effect import — initializes i18next (resources, fallback language,
// AsyncStorage-persisted language restore) before anything else renders.
// Must come before any component that calls t() or useTranslation().
import '@/src/i18n';

import { ThemeProvider } from '@/src/theme/ThemeContext';
import { AuthProvider, useAuth } from '@/src/stores/AuthContext';
import { SpeechVoiceProvider } from '@/src/stores/SpeechVoiceContext';
import { initOfflineLayer } from '@/src/db/appInit';
import { useConnectivity } from '@/src/hooks/useConnectivity';
import { getHasOnboarded } from '@/src/onboarding/onboardingFlag';

SplashScreen.preventAutoHideAsync().catch(() => {});

// NOTE: Any console.warn/error in a dev build (ours or a third-party
// library's, e.g. expo-av's deprecation notice) triggers RN's LogBox
// banner ("Open debugger to view warnings"), which visually overlaps the
// bottom of the screen — including the tab bar — and silently swallows
// taps aimed at elements underneath it (bit us three separate times during
// E2E testing: a missing font, a deprecated FileSystem API, and an
// expo-av deprecation notice, each an unrelated warning triggering the
// same failure). Suppressing the banner fixes the root cause instead of
// chasing every future warning individually. Warnings still print to the
// Metro/console log — this only hides the in-app overlay. Only active in
// dev builds; production builds don't show LogBox regardless.
if (__DEV__) {
  LogBox.ignoreAllLogs(true);
}

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
// Tour-then-login model (mobile/FEATURE_PLAN.md section 3.4): the
// onboarding tour never creates an account — real accounts are created by
// a teacher or homeschool parent in the web app, same as before this
// change. Onboarding's only job now is to run once on a device that's
// never seen it, then hand off to the real /login screen.
function AuthGuard() {
  const { user, isLoading } = useAuth();
  useConnectivity();

  React.useEffect(() => {
    if (user) initOfflineLayer();
  }, [!!user]);

  const segments = useSegments();

  // null = not checked yet (avoid a flash-of-wrong-screen before we know).
  const [hasOnboarded, setHasOnboarded] = useState<boolean | null>(null);
  useEffect(() => {
    getHasOnboarded().then(setHasOnboarded);
  }, []);

  useEffect(() => {
    if (isLoading || hasOnboarded === null) return;
    const inOnboarding = segments[0] === '(onboarding)';
    const inLogin = segments[0] === 'login';
    const inAuth = inOnboarding || inLogin;

    if (!user && !inAuth) {
      // Re-read from storage instead of trusting the `hasOnboarded` state
      // variable here — that state is fetched once on mount and never
      // refreshed. (onboarding)/first-activity.tsx's finishOnboarding()
      // writes the flag and navigates to /login directly, bypassing this
      // effect entirely, so this component's copy stays stale at `false`
      // for the rest of the app session. Harmless until something else
      // hits this exact branch later in the same session — confirmed via
      // a real CI failure: maestro/flows/settings/9.4-sign-out.yaml signs
      // out (no relaunch, so no fresh mount) and landed back on the
      // onboarding splash instead of /login because of that stale `false`.
      getHasOnboarded().then((onboarded) => {
        setHasOnboarded(onboarded);
        router.replace(onboarded ? '/login' : '/(onboarding)');
      });
    } else if (user && inAuth) {
      // Not just inLogin: (onboarding) and (tabs) both register an index
      // route at "/", and on a cold launch with a restored session (e.g.
      // reopening the app after it was backgrounded/killed) the router's
      // structural default for "/" can land on (onboarding) regardless of
      // hasOnboarded — this branch was only catching the login case, so an
      // already-authenticated user landing in onboarding got stuck there.
      //
      // Target the role's actual home tab explicitly rather than the bare
      // '/(tabs)' group path. A bare group path resolves to that group's
      // own index route ((tabs)/index.tsx = Discover) regardless of
      // (tabs)/_layout.tsx's own initialRouteName -- confirmed live: every
      // TEACHER/HOMESCHOOL/PARENT login (and every cold launch with an
      // already-valid session, since that also funnels through this same
      // branch once getCurrentUser() resolves) landed on the hidden
      // Discover screen's "No activities yet -- your teacher will add some
      // soon" copy, with only the correct role-specific tab BAR showing
      // underneath it. Tapping the bar's own tab worked fine -- only the
      // *initial* landing screen was wrong. Mirrors the same role → initial
      // tab mapping (tabs)/_layout.tsx computes for its own
      // initialRouteName, kept here too since that prop alone isn't
      // sufficient when arriving via an explicit path.
      const role = user.role;
      const dest =
        role === 'TEACHER' || role === 'HOMESCHOOL' ? '/(tabs)/teacher-dashboard'
        : role === 'PARENT' ? '/(tabs)/parent-dashboard'
        : '/(tabs)';
      router.replace(dest);
    } else if (!user && inOnboarding && hasOnboarded) {
      // Symmetric case of the one above: the same "/" route ambiguity can
      // land an unauthenticated-but-already-onboarded user (e.g. after
      // signing out, or relaunching post-tour without logging in) back on
      // the onboarding splash instead of login. Confirmed via a real CI
      // failure — maestro/flows/onboarding/15.1-first-launch.yaml's
      // relaunch-without-login step got stuck re-showing onboarding
      // despite @ppw_has_onboarded already being true.
      router.replace('/login');
    }
  }, [user, isLoading, hasOnboarded, segments]);

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
          // NOTE: DMSans_600SemiBold does not exist in the installed
          // @expo-google-fonts/dm-sans package (only 400/500/700 are
          // shipped) and isn't referenced anywhere as a fontFamily in
          // theme/tokens.ts — was dead weight causing a Font.loadAsync
          // rejection (and the resulting LogBox banner) on every launch.
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

  // NOTE: Stack (expo-router) does not forward `onLayout` to a native view —
  // it's a navigator config component, not a View. Relying on onLayout here
  // silently never fires, so the splash screen never dismisses. Hide it
  // directly once we know we're ready to render instead.
  useEffect(() => {
    if (appReady) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [appReady]);

  if (!appReady) return null;

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <SpeechVoiceProvider>
          <AuthProvider>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(tabs)"        options={{ headerShown: false }} />
              <Stack.Screen name="(onboarding)"  options={{ headerShown: false }} />
              <Stack.Screen name="login"         options={{ headerShown: false }} />
              <Stack.Screen name="activity/[id]" options={{ headerShown: false }} />
            </Stack>
            <AuthGuard />
            <StatusBar style="auto" />
          </AuthProvider>
        </SpeechVoiceProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
