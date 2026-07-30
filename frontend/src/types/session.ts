// src/types/session.ts - STUB
export interface LearningSession {
  id: string
  session_id?: string        // alias — some components use session_id
  activity_id: string
  student_id: string
  started_at: string
  created_at?: string
  ended_at?: string
  status?: 'active' | 'completed' | 'paused'
  title?: string
  location?: { latitude: number; longitude: number; name?: string }
  inquiry_log?: InquiryEntry[]
  evidence?: EvidenceOfLearning[]
  competency_assessment?: CompetencyAssessment
  original_ai_draft?: string
  // Tiered-polling hint from GET /sessions/{id} — see services/polling.py (backend).
  poll_interval_seconds?: number | null
}

export interface EvidenceOfLearning {
  id: string
  session_id: string
  type: string
  data: string
  evidence?: string
  competency_assessment?: string
  original_ai_draft?: string
}

export interface InquiryEntry {
  id: string
  session_id: string
  question: string
  response: string
  timestamp?: string
  Aristotelian_prompt?: string
  confidence?: number
}

export interface CompetencyAssessment {
  id: string
  student_id: string
  competency: string
  level: number
}

export interface Location {
  latitude: number
  longitude: number
}

export interface ActivityZone {
  id?: string
  name?: string
  center: Location
  radius: number
  shape?: string             // 'circle' | 'polygon' | 'rectangle'
  coordinates?: Location[]   // polygon vertices
}

// Re-export the ZoneShape enum from constants so Map.tsx imports resolve correctly
export { ZoneShape } from '@/config/constants'

export interface ActivityCreateRequest {
  title: string
  description: string
  location_latitude: number
  location_longitude: number
  location_radius_meters: number
}
// Missing request types (added 2026-06-03 — Root Cause 5)
export interface LearningSessionCreateRequest {
  activity_id: string
  student_id: string
  location?: { latitude: number; longitude: number }
}

export interface SessionUpdateRequest {
  status?: 'active' | 'completed' | 'paused'
  ended_at?: string
  notes?: string
}
