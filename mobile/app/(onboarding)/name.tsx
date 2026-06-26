// Onboarding 2 — Name Entry
// Floating card over dimmed map. Single field.
// Design ref: Handoff v1.0 screen 02 "NAME ENTRY"
import React, { useState } from 'react';
import { View, TextInput, StyleSheet, useWindowDimensions, KeyboardAvoidingView, Platform, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTheme } from '@/src/theme/ThemeContext';
import { useBand } from '@/src/bands/BandContext';
import { copy } from '@/src/bands/copy';
import MapIllustration from '@/src/components/MapIllustration';
import PeriSpeech from '@/src/components/PeriSpeech';
import Btn from '@/src/components/Btn';

function ProgressDots({ theme, active }: { theme: any; active: number }) {
  return (
    <View style={styles.dots}>
      {[0, 1, 2, 3].map(i => (
        <View key={i} style={[styles.dot, i === active
          ? { width: 20, backgroundColor: theme.accent }
          : { width: 7, backgroundColor: theme.border }
        ]} />
      ))}
    </View>
  );
}

export default function NameScreen() {
  const { width, height } = useWindowDimensions();
  const { theme, themeName } = useTheme();
  const { band } = useBand();
  const c = copy[band];
  const [name, setName] = useState('');
  const canContinue = name.trim().length > 0;

  const advance = () => {
    if (!canContinue) return;
    router.push({ pathname: '/(onboarding)/location', params: { name: name.trim() } });
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[styles.root, { backgroundColor: theme.mapBase }]}>
        <StatusBar barStyle={themeName === 'atmosphere' ? 'light-content' : 'dark-content'} translucent backgroundColor="transparent" />
        <View style={StyleSheet.absoluteFill}>
          <MapIllustration theme={theme} themeName={themeName} width={width} height={height} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.30)' }]} />
        </View>
        <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
          <View style={[styles.card, {
            backgroundColor: theme.surface,
            borderRadius: theme.radiusLg,
            borderColor: theme.border,
          }]}>
            <PeriSpeech text={c.namePeriSpeech} band={band} theme={theme} size={band === 'k6' ? 48 : 40} />
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder={c.namePlaceholder}
              placeholderTextColor={theme.textFaint}
              returnKeyType="done"
              autoFocus
              onSubmitEditing={advance}
              style={[styles.input, {
                backgroundColor: theme.surfaceAlt,
                borderColor: theme.border,
                borderRadius: theme.radius,
                fontFamily: theme.fontBody,
                color: theme.text,
                fontSize: band === 'k6' ? 18 : 16,
                minHeight: band === 'k6' ? 52 : 44,
              }]}
            />
            <Btn label={c.nameCta} onPress={advance} theme={theme} band={band} disabled={!canContinue} />
            <ProgressDots theme={theme} active={1} />
          </View>
        </SafeAreaView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root:     { flex: 1 },
  safeArea: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  card: {
    padding: 20, gap: 14, borderWidth: 1,
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 24, elevation: 12,
  },
  input: { borderWidth: 1.5, paddingHorizontal: 14 },
  dots:  { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 },
  dot:   { height: 7, borderRadius: 4 },
});
