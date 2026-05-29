// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

/**
 * Complete TypeScript Types for Peripateticware API
 * Organized by domain: Auth, Activities, Projects, Sessions, Evidence, Users, etc.
 */

/* ============================================================================ */
/* AUTH TYPES */
/* ============================================================================ */

export interface LoginRequest {
  email?: string
  username?: string
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
  username?: string
  full_name?: string
  first_name?: string
  last_name?: string
  role: 'TEACHER' | 'STUDENT' | 'PARENT' | 'ADMIN'
  created_at?: string
  updated_at?: string
  is_active?: boolean
}

export interface SignupRequest {
  email: string
  password: string
  password_confirm?: string
  full_name?: string
  first_name?: string
  last_name?: string
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
/* ACTIVITY TYPES */
/* ============================================================================ */

export interface Activity {
  id: string
  title: string
  description: string
  subject: string
  grade_level?: string
  location: string
  status: 'active' | 'completed' | 'pending' | 'draft'
  due_date: string
  created_at: string
  updated_at: string
  teacher_id: string
  student_count?: number
  submissions_count?: number
  completion_rate?: number
  phases: {
    orient: PhaseInfo
    inquiry: PhaseInfo
    reflect: PhaseInfo
  }
  rubric_ids?: string[]
  curriculum_links?: string[]
  standards?: string[]
}

export interface PhaseInfo {
  title?: string
  description?: string
  status: 'completed' | 'in_progress' | 'pending'
  due_date?: string
  instructions?: string
}

export interface ActivityFormData {
  title: string
  description: string
  subject: string
  location: string
  due_date: string
  grade_level?: string
  phases: {
    orient: PhaseFormData
    inquiry: PhaseFormData
    reflect: PhaseFormData
  }
  student_ids?: string[]
  rubric_ids?: string[]
  curriculum_standards?: string[]
}

export interface PhaseFormData {
  title: string
  description: string
  due_date: string
  instructions: string
}

export interface CreateActivityRequest extends ActivityFormData {}
export interface UpdateActivityRequest extends Partial<ActivityFormData> {}

export interface PaginatedActivityResponse extends PaginatedResponse<Activity> {}

export interface ActivityFilters {
  status?: 'active' | 'completed' | 'pending' | 'draft'
  subject?: string
  grade_level?: string
  teacher_id?: string
  skip?: number
  limit?: number
  page?: number
  page_size?: number
}

/* ============================================================================ */
/* PROJECT TYPES */
/* ============================================================================ */

export interface Project {
  id: string
  title: string
  description: string
  status: 'active' | 'completed' | 'pending'
  created_at: string
  updated_at: string
  activity_id: string
  student_id: string
  teacher_id: string
  submissions_count: number
  evidence_count: number
  progress: number
  due_date?: string
  rubric_id?: string
}

export interface ProjectFormData {
  title: string
  description: string
  activity_id: string
  student_id?: string
  due_date?: string
  rubric_id?: string
}

export interface PaginatedProjectResponse extends PaginatedResponse<Project> {}

export interface ProjectFilters {
  status?: 'active' | 'completed' | 'pending'
  student_id?: string
  activity_id?: string
  teacher_id?: string
  skip?: number
  limit?: number
  page?: number
  page_size?: number
}

/* ============================================================================ */
/* SESSION TYPES */
/* ============================================================================ */

export interface Session {
  id: string
  activity_id: string
  title: string
  description: string
  location: string
  latitude?: number
  longitude?: number
  start_time: string
  end_time: string
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled'
  created_at: string
  updated_at: string
  teacher_id: string
  student_ids: string[]
  student_count: number
  joined_student_count?: number
  evidence_count?: number
}

export interface SessionFormData {
  activity_id: string
  title: string
  description: string
  location: string
  latitude?: number
  longitude?: number
  start_time: string
  end_time: string
  student_ids: string[]
}

export interface PaginatedSessionResponse extends PaginatedResponse<Session> {}

export interface SessionFilters {
  status?: 'scheduled' | 'in_progress' | 'completed' | 'cancelled'
  activity_id?: string
  teacher_id?: string
  skip?: number
  limit?: number
  page?: number
  page_size?: number
}

/* ============================================================================ */
/* EVIDENCE & CAPTURE TYPES */
/* ============================================================================ */

export interface Evidence {
  id: string
  session_id: string
  student_id: string
  capture_type: 'photo' | 'video' | 'audio' | 'text' | 'sketch'
  file_url?: string
  transcript?: string
  description?: string
  latitude?: number
  longitude?: number
  created_at: string
  updated_at: string
  learning_objectives?: string[]
  competencies?: string[]
}

export interface EvidenceFormData {
  capture_type: 'photo' | 'video' | 'audio' | 'text' | 'sketch'
  description?: string
  latitude?: number
  longitude?: number
  learning_objectives?: string[]
  competencies?: string[]
}

export interface PaginatedEvidenceResponse extends PaginatedResponse<Evidence> {}

export interface EvidenceFilters {
  session_id?: string
  student_id?: string
  capture_type?: 'photo' | 'video' | 'audio' | 'text' | 'sketch'
  skip?: number
  limit?: number
  page?: number
  page_size?: number
}

/* ============================================================================ */
/* PROGRESS & ASSESSMENT TYPES */
/* ============================================================================ */

export interface StudentProgress {
  id: string
  student_id: string
  activity_id: string
  overall_progress: number
  phase_progress: {
    orient: number
    inquiry: number
    reflect: number
  }
  competency_progress: CompetencyProgress[]
  submissions_count: number
  evidence_count: number
  last_updated: string
}

export interface CompetencyProgress {
  competency_id: string
  competency_name: string
  progress: number
  status: 'not_started' | 'in_progress' | 'proficient' | 'advanced'
}

export interface Rubric {
  id: string
  title: string
  description?: string
  teacher_id: string
  criteria: RubricCriterion[]
  total_points: number
  created_at: string
  updated_at: string
  is_template?: boolean
  template_name?: string
}

export interface RubricCriterion {
  id: string
  title: string
  description?: string
  max_points: number
  levels: RubricLevel[]
}

export interface RubricLevel {
  level: number
  description: string
  points: number
}

export interface RubricScore {
  id: string
  rubric_id: string
  assignment_id: string
  student_id: string
  scores: {
    [criterionId: string]: {
      level: number
      points: number
      comments?: string
    }
  }
  total_score: number
  feedback?: string
  scored_by: string
  scored_at: string
}

/* ============================================================================ */
/* CURRICULUM & STANDARDS TYPES */
/* ============================================================================ */

export interface CurriculumUnit {
  id: string
  title: string
  description: string
  subject: string
  grade_level: string
  standards: CurriculumStandard[]
  created_at: string
  updated_at: string
}

export interface CurriculumStandard {
  id: string
  code: string
  title: string
  description: string
  subject: string
  grade_level: string
  bloom_level?: string
}

export interface PaginatedCurriculumResponse extends PaginatedResponse<CurriculumUnit> {}

export interface CurriculumFilters {
  subject?: string
  grade_level?: string
  skip?: number
  limit?: number
  page?: number
  page_size?: number
}

/* ============================================================================ */
/* TEACHER TYPES */
/* ============================================================================ */

export interface TeacherClass {
  id: string
  name: string
  subject: string
  grade_level: string
  student_count: number
  created_at: string
  updated_at: string
}

export interface TeacherSubmission {
  id: string
  project_id: string
  student_id: string
  student_name: string
  status: 'submitted' | 'graded' | 'pending'
  submitted_at: string
  graded_at?: string
  score?: number
  feedback?: string
}

export interface TeacherDashboardData {
  total_students: number
  total_classes: number
  active_activities: number
  pending_submissions: number
  recent_submissions: TeacherSubmission[]
  classes: TeacherClass[]
  activities: Activity[]
}

/* ============================================================================ */
/* PARENT TYPES */
/* ============================================================================ */

export interface LinkedChild {
  id: string
  email: string
  full_name: string
  grade_level: string
  verified: boolean
}

export interface ChildProgress {
  student_id: string
  student_name: string
  overall_progress: number
  activities: Activity[]
  competencies: CompetencyProgress[]
  recent_evidence: Evidence[]
}

export interface ParentDashboardData {
  children: LinkedChild[]
  child_progress: {
    [studentId: string]: ChildProgress
  }
}

/* ============================================================================ */
/* ADMIN TYPES */
/* ============================================================================ */

export interface SystemAnalytics {
  total_users: number
  total_teachers: number
  total_students: number
  total_parents: number
  total_activities: number
  total_sessions: number
  average_session_attendance: number
  system_uptime: number
  database_size: string
}

export interface AdminDashboardData {
  users_count: number
  activities_count: number
  sessions_count: number
  analytics: SystemAnalytics
  recent_users: User[]
}

/* ============================================================================ */
/* STUDENT TYPES */
/* ============================================================================ */

export interface StudentDashboardData {
  progress: StudentProgress[]
  active_projects: Project[]
  upcoming_sessions: Session[]
  available_activities: Activity[]
  recent_evidence: Evidence[]
}

/* ============================================================================ */
/* API ERROR TYPES */
/* ============================================================================ */

export interface ApiError {
  detail?: string | Record<string, any>
  message?: string
  error?: string
  status_code?: number
}

export interface ApiValidationError {
  field: string
  message: string
}
