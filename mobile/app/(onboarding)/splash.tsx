// Onboarding 1 — Splash
// Full-bleed map. Crow appears from bottom sheet.
// Design ref: Handoff v1.0 screen 01 "MAP SPLASH"
import React from 'react';
import { View, Text, StyleSheet, useWindowDimensions, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTheme } from '@/src/theme/ThemeContext';
import { useOnboardingCopy } from '@/src/onboarding/copy';
import MapIllustration from '@/src/components/MapIllustration';
import PeriSpeech from '@/src/components/PeriSpeech';
import Btn from '@/src/components/Btn';

export default function SplashScreen() {
  const { width, height } = useWindowDimensions();
  const { theme, themeName } = useTheme();
  const c = useOnboardingCopy();

  return (
    <View testID="onboarding-splash" style={[styles.root, { backgroundColor: theme.mapBase }]}>
      <StatusBar barStyle={themeName === 'atmosphere' ? 'light-content' : 'dark-content'} translucent backgroundColor="transparent" />

      <View style={StyleSheet.absoluteFill}>
        <MapIllustration theme={theme} themeName={themeName} width={width} height={height} />
      </View>

      <SafeAreaView edges={['bottom']} style={styles.safeArea}>
        <View style={[styles.sheet, {
          backgroundColor: theme.surface,
          borderTopLeftRadius: theme.radiusLg,
          borderTopRightRadius: theme.radiusLg,
          borderColor: theme.border,
        }]}>
          <View style={[styles.handle, { backgroundColor: theme.border }]} />
          <PeriSpeech text={c.splashPeriSpeech} theme={theme} size={44} />
          <Text style={[styles.wordmark, { fontFamily: theme.fontMono, color: theme.textFaint }]}>
            PERIPATETICWARE
          </Text>
          <Btn testID="onboarding-splash-cta" label={c.splashCta} onPress={() => router.push('/(onboarding)/name')} theme={theme} />
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root:     { flex: 1 },
  safeArea: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    padding: 20, paddingTop: 14, gap: 16, borderTopWidth: 1,
    shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 8,
  },
  handle:   { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 4 },
  wordmark: { fontSize: 10, letterSpacing: 3, textAlign: 'center', opacity: 0.5 },
});
