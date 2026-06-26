import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import CrowAvatar from './CrowAvatar';
import type { AgeBand } from '@/src/bands/copy';
import type { Theme } from '@/src/theme/tokens';

interface PeriSpeechProps {
  text: string;
  band: AgeBand;
  theme: Theme;
  size?: number;
}

export default function PeriSpeech({ text, band, theme, size = 44 }: PeriSpeechProps) {
  return (
    <View style={styles.row}>
      <CrowAvatar band={band} theme={theme} size={size} />
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
            fontSize: band === 'k6' ? 15 : 14,
            lineHeight: band === 'k6' ? 22 : 20,
          },
        ]}>
          {text}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row:    { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  bubble: { flex: 1, borderWidth: 1, padding: 12 },
  text:   {},
});
