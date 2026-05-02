// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

/**
 * useLocation Custom Hook
 * Provides location and geolocation functionality
 */

import { useState, useCallback, useEffect } from 'react';

interface LocationCoordinates {
  lat: number;
  lng: number;
}

interface LocationData extends LocationCoordinates {
  name: string;
  accuracy?: number;
  timestamp?: number;
}

export const useLocation = () => {
  const [location, setLocation] = useState<LocationData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [geolocationSupported, setGeolocationSupported] = useState(false);

  // Check if geolocation is supported
  useEffect(() => {
    setGeolocationSupported('geolocation' in navigator);
  }, []);

  // Get current location using browser geolocation
  const getCurrentLocation = useCallback(async () => {
    if (!geolocationSupported) {
      setError('Geolocation is not supported in your browser');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          timeout: 10000,
          enableHighAccuracy: true,
        });
      });

      const newLocation: LocationData = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
        timestamp: position.timestamp,
        name: `Latitude: ${position.coords.latitude.toFixed(4)}, Longitude: ${position.coords.longitude.toFixed(4)}`,
      };

      setLocation(newLocation);
      return newLocation;
    } catch (err) {
      const message = getGeolocationErrorMessage(
        err instanceof GeolocationPositionError ? err.code : 0
      );
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [geolocationSupported]);

  // Search address (geocoding) using OSM Nominatim
  const searchAddress = useCallback(async (address: string) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
          address
        )}&format=json&limit=1`,
        {
          headers: {
            'User-Agent': 'Peripateticware',
          },
        }
      );

      if (!response.ok) throw new Error('Search failed');

      const results = await response.json();

      if (results.length === 0) {
        setError('Location not found');
        return null;
      }

      const result = results[0];
      const newLocation: LocationData = {
        lat: parseFloat(result.lat),
        lng: parseFloat(result.lon),
        name: result.display_name || address,
      };

      setLocation(newLocation);
      return newLocation;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Search failed';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Reverse geocoding (convert coordinates to address)
  const reverseGeocode = useCallback(async (lat: number, lng: number) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
        {
          headers: {
            'User-Agent': 'Peripateticware',
          },
        }
      );

      if (!response.ok) throw new Error('Reverse geocoding failed');

      const result = await response.json();

      const newLocation: LocationData = {
        lat,
        lng,
        name: result.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
      };

      setLocation(newLocation);
      return newLocation;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Reverse geocoding failed';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Set location manually
  const setManualLocation = useCallback((lat: number, lng: number, name: string) => {
    const newLocation: LocationData = {
      lat,
      lng,
      name,
      timestamp: Date.now(),
    };
    setLocation(newLocation);
    setError(null);
  }, []);

  // Clear location
  const clearLocation = useCallback(() => {
    setLocation(null);
    setError(null);
  }, []);

  // Clear error
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Calculate distance between two coordinates (in meters)
  const calculateDistance = useCallback((lat1: number, lng1: number, lat2: number, lng2: number) => {
    const R = 6371e3; // Earth's radius in meters
    const Ï†1 = (lat1 * Math.PI) / 180;
    const Ï†2 = (lat2 * Math.PI) / 180;
    const Î”Ï† = ((lat2 - lat1) * Math.PI) / 180;
    const Î”Î» = ((lng2 - lng1) * Math.PI) / 180;

    const a =
      Math.sin(Î”Ï† / 2) * Math.sin(Î”Ï† / 2) +
      Math.cos(Ï†1) * Math.cos(Ï†2) * Math.sin(Î”Î» / 2) * Math.sin(Î”Î» / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance in meters
  }, []);

  return {
    // State
    location,
    loading,
    error,
    geolocationSupported,

    // Actions
    getCurrentLocation,
    searchAddress,
    reverseGeocode,
    setManualLocation,
    clearLocation,
    clearError,
    calculateDistance,

    // Computed
    hasLocation: location !== null,
    isLoading: loading,
    hasError: error !== null,
  };
};

// Helper function to get geolocation error message
function getGeolocationErrorMessage(code: number): string {
  switch (code) {
    case 1:
      return 'Permission denied. Please enable location access in your browser settings.';
    case 2:
      return 'Position unavailable. Unable to retrieve your location.';
    case 3:
      return 'Request timeout. Could not get your location in time.';
    default:
      return 'An error occurred while retrieving your location.';
  }
}

export default useLocation;

