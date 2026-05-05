// ==============================================================================
// frontend/src/types/student.ts
// Type definitions for Phase 6 student features
// ==============================================================================

import { UUID } from 'crypto';

// ==============================================================================
// ENUMS
// ==============================================================================

export enum CaptureType {
  PHOTO = 'photo',
  VIDEO = 'video',
  AUDIO = 'audio',
  TEXT = 'text',
  SKETCH = 'sketch',
  MEASUREMENT = 'measurement'
}

export enum NotebookEntryType {
  REFLECTION = 'reflection',
  QUESTION = 'question',
  DISCOVERY = 'discovery',
  HYPOTHESIS = 'hypothesis',
  FREEFORM = 'freeform'
}

export enum AnnotationType {
  TEXT_LABEL = 'text_label',
  BOX = 'box',
  ARROW = 'arrow',
  EXPLANATION = 'explanation'
}

export enum CompetencyStatus {
  NOT_STARTED = 'not_started',
  DEVELOPING = 'developing',
  PROFICIENT = 'proficient',
  ADVANCED = 'advanced'
}

export enum TranscriptionStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

// ==============================================================================
// CAPTURE TYPES
// ==============================================================================

export interface StudentCapture {
  id: string;
  student_id: string;
  activity_id?: string;
  session_id?: string;
  capture_type: CaptureType;
  file_path: string;
  file_size_bytes?: number;
  mime_type?: string;
  captured_at: string;
  location_latitude?: number;
  location_longitude?: number;
  location_name?: string;
  description?: string;
  transcript?: string;
  transcript_confidence?: number;
  transcript_language?: string;
  transcript_status?: TranscriptionStatus;
  transcript_source?: string;
  duration_seconds?: number;
  dimensions?: string;
  created_at: string;
  updated_at: string;
}

// ==============================================================================
// NOTEBOOK TYPES
// ==============================================================================

export interface StudentNotebook {
  id: string;
  student_id: string;
  activity_id?: string;
  session_id?: string;
  entry_type: NotebookEntryType;
  prompt?: string;
  content: string;
  learning_objectives_tagged?: string[];
  competencies_addressed?: string[];
  reflection_depth: string;
  word_count: number;
  created_at: string;
  updated_at: string;
}

export interface NotebookFeedback {
  id: string;
  notebook_id: string;
  teacher_id: string;
  comment: string;
  is_positive: boolean;
  competency_level?: string;
  created_at: string;
  updated_at: string;
}

// ==============================================================================
// ANNOTATION TYPES
// ==============================================================================

export interface StudentAnnotation {
  id: string;
  capture_id: string;
  student_id: string;
  annotation_type: AnnotationType;
  content: string;
  position_x?: number;
  position_y?: number;
  position_width?: number;
  position_height?: number;
  linked_objective?: string;
  linked_concept?: string;
  explanation: string;
  created_at: string;
  updated_at: string;
}

// ==============================================================================
// COMPETENCY TYPES
// ==============================================================================

export interface StudentCompetency {
  id: string;
  student_id: string;
  competency_name: string;
  description: string;
  category: string;
  status: CompetencyStatus;
  progress_percent: number;
  evidence_count: number;
  first_achieved_at?: string;
  last_achieved_at?: string;
  created_at: string;
  updated_at: string;
}

// ==============================================================================
// PORTFOLIO TYPES
// ==============================================================================

export interface Portfolio {
  captures: StudentCapture[];
  notebook_entries: StudentNotebook[];
  competencies: StudentCompetency[];
  created_at: string;
}

export interface PortfolioStats {
  total_captures: number;
  total_entries: number;
  total_competencies: number;
  competencies_proficient: number;
  total_evidence_hours: number;
}

// ==============================================================================
// TRANSCRIPTION TYPES
// ==============================================================================

export interface TranscriptionResult {
  text: string;
  confidence: number;
  language: string;
  provider: string;
  duration_seconds: number;
  status: string;
  words?: Array<{
    word: string;
    confidence: number;
    start_ms: number;
    end_ms: number;
  }>;
}

// ==============================================================================
// LINKING TYPES
// ==============================================================================

export interface NotebookCaptureLink {
  id: string;
  notebook_id: string;
  capture_id: string;
  created_at: string;
}

// ==============================================================================
// REQUEST/RESPONSE TYPES
// ==============================================================================

export interface CaptureUploadRequest {
  file: File;
  captureType: CaptureType;
  activityId?: string;
  sessionId?: string;
  latitude?: number;
  longitude?: number;
  locationName?: string;
  description?: string;
}

export interface NotebookCreateRequest {
  entryType: NotebookEntryType;
  content: string;
  prompt?: string;
  activityId?: string;
  sessionId?: string;
  learningObjectivesTagged?: string[];
  competenciesAddressed?: string[];
}

export interface AnnotationCreateRequest {
  annotationType: AnnotationType;
  content: string;
  positionX?: number;
  positionY?: number;
  positionWidth?: number;
  positionHeight?: number;
  linkedObjective?: string;
  linkedConcept?: string;
  explanation: string;
}

// ==============================================================================
// OFFLINE STORAGE TYPES
// ==============================================================================

export interface StoredCapture {
  id: string;
  file: Blob;
  metadata: Record<string, any>;
  uploadedAt?: number;
}

export interface StoredNotebook {
  id: string;
  content: string;
  linkedCaptures: string[];
  savedAt: number;
  syncedAt?: number;
}

// ==============================================================================
// ACTIVITY TYPES (for reference)
// ==============================================================================

export interface Activity {
  id: string;
  title: string;
  description: string;
  objectives?: string[];
  inquiry_prompts?: string[];
  location?: {
    latitude: number;
    longitude: number;
    name: string;
  };
  duration_minutes?: number;
}

// ==============================================================================
// STATISTICS TYPES
// ==============================================================================

export interface StudentStats {
  activitiesCompleted: number;
  evidenceCollected: number;
  entriesWritten: number;
  hoursSpent: number;
  averageReflectionDepth: string;
  competenciesAchieved: number;
}

export interface LearningTimeline {
  date: string;
  capturesCount: number;
  entriesCount: number;
  competenciesUnlocked: string[];
}
