import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import CrowAvatar from './CrowAvatar';
import type { Theme } from '@/src/theme/tokens';
import { useSpeech } from '@/src/hooks/useSpeech';
import { useSpeechVoice } from '@/src/stores/SpeechVoiceContext';

interface PeriSpeechProps {
  text: string;
  theme: Theme;
  size?: number;
}

export default function PeriSpeech({ text, theme, size = 44 }: PeriSpeechProps) {
  const { t } = useTranslation();
  const { voiceId, speechLocale } = useSpeechVoice();
  const { speaking, toggle } = useSpeech({ language: speechLocale, voice: voiceId });

  return (
    <View style={styles.row}>
      <CrowAvatar theme={theme} size={size} />
      <View style={[
        styles.bubble,
        {
          backgroundColor: theme.surfaceAlt,
          borderColor: theme.border,
          borderRadius: theme.radius,
          borderTopLeftRadius: 4,
        },
      ]}>
        <Text style={[
          styles.text,
          {
            fontFamily: theme.fontBody,
            color: theme.text,
            fontSize: 14,
            lineHeight: 20,
          },
        ]}>
          {text}
        </Text>
        <TouchableOpacity
          testID="peri-speech-speaker"
          onPress={() => toggle(text)}
          hitSlop={8}
          style={[
            styles.speakerBtn,
            { backgroundColor: speaking ? theme.accentMuted : 'transparent', borderRadius: theme.radiusFull },
          ]}
          accessibilityRole="button"
          accessibilityLabel={speaking ? t('perispeech.stopReading', 'Stop reading aloud') : t('perispeech.readAloud', 'Read aloud')}
          accessibilityState={{ selected: speaking }}
        >
          <Text style={[styles.speakerIcon, { color: speaking ? theme.accent : theme.textFaint }]}>
            {speaking ? '⏸' : '🔊'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row:        { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  bubble:     { flex: 1, flexDirection: 'row', alignItems: 'flex-start', borderWidth: 1, padding: 12, gap: 8 },
  text:       { flex: 1 },
  speakerBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  speakerIcon:{ fontSize: 15 },
});
