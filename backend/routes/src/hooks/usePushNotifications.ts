// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import {
  initializePushNotifications,
  setupNotificationListeners,
  handleNotificationResponse,
} from '../services/pushNotificationService';

interface UsePushNotificationsOptions {
  onNotificationReceived?: (notification: Notifications.Notification) => void;
  onNotificationResponse?: (response: any) => void;
  enabled?: boolean;
}

/**
 * Custom hook for managing push notifications
 */
export const usePushNotifications = (options: UsePushNotificationsOptions = {}) => {
  const {
    onNotificationReceived,
    onNotificationResponse,
    enabled = true,
  } = options;

  useEffect(() => {
    if (!enabled) return;

    let cleanup: (() => void) | undefined;

    const setupNotifications = async () => {
      try {
        // Initialize push notifications
        const token = await initializePushNotifications();

        if (token) {
          // Setup listeners
          cleanup = setupNotificationListeners(
            (notification) => {
              handleNotificationResponse({ notification });
              onNotificationReceived?.(notification);
            },
            (response) => {
              handleNotificationResponse(response);
              onNotificationResponse?.(response);
            }
          );
        }
      } catch (error) {
        console.error('Failed to setup notifications:', error);
      }
    };

    setupNotifications();

    return () => {
      cleanup?.();
    };
  }, [enabled, onNotificationReceived, onNotificationResponse]);
};

/**
 * Hook to request notification permissions
 */
export const useNotificationPermissions = async () => {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      return status === 'granted';
    }

    return true;
  } catch (error) {
    console.error('Failed to request notification permissions:', error);
    return false;
  }
};

