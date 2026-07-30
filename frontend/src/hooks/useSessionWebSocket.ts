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

/** Fallback poll cadence (ms) until a caller supplies a server-computed one. */
const DEFAULT_POLL_INTERVAL_MS = 5_000

/**
 * Custom hook for session monitoring via REST polling.
 *
 * Replaces the previous WebSocket implementation — the backend WebSocket
 * endpoint (/sessions/{id}/monitor) was never implemented.  The REST polling
 * endpoint (GET /sessions/{id}/events?since=) exists and works.
 *
 * `pollIntervalMs` lets a caller pass the tiered-polling hint the backend
 * already computed for this session (GET /sessions/{id}'s
 * poll_interval_seconds — see services/polling.py) instead of this hook
 * hardcoding a single cadence for every session regardless of how
 * long-running it is. Defaults to the original 5s cadence when the caller
 * doesn't have that value yet (e.g. still loading the session).
 *
 * The public interface is otherwise identical to the old WebSocket hook so
 * existing consumers (useStudentLocations, useInquiryUpdates) that don't
 * pass pollIntervalMs require zero changes.
 */
export const useSessionWebSocket = (
  sessionId: string | null,
  enabled: boolean = true,
  pollIntervalMs: number = DEFAULT_POLL_INTERVAL_MS
) => {
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
    intervalRef.current = setInterval(poll, pollIntervalMs)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [enabled, sessionId, poll, pollIntervalMs])

  return state
}

/**
 * Hook for handling a specific session event type.
 * Interface unchanged from the original WebSocket version.
 */
export const useSessionEvent = (
  sessionId: string | null,
  eventType: SessionEvent['type'],
  callback: (data: Record<string, any>) => void,
  pollIntervalMs: number = DEFAULT_POLL_INTERVAL_MS
) => {
  const wsState = useSessionWebSocket(sessionId, true, pollIntervalMs)

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
export const useStudentLocations = (
  sessionId: string | null,
  pollIntervalMs: number = DEFAULT_POLL_INTERVAL_MS
) => {
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

  useSessionEvent(
    sessionId,
    'location_update',
    (data) => {
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
    },
    pollIntervalMs
  )

  return locations
}

/**
 * Collects inquiry/capture events as they arrive.
 */
export const useInquiryUpdates = (
  sessionId: string | null,
  pollIntervalMs: number = DEFAULT_POLL_INTERVAL_MS
) => {
  const [inquiries, setInquiries] = useState<any[]>([])

  useSessionEvent(
    sessionId,
    'inquiry_submitted',
    (data) => {
      setInquiries((prev) => [data, ...prev])
    },
    pollIntervalMs
  )

  return inquiries
}

export default useSessionWebSocket
