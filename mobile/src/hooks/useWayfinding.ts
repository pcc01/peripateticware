// src/hooks/useWayfinding.ts
// Multi-step scavenger-hunt navigation. Generalises useGeofence to an ordered
// (or free-choice) set of waypoints: tracks the student's position ON THE
// PHONE, shows distance + bearing to the next stop, and fires onArrive when
// they're inside a stop's radius for a few consecutive fixes.
//
// PRIVACY: this hook never transmits a coordinate. The parent reports only
// which waypoint was reached, via recordWaypointArrival(). See
// WAYFINDING_CONSENT_LADDER.md §2 (rung B).

import { useEffect, useMemo, useRef, useState } from 'react';
import * as Location from 'expo-location';
import type { Waypoint } from '@/src/api/activities';
import {
  RUNG_ORDER,
  haversineMeters,
  bearingDegrees,
  relativeBearing as relBearing,
  nextActiveWaypoint,
  isWithinArrivalRadius,
} from '@/src/hooks/wayfindingMath';

type WayfindingMode = 'ordered' | 'free_choice' | 'guided_path';

interface Params {
  waypoints: Waypoint[];
  mode?: WayfindingMode | null;
  /** Waypoint ids already reached — from server progress. Controlled by parent. */
  arrivedIds: Set<string>;
  enabled: boolean;
  /** Fired once per waypoint when arrival is confirmed (debounced). */
  onArrive?: (waypoint: Waypoint, inSequence: boolean) => void;
  /** When false, arrival streaks still build but onArrive is held back (and
   *  the waypoint is NOT marked fired) until it flips true — so an arrival
   *  detected before the session is ready isn't lost. Default true. */
  canArrive?: boolean;
  /** The student's effective capability rung (from …/my-capability). Rung D
   *  enables throttled onLiveFix; rung E buffers breadcrumbs for drainBreadcrumbs(). */
  capabilityRung?: string;
  /** Rung D — throttled to ~1 per LIVE_FIX_INTERVAL_MS. */
  onLiveFix?: (lat: number, lon: number, accuracy: number | null) => void;
}

// Consecutive in-radius fixes required before an arrival is confirmed — one
// stray fix near a stop won't trigger it, two in a row will.
const ARRIVAL_CONFIRM_FIXES = 2;
const LIVE_FIX_INTERVAL_MS = 15_000;

export interface WayfindingState {
  /** The stop the student should head to next (null when all done). */
  activeWaypoint: Waypoint | null;
  /** Metres to the active waypoint, or null before the first fix. */
  distanceMeters: number | null;
  /** Compass bearing (0=N) from the student to the active waypoint. */
  bearingDegrees: number | null;
  /** Device heading (0=N), or null if unavailable. */
  headingDegrees: number | null;
  /** bearing − heading, normalised to [0,360) — rotate an arrow by this. */
  relativeBearing: number | null;
  /** True once a location permission has been granted this session. */
  tracking: boolean;
  /** Rung E — buffered breadcrumb points [[lng,lat,epochMs],…]; clears on read. */
  drainBreadcrumbs: () => number[][];
}

export function useWayfinding({
  waypoints,
  mode,
  arrivedIds,
  enabled,
  onArrive,
  capabilityRung,
  onLiveFix,
  canArrive,
}: Params): WayfindingState {
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [headingDegrees, setHeadingDegrees] = useState<number | null>(null);
  const [tracking, setTracking] = useState(false);

  const posSub = useRef<Location.LocationSubscription | null>(null);
  const headSub = useRef<Location.LocationSubscription | null>(null);
  // waypoint id -> consecutive in-radius fix count
  const streaks = useRef<Record<string, number>>({});
  // waypoint ids we've already fired onArrive for this mount
  const fired = useRef<Set<string>>(new Set());
  // Rung D/E plumbing — kept in refs so the long-lived watch callback sees
  // current values without resubscribing.
  const rungRef = useRef<number>(RUNG_ORDER[capabilityRung ?? 'B'] ?? 1);
  const onLiveFixRef = useRef(onLiveFix);
  const lastLiveFixAt = useRef<number>(0);
  const breadcrumbs = useRef<number[][]>([]); // [[lng, lat, epochMs], ...]
  const canArriveRef = useRef<boolean>(canArrive !== false);
  useEffect(() => {
    rungRef.current = RUNG_ORDER[capabilityRung ?? 'B'] ?? 1;
    onLiveFixRef.current = onLiveFix;
    canArriveRef.current = canArrive !== false;
  });

  /** Rung E — hand the buffered breadcrumb points to the caller and clear. */
  const drainBreadcrumbs = (): number[][] => {
    const out = breadcrumbs.current;
    breadcrumbs.current = [];
    return out;
  };

  const ordered = mode === 'ordered' || mode === 'guided_path';

  const sorted = useMemo(
    () => [...waypoints].sort((a, b) => a.sequence_index - b.sequence_index),
    [waypoints]
  );

  // The next stop to head for. Ordered: first un-reached by sequence.
  // Free-choice: nearest un-reached.
  const activeWaypoint = useMemo(
    () => nextActiveWaypoint(sorted, arrivedIds, ordered, coords),
    [sorted, arrivedIds, ordered, coords]
  );

  // Keep the active-waypoint id available to the (long-lived) watch callback
  // so target changes don't force a resubscribe. Declared before the watch
  // effect that reads it.
  const activeWaypointIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeWaypointIdRef.current = activeWaypoint?.id ?? null;
  }, [activeWaypoint]);

  // ── Position watch ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled || sorted.length === 0) return;
    let cancelled = false;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted' || cancelled) return;
      setTracking(true);

      posSub.current = await Location.watchPositionAsync(
        // distanceInterval 1 (not 5): arrival confirmation counts consecutive
        // in-radius fixes, so we want every fix, not one per 5 m moved.
        { accuracy: Location.Accuracy.High, distanceInterval: 1, timeInterval: 0 },
        (loc) => {
          const lat = loc.coords.latitude;
          const lon = loc.coords.longitude;
          setCoords({ lat, lon });

          // Rung E — buffer a breadcrumb point for the caller to flush.
          if (rungRef.current >= RUNG_ORDER.E) {
            breadcrumbs.current.push([
              Math.round(lon * 1e6) / 1e6,
              Math.round(lat * 1e6) / 1e6,
              Date.now(),
            ]);
          }
          // Rung D — throttled live position to the teacher.
          if (
            rungRef.current >= RUNG_ORDER.D &&
            Date.now() - lastLiveFixAt.current >= LIVE_FIX_INTERVAL_MS
          ) {
            lastLiveFixAt.current = Date.now();
            onLiveFixRef.current?.(lat, lon, loc.coords.accuracy ?? null);
          }

          // Arrival detection — check every not-yet-reached waypoint so a
          // student who wanders onto a later stop still gets credit.
          for (const w of sorted) {
            if (arrivedIds.has(w.id) || fired.current.has(w.id)) continue;
            if (isWithinArrivalRadius(w, lat, lon)) {
              const n = (streaks.current[w.id] || 0) + 1;
              streaks.current[w.id] = n;
              // Hold the fire (and the fired-mark) until the caller is ready to
              // report it, so an arrival detected before the session exists
              // isn't silently lost.
              if (n >= ARRIVAL_CONFIRM_FIXES && canArriveRef.current) {
                fired.current.add(w.id);
                const inSequence = !ordered || w.id === activeWaypointIdRef.current;
                onArrive?.(w, inSequence);
              }
            } else {
              streaks.current[w.id] = 0;
            }
          }
        }
      );
    })();

    return () => {
      cancelled = true;
      posSub.current?.remove();
      posSub.current = null;
    };
    // activeWaypoint is read via a ref inside the callback so we don't
    // resubscribe on every target change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, sorted, arrivedIds, ordered, onArrive]);

  // ── Heading watch ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled || !activeWaypoint) return;
    let cancelled = false;
    (async () => {
      try {
        headSub.current = await Location.watchHeadingAsync((h) => {
          if (cancelled) return;
          const deg = h.trueHeading >= 0 ? h.trueHeading : h.magHeading;
          setHeadingDegrees(deg >= 0 ? deg : null);
        });
      } catch {
        setHeadingDegrees(null);
      }
    })();
    return () => {
      cancelled = true;
      headSub.current?.remove();
      headSub.current = null;
    };
  }, [enabled, activeWaypoint]);

  const distanceMeters =
    coords && activeWaypoint
      ? Math.round(
          haversineMeters(coords.lat, coords.lon, activeWaypoint.latitude, activeWaypoint.longitude)
        )
      : null;

  const bearing =
    coords && activeWaypoint
      ? bearingDegrees(coords.lat, coords.lon, activeWaypoint.latitude, activeWaypoint.longitude)
      : null;

  const relativeBearing =
    bearing != null && headingDegrees != null
      ? relBearing(bearing, headingDegrees)
      : null;

  return {
    activeWaypoint,
    distanceMeters,
    bearingDegrees: bearing,
    headingDegrees,
    relativeBearing,
    tracking,
    drainBreadcrumbs,
  };
}
