# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

// Phase 6: Student Capture, Notebook, Portfolio, Progress Types
// Import existing types
import { SessionStatus } from '@/config/constants';

// ============================================================
// CAPTURE TYPES
// ============================================================

export type CaptureType = 'photo' | 'video' | 'audio' | 'text' | 'sketch' | 'measurement';

export interface Capture {
  id: string;
  session_id: string;
  student_id: string;
  activity_id: string;
  capture_type: CaptureType;
  file_url: string;
  title: string;
  description: string;
  location_latitude?: number;
  location_longitude?: number;
  learning_objectives: string[];
  competencies: string[];
  ai_analysis?: {
    quality_score: number;
    insights: string[];
  };
  created_at: string;
}

export interface CaptureFormData {
  title: string;
  description: string;
  capture_type: CaptureType;
  file?: File;
  learning_objectives: string[];
  competencies: string[];
}

export interface CaptureFilters {
  type?: CaptureType;
  status?: string;
  search?: string;
  sort?: 'recent' | 'oldest' | 'quality';
}

// ============================================================
// ANNOTATION TYPES
// ============================================================

export interface Annotation {
  id: string;
  capture_id: string;
  type: 'region' | 'label' | 'highlight';
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
  label: string;
  explanation: string;
  learning_objectives: string[];
}

// ============================================================
// NOTEBOOK ENTRY TYPES
// ============================================================

export type ReflectionType = 'guided' | 'freeform' | 'structured';

export interface NotebookEntry {
  id: string;
  session_id: string;
  student_id: string;
  title: string;
  content: string;
  reflection_type: ReflectionType;
  prompts_used: string[];
  prompt_responses: Record<string, string>;
  learning_objectives: string[];
  competencies: string[];
  capture_ids: string[];
  status: 'draft' | 'submitted' | 'reviewed' | 'approved';
  teacher_feedback?: string;
  ai_suggestions?: string[];
  created_at: string;
}

export interface NotebookEntryFormData {
  title: string;
  content: string;
  reflection_type: ReflectionType;
  prompts_used?: string[];
  prompt_responses?: Record<string, string>;
  learning_objectives: string[];
  competencies: string[];
  capture_ids: string[];
}

export interface EntryFilters {
  type?: ReflectionType;
  status?: string;
  search?: string;
  sort?: 'recent' | 'oldest';
}

// ============================================================
// PORTFOLIO TYPES
// ============================================================

export interface EvidenceCollection {
  id: string;
  student_id: string;
  session_id: string;
  title: string;
  description?: string;
  captures: Capture[];
  entries: NotebookEntry[];
  status: 'draft' | 'submitted' | 'reviewed';
  quality_score?: number;
  competencies_demonstrated: string[];
  teacher_review?: {
    feedback: string;
    reviewed_at: string;
  };
  created_at: string;
}

// ============================================================
// PROGRESS DASHBOARD TYPES
// ============================================================

export type CompetencyLevel = 'emerging' | 'developing' | 'proficient' | 'advanced';

export interface CompetencyProgress {
  competency_id: string;
  competency_name: string;
  current_level: CompetencyLevel;
  progress_percentage: number;
  evidence_count: number;
  level_history: Array<{
    level: CompetencyLevel;
    date: string;
    evidence_id: string;
  }>;
}

export interface LearningObjectiveProgress {
  objective_id: string;
  objective_name: string;
  status: 'not_started' | 'in_progress' | 'achieved' | 'exceeded';
  progress_percentage: number;
  evidence_ids: string[];
}

export interface ActivityProgress {
  activity_id: string;
  activity_name: string;
  completed_at?: string;
  captures_count: number;
  entries_count: number;
}

export interface ProgressDashboard {
  student_id: string;
  activities_completed: number;
  total_captures: number;
  competencies: CompetencyProgress[];
  learning_objectives: LearningObjectiveProgress[];
  weekly_engagement: number[];
  quality_trend: number[];
  competency_growth: Record<string, number>;
  engagement_streak_days: number;
  last_updated: string;
}

// ============================================================
// SESSION CONTEXT
// ============================================================

export interface SessionContext {
  session_id: string;
  student_id: string;
  activity_id: string;
  activity_name: string;
  learning_objectives: Array<{ id: string; name: string }>;
  competencies: Array<{ id: string; name: string }>;
  location_latitude?: number;
  location_longitude?: number;
}
