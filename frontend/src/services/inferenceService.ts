// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import { apiClient } from '@/config/api'
import {
  InquiryRequest,
  InquiryResponse,
  MultimodalProcessRequest,
  MultimodalProcessResponse,
  RagRetrieveResponse,
  TextEmbeddingResponse,
} from '@/types/api'

export const inferenceService = {
  /**
   * Process a text inquiry with Aristotelian reasoning
   * Returns the next question and relevant resources
   */
  async processInquiry(request: InquiryRequest): Promise<InquiryResponse> {
    try {
      const response = await apiClient.post<{ data: InquiryResponse }>(
        '/inference/inquiry',
        request
      )
      return response.data.data
    } catch (error) {
      console.error('Failed to process inquiry:', error)
      throw error
    }
  },

  /**
   * Process multimodal input (image, audio)
   * Extracts text and generates embeddings
   */
  async processMultimodal(
    sessionId: string,
    file: File,
    inputType: 'image' | 'audio'
  ): Promise<MultimodalProcessResponse> {
    try {
      const formData = new FormData()
      formData.append('session_id', sessionId)
      formData.append('input_type', inputType)
      formData.append('file', file)

      const response = await apiClient.post<{ data: MultimodalProcessResponse }>(
        '/inference/multimodal-process',
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        }
      )
      return response.data.data
    } catch (error) {
      console.error('Failed to process multimodal input:', error)
      throw error
    }
  },

  /**
   * GraphRAG retrieval: vector search over rag_documents for seed matches,
   * plus (by default) graph expansion — ancestors, cross-references,
   * prerequisites, aligned content — via services/graph_retrieval.py on the
   * backend. See RagRetrieveResponse / RagDocument for the response shape;
   * each document's `relation` says which kind of result it is.
   *
   * NOTE: this previously unwrapped the response as `response.data.data`,
   * but /inference/rag-retrieve returns its payload directly (no `{data:
   * ...}` envelope) — fixed to `response.data`. Caught here because this
   * function had no real caller yet to have surfaced the bug.
   */
  async ragRetrieve(
    query: string,
    options: {
      topK?: number
      sourceType?: string
      jurisdictionId?: string
      includeAncestors?: boolean
      includeRelated?: boolean
    } = {}
  ): Promise<RagRetrieveResponse> {
    try {
      const response = await apiClient.get<RagRetrieveResponse>(
        '/inference/rag-retrieve',
        {
          params: {
            query,
            top_k: options.topK ?? 5,
            source_type: options.sourceType,
            jurisdiction_id: options.jurisdictionId,
            include_ancestors: options.includeAncestors,
            include_related: options.includeRelated,
          },
        }
      )
      return response.data
    } catch (error) {
      console.error('Failed to retrieve RAG documents:', error)
      throw error
    }
  },

  /**
   * Generate text embedding for a query string
   * Used for vector similarity searches
   */
  async generateTextEmbedding(text: string): Promise<TextEmbeddingResponse> {
    try {
      const response = await apiClient.post<TextEmbeddingResponse>(
        '/inference/text-embedding',
        { text }
      )
      return response.data
    } catch (error) {
      console.error('Failed to generate text embedding:', error)
      throw error
    }
  },
}

export default inferenceService