import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, type ViewStyle } from 'react-native';
import type { Theme } from '@/src/theme/tokens';
import type { AgeBand } from '@/src/bands/copy';

interface BtnProps {
  label: string;
  onPress: () => void;
  theme: Theme;
  variant?: 'primary' | 'secondary' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  band?: AgeBand;
}

export default function Btn({ label, onPress, theme, variant = 'primary', loading, disabled, style, band }: BtnProps) {
  const minHeight = band === 'k6' ? 52 : 44;
  const fontSize = band === 'k6' ? 16 : 15;

  const containerStyle: ViewStyle = {
    primary:   { backgroundColor: theme.accent,     borderRadius: theme.radius, minHeight },
    secondary: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: theme.border, borderRadius: theme.radius, minHeight },
    ghost:     { backgroundColor: 'transparent', borderRadius: theme.radius, minHeight },
  }[variant];

  const textColor = {
    primary:   theme.accentText,
    secondary: theme.textMuted,
    ghost:     theme.textMuted,
  }[variant];

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      disabled={disabled || loading}
      style={[styles.base, containerStyle, disabled && styles.dimmed, style]}
    >
      {loading
        ? <ActivityIndicator color={textColor} />
        : <Text style={[styles.label, { color: textColor, fontFamily: theme.fontBody, fontSize }]}>{label}</Text>
      }
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  label:  { fontWeight: '600', letterSpacing: 0.1 },
  dimmed: { opacity: 0.45 },
});
