# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

// src/types/parent.ts

export interface ParentAccount {
  id: string;
  email: string;
  name: string;
  phone?: string;
  createdAt: string;
  children: ChildLink[];
}

export interface ChildLink {
  id: string;
  childId: string;
  childName: string;
  childAvatar?: string;
  relationship: 'mother' | 'father' | 'guardian' | 'grandparent' | 'other';
  linkedAt: string;
}

export interface ChildProgress {
  childId: string;
  childName: string;
  grade: number;
  competencies: CompetencyProgress[];
  activitiesCompleted: number;
  hoursLearned: number;
  engagementScore: number; // 0-100
  lastActive: string;
}

export interface CompetencyProgress {
  id: string;
  name: string;
  description: string;
  level: 1 | 2 | 3 | 4 | 5;
  targetLevel: 1 | 2 | 3 | 4 | 5;
  progress: number; // 0-100
  achievedAt?: string;
  evidence: EvidenceItem[];
}

export interface EvidenceItem {
  id: string;
  type: 'photo' | 'text' | 'audio' | 'video';
  title: string;
  description: string;
  url: string;
  createdAt: string;
  activity: ActivityRef;
}

export interface ActivityRef {
  id: string;
  title: string;
  subject: string;
  location?: string;
}

export interface ChildActivity {
  id: string;
  sessionId: string;
  title: string;
  subject: string;
  description: string;
  completedAt: string;
  duration: number; // in minutes
  location?: string;
  evidenceCount: number;
  teacher: TeacherRef;
}

export interface TeacherRef {
  id: string;
  name: string;
  email: string;
  photo?: string;
}

export interface Message {
  id: string;
  fromTeacherId: string;
  fromTeacherName: string;
  toParentId: string;
  subject: string;
  body: string;
  attachments: Attachment[];
  readAt?: string;
  createdAt: string;
  conversationId: string;
}

export interface Attachment {
  id: string;
  filename: string;
  url: string;
  type: string;
}

export interface Reply {
  id: string;
  messageId: string;
  fromParentId: string;
  body: string;
  attachments: Attachment[];
  createdAt: string;
}

export interface WeeklyReport {
  childId: string;
  weekStarting: string;
  weekEnding: string;
  activitiesCompleted: number;
  totalHours: number;
  newCompetencies: string[];
  highlights: string[];
  concerns: string[];
  averageEngagement: number;
  comparison: {
    classAverage: number;
    classRange: { min: number; max: number };
  };
}

export interface MonthlyReport {
  childId: string;
  month: string;
  year: number;
  activitiesCompleted: number;
  totalHours: number;
  competenciesAchieved: CompetencyProgress[];
  engagementTrend: EngagementPoint[];
  topSubjects: SubjectStats[];
  growthAreas: string[];
  recommendations: string[];
}

export interface EngagementPoint {
  date: string;
  score: number;
}

export interface SubjectStats {
  subject: string;
  hoursSpent: number;
  activitiesCompleted: number;
  competenciesAchieved: number;
}

export interface EmailSchedule {
  id: string;
  parentId: string;
  frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly';
  dayOfWeek?: number; // 0-6
  dayOfMonth?: number; // 1-31
  timeOfDay: string; // HH:MM format
  enabled: boolean;
  emailType: 'digest' | 'alerts' | 'both';
}

export interface Notification {
  id: string;
  parentId: string;
  type: 'achievement' | 'concern' | 'message' | 'reminder';
  title: string;
  body: string;
  relatedChildId: string;
  actionUrl?: string;
  readAt?: string;
  createdAt: string;
}

export interface Settings {
  parentId: string;
  darkMode: boolean;
  language: 'en' | 'es' | 'ar' | 'ja';
  emailFrequency: EmailSchedule;
  notificationsEnabled: boolean;
  pushNotificationsEnabled: boolean;
  privacyLevel: 'full' | 'limited' | 'restricted';
}

export interface ExportFormat {
  format: 'pdf' | 'excel' | 'csv';
  includeGraphics: boolean;
  includeSummary: boolean;
  dateRange: {
    start: string;
    end: string;
  };
}

export interface ReportData {
  childName: string;
  reportPeriod: string;
  generatedAt: string;
  content: MonthlyReport | WeeklyReport;
  signature?: string;
}
