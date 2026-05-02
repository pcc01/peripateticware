// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

/**
 * Generic API response types
 * Matches backend response structure
 */

export interface ApiResponse<T> {
  data?: T
  status: 'success' | 'error'
  timestamp: string
}

export interface ApiListResponse<T> {
  total: number
  items: T[]
  page?: number
  page_size?: number
}

export interface ApiError {
  detail: string
  status_code: number
  timestamp: string
  error_type?: string
}

export interface PaginationParams {
  page: number
  page_size: number
}

export interface FilterParams {
  [key: string]: string | number | boolean
}

// Inference/RAG types
export interface InquiryRequest {
  session_id: string
  input_type: 'text' | 'image' | 'audio'
  text?: string
  location?: {
    latitude: number
    longitude: number
    location_name: string
  }
  curriculum_context?: {
    topic: string
    bloom_level: number
  }
  persona_context?: {
    learning_style: string
    bloom_level: number
  }
}

export interface InquiryResponse {
  session_id: string
  reasoning_path: {
    site: {
      location_name: string
      nearby_resources?: string[]
      weather?: string
    }
    curriculum: {
      topic: string
      bloom_level: number
    }
    persona: {
      learning_style: string
      bloom_level: number
    }
  }
  next_question: string
  resources: string[]
  confidence: number
}

export interface MultimodalProcessRequest {
  session_id: string
  input_type: 'image' | 'audio'
  file: File
}

export interface MultimodalProcessResponse {
  session_id: string
  input_type: 'image' | 'audio'
  embedding: number[]
  extracted_text?: string
  metadata: Record<string, any>
  processing_latency_ms: number
}

export interface RagRetrieveResponse {
  query: string
  top_k: number
  documents: RagDocument[]
  retrieval_time_ms: number
}

export interface RagDocument {
  id: string
  title: string
  content: string
  relevance_score: number
}

export interface TextEmbeddingResponse {
  text: string
  embedding: number[]
  dimension: number
  model: string
}

