// User & Authentication Types
export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'parent' | 'teacher' | 'admin';
  avatarUrl?: string;
  createdAt: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export interface RegisterRequest {
  email: string;
  password: string;
  confirmPassword: string;
  firstName: string;
  lastName: string;
  parentRelationship?: string;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  token: string | null;
}

// Child & Progress Types
export interface Child {
  id: string;
  name: string;
  grade: string;
  avatarUrl?: string;
  linkedAt: string;
  status: 'active' | 'inactive';
}

export interface ChildProgress {
  childId: string;
  completedActivities: number;
  totalActivities: number;
  percentComplete: number;
  lastActivityDate?: string;
  learningAreas: LearningArea[];
}

export interface LearningArea {
  name: string;
  progress: number;
  count: number;
}

export interface Activity {
  id: string;
  title: string;
  description: string;
  category: string;
  status: 'not_started' | 'in_progress' | 'completed';
  completionDate?: string;
  evidence?: Evidence[];
  dueDate?: string;
}

export interface Evidence {
  id: string;
  type: 'photo' | 'video' | 'text' | 'audio';
  url: string;
  caption?: string;
  timestamp: string;
}

// Notification Types
export interface Notification {
  id: string;
  type: 'achievement' | 'concern' | 'activity' | 'message' | 'update';
  title: string;
  message: string;
  timestamp: string;
  isRead: boolean;
  relatedData?: Record<string, any>;
}

export interface NotificationPreferences {
  achievements: boolean;
  concerns: boolean;
  activities: boolean;
  messages: boolean;
  systemUpdates: boolean;
  emailNotifications: boolean;
  pushNotifications: boolean;
}

// Settings Types
export interface UserSettings {
  language: string;
  darkMode: boolean;
  emailPreferences: EmailPreferences;
  notificationPreferences: NotificationPreferences;
  privacySettings: PrivacySettings;
}

export interface EmailPreferences {
  weeklyDigest: boolean;
  monthlyReport: boolean;
  achievements: boolean;
  concerns: boolean;
  systemNotifications: boolean;
}

export interface PrivacySettings {
  shareProgress: boolean;
  allowMessages: boolean;
  dataCollection: 'minimal' | 'standard' | 'full';
}

// API Response Types
export interface ApiResponse<T> {
  data: T;
  status: number;
  message?: string;
}

export interface ApiError {
  message: string;
  code: string;
  status: number;
  details?: Record<string, any>;
}

// Form Types
export interface FormErrors {
  [key: string]: string;
}

// Network State
export interface NetworkState {
  isConnected: boolean;
  type: 'wifi' | 'cellular' | 'none' | 'unknown';
}

// Cache Types
export interface CacheItem<T> {
  data: T;
  timestamp: number;
  expiresIn: number; // milliseconds
}
