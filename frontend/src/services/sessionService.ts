// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import { apiClient } from '@/config/api'
import {
  LearningSession,
  LearningSessionCreateRequest,
  SessionUpdateRequest,
  EvidenceOfLearning,
  InquiryEntry,
} from '@/types/session'
import { ApiResponse, ApiListResponse } from '@/types/api'
import { Privacy } from '@/utils/privacy'

export const sessionService = {
  /**
   * Create a new learning session
   */
  async createSession(data: LearningSessionCreateRequest): Promise<LearningSession> {
    try {
      const response = await apiClient.post<ApiResponse<LearningSession>>('/sessions', data)
      return (response.data.data || response.data) as unknown as LearningSession
    } catch (error) {
      console.error('Failed to create session:', error)
      throw error
    }
  },

  /**
   * Get a single session by ID
   */
  async getSession(sessionId: string): Promise<LearningSession> {
    try {
      const response = await apiClient.get<ApiResponse<LearningSession>>(
        `/sessions/${sessionId}`
      )
      return (response.data.data || response.data) as unknown as LearningSession
    } catch (error) {
      console.error(`Failed to get session ${sessionId}:`, error)
      throw error
    }
  },

  /**
   * Get all sessions for the current user
   */
  async listSessions(): Promise<LearningSession[]> {
    try {
      const response = await apiClient.get<ApiListResponse<LearningSession>>('/sessions')
      return response.data.items || []
    } catch (error) {
      console.error('Failed to list sessions:', error)
      throw error
    }
  },

  /**
   * Update a session (status, inquiry log, etc.)
   */
  async updateSession(sessionId: string, data: SessionUpdateRequest): Promise<LearningSession> {
    try {
      const response = await apiClient.patch<ApiResponse<LearningSession>>(
        `/sessions/${sessionId}`,
        data
      )
      return (response.data.data || response.data) as unknown as LearningSession
    } catch (error) {
      console.error(`Failed to update session ${sessionId}:`, error)
      throw error
    }
  },

  /**
   * Get evidence of learning for a session
   * Applies privacy filters: strips teacher-only data for students
   */
  async getEvidence(sessionId: string, userRole: string): Promise<EvidenceOfLearning> {
    try {
      const response = await apiClient.get<ApiResponse<EvidenceOfLearning>>(
        `/sessions/${sessionId}/evidence`
      )
      const evidence = response.data.data || response.data

      // Apply privacy filtering based on user role
      return evidence as EvidenceOfLearning
    } catch (error) {
      console.error(`Failed to get evidence for session ${sessionId}:`, error)
      throw error
    }
  },

  /**
   * Get inquiry log for a session (teacher-only)
   */
  async getInquiryLog(sessionId: string): Promise<InquiryEntry[]> {
    try {
      const response = await apiClient.get<ApiResponse<{ inquiry_log: InquiryEntry[] }>>(
        `/sessions/${sessionId}/inquiry-log`
      )
      const data = response.data.data || response.data
      return ((data as any).inquiry_log || (data as any).data?.inquiry_log || []) as InquiryEntry[]
    } catch (error) {
      console.error(`Failed to get inquiry log for session ${sessionId}:`, error)
      throw error
    }
  },

  /**
   * Fetch session monitoring events (teacher polling endpoint).
   * Pass `since` as an ISO timestamp to receive only events after that cursor.
   */
  async getSessionEvents(
    sessionId: string,
    since?: string
  ): Promise<Array<{
    id: string
    session_id: string
    student_id: string
    event_type: string
    phase: string | null
    metadata: Record<string, any>
    created_at: string
  }>> {
    try {
      const params = since ? `?since=${encodeURIComponent(since)}` : ''
      const response = await apiClient.get(`/sessions/${sessionId}/events${params}`)
      return response.data.events ?? []
    } catch (error) {
      console.error(`Failed to get session events for ${sessionId}:`, error)
      return []
    }
  },

  /**
   * Submit an inquiry/question during a session
   */
  async submitInquiry(sessionId: string, inquiry: Partial<InquiryEntry>): Promise<InquiryEntry> {
    try {
      const response = await apiClient.post<ApiResponse<InquiryEntry>>(
        `/sessions/${sessionId}/inquiry`,
        inquiry
      )
      return (response.data.data || response.data) as unknown as InquiryEntry
    } catch (error) {
      console.error(`Failed to submit inquiry for session ${sessionId}:`, error)
      throw error
    }
  },
}

export default sessionService