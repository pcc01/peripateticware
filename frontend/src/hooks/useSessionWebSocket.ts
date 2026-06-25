// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import { useEffect, useRef, useState, useCallback } from 'react'
import sessionService from '@/services/sessionService'

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

/** How often (ms) the teacher dashboard polls for new session events. */
const POLL_INTERVAL_MS = 5_000

/**
 * Custom hook for session monitoring via REST polling.
 *
 * Replaces the previous WebSocket implementation — the backend WebSocket
 * endpoint (/sessions/{id}/monitor) was never implemented.  The REST polling
 * endpoint (GET /sessions/{id}/events?since=) exists and works.
 *
 * The public interface is identical to the old WebSocket hook so all
 * consumers (SessionMonitor.tsx, useStudentLocations, useInquiryUpdates)
 * require zero changes.
 */
export const useSessionWebSocket = (sessionId: string | null, enabled: boolean = true) => {
  const [state, setState] = useState<WebSocketState>({
    isConnected: false,
    lastMessage: null,
    error: null,
  })

  // ISO timestamp cursor — advances to the created_at of the last event received
  const sinceRef = useRef<string>(new Date(0).toISOString())
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  const poll = useCallback(async () => {
    if (!sessionId) return
    try {
      const events = await sessionService.getSessionEvents(sessionId, sinceRef.current)

      if (events.length > 0) {
        sinceRef.current = events[events.length - 1].created_at

        for (const raw of events) {
          let type: SessionEvent['type'] | null = null
          if (raw.event_type === 'location_update')  type = 'location_update'
          else if (raw.event_type === 'capture_added') type = 'inquiry_submitted'
          else if (raw.event_type === 'session_ended') type = 'session_ended'
          // Unknown types silently ignored

          if (type) {
            const mapped: SessionEvent = {
              type,
              sessionId: raw.session_id,
              timestamp: raw.created_at,
              data: { ...raw.metadata, student_id: raw.student_id },
            }
            setState((prev) => ({ ...prev, isConnected: true, lastMessage: mapped, error: null }))
          }
        }
      } else {
        // Successful empty poll — mark connected, clear any prior error
        setState((prev) => ({ ...prev, isConnected: true, error: null }))
      }
    } catch (err: any) {
      setState((prev) => ({
        ...prev,
        isConnected: false,
        error: err?.message ?? 'Polling failed',
      }))
    }
  }, [sessionId])

  useEffect(() => {
    if (!enabled || !sessionId) return

    // Reset cursor whenever the session changes
    sinceRef.current = new Date(0).toISOString()

    poll() // immediate first fetch
    intervalRef.current = setInterval(poll, POLL_INTERVAL_MS)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [enabled, sessionId, poll])

  return state
}

/**
 * Hook for handling a specific session event type.
 * Interface unchanged from the original WebSocket version.
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
 * Tracks latest known position for each student in the session.
 * Populated from 'location_update' events fired when students submit
 * evidence captures or field notes.
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
          timestamp: data.timestamp ?? new Date().toISOString(),
          accuracy: data.accuracy ?? 0,
        },
      }))
    }
  })

  return locations
}

/**
 * Collects inquiry/capture events as they arrive.
 */
export const useInquiryUpdates = (sessionId: string | null) => {
  const [inquiries, setInquiries] = useState<any[]>([])

  useSessionEvent(sessionId, 'inquiry_submitted', (data) => {
    setInquiries((prev) => [data, ...prev])
  })

  return inquiries
}

export default useSessionWebSocket
