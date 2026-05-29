// src/types/session.ts - STUB
export interface LearningSession {
  id: string
  activity_id: string
  student_id: string
  started_at: string
  ended_at?: string
}

export interface EvidenceOfLearning {
  id: string
  session_id: string
  type: string
  data: string
}

export interface InquiryEntry {
  id: string
  session_id: string
  question: string
  response: string
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
  center: Location
  radius: number
}

export interface ZoneShape {
  type: 'circle' | 'polygon'
}

export interface ActivityCreateRequest {
  title: string
  description: string
  location_latitude: number
  location_longitude: number
  location_radius_meters: number
}