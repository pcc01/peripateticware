// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

// frontend/src/types/phase7.ts

// ============================================================================
// CLASS & ENROLLMENT
// ============================================================================

export interface Class {
  id: string;
  teacher_id: string;
  name: string;
  subject: string;
  grade_level: number;
  school_year: string;
  description?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ClassSettings {
  id: string;
  class_id: string;
  peer_project_approval_mode: 'teacher_gate' | 'auto_publish';
  peer_project_author_sees_individual_responses: boolean;
  students_can_create_peer_projects: boolean;
  students_can_create_field_notes: boolean;
  max_active_self_projects_per_student: number;
  audio_max_duration_seconds: number;
  updated_at: string;
}

// ============================================================================
// CAPTURES (existing, extended for audio)
// ============================================================================

export type CaptureType = 'photo' | 'video' | 'audio' | 'text' | 'sketch' | 'measurement';

export interface CaptureRef {
  id: string;
  capture_type: CaptureType;
  file_path?: string;
  description?: string;
  captured_at: string;
  duration_seconds?: number;
  location_latitude?: number;
  location_longitude?: number;
  transcript: null;  // Always null in Phase 7 — ASR disabled
}

// ============================================================================
// SELF-PROJECTS
// ============================================================================

export type SelfProjectStatus = 'personal' | 'shared' | 'archived';

export interface SelfProject {
  id: string;
  student_id: string;
  title: string;
  description?: string;
  cover_image_url?: string;
  status: SelfProjectStatus;
  field_note_count: number;
  created_at: string;
  updated_at: string;
}

export interface SelfProjectCreate {
  title: string;
  description?: string;
}

export interface SelfProjectShareRequest {
  class_id: string;
  student_message?: string;
}

// ============================================================================
// FIELD NOTES
// ============================================================================

export type FieldNoteStatus = 'draft' | 'shared' | 'submitted' | 'promoted' | 'rejected';

export interface FieldNote {
  capture_count?: number
  id: string;
  student_id: string;
  self_project_id?: string;
  title: string;
  description?: string;
  status: FieldNoteStatus;
  location_latitude?: number;
  location_longitude?: number;
  location_name?: string;
  self_tagged_objective_ids: string[];
  submitted_for_promotion_at?: string;
  submitted_with_message?: string;
  teacher_feedback?: string;
  promoted_activity_id?: string;
  promoted_at?: string;
  captures: CaptureRef[];
  created_at: string;
  updated_at: string;
}

export interface FieldNoteListItem {
  id: string;
  title: string;
  description?: string;
  status: FieldNoteStatus;
  self_project_id?: string;
  capture_count: number;
  location_name?: string;
  created_at: string;
  updated_at: string;
}

export interface FieldNoteCreate {
  title: string;
  description?: string;
  self_project_id?: string;
  self_tagged_objective_ids?: string[];
  location_latitude?: number;
  location_longitude?: number;
  location_name?: string;
}

export interface FieldNoteUpdate extends Partial<FieldNoteCreate> {}

export interface PaginatedFieldNotes {
  items: FieldNoteListItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

// ============================================================================
// PEER PROJECTS
// ============================================================================

export type PeerProjectStatus = 'draft' | 'pending_approval' | 'published' | 'rejected' | 'archived';
export type PeerProjectAudience = 'whole_class' | 'specific_students';

export interface GuidingPrompt {
  prompt: string;
  order: number;
}

export interface LearningObjectiveText {
  text: string;
  order: number;
}

export interface ExampleCapture {
  id: string;
  capture_id: string;
  caption?: string;
  order: number;
  capture?: CaptureRef;
}

export interface PeerProject {
  id: string;
  author_student_id: string;
  class_id: string;
  template_activity_id?: string;
  title: string;
  description: string;
  learning_objectives_text: LearningObjectiveText[];
  guiding_prompts: GuidingPrompt[];
  curriculum_objective_ids: string[];
  allowed_capture_types: CaptureType[];
  audience: PeerProjectAudience;
  target_student_ids: string[];
  status: PeerProjectStatus;
  approval_required: boolean;
  teacher_feedback?: string;
  published_at?: string;
  author_can_see_individual_responses: boolean;
  example_captures: ExampleCapture[];
  response_count: number;
  completed_response_count: number;
  created_at: string;
  updated_at: string;
}

export interface PeerProjectCreate {
  title: string;
  description: string;
  learning_objectives_text: LearningObjectiveText[];
  guiding_prompts: GuidingPrompt[];
  allowed_capture_types: CaptureType[];
  audience: PeerProjectAudience;
  target_student_ids?: string[];
  template_activity_id?: string;
}

export interface PaginatedPeerProjects {
  items: PeerProject[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

// ============================================================================
// PEER PROJECT RESPONSES
// ============================================================================

export type PeerProjectResponseStatus = 'in_progress' | 'completed';

export interface PeerProjectResponse {
  id: string;
  peer_project_id: string;
  student_id: string;
  status: PeerProjectResponseStatus;
  notebook_entry_id?: string;
  completed_at?: string;
  captures: CaptureRef[];
  created_at: string;
  updated_at: string;
}

// ============================================================================
// GRADING
// ============================================================================

export interface PeerProjectGrade {
  id: string;
  response_id: string;
  teacher_id: string;
  score?: number;
  rubric_scores?: Record<string, number>;
  feedback_to_student: string;
  competencies_evidenced: string[];
  feedback_to_author?: string;
  graded_at: string;
  updated_at: string;
}

export interface PeerProjectGradeCreate {
  score?: number;
  rubric_scores?: Record<string, number>;
  feedback_to_student: string;
  competencies_evidenced?: string[];
  feedback_to_author?: string;
}

// ============================================================================
// CROSS-CLASS SHARING
// ============================================================================

export type CrossClassStatus = 'pending' | 'approved' | 'published' | 'declined';

export interface CrossClassShare {
  id: string;
  peer_project_id: string;
  target_class_id: string;
  status: CrossClassStatus;
  anonymized_title?: string;
  student_notified_at?: string;
  student_responded_at?: string;
  published_at?: string;
  created_at: string;
}

// ============================================================================
// AUDIO
// ============================================================================

export interface AudioCaptureResult {
  id: string;
  capture_type: 'audio';
  file_path: string;
  duration_seconds: number;
  file_size_bytes: number;
  mime_type: string;
  transcript: null;
  captured_at: string;
}

export type AudioRecordingState = 'idle' | 'recording' | 'stopped' | 'uploading' | 'done' | 'error';

// ============================================================================
// STUDENT PROPOSALS — Reverse Scavenger Hunt
// ============================================================================

export type ProposalStatus = 'draft' | 'pending' | 'approved' | 'rejected';

export interface Proposal {
  id: string;
  title: string;
  challenge_description: string;
  location_hint: string;
  subject: string;
  note_to_teacher: string;
  status: ProposalStatus;
  teacher_feedback: string;
  student_id: string;
  student_name?: string;
  approved_activity_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProposalCreate {
  title: string;
  challenge_description: string;
  location_hint?: string;
  subject?: string;
  note_to_teacher?: string;
}

export interface ProposalUpdate {
  title?: string;
  challenge_description?: string;
  location_hint?: string;
  subject?: string;
  note_to_teacher?: string;
}

// ============================================================================
// PROFESSOR — FIELDWORK LOCATION MAP
// ============================================================================

export interface FieldworkLocation {
  student_id: string
  student_name: string
  latitude: number
  longitude: number
  location_name: string | null
  submitted_at: string | null
  title: string | null
  type: 'field_note' | 'capture'
}

export interface FieldworkLocationsResponse {
  activity_id: string
  locations: FieldworkLocation[]
  count: number
}
