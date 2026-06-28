// src/types/teacher.ts - UPDATED
export interface Activity {
  id: string
  teacher_id: string
  title: string
  description: string
  location_latitude: number
  location_longitude: number
  location_radius_meters: number
  location_name: string
  grade_level: number
  subject: string
  difficulty_level: number
  estimated_duration_minutes: number
  curriculum_unit_ids?: string[]
  learning_objectives: string[]
  materials_needed: string[]
  resources: string[] // Keep as strings
  status: 'draft' | 'published' | 'archived'
  is_shareable: boolean
  share_scope?: 'org' | 'all'
  language?: string
  state_standard?: string
  discipline?: string
  bloom_level?: string
  activity_type?: ActivityType
  created_at: string
  updated_at: string
  archived_at?: string
}

export interface ActivityFormData {
  title: string
  description: string
  location_latitude: number
  location_longitude: number
  location_radius_meters: number
  location_name: string
  grade_level: number
  subject: string
  difficulty_level: number
  estimated_duration_minutes: number
  curriculum_unit_ids?: string[]
  learning_objectives?: string[]
  materials_needed?: string[]
  resources?: string[]
  is_shareable?: boolean
  share_scope?: 'org' | 'all'
  language?: string
  state_standard?: string
  discipline?: string
}

// IMPORTANT: ActivityType is a UNION TYPE, not an interface
export type ActivityType = 'outdoor' | 'field_study' | 'inquiry'
  | 'discussion'
  | 'hands_on'
  | 'virtual'
  | 'hybrid'
  | 'lab'
  | 'field_study'
  | 'project'

export interface Project {
  id: string
  teacher_id: string
  title: string
  description: string
  status: 'draft' | 'active' | 'completed'
  start_date?: string
  end_date?: string
  created_at: string
  updated_at: string
}

export interface ProjectFormData {
  subject?: string
  title: string
  description: string
  start_date?: string
  end_date?: string
  grade_level?: number
  duration_weeks?: number
}

export interface ActivityFilters {
  subject?: string
  grade_level?: number
  difficulty_level?: number
  status?: string
  page?: number
  page_size?: number
}

export interface ProjectFilters {
  status?: 'draft' | 'active' | 'completed'
  subject?: string
  page?: number
  page_size?: number
}

export interface CurriculumUnit {
  id: string
  name: string
  title?: string
  description: string
  subject?: string
  grade_level?: number
  bloom_level?: number
  created_at?: string
}

export interface CurriculumFilters {
  subject?: string
  grade_level?: number
  page?: number
  page_size?: number
}

export interface PaginatedActivityResponse {
  items: Activity[]
  total: number
  page: number
  per_page: number
}

export interface PaginatedProjectResponse {
  items: Project[]
  total: number
  page: number
  per_page: number
  total_pages?: number
}

export interface PaginatedCurriculumResponse {
  items: CurriculumUnit[]
  total: number
  page: number
  per_page: number
}

export interface ActivityListResponse {
  id: string
  title: string
  subject: string
  grade_level: number
  estimated_duration_minutes: number
  status: 'draft' | 'published' | 'archived'
}

export interface ProjectListResponse {
  id: string
  title: string
  description: string
  status: 'draft' | 'active' | 'completed'
  subject?: string
  grade_level?: number
  start_date?: string
  end_date?: string
  duration_weeks?: number
  activity_count?: number
  created_at?: string
}

export type ProjectStatus = 'planning' | 'draft' | 'active' | 'completed' | 'archived'

export interface CreateActivityInput {
  title: string
  description: string
  location_latitude: number
  location_longitude: number
  location_radius_meters: number
  location_name: string
  grade_level: number
  subject: string
  difficulty_level: number
  estimated_duration_minutes: number
  materials_needed?: string[]
  resources?: string[]
  learning_objectives?: string[]
  bloom_level?: string
  activity_type?: ActivityType
  is_shareable?: boolean
  share_scope?: 'org' | 'all'
  language?: string
  state_standard?: string
  discipline?: string
  curriculum_unit_ids?: string[]
}

export interface UpdateActivityInput extends Partial<CreateActivityInput> {}
export interface CurriculumCreateRequest {
  title: string
  description: string
  subject: string
  grade_level: number
  bloom_level?: number
  marzano_level?: number
  standards?: string[]
  content?: Record<string, unknown>
}
