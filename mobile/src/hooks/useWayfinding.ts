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
import { Platform } from 'react-native';
import * as Location from 'expo-location';
import * as Device from 'expo-device';
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
// iOS-only polling fallback — see the position-watch effect below. Fast
// enough that ARRIVAL_CONFIRM_FIXES (2) consecutive in-radius polls land
// well inside a flow's extendedWaitUntil timeout; slow enough not to hammer
// battery/CPU polling GPS in a tight loop.
const POLL_INTERVAL_MS = 1_000;

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
  // iOS-only: see the position-watch effect below for why this exists
  // alongside posSub rather than instead of it.
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
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
  // onArrive too -- see the position-watch effect below. A caller that
  // passes an inline/unmemoized callback (confirmed: WayfindingPanel's own
  // parent, app/activity/[id].tsx, does exactly this for onCaptureRequested,
  // which handleArrive's identity depends on) would otherwise force a
  // resubscribe on every one of ITS re-renders, not just on arrivals --
  // the hook shouldn't have to trust every caller to memoize correctly.
  const onArriveRef = useRef(onArrive);
  useEffect(() => {
    rungRef.current = RUNG_ORDER[capabilityRung ?? 'B'] ?? 1;
    onLiveFixRef.current = onLiveFix;
    canArriveRef.current = canArrive !== false;
    onArriveRef.current = onArrive;
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

  // Same deal for arrivedIds -- it changes on every arrival, which is
  // exactly when the effect below used to resubscribe (it WAS a dependency
  // until 2026-10-08). On Android that resubscribe is fast enough not to
  // matter; on a real iOS run it reliably missed the next stop's mocked
  // GPS fixes -- the dead window between unsubscribe and the new
  // subscription's first callback swallowed all of them, every time,
  // confirmed reproducible across two separate builds.
  const arrivedIdsRef = useRef<Set<string>>(arrivedIds);
  useEffect(() => {
    arrivedIdsRef.current = arrivedIds;
  }, [arrivedIds]);

  // ── Position watch ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled || sorted.length === 0) return;
    let cancelled = false;

    const handleFix = (coords: { latitude: number; longitude: number; accuracy: number | null }) => {
      const lat = coords.latitude;
      const lon = coords.longitude;
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
        onLiveFixRef.current?.(lat, lon, coords.accuracy ?? null);
      }

      // Arrival detection — check every not-yet-reached waypoint so a
      // student who wanders onto a later stop still gets credit.
      for (const w of sorted) {
        if (arrivedIdsRef.current.has(w.id) || fired.current.has(w.id)) continue;
        if (isWithinArrivalRadius(w, lat, lon)) {
          const n = (streaks.current[w.id] || 0) + 1;
          streaks.current[w.id] = n;
          // Hold the fire (and the fired-mark) until the caller is ready to
          // report it, so an arrival detected before the session exists
          // isn't silently lost.
          if (n >= ARRIVAL_CONFIRM_FIXES && canArriveRef.current) {
            fired.current.add(w.id);
            const inSequence = !ordered || w.id === activeWaypointIdRef.current;
            onArriveRef.current?.(w, inSequence);
          }
        } else {
          streaks.current[w.id] = 0;
        }
      }
    };

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted' || cancelled) return;
      setTracking(true);

      // iOS SIMULATOR ONLY (Device.isDevice false): confirmed via on-screen
      // debug instrumentation 2026-10-08 that watchPositionAsync's
      // continuous callback delivers exactly ONE fix ever (the initial one
      // on subscribe) and then nothing further, no matter the
      // distanceInterval/timeInterval combination tried, and no matter how
      // the simulated location changes afterward (Maestro setLocation, raw
      // simctl location set, the Simulator's own Features > Location menu —
      // all three, same result, even on a freshly booted simulator + freshly
      // restarted CoreSimulator service + a guaranteed fresh app process,
      // ruling out environment contamination or a stale build). This matches
      // a long-standing, widely-reported upstream expo-location bug —
      // github.com/expo/expo/issues/2682, /10196, /44003 (the last one is
      // literally "watchPositionAsync fails when changing Custom location
      // set in iOS simulator," same SDK version, same repro) — that's
      // consistently framed around the Simulator specifically, not real
      // hardware, which has its own continuous GPS feed into CoreLocation
      // that never goes through the simulated-location-injection path the
      // bug reports implicate. Scoped to Simulator-only (not blanket iOS) on
      // purpose: polling getCurrentPositionAsync() every second is
      // meaningfully more battery-hungry than a native watch (each call
      // re-engages the GPS radio fresh rather than letting the OS batch
      // continuous tracking at the hardware level) — fine for a Simulator
      // test session, not something to ship onto a real student's phone for
      // a 30+ minute hunt. A real iOS device gets the normal efficient watch
      // below, same as Android always has.
      if (Platform.OS === 'ios' && !Device.isDevice) {
        const poll = async () => {
          try {
            const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
            if (!cancelled) {
              handleFix({
                latitude: loc.coords.latitude,
                longitude: loc.coords.longitude,
                accuracy: loc.coords.accuracy ?? null,
              });
            }
          } catch {
            // one poll failing is fine — the next one retries in POLL_INTERVAL_MS
          }
        };
        await poll(); // first fix immediately, matching watchPositionAsync's own behavior
        pollTimer.current = setInterval(poll, POLL_INTERVAL_MS);
        return;
      }

      posSub.current = await Location.watchPositionAsync(
        // distanceInterval 0 (not 1 or 5): arrival confirmation counts
        // consecutive in-radius fixes, so we want every fix, not one per N m
        // moved. NO timeInterval — Android-only per expo-location's own
        // docs; passing any value (including 0) is harmless on Android but
        // see the iOS branch above for why it actively breaks delivery there.
        { accuracy: Location.Accuracy.High, distanceInterval: 0 },
        (loc) =>
          handleFix({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            accuracy: loc.coords.accuracy ?? null,
          })
      );
    })();

    return () => {
      cancelled = true;
      posSub.current?.remove();
      posSub.current = null;
      if (pollTimer.current) {
        clearInterval(pollTimer.current);
        pollTimer.current = null;
      }
    };
    // activeWaypoint, arrivedIds AND onArrive are all read via refs inside
    // the callback, so nothing about a target change, a fresh arrival, or
    // the caller's own re-render churn forces a resubscribe -- the position
    // watch stays live for the whole hunt, subscribing exactly once (per
    // enabled/sorted/ordered identity, none of which should change mid-hunt).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, sorted, ordered]);

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
