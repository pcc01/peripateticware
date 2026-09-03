// src/hooks/wayfindingMath.ts
// Pure geo/selection helpers for useWayfinding — extracted so they can be
// unit-tested without expo-location. See WAYFINDING_CONSENT_LADDER.md.

import type { Waypoint } from '@/src/api/activities';

export const RUNG_ORDER: Record<string, number> = { A: 0, B: 1, C: 2, D: 3, E: 4 };

export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
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

/** Compass bearing (0 = N, clockwise) from point 1 to point 2. */
export function bearingDegrees(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const f1 = (lat1 * Math.PI) / 180;
  const f2 = (lat2 * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(dl) * Math.cos(f2);
  const x = Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function relativeBearing(bearing: number, heading: number): number {
  return (bearing - heading + 360) % 360;
}

/**
 * The stop the student should head for next.
 * - ordered: the first un-reached stop by sequence.
 * - free choice: the nearest un-reached stop (falls back to first when no fix).
 * Returns null when every stop is reached.
 */
export function nextActiveWaypoint(
  sorted: Waypoint[],
  arrivedIds: Set<string>,
  ordered: boolean,
  coords: { lat: number; lon: number } | null
): Waypoint | null {
  const remaining = sorted.filter((w) => !arrivedIds.has(w.id));
  if (remaining.length === 0) return null;
  if (ordered || !coords) return remaining[0];
  let best = remaining[0];
  let bestD = Infinity;
  for (const w of remaining) {
    const d = haversineMeters(coords.lat, coords.lon, w.latitude, w.longitude);
    if (d < bestD) {
      bestD = d;
      best = w;
    }
  }
  return best;
}

/** True when `coords` is inside `wp`'s arrival radius. */
export function isWithinArrivalRadius(
  wp: Pick<Waypoint, 'latitude' | 'longitude' | 'arrival_radius_meters'>,
  lat: number,
  lon: number
): boolean {
  return haversineMeters(lat, lon, wp.latitude, wp.longitude) <= (wp.arrival_radius_meters || 25);
}
