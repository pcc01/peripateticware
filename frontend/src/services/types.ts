// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

/**
 * Peripateticware API Types
 * Complete TypeScript interfaces for all API endpoints
 */

/* ============================================================================ */
/* AUTH TYPES */
/* ============================================================================ */

export interface LoginRequest {
  email: string
  password: string
}

export interface LoginResponse {
  access_token: string
  token_type: string
  user: User
}

export interface User {
  id: string
  email: string
  username: string
  full_name: string
  role: 'TEACHER' | 'STUDENT' | 'PARENT' | 'ADMIN'
}

/* ============================================================================ */
/* PAGINATION */
/* ============================================================================ */

export interface PaginatedResponse<T> {
  total: number
  skip: number
  limit: number
  items: T[]
}

export interface PaginationParams {
  skip?: number
  limit?: number
}

/* ============================================================================ */
/* TEACHER TYPES */
/* ============================================================================ */

export interface Activity {
  id: string
  title: string
  description: string
  subject: string
  location: string
  status: 'active' | 'completed' | 'pending'
  due_date: string
  created_at: string
  updated_at: string
  student_count: number
  submissions_count: number
  progress: number
  phases: {
    orient: PhaseStatus
    inquiry: PhaseStatus
    reflect: PhaseStatus
  }
}

export interface PhaseStatus {
  status: 'completed' | 'in_progress' | 'pending'
  due_date: string
}

export interface CreateActivityRequest {
  title: string
  description: string
  subject: string
  location: string
  due_date: string
  phases: {
    orient: PhaseRequest
    inquiry: PhaseRequest
    reflect: PhaseRequest
  }
  student_ids: string[]
  rubric_id?: string
  standards?: string[]
}

export interface PhaseRequest {
  title: string
  description: string
  due_date: string
  instructions: string
}

export interface ActivityDetail extends Activity {
  students: StudentProgress[]
}

export interface StudentProgress {
  id: string
  name: string
  status: string
  current_phase: string
  progress: number
  submissions: Submission[]
}

export interface Submission {
  id: string
  student_id: string
  student_name: string
  activity_id: string
  activity_title: string
  phase: string
  submitted_at: string
  status: 'pending_review' | 'approved' | 'rejected'
  evidence: Evidence[]
  notes: string
}

export interface Evidence {
  id: string
  type: 'photo' | 'text' | 'audio' | 'video'
  title: string
  description: string
  url?: string
  content?: string
  created_at: string
}

export interface ApproveSubmissionRequest {
  feedback: string
  score: number
}

export interface TeacherStudent {
  id: string
  name: string
  email: string
  grade: string
  class: string
  activities_completed: number
  activities_in_progress: number
  overall_progress: number
  engagement_score: number
  last_activity: string
}

export interface ClassAnalytics {
  class_stats: {
    total_students: number
    avg_completion_rate: number
    avg_engagement: number
    activities_assigned: number
    activities_completed: number
  }
  competencies: CompetencyStats[]
  top_performers: StudentProgress[]
  students_needing_support: StudentProgress[]
}

export interface CompetencyStats {
  name: string
  avg_level: number
  target_level: number
  trend: 'up' | 'down' | 'stable'
}

/* ============================================================================ */
/* STUDENT TYPES */
/* ============================================================================ */

export interface StudentActivityListItem {
  id: string
  title: string
  description: string
  subject: string
  location: string
  status: 'active' | 'completed' | 'pending'
  due_date: string
  progress: number
  current_phase: string
  teacher: {
    id: string
    name: string
    email: string
  }
}

export interface StudentActivityDetail extends StudentActivityListItem {
  phases: {
    orient: PhaseDetail
    inquiry: PhaseDetail
    reflect: PhaseDetail
  }
}

export interface PhaseDetail extends PhaseStatus {
  title: string
  description: string
  instructions: string
}

export interface SubmitEvidenceRequest {
  phase: string
  evidence: EvidenceSubmission[]
  notes: string
}

export interface EvidenceSubmission {
  type: 'photo' | 'text' | 'audio' | 'video'
  title: string
  description: string
  file?: File
  content?: string
}

export interface Competency {
  id: string
  name: string
  description: string
  level: number
  target_level: number
  progress: number
  evidence: CompetencyEvidence[]
}

export interface CompetencyEvidence {
  id: string
  activity_id: string
  activity_title: string
  submitted_at: string
}

export interface Achievement {
  id: string
  name: string
  description: string
  icon: string
  earned_at: string
  competencies: string[]
}

/* ============================================================================ */
/* PARENT TYPES */
/* ============================================================================ */

export interface Child {
  id: string
  name: string
  grade: string
  school: string
  teacher: {
    id: string
    name: string
    email: string
  }
}

export interface ChildProgress {
  child_id: string
  child_name: string
  grade: string
  school: string
  this_week: {
    activities: number
    hours: number
    engagement_score: number
  }
  competencies: CompetencyOverview[]
}

export interface CompetencyOverview {
  name: string
  level: number
  target_level: number
  progress: number
}

export interface WeeklyDigest {
  child_id: string
  week_starting: string
  summary: string
  activities_completed: number
  new_competencies: string[]
  highlights: string[]
  concerns: string[]
  teacher: {
    name: string
    message_sent_at: string
  }
}

export interface ParentMessage {
  subject: string
  body: string
  attachments?: File[]
}

/* ============================================================================ */
/* ADMIN TYPES */
/* ============================================================================ */

export interface AdminUser {
  id: string
  email: string
  username: string
  full_name: string
  role: 'TEACHER' | 'STUDENT' | 'PARENT' | 'ADMIN'
  status: 'active' | 'inactive' | 'suspended'
  created_at: string
  last_login: string
  class?: string
}

export interface CreateUserRequest {
  email: string
  username: string
  full_name: string
  password: string
  role: 'TEACHER' | 'STUDENT' | 'PARENT' | 'ADMIN'
}

export interface Class {
  id: string
  grade: string
  room: string
  school: string
  teacher: {
    id: string
    name: string
    email: string
  }
  student_count: number
}

export interface SystemHealthResponse {
  status: 'healthy' | 'degraded' | 'down'
  timestamp: string
  services: ServiceStatus[]
  metrics: SystemMetrics
}

export interface ServiceStatus {
  name: string
  status: 'up' | 'down' | 'degraded'
  last_checked: string
  response_time_ms: number
}

export interface SystemMetrics {
  active_users: number
  active_sessions: number
  api_calls_last_hour: number
  error_rate: number
  avg_response_time_ms: number
  db_connections: number
  cache_hit_rate: number
}

export interface PrivacyConfig {
  privacy: {
    data_retention_days: number
    gdpr_enabled: boolean
    hipaa_enabled: boolean
    ferpa_enabled: boolean
    child_privacy_level: string
  }
  llm: {
    provider: string
    model: string
    temperature: number
    max_tokens: number
    enable_local_processing: boolean
  }
}

/* ============================================================================ */
/* LOCATION TYPES */
/* ============================================================================ */

export interface ActivityLocation {
  activity_id: string
  location: {
    name: string
    latitude: number
    longitude: number
    radius_meters: number
  }
  students: StudentLocation[]
}

export interface StudentLocation {
  id: string
  name: string
  latitude: number
  longitude: number
  last_updated: string
  status: 'active' | 'inactive'
}

export interface LocationData {
  id: string
  name: string
  type: 'park' | 'museum' | 'outdoor' | 'other'
  latitude: number
  longitude: number
  description?: string
}

/* ============================================================================ */
/* NOTIFICATION TYPES */
/* ============================================================================ */

export interface Notification {
  id: string
  type: 'submission' | 'message' | 'achievement' | 'reminder'
  title: string
  body: string
  read: boolean
  created_at: string
  related_id?: string
}

/* ============================================================================ */
/* SEARCH TYPES */
/* ============================================================================ */

export interface SearchActivityRequest {
  q: string
  type?: 'title' | 'description' | 'subject'
  filters?: {
    subject?: string
    grade?: string
    location?: string
  }
}

/* ============================================================================ */
/* ERROR TYPES */
/* ============================================================================ */

export interface ApiError {
  detail: string | ValidationError[]
}

export interface ValidationError {
  loc: string[]
  msg: string
  type: string
}

/* ============================================================================ */
/* QUERY PARAMS TYPES */
/* ============================================================================ */

export interface ActivityQueryParams extends PaginationParams {
  status?: 'active' | 'completed' | 'pending'
  subject?: string
  sort_by?: 'created_at' | 'updated_at' | 'due_date'
  sort_order?: 'asc' | 'desc'
}

export interface SubmissionQueryParams extends PaginationParams {
  status?: 'pending_review' | 'approved' | 'rejected'
  student_id?: string
  activity_id?: string
}

export interface UserQueryParams extends PaginationParams {
  role?: 'TEACHER' | 'STUDENT' | 'PARENT' | 'ADMIN'
  status?: 'active' | 'inactive' | 'suspended'
  search?: string
}

export interface LogQueryParams extends PaginationParams {
  level?: 'info' | 'warning' | 'error'
  resource_type?: 'user' | 'activity' | 'submission'
  action?: 'create' | 'update' | 'delete'
  start_date?: string
  end_date?: string
}
