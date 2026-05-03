// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

/**
 * Teacher Module Types and Interfaces
 * Complete type definitions for activities, store, and API responses
 */

export interface Activity {
  id: string
  teacher_id: string
  title: string
  description: string
  grade_level: number
  subject: string
  difficulty_level: number
  location_latitude: number
  location_longitude: number
  location_radius_meters: number
  location_name: string
  estimated_duration_minutes: number
  materials_needed: string[]
  resources: string[]
  learning_objectives: string[]
  curriculum_unit_ids: string[]
  bloom_level: 'remember' | 'understand' | 'apply' | 'analyze' | 'evaluate' | 'create'
  activity_type: 'outdoor' | 'indoor' | 'virtual' | 'mixed'
  is_shareable: boolean
  status: 'draft' | 'published' | 'archived'
  created_at: string
  updated_at: string
  published_at?: string
  archived_at?: string
}

export interface CreateActivityInput {
  title: string
  description?: string
  grade_level: number
  subject: string
  difficulty_level?: number
  location_latitude?: number
  location_longitude?: number
  location_radius_meters?: number
  location_name?: string
  estimated_duration_minutes?: number
  materials_needed?: string[]
  resources?: string[]
  learning_objectives?: string[]
  curriculum_unit_ids?: string[]
  bloom_level?: string
  activity_type?: string
  is_shareable?: boolean
}

export interface UpdateActivityInput extends Partial<CreateActivityInput> {}

export interface ActivityListResponse {
  items: Activity[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

export interface ActivityResponse {
  data: Activity
}

export interface Project {
  id: string
  teacher_id: string
  title: string
  description: string
  status: 'draft' | 'active' | 'completed'
  activities: Activity[]
  created_at: string
  updated_at: string
}

export interface TeacherProfile {
  id: string
  email: string
  name: string
  school: string
  grade_levels: number[]
  subjects: string[]
  bio: string
}

export interface PaginationParams {
  page?: number
  page_size?: number
}

export interface FilterParams extends PaginationParams {
  subject?: string
  grade_level?: number
  status?: 'draft' | 'published' | 'archived'
  search?: string
}

export interface ApiError {
  detail: string
  status_code: number
}

export interface LoadingState {
  isLoading: boolean
  error: string | null
  errorCode?: number
}
