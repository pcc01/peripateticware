# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

import { useCallback, useState, useEffect } from 'react'
import { GEOLOCATION_CONFIG } from '@/config/constants'

export interface GeolocationCoordinates {
  latitude: number
  longitude: number
  accuracy: number
  timestamp: number
}

interface GeolocationState {
  coordinates: GeolocationCoordinates | null
  error: string | null
  isLoading: boolean
  lastUpdated: string | null
}

export const useGeolocation = () => {
  const [state, setState] = useState<GeolocationState>({
    coordinates: null,
    error: null,
    isLoading: false,
    lastUpdated: null,
  })

  const getLocation = useCallback(() => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }))

    if (!navigator.geolocation) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: 'Geolocation is not supported by your browser',
      }))
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords
        setState({
          coordinates: {
            latitude,
            longitude,
            accuracy,
            timestamp: position.timestamp,
          },
          error: null,
          isLoading: false,
          lastUpdated: new Date().toISOString(),
        })
      },
      (error) => {
        let errorMessage = 'Failed to get location'
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage = 'Location permission denied. Please enable location access.'
            break
          case error.POSITION_UNAVAILABLE:
            errorMessage = 'Location information is unavailable.'
            break
          case error.TIMEOUT:
            errorMessage = 'Location request timed out.'
            break
        }
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: errorMessage,
        }))
      },
      {
        enableHighAccuracy: GEOLOCATION_CONFIG.ENABLE_HIGH_ACCURACY,
        timeout: GEOLOCATION_CONFIG.TIMEOUT,
        maximumAge: GEOLOCATION_CONFIG.MAX_AGE,
      }
    )
  }, [])

  const watchLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setState((prev) => ({
        ...prev,
        error: 'Geolocation is not supported by your browser',
      }))
      return undefined
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords
        setState({
          coordinates: {
            latitude,
            longitude,
            accuracy,
            timestamp: position.timestamp,
          },
          error: null,
          isLoading: false,
          lastUpdated: new Date().toISOString(),
        })
      },
      (error) => {
        console.error('Geolocation watch error:', error)
      },
      {
        enableHighAccuracy: GEOLOCATION_CONFIG.ENABLE_HIGH_ACCURACY,
        timeout: GEOLOCATION_CONFIG.TIMEOUT,
        maximumAge: GEOLOCATION_CONFIG.MAX_AGE,
      }
    )

    return () => navigator.geolocation.clearWatch(watchId)
  }, [])

  const clearLocation = useCallback(() => {
    setState({
      coordinates: null,
      error: null,
      isLoading: false,
      lastUpdated: null,
    })
  }, [])

  return {
    ...state,
    getLocation,
    watchLocation,
    clearLocation,
  }
}

export default useGeolocation
