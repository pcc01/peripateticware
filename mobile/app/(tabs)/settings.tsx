// app/(tabs)/settings.tsx — Theme picker + logout

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '@/src/theme/ThemeContext';
import { useAuth } from '@/src/stores/AuthContext';
import { ThemeName } from '@/src/theme/tokens';
import { t } from '@/src/i18n/t';
import { SUPPORTED_LOCALES, LANGUAGE_STORAGE_KEY, DEFAULT_LOCALE } from '@/src/i18n/locales';

const THEMES: { name: ThemeName; label: string; emoji: string; desc: string }[] = [
  { name: 'fieldGuide',  label: t('settings.theme.fieldGuide.label', 'Field Guide'),  emoji: '🌿', desc: t('settings.theme.fieldGuide.desc', 'Warm parchment — classic field notebook') },
  { name: 'terrain',     label: t('settings.theme.terrain.label', 'Terrain'),      emoji: '🪨', desc: t('settings.theme.terrain.desc', 'Crisp and sharp — topographic focus') },
  { name: 'atmosphere',  label: t('settings.theme.atmosphere.label', 'Atmosphere'),   emoji: '🌌', desc: t('settings.theme.atmosphere.desc', 'Deep and dark — night sky clarity') },
];

export default function SettingsScreen() {
  const { theme, themeName, setTheme } = useTheme();
  const { user, logout } = useAuth();
  const [locale, setLocale] = useState<string>(DEFAULT_LOCALE);

  // Persistence-only for now (mobile/FEATURE_PLAN.md §3.1 — Paul's decision:
  // ship AsyncStorage persistence now, defer real translation library).
  // Picking a language updates the selected chip and survives relaunch, but
  // does not change any displayed text yet — `src/i18n/t.ts` stays a
  // pass-through until a translation library is chosen.
  useEffect(() => {
    (async () => {
      const stored = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
      if (stored) setLocale(stored);
    })();
  }, []);

  const handleSelectLocale = async (code: string) => {
    setLocale(code);
    await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, code);
  };

  const handleLogout = () => {
    Alert.alert(t('settings.signOut.title', 'Sign out'), t('settings.signOut.confirm', 'Are you sure?'), [
      { text: t('common.cancel', 'Cancel'), style: 'cancel' },
      { text: t('settings.signOut.title', 'Sign out'), style: 'destructive', onPress: logout },
    ]);
  };

  return (
    <SafeAreaView testID="settings-screen" style={[styles.root, { backgroundColor: theme.bg }]}>
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
          {THEMES.map((opt) => (
            <TouchableOpacity
              key={opt.name}
              onPress={() => setTheme(opt.name)}
              style={[styles.optionRow, { borderColor: themeName === opt.name ? theme.accent : theme.border, borderRadius: theme.radiusSm, backgroundColor: themeName === opt.name ? theme.accentMuted : theme.surfaceAlt }]}
              accessibilityRole="radio"
              accessibilityLabel={`${opt.label} theme. ${opt.desc}`}
              accessibilityState={{ selected: themeName === opt.name }}
            >
              <Text style={styles.optionEmoji}>{opt.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.optionLabel, { fontFamily: theme.fontBody, color: theme.text }]}>{opt.label}</Text>
                <Text style={[styles.optionDesc, { fontFamily: theme.fontBody, color: theme.textMuted }]}>{opt.desc}</Text>
              </View>
              {themeName === opt.name && <Text style={[styles.checkmark, { color: theme.accent }]}>✓</Text>}
            </TouchableOpacity>
          ))}
        </View>

        {/* Language picker (persistence only — see FEATURE_PLAN.md §3.1) */}
        <View style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: theme.radius }]}>
          <Text style={[styles.sectionLabel, { fontFamily: theme.fontMono, color: theme.textFaint }]}>LANGUAGE</Text>
          {SUPPORTED_LOCALES.map((opt) => (
            <TouchableOpacity
              key={opt.code}
              onPress={() => handleSelectLocale(opt.code)}
              style={[styles.optionRow, { borderColor: locale === opt.code ? theme.accent : theme.border, borderRadius: theme.radiusSm, backgroundColor: locale === opt.code ? theme.accentMuted : theme.surfaceAlt }]}
              accessibilityRole="radio"
              accessibilityLabel={`${opt.name} language`}
              accessibilityState={{ selected: locale === opt.code }}
            >
              <Text style={styles.optionEmoji}>{opt.flag}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.optionLabel, { fontFamily: theme.fontBody, color: theme.text }]}>{opt.name}</Text>
              </View>
              {locale === opt.code && <Text style={[styles.checkmark, { color: theme.accent }]}>✓</Text>}
            </TouchableOpacity>
          ))}
        </View>

        {/* Logout */}
        <TouchableOpacity
          onPress={handleLogout}
          style={[styles.logoutBtn, { borderColor: theme.warn, borderRadius: theme.radiusSm }]}
          accessibilityRole="button"
          accessibilityLabel={t('settings.signOut.title', 'Sign out')}
        >
          <Text style={[styles.logoutLabel, { fontFamily: theme.fontBody, color: theme.warn }]}>{t('settings.signOut.title', 'Sign out')}</Text>
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
