// src/hooks/useGeofence.ts
// Watches student location during an activity; calls onExit when they leave the radius

import { useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';

interface GeofenceParams {
  centerLat?: number;
  centerLon?: number;
  radiusMeters?: number;
  enabled: boolean;
  onExit?: () => void;
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function useGeofence({ centerLat, centerLon, radiusMeters = 200, enabled, onExit }: GeofenceParams) {
  const [distanceMeters, setDistanceMeters] = useState<number | null>(null);
  const [isInside, setIsInside] = useState(true);
  const subRef = useRef<Location.LocationSubscription | null>(null);
  const lastExitRef = useRef(0);
  const lastInsideRef = useRef(true);
  // activity/[id].tsx passes a brand-new `onExit` closure on every render
  // (it's defined inline, not memoized), but `onExit` wasn't in this
  // effect's dependency array below — so without this ref, the watcher's
  // callback would permanently hold only the very first render's closure.
  // setGeofenceToast(true) is a stable setState call either way, so that
  // part kept working, but a same-session analytics call reading a value
  // that changes after mount (e.g. sessionId arriving slightly after
  // Inquiry starts) could silently log against a stale/undefined one.
  // Keeping onExit in a ref (updated every render, read inside the
  // long-lived watcher callback) fixes that without forcing the effect
  // below to tear down and resubscribe watchPositionAsync() on every
  // parent render, which adding onExit directly to the deps array would.
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;

  useEffect(() => {
    if (!enabled || centerLat == null || centerLon == null) return;

    let cancelled = false;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (__DEV__) console.log(`[useGeofence] permission status: ${status}`);
      if (status !== 'granted' || cancelled) return;

      subRef.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, distanceInterval: 10 },
        (loc) => {
          const dist = haversineMeters(
            loc.coords.latitude, loc.coords.longitude,
            centerLat, centerLon
          );
          setDistanceMeters(Math.round(dist));
          const inside = dist <= radiusMeters;
          // Logged only on a boundary crossing, not every update, so this
          // can't turn into per-second noise for a student on a long walk —
          // but still gives a next CI failure's logcat/device log something
          // concrete: did a location update ever arrive, and did it cross
          // the radius, before the test's own timeout gave up. lastInsideRef
          // (not the isInside state var) is what's compared against: state
          // read inside this same long-lived callback would be stale for
          // the same closure reason onExit needed a ref above.
          if (__DEV__ && inside !== lastInsideRef.current) {
            console.log(`[useGeofence] crossed boundary: inside=${inside} dist=${Math.round(dist)}m`);
          }
          lastInsideRef.current = inside;
          setIsInside(inside);

          // Throttle exit callbacks to once per 30s
          if (!inside && onExitRef.current && Date.now() - lastExitRef.current > 30_000) {
            lastExitRef.current = Date.now();
            onExitRef.current();
          }
        }
      );
    })();

    return () => {
      cancelled = true;
      subRef.current?.remove();
    };
  }, [enabled, centerLat, centerLon, radiusMeters]);

  return { distanceMeters, isInside };
}
