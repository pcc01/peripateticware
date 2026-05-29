// src/types/curriculum.ts - STUB
export interface CurriculumUnit {
  id: string
  name: string
  description: string
}

export interface CurriculumCreateRequest {
  name: string
  description: string
}

export interface CurriculumUpdateRequest extends Partial<CurriculumCreateRequest> {}

export interface StandardsAlignment {
  standard_id: string
  curriculum_unit_id: string
}