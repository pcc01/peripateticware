// src/types/curriculum.ts
export interface CurriculumUnit {
  id: string
  name?: string
  title?: string           // API returns title; name is the legacy field
  description: string
  subject?: string
  grade_level?: number | string
  bloom_level?: number
  marzano_level?: number
  standards?: string[]
  created_at?: string
  updated_at?: string
  content?: Record<string, unknown>
}

export interface CurriculumCreateRequest {
  name?: string
  title?: string
  description: string
  subject?: string
  grade_level?: number
  bloom_level?: number
  marzano_level?: number
  standards?: string[]
  content?: Record<string, unknown>
}

export interface CurriculumUpdateRequest extends Partial<CurriculumCreateRequest> {}

export interface StandardsAlignment {
  standard_id: string
  curriculum_unit_id: string
}

export interface CurriculumFilters {
  subject?: string
  grade_level?: number | string
  search?: string
  page?: number
  page_size?: number
}
