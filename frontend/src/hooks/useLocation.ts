// src/hooks/useLocation.ts
import { useState, useCallback, useEffect } from 'react'

export interface GeoLocation {
  latitude: number
  longitude: number
  accuracy: number
  timestamp: number
}

export interface LocationError {
  code: number
  message: string
}

export function useLocation() {
  const [location, setLocation] = useState<GeoLocation | null>(null)
  const [error, setError] = useState<LocationError | null>(null)
  const [loading, setLoading] = useState(true)

  // Calculate distance between two points using Haversine formula
  const calculateDistance = useCallback(
    (lat1: number, lng1: number, lat2: number, lng2: number): number => {
      const R = 6371 // Earth's radius in km
      
      // Convert to radians
      const phi1 = (lat1 * Math.PI) / 180
      const phi2 = (lat2 * Math.PI) / 180
      const deltaLat = ((lat2 - lat1) * Math.PI) / 180
      const deltaLng = ((lng2 - lng1) * Math.PI) / 180

      // Haversine formula
      const a =
        Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
        Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2)

      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
      const distance = R * c

      return distance
    },
    []
  )

  // Check if user is within a radius
  const isWithinRadius = useCallback(
    (centerLat: number, centerLng: number, radiusKm: number): boolean => {
      if (!location) return false

      const distance = calculateDistance(
        centerLat,
        centerLng,
        location.latitude,
        location.longitude
      )

      return distance <= radiusKm
    },
    [location, calculateDistance]
  )

  // Get current location
  const getCurrentLocation = useCallback(() => {
    setLoading(true)
    setError(null)

    if (!navigator.geolocation) {
      setError({
        code: -1,
        message: 'Geolocation is not supported by this browser',
      })
      setLoading(false)
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp,
        })
        setLoading(false)
      },
      (err) => {
        setError({
          code: err.code,
          message: err.message,
        })
        setLoading(false)
      }
    )
  }, [])

  // Watch location
  const watchLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setError({
        code: -1,
        message: 'Geolocation is not supported',
      })
      return null
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp,
        })
        setError(null)
      },
      (err) => {
        setError({
          code: err.code,
          message: err.message,
        })
      }
    )

    return () => {
      if (watchId) {
        navigator.geolocation.clearWatch(watchId)
      }
    }
  }, [])

  // Get location on mount
  useEffect(() => {
    getCurrentLocation()
  }, [getCurrentLocation])

  return {
    location,
    error,
    loading,
    getCurrentLocation,
    watchLocation,
    calculateDistance,
    isWithinRadius,
  }
}

export default useLocation