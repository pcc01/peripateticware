// src/types/teacher.ts - UPDATED
// Activity is canonical in services/types.ts — re-exported here so all
// existing `import { Activity } from '@/types/teacher'` call sites keep working.
// (Needs both a local `import type` and a re-export: `export type {...} from`
// alone only re-exports the name, it doesn't bring it into this file's own
// scope, and this file also references `Activity` below.)
import type { Activity } from '@/services/types'
export type { Activity } from '@/services/types'

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
  grade_level: number
  subject: string
  duration_weeks: number
  status: ProjectStatus
  start_date?: string
  end_date?: string | null
  activities: ActivityListResponse[]
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
  // Author's choice: 'ai_chat' = students can open-ended chat with AI-backed
  // Peri during this activity, on top of the curated question bank;
  // 'curated_only' = curated bank only, no live AI call. Defaults to
  // 'ai_chat' on the backend when omitted.
  ai_interaction_mode?: 'ai_chat' | 'curated_only'
  // GPS live-map feature: whether this activity prompts students for
  // location-sharing self-consent (13+) at session start.
  discovery_location_gps_capture_enabled?: boolean
  // Structured Wikidata/Wikipedia place enrichment captured while setting the
  // location — saved with the activity so students can see it offline later.
  location_wiki_data?: Record<string, any> | null
  location_info?: string
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
