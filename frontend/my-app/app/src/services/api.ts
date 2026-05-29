// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import axios, { AxiosInstance, AxiosError } from 'axios';
import * as SecureStore from 'expo-secure-store';
import { useAuthStore } from '../stores/authStore';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';

/**
 * API Service
 * Handles all HTTP requests with authentication and token refresh
 */
class ApiService {
  private instance: AxiosInstance;
  private refreshing = false;
  private failedQueue: Array<{
    resolve: (value?: unknown) => void;
    reject: (reason?: unknown) => void;
  }> = [];

  constructor() {
    this.instance = axios.create({
      baseURL: `${API_BASE_URL}/api`,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor - add auth token
    this.instance.interceptors.request.use(
      async (config) => {
        try {
          const token = await SecureStore.getItemAsync('authToken');
          if (token) {
            config.headers.Authorization = `Bearer ${token}`;
          }
        } catch (error) {
          console.error('Error retrieving auth token:', error);
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor - handle 401 and refresh token
    this.instance.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const originalRequest = error.config as any;

        if (error.response?.status === 401 && !originalRequest._retry) {
          if (this.refreshing) {
            // Queue requests while refreshing
            return new Promise((resolve, reject) => {
              this.failedQueue.push({ resolve, reject });
            }).then((token) => {
              originalRequest.headers.Authorization = `Bearer ${token}`;
              return this.instance(originalRequest);
            });
          }

          originalRequest._retry = true;
          this.refreshing = true;

          try {
            const refreshToken = await SecureStore.getItemAsync('refreshToken');
            if (!refreshToken) {
              // No refresh token, logout user
              useAuthStore.setState({ user: null, token: null, isAuthenticated: false });
              return Promise.reject(error);
            }

            const response = await axios.post(`${API_BASE_URL}/api/auth/refresh`, {
              refresh_token: refreshToken,
            });

            const { access_token, refresh_token } = response.data;

            // Store new tokens
            await SecureStore.setItemAsync('authToken', access_token);
            if (refresh_token) {
              await SecureStore.setItemAsync('refreshToken', refresh_token);
            }

            // Update auth store
            useAuthStore.setState({ token: access_token });

            // Process queued requests
            this.failedQueue.forEach(({ resolve }) => resolve(access_token));
            this.failedQueue = [];

            // Retry original request
            originalRequest.headers.Authorization = `Bearer ${access_token}`;
            return this.instance(originalRequest);
          } catch (refreshError) {
            // Refresh failed, logout user
            useAuthStore.setState({ user: null, token: null, isAuthenticated: false });
            this.failedQueue = [];
            return Promise.reject(refreshError);
          } finally {
            this.refreshing = false;
          }
        }

        return Promise.reject(error);
      }
    );
  }

  /**
   * Get axios instance for custom requests
   */
  getClient(): AxiosInstance {
    return this.instance;
  }

  // ==================== Authentication ====================

  /**
   * Register a new user
   */
  async register(data: {
    email: string;
    password: string;
    name: string;
    role: 'parent' | 'teacher' | 'admin';
    school_id?: string;
  }) {
    const response = await this.instance.post('/auth/register', data);
    return response.data;
  }

  /**
   * Login user
   */
  async login(email: string, password: string) {
    const response = await this.instance.post('/auth/login', {
      email,
      password,
    });

    const { access_token, refresh_token, user } = response.data;

    // Store tokens
    await SecureStore.setItemAsync('authToken', access_token);
    if (refresh_token) {
      await SecureStore.setItemAsync('refreshToken', refresh_token);
    }

    return { access_token, refresh_token, user };
  }

  /**
   * Refresh access token
   */
  async refreshToken(refreshToken: string) {
    const response = await this.instance.post('/auth/refresh', {
      refresh_token: refreshToken,
    });
    return response.data;
  }

  /**
   * Request password reset
   */
  async requestPasswordReset(email: string) {
    const response = await this.instance.post('/auth/forgot-password', { email });
    return response.data;
  }

  /**
   * Reset password with token
   */
  async resetPassword(token: string, newPassword: string) {
    const response = await this.instance.post('/auth/reset-password', {
      token,
      new_password: newPassword,
    });
    return response.data;
  }

  /**
   * Logout user
   */
  async logout() {
    try {
      await this.instance.post('/auth/logout');
    } catch (error) {
      console.error('Error during logout:', error);
    }

    // Clear tokens
    await SecureStore.deleteItemAsync('authToken');
    await SecureStore.deleteItemAsync('refreshToken');
  }

  // ==================== User ====================

  /**
   * Get current user profile
   */
  async getUserProfile() {
    const response = await this.instance.get('/users/me');
    return response.data;
  }

  /**
   * Update user profile
   */
  async updateUserProfile(data: Partial<any>) {
    const response = await this.instance.put('/users/me', data);
    return response.data;
  }

  /**
   * Change password
   */
  async changePassword(currentPassword: string, newPassword: string) {
    const response = await this.instance.post('/users/change-password', {
      current_password: currentPassword,
      new_password: newPassword,
    });
    return response.data;
  }

  // ==================== Children ====================

  /**
   * Get all children for parent
   */
  async getChildren() {
    const response = await this.instance.get('/children');
    return response.data;
  }

  /**
   * Get single child
   */
  async getChild(childId: string) {
    const response = await this.instance.get(`/children/${childId}`);
    return response.data;
  }

  /**
   * Link child to parent
   */
  async linkChild(childCode: string) {
    const response = await this.instance.post('/children/link', {
      child_code: childCode,
    });
    return response.data;
  }

  // ==================== Activities ====================

  /**
   * Get activities for a child
   */
  async getChildActivities(childId: string, limit = 50, offset = 0) {
    const response = await this.instance.get('/activities', {
      params: {
        child_id: childId,
        limit,
        offset,
      },
    });
    return response.data;
  }

  /**
   * Get activity details
   */
  async getActivity(activityId: string) {
    const response = await this.instance.get(`/activities/${activityId}`);
    return response.data;
  }

  /**
   * Get activity evidence
   */
  async getActivityEvidence(activityId: string) {
    const response = await this.instance.get(`/activities/${activityId}/evidence`);
    return response.data;
  }

  // ==================== Evidence ====================

  /**
   * Get evidence for activity
   */
  async getEvidence(activityId: string) {
    const response = await this.instance.get(
      `/activities/${activityId}/evidence`
    );
    return response.data;
  }

  /**
   * Get single evidence
   */
  async getEvidenceDetail(evidenceId: string) {
    const response = await this.instance.get(`/evidence/${evidenceId}`);
    return response.data;
  }

  /**
   * Upload evidence (file)
   */
  async uploadEvidence(
    activityId: string,
    file: any,
    evidenceType: 'photo' | 'note' | 'audio' | 'video'
  ) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('evidence_type', evidenceType);

    const response = await this.instance.post(
      `/activities/${activityId}/evidence`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );
    return response.data;
  }

  /**
   * Create evidence (text/note)
   */
  async createEvidence(
    activityId: string,
    data: {
      content: string;
      evidence_type: string;
      location?: { lat: number; lon: number };
    }
  ) {
    const response = await this.instance.post(
      `/activities/${activityId}/evidence`,
      data
    );
    return response.data;
  }

  // ==================== Progress ====================

  /**
   * Get child progress
   */
  async getProgress(childId: string) {
    const response = await this.instance.get(`/children/${childId}/progress`);
    return response.data;
  }

  /**
   * Get progress by learning area
   */
  async getProgressByArea(childId: string, area: string) {
    const response = await this.instance.get(
      `/children/${childId}/progress/${area}`
    );
    return response.data;
  }

  // ==================== Feedback ====================

  /**
   * Get feedback for evidence
   */
  async getFeedback(evidenceId: string) {
    const response = await this.instance.get(`/evidence/${evidenceId}/feedback`);
    return response.data;
  }

  /**
   * Get all feedback for activity
   */
  async getActivityFeedback(activityId: string) {
    const response = await this.instance.get(
      `/activities/${activityId}/feedback`
    );
    return response.data;
  }

  // ==================== Notifications ====================

  /**
   * Get all notifications
   */
  async getNotifications(limit = 50, offset = 0) {
    const response = await this.instance.get('/notifications', {
      params: { limit, offset },
    });
    return response.data;
  }

  /**
   * Mark notification as read
   */
  async markNotificationAsRead(notificationId: string) {
    const response = await this.instance.put(
      `/notifications/${notificationId}/read`
    );
    return response.data;
  }

  /**
   * Delete notification
   */
  async deleteNotification(notificationId: string) {
    const response = await this.instance.delete(
      `/notifications/${notificationId}`
    );
    return response.data;
  }

  /**
   * Register push notification token
   */
  async registerPushToken(token: string) {
    const response = await this.instance.post('/notifications/register-token', {
      token,
      platform: 'ios', // or 'android'
    });
    return response.data;
  }

  /**
   * Update notification preferences
   */
  async updateNotificationPreferences(preferences: {
    activity_completed?: boolean;
    achievement_unlocked?: boolean;
    teacher_message?: boolean;
    weekly_summary?: boolean;
  }) {
    const response = await this.instance.put(
      '/notifications/preferences',
      preferences
    );
    return response.data;
  }

  // ==================== Competencies ====================

  /**
   * Get competencies for child
   */
  async getCompetencies(childId: string) {
    const response = await this.instance.get(
      `/children/${childId}/competencies`
    );
    return response.data;
  }

  /**
   * Get competency detail
   */
  async getCompetencyDetail(childId: string, competencyId: string) {
    const response = await this.instance.get(
      `/children/${childId}/competencies/${competencyId}`
    );
    return response.data;
  }

  // ==================== Settings ====================

  /**
   * Get app settings
   */
  async getSettings() {
    const response = await this.instance.get('/settings');
    return response.data;
  }

  /**
   * Update app settings
   */
  async updateSettings(settings: any) {
    const response = await this.instance.put('/settings', settings);
    return response.data;
  }

  /**
   * Get curriculum
   */
  async getCurriculum() {
    const response = await this.instance.get('/curriculum');
    return response.data;
  }

  // ==================== Health Check ====================

  /**
   * Health check endpoint
   */
  async healthCheck() {
    try {
      const response = await this.instance.get('/health');
      return response.data;
    } catch (error) {
      return { status: 'error' };
    }
  }

  // ==================== Error Handling ====================

  /**
   * Handle API errors
   */
  static handleError(error: any) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const data = error.response?.data;

      switch (status) {
        case 400:
          return { error: data?.detail || 'Bad request' };
        case 401:
          return { error: 'Unauthorized - please login again' };
        case 403:
          return { error: 'Forbidden - you do not have access' };
        case 404:
          return { error: 'Not found' };
        case 500:
          return { error: 'Server error - please try again later' };
        case 503:
          return { error: 'Service unavailable - please try again later' };
        default:
          return { error: data?.detail || 'An error occurred' };
      }
    }

    return { error: 'Network error - please check your connection' };
  }
}

// Create singleton instance
const apiService = new ApiService();

export default apiService;

