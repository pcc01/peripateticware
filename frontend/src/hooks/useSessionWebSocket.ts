# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

import { useEffect, useRef, useState, useCallback } from 'react'

/**
 * Real-time event types for session monitoring
 */
export interface SessionEvent {
  type: 'location_update' | 'inquiry_submitted' | 'session_ended' | 'error'
  sessionId: string
  timestamp: string
  data: Record<string, any>
}

interface WebSocketState {
  isConnected: boolean
  lastMessage: SessionEvent | null
  error: string | null
}

/**
 * Custom hook for WebSocket connection to session monitoring
 * Handles reconnection, heartbeat, and event parsing
 */
export const useSessionWebSocket = (sessionId: string | null, enabled: boolean = true) => {
  const [state, setState] = useState<WebSocketState>({
    isConnected: false,
    lastMessage: null,
    error: null,
  })

  const ws = useRef<WebSocket | null>(null)
  const reconnectAttempts = useRef(0)
  const heartbeatInterval = useRef<NodeJS.Timeout | null>(null)
  const maxReconnectAttempts = 5
  const reconnectDelay = 3000

  // Get WebSocket URL from environment
  const getWebSocketURL = useCallback(() => {
    const baseURL = process.env.VITE_API_URL || 'http://localhost:8000/api/v1'
    const wsURL = baseURL.replace(/^http/, 'ws')
    return `${wsURL}/sessions/${sessionId}/monitor`
  }, [sessionId])

  // Connect to WebSocket
  const connect = useCallback(() => {
    if (!sessionId || !enabled) return
    if (ws.current?.readyState === WebSocket.OPEN) return

    try {
      ws.current = new WebSocket(getWebSocketURL())

      ws.current.onopen = () => {
        console.log('WebSocket connected')
        setState((prev) => ({
          ...prev,
          isConnected: true,
          error: null,
        }))
        reconnectAttempts.current = 0

        // Send heartbeat every 30 seconds
        heartbeatInterval.current = setInterval(() => {
          if (ws.current?.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify({ type: 'heartbeat', sessionId }))
          }
        }, 30000)
      }

      ws.current.onmessage = (event) => {
        try {
          const message: SessionEvent = JSON.parse(event.data)
          setState((prev) => ({
            ...prev,
            lastMessage: message,
            error: null,
          }))
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error)
        }
      }

      ws.current.onerror = (event) => {
        const errorMsg = `WebSocket error: ${event.type}`
        setState((prev) => ({
          ...prev,
          error: errorMsg,
        }))
        console.error(errorMsg)
      }

      ws.current.onclose = () => {
        console.log('WebSocket closed')
        setState((prev) => ({
          ...prev,
          isConnected: false,
        }))

        // Clear heartbeat interval
        if (heartbeatInterval.current) {
          clearInterval(heartbeatInterval.current)
        }

        // Attempt to reconnect with exponential backoff
        if (reconnectAttempts.current < maxReconnectAttempts) {
          reconnectAttempts.current++
          const delay = reconnectDelay * Math.pow(2, reconnectAttempts.current - 1)
          console.log(`Reconnecting in ${delay}ms...`)
          setTimeout(connect, delay)
        }
      }
    } catch (error: any) {
      setState((prev) => ({
        ...prev,
        error: error.message,
      }))
      console.error('Failed to create WebSocket:', error)
    }
  }, [sessionId, enabled, getWebSocketURL])

  // Cleanup on unmount or when sessionId changes
  useEffect(() => {
    connect()

    return () => {
      if (ws.current) {
        ws.current.close()
      }
      if (heartbeatInterval.current) {
        clearInterval(heartbeatInterval.current)
      }
    }
  }, [connect])

  return state
}

/**
 * Hook for handling specific session events
 */
export const useSessionEvent = (
  sessionId: string | null,
  eventType: SessionEvent['type'],
  callback: (data: Record<string, any>) => void
) => {
  const wsState = useSessionWebSocket(sessionId)

  useEffect(() => {
    if (wsState.lastMessage?.type === eventType) {
      callback(wsState.lastMessage.data)
    }
  }, [wsState.lastMessage, eventType, callback])
}

/**
 * Hook for tracking student locations in real-time
 */
export const useStudentLocations = (sessionId: string | null) => {
  const [locations, setLocations] = useState<
    Record<
      string,
      {
        latitude: number
        longitude: number
        timestamp: string
        accuracy: number
      }
    >
  >({})

  useSessionEvent(sessionId, 'location_update', (data) => {
    if (data.student_id && data.latitude && data.longitude) {
      setLocations((prev) => ({
        ...prev,
        [data.student_id]: {
          latitude: data.latitude,
          longitude: data.longitude,
          timestamp: data.timestamp,
          accuracy: data.accuracy,
        },
      }))
    }
  })

  return locations
}

/**
 * Hook for tracking inquiry submissions
 */
export const useInquiryUpdates = (sessionId: string | null) => {
  const [inquiries, setInquiries] = useState<any[]>([])

  useSessionEvent(sessionId, 'inquiry_submitted', (data) => {
    setInquiries((prev) => [data, ...prev])
  })

  return inquiries
}

export default useSessionWebSocket
