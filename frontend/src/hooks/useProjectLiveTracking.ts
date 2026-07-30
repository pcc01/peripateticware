// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import { useEffect, useRef, useState, useCallback } from 'react'
import sessionService from '@/services/sessionService'
import { projectTrackingApi } from '@/services/phase7Api'
import type { ProjectActiveSession } from '@/types/phase7'

/**
 * Live tracking across every activity in a Project, not just one session —
 * useSessionWebSocket (frontend/src/hooks/useSessionWebSocket.ts) only tracks
 * a single sessionId, which doesn't fit a project that can have several
 * concurrently-active sessions across different activities.
 *
 * Same REST-polling architecture as useSessionWebSocket (no WebSocket
 * backend — see GPS_MAP_HANDOFF.md), fanned out: refresh the roster
 * (already activity-gated + consent-filtered server-side) on a cadence the
 * *backend* dictates via poll_interval_seconds (tiered-polling — a Project
 * is always long-running, so this lands on the slower tier; see
 * services/polling.py), then poll each active session's own event stream in
 * parallel for location updates.
 */

// Only used before the first successful roster fetch has told us the real
// (server-computed) interval.
const DEFAULT_POLL_INTERVAL_MS = 5_000

export interface ProjectStudentLocation {
  latitude: number
  longitude: number
  accuracy: number | null
  timestamp: string
}

interface ProjectLiveTrackingState {
  sessions: ProjectActiveSession[]
  locations: Record<string, ProjectStudentLocation>
  gpsEnabledActivityCount: number
  loading: boolean
  error: string | null
}

export function useProjectLiveTracking(projectId: string | null) {
  const [state, setState] = useState<ProjectLiveTrackingState>({
    sessions: [],
    locations: {},
    gpsEnabledActivityCount: 0,
    loading: true,
    error: null,
  })

  // One "since" cursor per session-id, so each session's event poll only
  // fetches what's new since the last tick.
  const cursorsRef = useRef<Record<string, string>>({})
  // Set from each response's poll_interval_seconds — read by the scheduling
  // effect below so cadence can change (e.g. once real data replaces an
  // empty-roster response) without waiting for a fixed timer to expire.
  const pollIntervalMsRef = useRef<number>(DEFAULT_POLL_INTERVAL_MS)

  const poll = useCallback(async () => {
    if (!projectId) return
    try {
      const { sessions, gps_enabled_activity_count, poll_interval_seconds } =
        await projectTrackingApi.getProjectActiveSessions(projectId)

      if (poll_interval_seconds) {
        pollIntervalMsRef.current = poll_interval_seconds * 1000
      }

      const activeIds = new Set(sessions.map((s) => s.session_id))
      // Drop cursors/locations for sessions that fell out of the roster
      // (session ended) so state doesn't grow unbounded across a long day.
      for (const id of Object.keys(cursorsRef.current)) {
        if (!activeIds.has(id)) delete cursorsRef.current[id]
      }

      const eventBatches = await Promise.all(
        sessions.map((s) =>
          sessionService
            .getSessionEvents(s.session_id, cursorsRef.current[s.session_id])
            .catch(() => [])
        )
      )

      setState((prev) => {
        const nextLocations = { ...prev.locations }
        // Prune locations for sessions no longer active.
        for (const id of Object.keys(nextLocations)) {
          if (!activeIds.has(id)) delete nextLocations[id]
        }

        sessions.forEach((s, i) => {
          const events = eventBatches[i]
          if (events.length > 0) {
            cursorsRef.current[s.session_id] = events[events.length - 1].created_at
          }
          for (const ev of events) {
            if (
              ev.event_type === 'location_update' &&
              ev.metadata?.latitude != null &&
              ev.metadata?.longitude != null
            ) {
              nextLocations[s.session_id] = {
                latitude: ev.metadata.latitude,
                longitude: ev.metadata.longitude,
                accuracy: ev.metadata.accuracy ?? null,
                timestamp: ev.created_at,
              }
            }
          }
          // Fall back to the session's start position until a live update lands.
          if (!nextLocations[s.session_id] && s.latitude != null && s.longitude != null) {
            nextLocations[s.session_id] = {
              latitude: s.latitude,
              longitude: s.longitude,
              accuracy: null,
              timestamp: s.started_at ?? new Date().toISOString(),
            }
          }
        })

        return {
          sessions,
          locations: nextLocations,
          gpsEnabledActivityCount: gps_enabled_activity_count,
          loading: false,
          error: null,
        }
      })
    } catch (err: any) {
      setState((prev) => ({ ...prev, loading: false, error: err?.message ?? 'Failed to load active sessions' }))
    }
  }, [projectId])

  useEffect(() => {
    if (!projectId) return
    cursorsRef.current = {}
    pollIntervalMsRef.current = DEFAULT_POLL_INTERVAL_MS
    setState((prev) => ({ ...prev, loading: true }))

    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    // Self-rescheduling rather than setInterval so a cadence change picked
    // up mid-poll (pollIntervalMsRef) takes effect on the very next tick
    // instead of waiting for the old interval to be torn down and rebuilt.
    const tick = async () => {
      await poll()
      if (!cancelled) timer = setTimeout(tick, pollIntervalMsRef.current)
    }
    tick()

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [projectId, poll])

  return state
}

export default useProjectLiveTracking
