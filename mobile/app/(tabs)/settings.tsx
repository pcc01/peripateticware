// app/(tabs)/settings.tsx — Theme picker + logout

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/src/theme/ThemeContext';
import { useBand } from '@/src/bands/BandContext';
import { useAuth } from '@/src/stores/AuthContext';
import { ThemeName } from '@/src/theme/tokens';
import { AgeBand } from '@/src/bands/copy';

const THEMES: { name: ThemeName; label: string; emoji: string; desc: string }[] = [
  { name: 'fieldGuide',  label: 'Field Guide',  emoji: '🌿', desc: 'Warm parchment — classic field notebook' },
  { name: 'terrain',     label: 'Terrain',      emoji: '🪨', desc: 'Crisp and sharp — topographic focus' },
  { name: 'atmosphere',  label: 'Atmosphere',   emoji: '🌌', desc: 'Deep and dark — night sky clarity' },
];

const BANDS: { band: AgeBand; label: string; desc: string }[] = [
  { band: 'k6',     label: 'K–6',     desc: 'Friendly voice, larger targets' },
  { band: 'm712',   label: '7–12',    desc: 'Peer-level, direct language' },
  { band: 'college',label: 'College', desc: 'Neutral, academic register' },
];

export default function SettingsScreen() {
  const { theme, themeName, setTheme } = useTheme();
  const { band, setBand } = useBand();
  const { user, logout } = useAuth();

  const handleLogout = () => {
    Alert.alert('Sign out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: logout },
    ]);
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.bg }]}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 20 }}>
        <Text style={[styles.title, { fontFamily: theme.fontHead, color: theme.text }]}>Settings</Text>

        {/* User info */}
        {user && (
          <View style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: theme.radius }]}>
            <Text style={[styles.sectionLabel, { fontFamily: theme.fontMono, color: theme.textFaint }]}>ACCOUNT</Text>
            <Text style={[styles.userEmail, { fontFamily: theme.fontBody, color: theme.text }]}>{user.email || 'Student'}</Text>
            <Text style={[styles.userRole, { fontFamily: theme.fontMono, color: theme.textFaint }]}>{user.role}</Text>
          </View>
        )}

        {/* Theme picker */}
        <View style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: theme.radius }]}>
          <Text style={[styles.sectionLabel, { fontFamily: theme.fontMono, color: theme.textFaint }]}>THEME</Text>
          {THEMES.map((t) => (
            <TouchableOpacity
              key={t.name}
              onPress={() => setTheme(t.name)}
              style={[styles.optionRow, { borderColor: themeName === t.name ? theme.accent : theme.border, borderRadius: theme.radiusSm, backgroundColor: themeName === t.name ? theme.accentMuted : theme.surfaceAlt }]}
            >
              <Text style={styles.optionEmoji}>{t.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.optionLabel, { fontFamily: theme.fontBody, color: theme.text }]}>{t.label}</Text>
                <Text style={[styles.optionDesc, { fontFamily: theme.fontBody, color: theme.textMuted }]}>{t.desc}</Text>
              </View>
              {themeName === t.name && <Text style={[styles.checkmark, { color: theme.accent }]}>✓</Text>}
            </TouchableOpacity>
          ))}
        </View>

        {/* Age band picker */}
        <View style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: theme.radius }]}>
          <Text style={[styles.sectionLabel, { fontFamily: theme.fontMono, color: theme.textFaint }]}>AGE BAND</Text>
          {BANDS.map((b) => (
            <TouchableOpacity
              key={b.band}
              onPress={() => setBand(b.band)}
              style={[styles.optionRow, { borderColor: band === b.band ? theme.accent : theme.border, borderRadius: theme.radiusSm, backgroundColor: band === b.band ? theme.accentMuted : theme.surfaceAlt }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.optionLabel, { fontFamily: theme.fontBody, color: theme.text }]}>{b.label}</Text>
                <Text style={[styles.optionDesc, { fontFamily: theme.fontBody, color: theme.textMuted }]}>{b.desc}</Text>
              </View>
              {band === b.band && <Text style={[styles.checkmark, { color: theme.accent }]}>✓</Text>}
            </TouchableOpacity>
          ))}
        </View>

        {/* Logout */}
        <TouchableOpacity
          onPress={handleLogout}
          style={[styles.logoutBtn, { borderColor: theme.warn, borderRadius: theme.radiusSm }]}
        >
          <Text style={[styles.logoutLabel, { fontFamily: theme.fontBody, color: theme.warn }]}>Sign out</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:         { flex: 1 },
  title:        { fontSize: 28, fontWeight: '700' },
  section:      { padding: 14, borderWidth: 1, gap: 10 },
  sectionLabel: { fontSize: 9, letterSpacing: 1.4, textTransform: 'uppercase' },
  userEmail:    { fontSize: 15, fontWeight: '600' },
  userRole:     { fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase' },
  optionRow:    { flexDirection: 'row', alignItems: 'center', padding: 10, borderWidth: 1, gap: 10 },
  optionEmoji:  { fontSize: 22, width: 30 },
  optionLabel:  { fontSize: 14, fontWeight: '600' },
  optionDesc:   { fontSize: 12, lineHeight: 18 },
  checkmark:    { fontSize: 16, fontWeight: '700' },
  logoutBtn:    { borderWidth: 1, padding: 14, alignItems: 'center' },
  logoutLabel:  { fontSize: 15, fontWeight: '600' },
});
