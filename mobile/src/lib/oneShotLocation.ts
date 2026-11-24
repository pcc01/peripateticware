// src/lib/oneShotLocation.ts
// PERI_SPONTANEOUS_DISCOVERY_SPEC_v1.md Design A -- the only one-shot GPS
// read in the app. Every other GPS code path (useGeofence.ts,
// useWayfinding.ts) is watchPositionAsync continuous tracking for an
// in-progress hunt; this is a single, explicit, student-initiated "where am
// I" read used to author a brand-new place, same category of action a
// teacher already does manually via LocationPicker.tsx.

import * as Location from 'expo-location';

export type OneShotLocationResult =
  | { ok: true; latitude: number; longitude: number }
  | { ok: false; reason: 'permission_denied' | 'unavailable' };

/** Requests foreground permission (if not already granted) and takes one
 * GPS read. Never watches, never persists the coordinate -- the caller uses
 * it exactly once to call /locations/search and then discards it (see
 * PERI_SPONTANEOUS_DISCOVERY_SPEC_v1.md Design C). */
export async function getOneShotLocation(): Promise<OneShotLocationResult> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      return { ok: false, reason: 'permission_denied' };
    }
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return { ok: true, latitude: position.coords.latitude, longitude: position.coords.longitude };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}
