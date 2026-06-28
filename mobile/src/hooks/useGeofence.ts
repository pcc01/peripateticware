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

  useEffect(() => {
    if (!enabled || centerLat == null || centerLon == null) return;

    let cancelled = false;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
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
          setIsInside(inside);

          // Throttle exit callbacks to once per 30s
          if (!inside && onExit && Date.now() - lastExitRef.current > 30_000) {
            lastExitRef.current = Date.now();
            onExit();
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
