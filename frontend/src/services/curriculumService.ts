# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

import { apiClient } from '@/config/api'
import { CurriculumUnit, CurriculumCreateRequest, CurriculumUpdateRequest, StandardsAlignment } from '@types/curriculum'
import { ApiResponse, ApiListResponse } from '@types/api'

export const curriculumService = {
  /**
   * Get all curriculum units with optional filtering
   */
  async listUnits(subject?: string, gradeLevel?: number): Promise<CurriculumUnit[]> {
    try {
      const params = new URLSearchParams()
      if (subject) params.append('subject', subject)
      if (gradeLevel) params.append('grade_level', gradeLevel.toString())

      const response = await apiClient.get<ApiListResponse<CurriculumUnit>>(
        `/curriculum?${params.toString()}`
      )
      return response.data.items || []
    } catch (error) {
      console.error('Failed to list curriculum units:', error)
      throw error
    }
  },

  /**
   * Get a single curriculum unit by ID
   */
  async getUnit(curriculumId: string): Promise<CurriculumUnit> {
    try {
      const response = await apiClient.get<ApiResponse<CurriculumUnit>>(
        `/curriculum/${curriculumId}`
      )
      return response.data.data || response.data
    } catch (error) {
      console.error(`Failed to get curriculum unit ${curriculumId}:`, error)
      throw error
    }
  },

  /**
   * Create a new curriculum unit
   */
  async createUnit(data: CurriculumCreateRequest): Promise<CurriculumUnit> {
    try {
      const response = await apiClient.post<ApiResponse<CurriculumUnit>>(
        '/curriculum',
        data
      )
      return response.data.data || response.data
    } catch (error) {
      console.error('Failed to create curriculum unit:', error)
      throw error
    }
  },

  /**
   * Update an existing curriculum unit
   */
  async updateUnit(curriculumId: string, data: CurriculumUpdateRequest): Promise<CurriculumUnit> {
    try {
      const response = await apiClient.patch<ApiResponse<CurriculumUnit>>(
        `/curriculum/${curriculumId}`,
        data
      )
      return response.data.data || response.data
    } catch (error) {
      console.error(`Failed to update curriculum unit ${curriculumId}:`, error)
      throw error
    }
  },

  /**
   * Delete a curriculum unit
   */
  async deleteUnit(curriculumId: string): Promise<void> {
    try {
      await apiClient.delete(`/curriculum/${curriculumId}`)
    } catch (error) {
      console.error(`Failed to delete curriculum unit ${curriculumId}:`, error)
      throw error
    }
  },

  /**
   * Get standards alignment for a curriculum unit
   */
  async getStandardsAlignment(curriculumId: string): Promise<StandardsAlignment> {
    try {
      const response = await apiClient.get<ApiResponse<StandardsAlignment>>(
        `/curriculum/${curriculumId}/standards-alignment`
      )
      return response.data.data || response.data
    } catch (error) {
      console.error(`Failed to get standards alignment for ${curriculumId}:`, error)
      throw error
    }
  },
}

export default curriculumService
