# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { useAuthStore } from '../stores/authStore';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';

// Configure notification handler
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    return {
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    };
  },
});

interface NotificationResponse {
  notification: Notifications.Notification;
  actionId?: string;
}

/**
 * Initialize push notifications
 * Requires Firebase project setup with Expo
 */
export const initializePushNotifications = async (): Promise<string | null> => {
  try {
    // Check if device supports notifications
    if (!Device.isDevice) {
      console.warn('Push notifications require a physical device');
      return null;
    }

    // Get the project ID for Expo
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) {
      console.warn('EAS project ID not found in app.json');
      return null;
    }

    // Request notification permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.warn('Failed to get push notification permissions');
      return null;
    }

    // Get the push token
    const token = await Notifications.getExpoPushTokenAsync({
      projectId,
    });

    console.log('Push notification token:', token.data);

    // Store token securely
    await SecureStore.setItemAsync('pushNotificationToken', token.data);

    // Register token with backend
    await registerPushToken(token.data);

    return token.data;
  } catch (error) {
    console.error('Failed to initialize push notifications:', error);
    return null;
  }
};

/**
 * Register push token with backend
 */
export const registerPushToken = async (token: string): Promise<void> => {
  try {
    const authStore = useAuthStore.getState();
    if (!authStore.token) return;

    await axios.post(
      `${API_BASE_URL}/notifications/tokens`,
      { token, platform: Device.osVersion ? 'ios' : 'android' },
      {
        headers: { Authorization: `Bearer ${authStore.token}` },
      }
    );
  } catch (error) {
    console.error('Failed to register push token:', error);
  }
};

/**
 * Set up notification listeners
 */
export const setupNotificationListeners = (
  onNotificationReceived?: (notification: Notifications.Notification) => void,
  onNotificationResponse?: (response: NotificationResponse) => void
): (() => void) => {
  // Listen for notifications when app is in foreground
  const notificationListener = Notifications.addNotificationReceivedListener(
    (notification) => {
      if (onNotificationReceived) {
        onNotificationReceived(notification);
      }
    }
  );

  // Listen for notification taps (when app is in background or closed)
  const responseListener = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      if (onNotificationResponse) {
        onNotificationResponse({
          notification: response.notification,
          actionId: response.actionIdentifier,
        });
      }
    }
  );

  // Return cleanup function
  return () => {
    Notifications.removeNotificationSubscription(notificationListener);
    Notifications.removeNotificationSubscription(responseListener);
  };
};

/**
 * Send a test notification (for development)
 */
export const sendTestNotification = async (): Promise<void> => {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Test Notification",
        body: "This is a test push notification",
        data: { test: true },
      },
      trigger: { seconds: 2 },
    });
  } catch (error) {
    console.error('Failed to send test notification:', error);
  }
};

/**
 * Handle notification response (deep linking, etc.)
 */
export const handleNotificationResponse = (response: NotificationResponse): void => {
  const { notification } = response;
  const data = notification.request.content.data;

  // Route based on notification type
  switch (data.type) {
    case 'achievement':
      // Navigate to child progress screen
      console.log('Achievement notification:', data);
      break;
    case 'concern':
      // Navigate to activity details
      console.log('Concern notification:', data);
      break;
    case 'message':
      // Navigate to messages
      console.log('Message notification:', data);
      break;
    default:
      console.log('Unknown notification type:', data.type);
  }
};

/**
 * Unregister push token (on logout)
 */
export const unregisterPushToken = async (): Promise<void> => {
  try {
    const token = await SecureStore.getItemAsync('pushNotificationToken');
    if (!token) return;

    const authStore = useAuthStore.getState();
    if (!authStore.token) return;

    await axios.delete(`${API_BASE_URL}/notifications/tokens/${token}`, {
      headers: { Authorization: `Bearer ${authStore.token}` },
    });

    await SecureStore.deleteItemAsync('pushNotificationToken');
  } catch (error) {
    console.error('Failed to unregister push token:', error);
  }
};
