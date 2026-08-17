// app/login.tsx
// Student login screen — uses existing theme system

import React, { useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, KeyboardAvoidingView,
  Platform, ActivityIndicator, TouchableOpacity, Alert,
} from 'react-native';
// @expo/vector-icons is already a dependency but unused elsewhere in this
// app — every other icon here is an emoji (see app/(tabs)/_layout.tsx's
// TabIcon). A password-reveal glyph specifically benefits from a real
// vector icon (crisp at small sizes, no font-rendering variance across
// devices the way 👁 vs 🙈 can have), so this is a deliberate one-off,
// not the start of a wider icon-library migration.
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTheme } from '@/src/theme/ThemeContext';
import { useAuth } from '@/src/stores/AuthContext';
import PeriSpeech from '@/src/components/PeriSpeech';
import Btn from '@/src/components/Btn';
import { useTranslation } from 'react-i18next';
import { requestPasswordReset } from '@/src/api/passwordReset';

export default function LoginScreen() {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // "Forgot password?" used to be a dead-end Alert telling students to go
  // find their teacher — this replaces it with the same request-a-reset-
  // link flow the web app already has wired end-to-end (ForgotPasswordPage
  // -> POST /api/v1/public/password/forgot). Kept as a mode toggle on this
  // same screen (rather than a separate expo-router route) because
  // AuthGuard in app/_layout.tsx only whitelists segments[0] === 'login'
  // (and '(onboarding)') for unauthenticated navigation — a standalone
  // "/forgot-password" route would get bounced straight back to /login by
  // that guard before a logged-out user could ever see it.
  const [mode, setMode] = useState<'login' | 'forgot'>('login');
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert(t('login.missingFields.title', 'Missing fields'), t('login.missingFields.body', 'Please enter your email and password.'));
      return;
    }
    setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
      router.replace('/(tabs)');
    } catch (err) {
      Alert.alert(
        t('login.failed.title', 'Login failed'),
        err instanceof Error ? err.message : t('login.failed.body', 'Check your email and password.')
      );
    } finally {
      setLoading(false);
    }
  };

  const openForgotPassword = () => {
    setForgotEmail(email.trim());
    setForgotError(null);
    setForgotSent(false);
    setMode('forgot');
  };

  const handleForgotSubmit = async () => {
    if (!forgotEmail.trim()) {
      setForgotError(t('login.passwordReset.missingEmail', 'Please enter your email.'));
      return;
    }
    setForgotLoading(true);
    setForgotError(null);
    try {
      await requestPasswordReset(forgotEmail.trim().toLowerCase());
      setForgotSent(true);
    } catch {
      // The backend never reveals whether the email exists (avoids
      // enumeration), so this only fires on an actual request failure —
      // network down, server error, etc.
      setForgotError(t('login.passwordReset.requestFailed', 'Something went wrong. Please try again.'));
    } finally {
      setForgotLoading(false);
    }
  };

  const inputStyle = [
    styles.input,
    {
      backgroundColor: theme.surfaceAlt,
      borderColor: theme.border,
      color: theme.text,
      fontFamily: theme.fontBody,
      borderRadius: theme.radiusSm,
    },
  ];

  return (
    <SafeAreaView testID="login-screen" style={[styles.root, { backgroundColor: theme.bg }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.inner}
      >
        <View style={styles.periWrap}>
          <PeriSpeech
            text={t('login.welcomeBack', 'Welcome back! Sign in to continue your learning journey.')}
            theme={theme}
            size={40}
          />
        </View>

        {mode === 'login' ? (
          <>
            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: theme.radiusLg }]}>
              <Text style={[styles.label, { color: theme.textMuted, fontFamily: theme.fontMono }]}>
                {t('login.emailLabel', 'EMAIL')}
              </Text>
              <TextInput
                testID="email-input"
                style={inputStyle}
                value={email}
                onChangeText={setEmail}
                placeholder="you@school.edu"
                placeholderTextColor={theme.textFaint}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
              />

              <Text style={[styles.label, { color: theme.textMuted, fontFamily: theme.fontMono }]}>
                {t('login.passwordLabel', 'PASSWORD')}
              </Text>
              <View style={styles.passwordRow}>
                <TextInput
                  testID="password-input"
                  style={[inputStyle, styles.passwordInput]}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="••••••••"
                  placeholderTextColor={theme.textFaint}
                  secureTextEntry={!showPassword}
                  autoComplete="password"
                />
                <TouchableOpacity
                  testID="password-reveal-toggle"
                  onPress={() => setShowPassword((v) => !v)}
                  hitSlop={10}
                  style={styles.passwordRevealBtn}
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? t('login.hidePassword', 'Hide password') : t('login.showPassword', 'Show password')}
                  accessibilityState={{ selected: showPassword }}
                >
                  <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={20} color={theme.textFaint} />
                </TouchableOpacity>
              </View>

              {loading ? (
                <ActivityIndicator color={theme.accent} style={{ marginTop: 8 }} />
              ) : (
                <Btn label={t('login.signIn', 'Sign in')} onPress={handleLogin} theme={theme} />
              )}
            </View>

            <TouchableOpacity
              testID="forgot-password-link"
              onPress={openForgotPassword}
              accessibilityRole="button"
              accessibilityLabel={t('login.forgotPassword', 'Forgot password?')}
            >
              <Text style={[styles.forgotText, { color: theme.textFaint, fontFamily: theme.fontBody }]}>
                {t('login.forgotPassword', 'Forgot password?')}
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <View
            testID="forgot-password-card"
            style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: theme.radiusLg }]}
          >
            {forgotSent ? (
              <>
                <Text style={[styles.optionLabel, { fontFamily: theme.fontBody, color: theme.text }]}>
                  {t('login.passwordReset.checkInbox', 'Check your inbox')}
                </Text>
                <Text style={[styles.forgotBody, { fontFamily: theme.fontBody, color: theme.textMuted }]}>
                  {t('login.passwordReset.checkInboxBody', "If an account exists for {{email}}, you'll receive a password reset link shortly. It expires in 60 minutes.", { email: forgotEmail.trim() })}
                </Text>
              </>
            ) : (
              <>
                <Text style={[styles.optionLabel, { fontFamily: theme.fontBody, color: theme.text }]}>
                  {t('login.passwordReset.title', 'Reset your password')}
                </Text>
                <Text style={[styles.forgotBody, { fontFamily: theme.fontBody, color: theme.textMuted }]}>
                  {t('login.passwordReset.body', "Enter your email and we'll send you a link to set a new password.")}
                </Text>

                <Text style={[styles.label, { color: theme.textMuted, fontFamily: theme.fontMono, marginTop: 6 }]}>
                  {t('login.emailLabel', 'EMAIL')}
                </Text>
                <TextInput
                  testID="forgot-password-email-input"
                  style={inputStyle}
                  value={forgotEmail}
                  onChangeText={setForgotEmail}
                  placeholder="you@school.edu"
                  placeholderTextColor={theme.textFaint}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoComplete="email"
                />

                {forgotError && (
                  <Text style={[styles.forgotBody, { fontFamily: theme.fontBody, color: theme.warn }]}>{forgotError}</Text>
                )}

                {forgotLoading ? (
                  <ActivityIndicator color={theme.accent} style={{ marginTop: 8 }} />
                ) : (
                  <Btn
                    testID="forgot-password-submit"
                    label={t('login.passwordReset.sendLink', 'Send reset link')}
                    onPress={handleForgotSubmit}
                    theme={theme}
                  />
                )}
              </>
            )}
          </View>
        )}

        {mode === 'forgot' && (
          <TouchableOpacity
            testID="back-to-login-link"
            onPress={() => setMode('login')}
            accessibilityRole="button"
            accessibilityLabel={t('login.passwordReset.backToLogin', 'Back to login')}
          >
            <Text style={[styles.forgotText, { color: theme.textFaint, fontFamily: theme.fontBody }]}>
              {t('login.passwordReset.backToLogin', 'Back to login')}
            </Text>
          </TouchableOpacity>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:       { flex: 1 },
  inner:      { flex: 1, justifyContent: 'center', padding: 20, gap: 16 },
  periWrap:   { alignItems: 'center', marginBottom: 8 },
  card:       { padding: 20, borderWidth: 1, gap: 10 },
  label:      { fontSize: 9, letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: -4 },
  input:      { height: 44, paddingHorizontal: 12, borderWidth: 1, fontSize: 15 },
  passwordRow:      { position: 'relative', justifyContent: 'center' },
  passwordInput:    { paddingRight: 44 },
  passwordRevealBtn:{ position: 'absolute', right: 4, height: 44, width: 40, alignItems: 'center', justifyContent: 'center' },
  forgotText: { textAlign: 'center', fontSize: 13, marginTop: 4 },
  optionLabel:{ fontSize: 16, fontWeight: '600' },
  forgotBody: { fontSize: 13, lineHeight: 19 },
});
