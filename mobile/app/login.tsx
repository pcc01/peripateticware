// app/login.tsx
// Student login screen — uses existing theme + band system

import React, { useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, KeyboardAvoidingView,
  Platform, ActivityIndicator, TouchableOpacity, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTheme } from '@/src/theme/ThemeContext';
import { useBand } from '@/src/bands/BandContext';
import { useAuth } from '@/src/stores/AuthContext';
import PeriSpeech from '@/src/components/PeriSpeech';
import Btn from '@/src/components/Btn';

export default function LoginScreen() {
  const { theme } = useTheme();
  const { band } = useBand();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Missing fields', 'Please enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
      router.replace('/(tabs)');
    } catch (err) {
      Alert.alert(
        'Login failed',
        err instanceof Error ? err.message : 'Check your email and password.'
      );
    } finally {
      setLoading(false);
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
            text="Welcome back! Sign in to continue your learning journey."
            band={band}
            theme={theme}
            size={band === 'k6' ? 48 : 40}
          />
        </View>

        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: theme.radiusLg }]}>
          <Text style={[styles.label, { color: theme.textMuted, fontFamily: theme.fontMono }]}>
            EMAIL
          </Text>
          <TextInput
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
            PASSWORD
          </Text>
          <TextInput
            style={inputStyle}
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            placeholderTextColor={theme.textFaint}
            secureTextEntry
            autoComplete="password"
          />

          {loading ? (
            <ActivityIndicator color={theme.accent} style={{ marginTop: 8 }} />
          ) : (
            <Btn label="Sign in" onPress={handleLogin} theme={theme} band={band} />
          )}
        </View>

        <TouchableOpacity onPress={() => Alert.alert('Password reset', 'Contact your teacher to reset your password.')}>
          <Text style={[styles.forgotText, { color: theme.textFaint, fontFamily: theme.fontBody }]}>
            Forgot password?
          </Text>
        </TouchableOpacity>
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
  forgotText: { textAlign: 'center', fontSize: 13, marginTop: 4 },
});
