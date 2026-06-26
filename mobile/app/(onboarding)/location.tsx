// Onboarding 3 — Location Permission
// Map preview makes the "why" self-evident before the OS ask.
// Design ref: Handoff v1.0 screen 03 "LOCATION ASK"
import React, { useState } from 'react';
import { View, Text, StyleSheet, useWindowDimensions, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import * as Location from 'expo-location';
import { useTheme } from '@/src/theme/ThemeContext';
import { useBand } from '@/src/bands/BandContext';
import { copy } from '@/src/bands/copy';
import MapIllustration from '@/src/components/MapIllustration';
import PeriSpeech from '@/src/components/PeriSpeech';
import Btn from '@/src/components/Btn';

export default function LocationScreen() {
  const { width, height } = useWindowDimensions();
  const { theme, themeName } = useTheme();
  const { band } = useBand();
  const c = copy[band];
  const { name } = useLocalSearchParams<{ name: string }>();
  const [loading, setLoading] = useState(false);

  const advance = () => router.push({ pathname: '/(onboarding)/first-activity', params: { name } });

  const handleAllow = async () => {
    setLoading(true);
    try {
      await Location.requestForegroundPermissionsAsync();
    } finally {
      setLoading(false);
      advance();
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.mapBase }]}>
      <StatusBar barStyle={themeName === 'atmosphere' ? 'light-content' : 'dark-content'} translucent backgroundColor="transparent" />

      <View style={[styles.mapPreview, { height: height * 0.45 }]}>
        <MapIllustration theme={theme} themeName={themeName} width={width} height={height * 0.5} />
        <View style={[styles.badge, { backgroundColor: theme.accent, borderRadius: theme.radiusFull }]}>
          <Text style={[styles.badgeText, { fontFamily: theme.fontMono, color: theme.accentText }]}>
            {c.locationBadge}
          </Text>
        </View>
        <View style={[styles.mapFade, { backgroundColor: theme.bg }]} pointerEvents="none" />
      </View>

      <SafeAreaView edges={['bottom']} style={styles.safeArea}>
        <View style={[styles.panel, {
          backgroundColor: theme.surface,
          borderTopLeftRadius: theme.radiusLg,
          borderTopRightRadius: theme.radiusLg,
          borderColor: theme.border,
        }]}>
          <View style={[styles.handle, { backgroundColor: theme.border }]} />
          <PeriSpeech text={c.locationPeriSpeech} band={band} theme={theme} size={band === 'k6' ? 48 : 40} />
          <Text style={[styles.note, { fontFamily: theme.fontMono, color: theme.textFaint }]}>
            {c.locationReassurance}
          </Text>
          <Btn label={c.locationConfirmCta} onPress={handleAllow} theme={theme} band={band} loading={loading} />
          <Btn label={c.locationSkipCta} onPress={advance} theme={theme} band={band} variant="secondary" />
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root:        { flex: 1 },
  mapPreview:  { position: 'relative', overflow: 'hidden' },
  badge:       { position: 'absolute', top: 14, alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 4 },
  badgeText:   { fontSize: 11, fontWeight: '600', letterSpacing: 0.5 },
  mapFade:     { position: 'absolute', bottom: 0, left: 0, right: 0, height: 40, opacity: 0.85 },
  safeArea:    { flex: 1, justifyContent: 'flex-end' },
  panel: {
    padding: 20, paddingTop: 14, gap: 12, borderTopWidth: 1,
    shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 8,
  },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 4 },
  note:   { textAlign: 'center', fontSize: 10, letterSpacing: 0.5, opacity: 0.7 },
});
