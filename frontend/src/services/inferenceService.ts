import { apiClient } from '@/config/api'
import {
  InquiryRequest,
  InquiryResponse,
  MultimodalProcessRequest,
  MultimodalProcessResponse,
  RagRetrieveResponse,
  TextEmbeddingResponse,
} from '@types/api'

export const inferenceService = {
  /**
   * Process a text inquiry with Socratic reasoning
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
   * Retrieve relevant documents from the RAG system
   * Uses vector search to find similar curriculum content
   */
  async ragRetrieve(query: string, topK: number = 5): Promise<RagRetrieveResponse> {
    try {
      const response = await apiClient.get<{ data: RagRetrieveResponse }>(
        '/inference/rag-retrieve',
        {
          params: { query, top_k: topK },
        }
      )
      return response.data.data
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
      const response = await apiClient.post<{ data: TextEmbeddingResponse }>(
        '/inference/text-embedding',
        { text }
      )
      return response.data.data
    } catch (error) {
      console.error('Failed to generate text embedding:', error)
      throw error
    }
  },
}

export default inferenceService
