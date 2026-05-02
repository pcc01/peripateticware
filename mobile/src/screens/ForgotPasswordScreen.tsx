// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { useAuthStore } from '../stores/authStore';

type Step = 'email' | 'token' | 'password' | 'success';

export default function ForgotPasswordScreen({ navigation }: any) {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const { requestPasswordReset, resetPassword } = useAuthStore();

  const handleEmailSubmit = async () => {
    if (!email) {
      Alert.alert('Error', 'Please enter your email');
      return;
    }

    if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      Alert.alert('Error', 'Please enter a valid email');
      return;
    }

    setLoading(true);
    try {
      await requestPasswordReset(email);
      setStep('token');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to send reset email');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!token) {
      Alert.alert('Error', 'Please enter the verification code');
      return;
    }

    if (!password || password.length < 8) {
      Alert.alert('Error', 'Password must be at least 8 characters');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      await resetPassword(token, password);
      setStep('success');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  const handleBackToLogin = () => {
    navigation.navigate('Login');
  };

  const getPasswordStrength = () => {
    if (!password) return 0;
    let strength = 0;
    if (password.length >= 8) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[^A-Za-z0-9]/.test(password)) strength++;
    return strength;
  };

  const strength = getPasswordStrength();
  const strengthColor = strength <= 1 ? '#ef4444' : strength === 2 ? '#f97316' : '#22c55e';

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.backButton}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Reset Password</Text>
          <Text style={styles.subtitle}>
            {step === 'email' && 'Enter your email address'}
            {step === 'token' && 'Enter the verification code'}
            {step === 'password' && 'Create a new password'}
            {step === 'success' && 'Password reset successful!'}
          </Text>
        </View>

        {/* Progress Steps */}
        <View style={styles.stepsContainer}>
          {(['email', 'token', 'password', 'success'] as Step[]).map((s, idx) => (
            <React.Fragment key={s}>
              <View
                style={[
                  styles.step,
                  (step === s ||
                    (['email', 'token', 'password', 'success'].indexOf(step) >
                      idx &&
                      s !== 'email')) &&
                    styles.stepActive,
                ]}
              >
                <Text
                  style={[
                    styles.stepNumber,
                    (step === s ||
                      ((['email', 'token', 'password', 'success'].indexOf(step) >
                        idx &&
                        s !== 'email'))) &&
                      styles.stepNumberActive,
                  ]}
                >
                  {idx + 1}
                </Text>
              </View>
              {idx < 3 && <View style={styles.stepDivider} />}
            </React.Fragment>
          ))}
        </View>

        {/* Email Step */}
        {step === 'email' && (
          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email Address</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter your registered email"
                placeholderTextColor="#9ca3af"
                value={email}
                onChangeText={setEmail}
                editable={!loading}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleEmailSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.buttonText}>Send Reset Code</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Token Step */}
        {step === 'token' && (
          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Verification Code</Text>
              <Text style={styles.helperText}>
                We sent a code to {email}. Enter it below.
              </Text>
              <TextInput
                style={styles.input}
                placeholder="Enter 6-digit code"
                placeholderTextColor="#9ca3af"
                value={token}
                onChangeText={setToken}
                editable={!loading}
                maxLength={6}
                keyboardType="number-pad"
              />
            </View>

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={() => setStep('password')}
              disabled={loading || !token}
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.buttonText}>Verify Code</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setStep('email')}>
              <Text style={styles.link}>Use different email</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Password Step */}
        {step === 'password' && (
          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>New Password</Text>
              <View style={styles.passwordContainer}>
                <TextInput
                  style={styles.passwordInput}
                  placeholder="Create a new password"
                  placeholderTextColor="#9ca3af"
                  value={password}
                  onChangeText={setPassword}
                  editable={!loading}
                  secureTextEntry={!showPassword}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  disabled={loading}
                >
                  <Text style={styles.showPasswordBtn}>
                    {showPassword ? '👁️' : '👁️‍🗨️'}
                  </Text>
                </TouchableOpacity>
              </View>

              {password && (
                <View style={styles.strengthContainer}>
                  <View
                    style={[
                      styles.strengthBar,
                      { backgroundColor: strengthColor, width: `${strength * 25}%` },
                    ]}
                  />
                </View>
              )}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Confirm Password</Text>
              <TextInput
                style={styles.input}
                placeholder="Confirm your password"
                placeholderTextColor="#9ca3af"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                editable={!loading}
                secureTextEntry
              />
            </View>

            <View style={styles.requirements}>
              <Text style={styles.requirementTitle}>Password Requirements:</Text>
              <Text style={styles.requirement}>
                {password.length >= 8 ? '✓' : '○'} At least 8 characters
              </Text>
              <Text style={styles.requirement}>
                {/[A-Z]/.test(password) ? '✓' : '○'} One uppercase letter
              </Text>
              <Text style={styles.requirement}>
                {/[0-9]/.test(password) ? '✓' : '○'} One number
              </Text>
              <Text style={styles.requirement}>
                {/[^A-Za-z0-9]/.test(password) ? '✓' : '○'} One special character
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.button, (loading || password !== confirmPassword) && styles.buttonDisabled]}
              onPress={handlePasswordReset}
              disabled={loading || password !== confirmPassword}
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.buttonText}>Reset Password</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Success Step */}
        {step === 'success' && (
          <View style={styles.successContainer}>
            <Text style={styles.successIcon}>✅</Text>
            <Text style={styles.successTitle}>Password Reset Successful!</Text>
            <Text style={styles.successMessage}>
              Your password has been reset. You can now sign in with your new password.
            </Text>

            <TouchableOpacity style={styles.button} onPress={handleBackToLogin}>
              <Text style={styles.buttonText}>Back to Login</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  content: {
    padding: 24,
    flexGrow: 1,
  },
  header: {
    marginBottom: 32,
  },
  backButton: {
    fontSize: 16,
    color: '#2563eb',
    fontWeight: '500',
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#111827',
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
  },
  stepsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 32,
  },
  step: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepActive: {
    backgroundColor: '#2563eb',
  },
  stepNumber: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  stepNumberActive: {
    color: '#ffffff',
  },
  stepDivider: {
    flex: 1,
    height: 2,
    backgroundColor: '#e5e7eb',
    marginHorizontal: 8,
  },
  form: {
    marginBottom: 24,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
    marginBottom: 8,
  },
  helperText: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: '#111827',
    backgroundColor: '#f9fafb',
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    backgroundColor: '#f9fafb',
    paddingRight: 12,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: '#111827',
  },
  showPasswordBtn: {
    fontSize: 18,
    padding: 4,
  },
  strengthContainer: {
    height: 4,
    backgroundColor: '#e5e7eb',
    borderRadius: 2,
    marginTop: 8,
    overflow: 'hidden',
  },
  strengthBar: {
    height: '100%',
    borderRadius: 2,
  },
  requirements: {
    backgroundColor: '#f3f4f6',
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
  },
  requirementTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  requirement: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 4,
  },
  button: {
    backgroundColor: '#2563eb',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  buttonDisabled: {
    backgroundColor: '#9ca3af',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  link: {
    color: '#2563eb',
    fontSize: 14,
    fontWeight: '500',
    marginTop: 16,
    textAlign: 'center',
  },
  successContainer: {
    alignItems: 'center',
    marginTop: 40,
  },
  successIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 8,
    textAlign: 'center',
  },
  successMessage: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 32,
    textAlign: 'center',
    lineHeight: 20,
  },
});
