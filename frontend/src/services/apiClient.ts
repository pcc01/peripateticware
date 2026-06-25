// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import axios, { AxiosInstance, AxiosError, AxiosRequestConfig } from 'axios'
import { ApiError } from './types'

/* ============================================================================ */
/* API CLIENT */
/* ============================================================================ */

export class ApiClient {
  private client: AxiosInstance
  private baseURL: string

  constructor(baseURL?: string) {
    this.baseURL = baseURL || '/api/v1'

    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    })

    // Add token to requests
    this.client.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('auth_token')
        if (token) {
          config.headers.Authorization = `Bearer ${token}`
        }
        return config
      },
      (error) => Promise.reject(error)
    )

    // Handle responses and errors
    this.client.interceptors.response.use(
      (response) => response,
      (error) => this.handleError(error)
    )
  }

  /* ─────────────────────────────────────────────────────────────────────── */
  /* HTTP METHODS */
  /* ─────────────────────────────────────────────────────────────────────── */

  async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.get<T>(url, config)
    return response.data
  }

  async post<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.post<T>(url, data, config)
    return response.data
  }

  async put<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.put<T>(url, data, config)
    return response.data
  }

  async patch<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.patch<T>(url, data, config)
    return response.data
  }

  async delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.delete<T>(url, config)
    return response.data
  }

  /* ─────────────────────────────────────────────────────────────────────── */
  /* ERROR HANDLING */
  /* ─────────────────────────────────────────────────────────────────────── */

  private handleError(error: AxiosError<ApiError>) {
    // Handle 401 Unauthorized - clear auth and redirect
    if (error.response?.status === 401) {
      localStorage.removeItem('auth_token')
      localStorage.removeItem('auth_user')
      window.location.href = '/login'
    }

    // Re-throw with formatted error
    const apiError = new ApiClientError(
      (typeof error.response?.data?.detail === "string" ? error.response.data.detail : JSON.stringify(error.response?.data?.detail)) || error.message,
      error.response?.status || 500,
      error
    )

    console.error('API Error:', apiError)
    throw apiError
  }

  /* ─────────────────────────────────────────────────────────────────────── */
  /* UTILITIES */
  /* ─────────────────────────────────────────────────────────────────────── */

  setAuthToken(token: string) {
    this.client.defaults.headers.common['Authorization'] = `Bearer ${token}`
  }

  clearAuthToken() {
    delete this.client.defaults.headers.common['Authorization']
  }

  setBaseURL(baseURL: string) {
    this.baseURL = baseURL
    this.client.defaults.baseURL = baseURL
  }
}

/* ============================================================================ */
/* CUSTOM ERROR CLASS */
/* ============================================================================ */

export class ApiClientError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public originalError: AxiosError<ApiError>
  ) {
    super(message)
    this.name = 'ApiClientError'
  }

  isNotFound(): boolean {
    return this.statusCode === 404
  }

  isUnauthorized(): boolean {
    return this.statusCode === 401
  }

  isForbidden(): boolean {
    return this.statusCode === 403
  }

  isValidationError(): boolean {
    return this.statusCode === 422
  }

  getValidationErrors(): { field: string; message: string }[] {
    if (!this.isValidationError()) return []

    const detail = this.originalError.response?.data?.detail
    if (Array.isArray(detail)) {
      return detail.map((err: any) => ({
        field: err.loc?.[1] || 'unknown',
        message: err.msg,
      }))
    }

    return []
  }
}

/* ============================================================================ */
/* SINGLETON INSTANCE */
/* ============================================================================ */

let apiClientInstance: ApiClient | null = null

export function getApiClient(): ApiClient {
  if (!apiClientInstance) {
    apiClientInstance = new ApiClient()
  }
  return apiClientInstance
}

export function setApiClient(client: ApiClient) {
  apiClientInstance = client
}
