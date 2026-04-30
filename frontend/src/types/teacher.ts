/**
 * Type definitions for teacher features
 * Activities and Projects
 */

export type ActivityType = 'inquiry' | 'discussion' | 'hands_on' | 'virtual' | 'hybrid';
export type ActivityStatus = 'draft' | 'published' | 'archived';
export type ProjectStatus = 'planning' | 'active' | 'completed' | 'archived';

// Activity Types
export interface Activity {
  id: string;
  teacher_id: string;
  title: string;
  description: string;
  location_latitude: number;
  location_longitude: number;
  location_radius_meters: number;
  location_name: string;
  grade_level: number;
  subject: string;
  difficulty_level: number; // 1-5
  estimated_duration_minutes: number;
  materials_needed: string[];
  resources: { url?: string; title?: string }[];
  learning_objectives: string[];
  curriculum_unit_ids: string[];
  bloom_level: number; // 1-6
  activity_type: ActivityType;
  is_shareable: boolean;
  status: ActivityStatus;
  is_active: boolean;
  view_count: number;
  created_at: string;
  updated_at: string;
  published_at: string | null;
}

export interface ActivityFormData {
  title: string;
  description: string;
  location_latitude: number;
  location_longitude: number;
  location_radius_meters: number;
  location_name: string;
  grade_level: number;
  subject: string;
  difficulty_level: number;
  estimated_duration_minutes: number;
  materials_needed: string[];
  resources: { url?: string; title?: string }[];
  learning_objectives: string[];
  curriculum_unit_ids: string[];
  bloom_level: number;
  activity_type: ActivityType;
  is_shareable: boolean;
}

export interface ActivityListResponse {
  id: string;
  teacher_id: string;
  title: string;
  description: string;
  subject: string;
  grade_level: number;
  difficulty_level: number;
  estimated_duration_minutes: number;
  status: ActivityStatus;
  activity_type: ActivityType;
  view_count: number;
  created_at: string;
  updated_at: string;
}

export interface PaginatedActivityResponse {
  items: ActivityListResponse[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

// Project Types
export interface Project {
  id: string;
  teacher_id: string;
  title: string;
  description: string;
  grade_level: number;
  subject: string;
  duration_weeks: number;
  start_date: string;
  end_date: string | null;
  status: ProjectStatus;
  activities: ActivityListResponse[];
  created_at: string;
  updated_at: string;
}

export interface ProjectFormData {
  title: string;
  description: string;
  grade_level: number;
  subject: string;
  duration_weeks: number;
  start_date: string;
  end_date: string | null;
}

export interface ProjectListResponse {
  id: string;
  teacher_id: string;
  title: string;
  description: string;
  subject: string;
  grade_level: number;
  duration_weeks: number;
  start_date: string;
  end_date: string | null;
  status: ProjectStatus;
  activity_count: number;
  created_at: string;
  updated_at: string;
}

export interface PaginatedProjectResponse {
  items: ProjectListResponse[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

// Curriculum Types
export interface CurriculumUnit {
  id: string;
  title: string;
  description: string;
  subject: string;
  grade_level: number;
  bloom_level: number;
  created_at: string;
}

export interface PaginatedCurriculumResponse {
  items: CurriculumUnit[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

// API Response Types
export interface ApiError {
  detail: string;
  status_code: number;
}

// Filter Types
export interface ActivityFilters {
  status?: ActivityStatus;
  subject?: string;
  grade_level?: number;
  difficulty?: number;
  page: number;
  page_size: number;
}

export interface ProjectFilters {
  status?: ProjectStatus;
  subject?: string;
  page: number;
  page_size: number;
}

export interface CurriculumFilters {
  subject?: string;
  grade_level?: number;
  page: number;
  page_size: number;
}
