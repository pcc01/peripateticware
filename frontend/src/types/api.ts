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