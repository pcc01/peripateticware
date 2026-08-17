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

// A single retrieved/expanded item from GET /inference/rag-retrieve.
// `relation` distinguishes a direct vector-search hit ("match") from
// structural context pulled in by graph expansion — see
// backend/services/graph_retrieval.py and
// PRD-graphrag-migration-2026-08-16.md §3. Treat these as different KINDS
// of relevance, not just lower similarity scores.
export interface RagDocument {
  id: string | null
  source_type: string          // 'standards' | 'curriculum' | 'homeschool' | 'custom'
  source_id?: string | null
  source_name?: string | null
  chunk_index?: number
  content: string
  metadata: Record<string, unknown>
  relevance_score: number
  relation: 'match' | 'ancestor' | 'cross_reference' | 'prerequisite' | 'aligned_content'
  expanded_from?: string | null
  node_type?: string | null
  node_id?: string | null
}

export interface RagRetrieveResponse {
  query: string
  query_embedding_dimension: number
  top_k: number
  source: string
  documents: RagDocument[]
  seed_count: number
  expanded_count: number
  graph_expansion_enabled: boolean
  retrieval_time_ms: number
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
