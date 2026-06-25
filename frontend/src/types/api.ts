// src/types/api.ts - STUB
export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: string
}

export interface ApiListResponse<T = any> {
  items: T[]
  total: number
  page: number
  per_page: number
  total_pages?: number
}
// Inference service types (added 2026-06-03 — Root Cause 4)
export interface InquiryRequest {
  session_id: string
  input_type?: string
  text?: string
  input_text?: string
  location?: Record<string, unknown>
  curriculum_context?: Record<string, unknown>
  persona_context?: Record<string, unknown>
}

export interface InquiryResponse {
  session_id: string
  next_question: string
  response: string
  resources: string[]
  confidence: number
  reasoning_path?: Record<string, unknown>
}

export interface MultimodalProcessRequest {
  session_id: string
  input_type: 'text' | 'image' | 'audio' | 'multimodal'
  text?: string
}

export interface MultimodalProcessResponse {
  session_id: string
  extracted_text: string
  inference_details: Record<string, unknown>
  success: boolean
}

export interface RagRetrieveResponse {
  query: string
  documents: Array<{ id: string; title: string; content: string; relevance_score: number }>
  total_retrieved: number
  success: boolean
}

export interface TextEmbeddingResponse {
  text: string
  embedding: number[]
  dimension: number
  model: string
  provider: string
  success: boolean
}
