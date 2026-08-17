// app/(tabs)/settings.tsx — Theme picker + logout, plus (STUDENT accounts
// only) any pending parent-link requests awaiting approval.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/src/theme/ThemeContext';
import { useAuth } from '@/src/stores/AuthContext';
import { ThemeName } from '@/src/theme/tokens';
import { LANGUAGE_STORAGE_KEY, DEFAULT_LOCALE } from '@/src/i18n/locales';
import { ensureLocaleLoaded } from '@/src/i18n/localePacks';
import LanguagePicker from '@/src/components/LanguagePicker';
import VoicePicker from '@/src/components/VoicePicker';
import { fetchParentRequests, approveParentRequest, denyParentRequest, ParentLinkRequest } from '@/src/api/parentLinkRequests';
import { requestPasswordReset } from '@/src/api/passwordReset';

// Only ever rendered for STUDENT accounts (see the section's own guard
// below) — a parent's link request needs the CHILD's consent, not the
// parent's, so this has no reason to exist on any other role's Settings.
// Renders nothing at all when there's nothing pending, rather than an
// always-visible empty section — this is a transient "someone's asking"
// surface, not a permanent settings item.
function ParentRequestsSection({ theme, t }: { theme: any; t: (k: string, d: string, o?: any) => any }) {
  const [requests, setRequests] = useState<ParentLinkRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingOn, setActingOn] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchParentRequests().then(setRequests).catch(() => setRequests([])).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const respond = async (parentId: string, approve: boolean) => {
    setActingOn(parentId);
    try {
      await (approve ? approveParentRequest(parentId) : denyParentRequest(parentId));
      setRequests((prev) => prev.filter((r) => r.parent_id !== parentId));
    } catch {
      Alert.alert(t('common.error', 'Something went wrong'), t('settings.parentRequests.actionError', 'Please try again.'));
    } finally {
      setActingOn(null);
    }
  };

  if (loading || requests.length === 0) return null;

  return (
    <View style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: theme.radius }]}>
      <Text style={[styles.sectionLabel, { fontFamily: theme.fontMono, color: theme.textFaint }]}>
        {t('settings.parentRequests.label', 'PARENT REQUESTS')}
      </Text>
      {requests.map((req) => (
        <View key={req.parent_id} style={[styles.requestRow, { borderColor: theme.border, borderRadius: theme.radiusSm }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.requestName, { fontFamily: theme.fontBody, color: theme.text }]} numberOfLines={1}>
              {req.parent_name}
            </Text>
            <Text style={[styles.optionDesc, { fontFamily: theme.fontBody, color: theme.textMuted }]}>
              {t('settings.parentRequests.body', '{{email}} wants to see your progress as your {{relationship}}.', { email: req.parent_email, relationship: req.relationship })}
            </Text>
          </View>
          {actingOn === req.parent_id ? (
            <ActivityIndicator color={theme.accent} />
          ) : (
            <View style={styles.requestActions}>
              <TouchableOpacity
                testID={`parent-request-deny-${req.parent_id}`}
                onPress={() => respond(req.parent_id, false)}
                style={[styles.requestBtn, { borderColor: theme.warn }]}
              >
                <Text style={{ color: theme.warn, fontFamily: theme.fontBody, fontWeight: '600' }}>{t('common.deny', 'Deny')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID={`parent-request-approve-${req.parent_id}`}
                onPress={() => respond(req.parent_id, true)}
                style={[styles.requestBtn, { backgroundColor: theme.accent, borderColor: theme.accent }]}
              >
                <Text style={{ color: '#fff', fontFamily: theme.fontBody, fontWeight: '600' }}>{t('common.approve', 'Approve')}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      ))}
    </View>
  );
}

export default function SettingsScreen() {
  const { theme, themeName, setTheme } = useTheme();
  const { user, logout } = useAuth();
  const { t, i18n: i18nInstance } = useTranslation();
  const [locale, setLocale] = useState<string>(DEFAULT_LOCALE);
  const [switchingLocale, setSwitchingLocale] = useState(false);
  const [localeError, setLocaleError] = useState<string | null>(null);
  const [resettingPassword, setResettingPassword] = useState(false);

  // NOTE: THEMES used to be a module-level `const` built by calling t() once
  // at import time — that froze the theme labels/descriptions at whichever
  // language was active on first JS load and never updated on a runtime
  // language switch (a real bug — see
  // WORK_PLAN_20260718_MOBILE_I18N.md Priority 1 item 4), which was
  // especially visible here since this is the very screen that hosts the
  // language picker. Computing it inside the render body with useMemo,
  // keyed on the current language (via useTranslation(), which subscribes
  // this component to i18next's `languageChanged` event), fixes that.
  // `renderLang` is a test-only regression marker for e2e/settings.test.js
  // 9.5 (and maestro/flows/settings/9.5-theme-labels-language-reactivity.yaml):
  // every locale JSON file currently ships byte-identical English-fallback
  // copy (see 9.3's comment above), so opt.label/opt.desc can't be used to
  // prove this useMemo actually recomputed on a language switch — the
  // string would read the same either way. renderLang is built inside the
  // SAME memoized array as label/desc, so it's frozen exactly when they
  // would be frozen (i.e. it reproduces the pre-fix bug if someone
  // reintroduces a module-level THEMES const) and fresh exactly when they
  // would be fresh. Surfaced via testID below so Detox/Maestro can assert
  // on it without relying on translated text content that doesn't exist
  // yet. Safe to remove this field (and go back to asserting opt.label
  // directly) once real per-locale translations land.
  const THEMES: { name: ThemeName; label: string; emoji: string; desc: string; renderLang: string }[] = useMemo(() => [
    { name: 'fieldGuide',  label: t('settings.theme.fieldGuide.label', 'Field Guide'),  emoji: '🌿', desc: t('settings.theme.fieldGuide.desc', 'Warm parchment — classic field notebook'), renderLang: i18nInstance.language },
    { name: 'terrain',     label: t('settings.theme.terrain.label', 'Terrain'),      emoji: '🪨', desc: t('settings.theme.terrain.desc', 'Crisp and sharp — topographic focus'), renderLang: i18nInstance.language },
    { name: 'atmosphere',  label: t('settings.theme.atmosphere.label', 'Atmosphere'),   emoji: '🌌', desc: t('settings.theme.atmosphere.desc', 'Deep and dark — night sky clarity'), renderLang: i18nInstance.language },
  ], [i18nInstance.language]);

  // Picking a language updates the selected chip, persists to AsyncStorage
  // (survives relaunch), AND now also calls i18n.changeLanguage() so the
  // change takes effect immediately without an app restart (Priority 2
  // item 5 — previously this only wrote to AsyncStorage and the actual
  // i18next language never changed until next cold boot).
  useEffect(() => {
    (async () => {
      const stored = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
      if (stored) setLocale(stored);
    })();
  }, []);

  const handleSelectLocale = async (code: string) => {
    if (switchingLocale) return;
    setSwitchingLocale(true);
    setLocaleError(null);
    const ok = await ensureLocaleLoaded(code);
    if (ok) {
      setLocale(code);
      await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, code);
      await i18nInstance.changeLanguage(code);
    } else {
      setLocaleError(t('settings.language.downloadFailed', 'Could not download this language. Check your connection and try again.'));
      // Locale / AsyncStorage / i18next language are left untouched on failure.
    }
    setSwitchingLocale(false);
  };

  // Mirrors the web app's own logged-in "change password" affordance
  // (HomeschoolSettingsPage) — there's no authenticated current-password ->
  // new-password endpoint anywhere in this codebase, only the public
  // email-link reset flow (backend/routes/reset.py). Rather than invent a
  // one-off endpoint, reuse that same flow here: fire the reset email at
  // the account's own address, then finish setting the new password on
  // the web (the email links to FRONTEND_URL/reset-password?token=...).
  const handleResetPassword = async () => {
    if (!user?.email || resettingPassword) return;
    setResettingPassword(true);
    try {
      await requestPasswordReset(user.email);
      Alert.alert(
        t('settings.password.sentTitle', 'Check your inbox'),
        t('settings.password.sentBody', "We've sent a password reset link to {{email}}. It expires in 60 minutes.", { email: user.email })
      );
    } catch {
      Alert.alert(t('common.error', 'Something went wrong'), t('settings.password.error', 'Please try again.'));
    } finally {
      setResettingPassword(false);
    }
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
        <Text style={[styles.title, { fontFamily: theme.fontHead, color: theme.text }]}>{t('tabs.settings', 'Settings')}</Text>

        {/* User info */}
        {user && (
          <View style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: theme.radius }]}>
            <Text style={[styles.sectionLabel, { fontFamily: theme.fontMono, color: theme.textFaint }]}>{t('settings.accountLabel', 'ACCOUNT')}</Text>
            <Text style={[styles.userEmail, { fontFamily: theme.fontBody, color: theme.text }]}>{user.email || t('settings.studentFallback', 'Student')}</Text>
            <Text style={[styles.userRole, { fontFamily: theme.fontMono, color: theme.textFaint }]}>
              {user.role === 'STUDENT' ? t('settings.role.student', 'Student') : user.role}
            </Text>
          </View>
        )}

        {/* Password reset — sends the same email-link reset used on the web
            (POST /api/v1/public/password/forgot). See handleResetPassword
            above for why this isn't a direct current/new-password form. */}
        {user?.email && (
          <View style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: theme.radius }]}>
            <Text style={[styles.sectionLabel, { fontFamily: theme.fontMono, color: theme.textFaint }]}>
              {t('settings.passwordLabel', 'PASSWORD')}
            </Text>
            <Text style={[styles.optionDesc, { fontFamily: theme.fontBody, color: theme.textMuted }]}>
              {t('settings.password.desc', "We'll email you a link to set a new password.")}
            </Text>
            {resettingPassword ? (
              <ActivityIndicator color={theme.accent} />
            ) : (
              <TouchableOpacity
                testID="reset-password-btn"
                onPress={handleResetPassword}
                style={[styles.resetPasswordBtn, { borderColor: theme.accent, borderRadius: theme.radiusSm }]}
                accessibilityRole="button"
                accessibilityLabel={t('settings.password.button', 'Reset password')}
              >
                <Text style={[styles.resetPasswordLabel, { color: theme.accent, fontFamily: theme.fontBody }]}>
                  {t('settings.password.button', 'Reset password')}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {user?.role === 'STUDENT' && <ParentRequestsSection theme={theme} t={t} />}

        {/* Theme picker */}
        <View style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: theme.radius }]}>
          <Text style={[styles.sectionLabel, { fontFamily: theme.fontMono, color: theme.textFaint }]}>{t('settings.themeLabel', 'THEME')}</Text>
          {THEMES.map((opt) => (
            <TouchableOpacity
              key={opt.name}
              testID={`theme-option-${opt.name}-${opt.renderLang}`}
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

        {/* Language picker — a popout modal (LanguagePicker) rather than an
            always-expanded 13-row list. Selecting persists to AsyncStorage
            and calls i18n.changeLanguage() (see handleSelectLocale above),
            so it takes effect immediately, no restart needed. */}
        <View style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: theme.radius }]}>
          <Text style={[styles.sectionLabel, { fontFamily: theme.fontMono, color: theme.textFaint }]}>{t('settings.languageLabel', 'LANGUAGE')}</Text>
          <LanguagePicker theme={theme} locale={locale} disabled={switchingLocale} onSelect={handleSelectLocale} />
          {localeError && (
            <Text style={[styles.optionDesc, { fontFamily: theme.fontBody, color: theme.warn }]}>{localeError}</Text>
          )}
        </View>

        {/* Voice picker — which on-device TTS voice reads Peri and activity
            text aloud for the currently-selected language above. Defaults
            to "Automatic" (matches app language via useSpeech's `language`
            hint); only needs to be touched if that default resolves to the
            wrong voice on a given device. */}
        <View style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: theme.radius }]}>
          <Text style={[styles.sectionLabel, { fontFamily: theme.fontMono, color: theme.textFaint }]}>{t('settings.voiceLabel', 'VOICE')}</Text>
          <VoicePicker theme={theme} />
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
  resetPasswordBtn:   { borderWidth: 1, padding: 12, alignItems: 'center' },
  resetPasswordLabel: { fontSize: 14, fontWeight: '600' },
  requestRow:     { flexDirection: 'row', alignItems: 'center', padding: 10, borderWidth: 1, gap: 10 },
  requestName:    { fontSize: 14, fontWeight: '600' },
  requestActions: { flexDirection: 'row', gap: 8 },
  requestBtn:     { borderWidth: 1, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 6 },
});
