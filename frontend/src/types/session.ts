// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import { SessionStatus, ZoneShape, InputType } from '@/config/constants'

export interface Location {
  latitude: number
  longitude: number
  name: string
}

export interface LearningSession {
  session_id: string
  user_id: string
  title: string
  curriculum_id: string
  status: SessionStatus
  location: Location
  inquiry_log: InquiryEntry[]
  created_at: string
  updated_at: string
  completed_at?: string
}

export interface LearningSessionCreateRequest {
  title: string
  curriculum_id: string
  latitude: number
  longitude: number
  location_name: string
}

export interface SessionUpdateRequest {
  title?: string
  status?: SessionStatus
  inquiry_log?: InquiryEntry[]
}

export interface InquiryEntry {
  id?: string
  timestamp: string
  question: string
  input_type: InputType
  student_response?: string
  socratic_prompt?: string
  ai_response?: string
  confidence?: number
}

export interface EvidenceOfLearning {
  session_id: string
  title: string
  evidence: {
    bloom_level_achieved: number
    key_concepts: string[]
    misconceptions_addressed: number
    engagement_score: number
  }
  status: SessionStatus
  completed_at: string
  // Privacy engine fields (teacher-only)
  original_ai_draft?: string // Teacher sees immutable original response
  competency_assessment?: CompetencyAssessment // Teacher-only
}

/**
 * Teacher-only competency assessment (from Privacy Engine)
 * Students never see this data - it's stripped at API response level
 */
export interface CompetencyAssessment {
  standards_evidence: string[]
  grade_alignment: string
  competency_areas: string[]
  growth_recommendations: string[]
  rigor_analysis: string
  teacher_notes: string
}

// Activity management for teachers
export interface ActivityZone {
  id: string
  name: string
  location: Location
  shape: ZoneShape
  radius?: number // For circles (in meters)
  coordinates?: Location[] // For polygons/rectangles
}

export interface Activity {
  activity_id: string
  curriculum_id: string
  name: string
  location: Location
  zone: ActivityZone
  difficulty: 'easy' | 'medium' | 'hard'
  duration_minutes: number
  objectives: string[]
  instructions: string
  resources?: string[]
  tags?: string[]
  created_by: string
  created_at: string
  updated_at: string
}

export interface ActivityCreateRequest {
  name: string
  curriculum_id: string
  latitude: number
  longitude: number
  location_name: string
  zone: ActivityZone
  difficulty: 'easy' | 'medium' | 'hard'
  duration_minutes: number
  objectives: string[]
  instructions: string
  resources?: string[]
  tags?: string[]
}

export interface ActivityBatchImport {
  activities: ActivityCreateRequest[]
}

