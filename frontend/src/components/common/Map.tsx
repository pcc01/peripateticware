import React, { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { MAP_CONFIG } from '@/config/constants'
import { Location, ActivityZone, ZoneShape } from '@types/session'

interface MapProps {
  center?: [number, number]
  zoom?: number
  markers?: Array<{ location: Location; label: string }>
  zones?: ActivityZone[]
  onLocationSelect?: (location: Location) => void
  onZoneCreate?: (zone: ActivityZone) => void
  editable?: boolean
  height?: string
}

const Map: React.FC<MapProps> = ({
  center = MAP_CONFIG.DEFAULT_CENTER,
  zoom = MAP_CONFIG.DEFAULT_ZOOM,
  markers = [],
  zones = [],
  onLocationSelect,
  onZoneCreate,
  editable = false,
  height = '400px',
}) => {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const layerGroup = useRef<L.FeatureGroup | null>(null)
  const [isDrawingZone, setIsDrawingZone] = useState(false)
  const [currentZoneShape, setCurrentZoneShape] = useState<ZoneShape>(ZoneShape.CIRCLE)

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return

    map.current = L.map(mapContainer.current).setView(center, zoom)

    // Add tile layer
    L.tileLayer(
      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      {
        attribution: MAP_CONFIG.ATTRIBUTION,
        maxZoom: MAP_CONFIG.MAX_ZOOM,
        minZoom: MAP_CONFIG.MIN_ZOOM,
      }
    ).addTo(map.current)

    // Create feature group for editable layers
    if (editable) {
      layerGroup.current = L.featureGroup().addTo(map.current)
    }

    // Handle location clicks
    if (onLocationSelect) {
      map.current.on('click', (e: L.LeafletMouseEvent) => {
        onLocationSelect({
          latitude: e.latlng.lat,
          longitude: e.latlng.lng,
          name: `Location (${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)})`,
        })
      })
    }

    return () => {
      if (map.current) {
        map.current.remove()
        map.current = null
      }
    }
  }, [center, zoom, onLocationSelect, editable])

  // Add markers
  useEffect(() => {
    if (!map.current) return

    markers.forEach((marker) => {
      L.marker([marker.location.latitude, marker.location.longitude])
        .bindPopup(marker.label)
        .addTo(map.current!)
    })
  }, [markers])

  // Draw zones
  useEffect(() => {
    if (!map.current || !layerGroup.current) return

    layerGroup.current.clearLayers()

    zones.forEach((zone) => {
      let layer: L.Layer | null = null

      if (zone.shape === ZoneShape.CIRCLE && zone.radius) {
        layer = L.circle([zone.location.latitude, zone.location.longitude], {
          radius: zone.radius,
          color: '#0066cc',
          fillOpacity: 0.2,
        })
      } else if (zone.shape === ZoneShape.RECTANGLE && zone.coordinates && zone.coordinates.length >= 2) {
        const bounds = [
          [zone.coordinates[0].latitude, zone.coordinates[0].longitude],
          [zone.coordinates[1].latitude, zone.coordinates[1].longitude],
        ] as L.LatLngBoundsExpression
        layer = L.rectangle(bounds, {
          color: '#0066cc',
          fillOpacity: 0.2,
        })
      } else if (zone.shape === ZoneShape.POLYGON && zone.coordinates && zone.coordinates.length >= 3) {
        const latlngs = zone.coordinates.map((c) => [c.latitude, c.longitude])
        layer = L.polygon(latlngs, {
          color: '#0066cc',
          fillOpacity: 0.2,
        })
      }

      if (layer) {
        layerGroup.current!.addLayer(layer)
      }
    })
  }, [zones])

  const handleDrawZone = () => {
    setIsDrawingZone(!isDrawingZone)
    // In production, integrate with Leaflet Draw library
  }

  return (
    <div className="w-full rounded-lg overflow-hidden border border-color-border">
      {editable && (
        <div className="bg-color-bg-secondary px-4 py-3 border-b border-color-border flex gap-2 flex-wrap">
          <button
            onClick={handleDrawZone}
            className={`px-3 py-1 rounded text-sm font-medium ${
              isDrawingZone
                ? 'bg-color-primary text-white'
                : 'bg-color-bg-primary border border-color-border'
            }`}
          >
            {isDrawingZone ? 'Stop Drawing' : 'Draw Zone'}
          </button>

          <select
            value={currentZoneShape}
            onChange={(e) => setCurrentZoneShape(e.target.value as ZoneShape)}
            className="px-3 py-1 rounded text-sm border border-color-border"
          >
            <option value={ZoneShape.CIRCLE}>Circle</option>
            <option value={ZoneShape.RECTANGLE}>Rectangle</option>
            <option value={ZoneShape.POLYGON}>Polygon</option>
          </select>
        </div>
      )}

      <div ref={mapContainer} style={{ height }} />
    </div>
  )
}

export default Map
