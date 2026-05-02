// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Switch,
  Alert,
} from 'react-native';
import { useSettingsStore } from '../stores/settingsStore';
import { useAuthStore } from '../stores/authStore';

export default function SettingsScreen({ navigation }: any) {
  const { settings, fetchSettings, toggleDarkMode, updateLanguage, updateNotificationPreferences, logout } = useSettingsStore();
  const { user } = useAuthStore();
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        await fetchSettings();
      } catch (error) {
        console.error('Failed to load settings:', error);
      } finally {
        setLoaded(true);
      }
    };

    loadSettings();
  }, []);

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', onPress: () => {} },
      {
        text: 'Sign Out',
        onPress: async () => {
          try {
            await logout();
            navigation.reset({
              index: 0,
              routes: [{ name: 'Login' }],
            });
          } catch (error) {
            Alert.alert('Error', 'Failed to sign out');
          }
        },
        style: 'destructive',
      },
    ]);
  };

  const toggleNotification = async (key: keyof typeof settings!.notificationPreferences) => {
    if (!settings) return;
    try {
      await updateNotificationPreferences({
        [key]: !settings.notificationPreferences[key],
      });
    } catch (error) {
      Alert.alert('Error', 'Failed to update notification preferences');
    }
  };

  if (!loaded || !settings) {
    return (
      <View style={styles.container}>
        <Text>Loading settings...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Profile Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Profile</Text>
        <View style={styles.card}>
          <View style={styles.profileRow}>
            <View>
              <Text style={styles.profileName}>
                {user?.firstName} {user?.lastName}
              </Text>
              <Text style={styles.profileEmail}>{user?.email}</Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.button}
            onPress={() => navigation.navigate('Profile')}
          >
            <Text style={styles.buttonText}>Edit Profile</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Display Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Display</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.label}>Dark Mode</Text>
            <Switch
              value={settings.darkMode}
              onValueChange={toggleDarkMode}
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.row}>
            <Text style={styles.label}>Language</Text>
            <TouchableOpacity onPress={() => {}}>
              <Text style={styles.value}>{settings.language.toUpperCase()}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Notifications Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Notifications</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.label}>Achievements</Text>
            <Switch
              value={settings.notificationPreferences.achievements}
              onValueChange={() => toggleNotification('achievements')}
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.row}>
            <Text style={styles.label}>Concerns</Text>
            <Switch
              value={settings.notificationPreferences.concerns}
              onValueChange={() => toggleNotification('concerns')}
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.row}>
            <Text style={styles.label}>Activities</Text>
            <Switch
              value={settings.notificationPreferences.activities}
              onValueChange={() => toggleNotification('activities')}
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.row}>
            <Text style={styles.label}>Messages</Text>
            <Switch
              value={settings.notificationPreferences.messages}
              onValueChange={() => toggleNotification('messages')}
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.row}>
            <Text style={styles.label}>Push Notifications</Text>
            <Switch
              value={settings.notificationPreferences.pushNotifications}
              onValueChange={() => toggleNotification('pushNotifications')}
            />
          </View>
        </View>
      </View>

      {/* Account Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.row}
            onPress={() => navigation.navigate('ChangePassword')}
          >
            <Text style={styles.label}>Change Password</Text>
            <Text style={styles.arrow}>›</Text>
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity
            style={styles.row}
            onPress={() => {}}
          >
            <Text style={styles.label}>Two-Factor Authentication</Text>
            <Text style={styles.arrow}>›</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Legal Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Legal</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.row}>
            <Text style={styles.label}>Privacy Policy</Text>
            <Text style={styles.arrow}>›</Text>
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity style={styles.row}>
            <Text style={styles.label}>Terms of Service</Text>
            <Text style={styles.arrow}>›</Text>
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity style={styles.row}>
            <Text style={styles.label}>About</Text>
            <Text style={styles.arrow}>›</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Danger Zone */}
      <View style={styles.section}>
        <TouchableOpacity
          style={styles.dangerButton}
          onPress={handleLogout}
        >
          <Text style={styles.dangerButtonText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      <View style={{ height: 20 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  section: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    overflow: 'hidden',
  },
  profileRow: {
    padding: 16,
    paddingBottom: 12,
  },
  profileName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  profileEmail: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  label: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '500',
  },
  value: {
    fontSize: 14,
    color: '#2563eb',
    fontWeight: '500',
  },
  arrow: {
    fontSize: 20,
    color: '#d1d5db',
  },
  divider: {
    height: 1,
    backgroundColor: '#e5e7eb',
  },
  button: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 8,
  },
  buttonText: {
    color: '#2563eb',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  dangerButton: {
    backgroundColor: '#ef4444',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  dangerButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
