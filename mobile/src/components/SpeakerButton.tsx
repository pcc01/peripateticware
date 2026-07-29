// src/components/SpeakerButton.tsx
// Icon-only read-aloud control for real content (activity titles,
// descriptions, directions, objectives) — as opposed to PeriSpeech, which
// pairs a speaker button with the crow avatar + speech bubble for Peri's
// own scripted narration. Activity content isn't "Peri talking", so it
// gets this bare button instead of a second avatar bubble stacked next to
// the first. Exists specifically for non-reading students: the actual
// task instructions (not just Peri's generic intro line) need to be
// readable aloud, on-device, in whatever language is currently selected.

import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Theme } from '@/src/theme/tokens';
import { useSpeech } from '@/src/hooks/useSpeech';
import { getSpeechLocale } from '@/src/i18n/locales';

interface Props {
  text: string;
  theme: Theme;
  size?: number;
  testID?: string;
}

export default function SpeakerButton({ text, theme, size = 26, testID }: Props) {
  const { t, i18n } = useTranslation();
  const { speaking, toggle } = useSpeech({ language: getSpeechLocale(i18n.language) });

  return (
    <TouchableOpacity
      testID={testID}
      onPress={() => toggle(text)}
      hitSlop={8}
      style={[
        styles.btn,
        { width: size, height: size, backgroundColor: speaking ? theme.accentMuted : 'transparent', borderRadius: theme.radiusFull },
      ]}
      accessibilityRole="button"
      accessibilityLabel={speaking ? t('perispeech.stopReading', 'Stop reading aloud') : t('perispeech.readAloud', 'Read aloud')}
      accessibilityState={{ selected: speaking }}
    >
      <Text style={[styles.icon, { fontSize: size * 0.55, color: speaking ? theme.accent : theme.textFaint }]}>
        {speaking ? '⏸' : '🔊'}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn:  { alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  icon: {},
});
