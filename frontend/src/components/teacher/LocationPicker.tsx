// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

/**
 * LocationPicker Component
 * Interactive map for selecting activity location with radius trigger zone
 * 
 * Features:
 * - Leaflet map integration
 * - Address search (geocoding)
 * - Drag marker to set location
 * - Radius adjustment slider
 * - Visual trigger zone on map
 * - Latitude/Longitude input fields
 * - Location name input
 */

import React, { useEffect, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { MapContainer, TileLayer, Marker, Circle, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import Button from '../common/Button';
import LoadingSpinner from '../common/LoadingSpinner';

// Fix Leaflet marker icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface LocationPickerProps {
  initialLat?: number;
  initialLng?: number;
  initialRadius?: number;
  initialLocationName?: string;
  onLocationSave: (lat: number, lng: number, radius: number, name: string) => void;
  onCancel?: () => void;
  compact?: boolean;
}

interface Location {
  lat: number;
  lng: number;
  name: string;
}

// Map event handler component
const LocationMarker: React.FC<{
  location: Location | null;
  radius: number;
  onLocationChange: (location: Location) => void;
}> = ({ location, radius, onLocationChange }) => {
  const map = useMapEvents({
    click(e) {
      const newLocation = {
        lat: e.latlng.lat,
        lng: e.latlng.lng,
        name: `${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)}`,
      };
      onLocationChange(newLocation);
      map.flyTo(e.latlng, map.getZoom());
    },
  });

  return location ? (
    <>
      <Marker position={[location.lat, location.lng]} draggable />
      <Circle
        center={[location.lat, location.lng]}
        radius={radius}
        pathOptions={{
          color: 'rgb(59, 130, 246)',
          fillColor: 'rgb(59, 130, 246)',
          fillOpacity: 0.1,
          weight: 2,
        }}
      />
    </>
  ) : null;
};

export const LocationPicker: React.FC<LocationPickerProps> = ({
  initialLat = 0,
  initialLng = 0,
  initialRadius = 100,
  initialLocationName = '',
  onLocationSave,
  onCancel,
  compact = false,
}) => {
  const [location, setLocation] = useState<Location>({
    lat: initialLat || 0,
    lng: initialLng || 0,
    name: initialLocationName || '',
  });

  const [radius, setRadius] = useState(initialRadius || 100);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const mapRef = useRef(null);

  // Handle address search (geocoding)
  const handleAddressSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchError('Please enter an address');
      return;
    }

    setSearching(true);
    setSearchError(null);

    try {
      // Use OpenStreetMap Nominatim API
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
          searchQuery
        )}&format=json&limit=1`,
        {
          headers: {
            'User-Agent': 'Peripateticware Activity Builder',
          },
        }
      );

      if (!response.ok) throw new Error('Search failed');

      const results = await response.json();

      if (results.length === 0) {
        setSearchError('Location not found. Try a different address.');
        setSearching(false);
        return;
      }

      const result = results[0];
      const newLocation = {
        lat: parseFloat(result.lat),
        lng: parseFloat(result.lon),
        name: result.display_name || result.name || searchQuery,
      };

      setLocation(newLocation);
      setSearchQuery('');
    } catch (error) {
      setSearchError(
        error instanceof Error ? error.message : 'Failed to search address'
      );
    } finally {
      setSearching(false);
    }
  };

  // Handle direct coordinate input
  const handleLatChange = (value: string) => {
    const lat = parseFloat(value);
    if (!isNaN(lat)) {
      setLocation((prev) => ({ ...prev, lat }));
    }
  };

  const handleLngChange = (value: string) => {
    const lng = parseFloat(value);
    if (!isNaN(lng)) {
      setLocation((prev) => ({ ...prev, lng }));
    }
  };

  const handleNameChange = (value: string) => {
    setLocation((prev) => ({ ...prev, name: value }));
  };

  const handleSave = () => {
    if (!location.name.trim()) {
      setSearchError('Please enter a location name');
      return;
    }
    onLocationSave(location.lat, location.lng, radius, location.name);
  };

  return (
    <div className={clsx(
      'space-y-4 bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700',
      compact ? 'text-sm' : ''
    )}>
      <h3 className="font-semibold text-gray-900 dark:text-white">
        📍 Select Location
      </h3>

      {/* Search Bar */}
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Search address or location..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleAddressSearch();
          }}
          className={clsx(
            'flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600',
            'bg-white dark:bg-gray-700 text-gray-900 dark:text-white',
            'placeholder-gray-500 dark:placeholder-gray-400',
            'focus:outline-none focus:ring-2 focus:ring-blue-500',
            compact ? 'text-sm' : 'text-base'
          )}
        />
        <Button
          variant="primary"
          size={compact ? 'sm' : 'md'}
          onClick={handleAddressSearch}
          disabled={searching}
          isLoading={searching}
        >
          Search
        </Button>
      </div>

      {/* Search Error */}
      {searchError && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 text-sm">
          {searchError}
        </div>
      )}

      {/* Map */}
      <div className="rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 h-64">
        <MapContainer
          center={[location.lat, location.lng]}
          zoom={13}
          style={{ height: '100%', width: '100%' }}
          ref={mapRef}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <LocationMarker
            location={location}
            radius={radius}
            onLocationChange={setLocation}
          />
        </MapContainer>
      </div>

      {/* Coordinates Section */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
            Latitude
          </label>
          <input
            type="number"
            value={location.lat}
            onChange={(e) => handleLatChange(e.target.value)}
            step="0.0001"
            className={clsx(
              'w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600',
              'bg-white dark:bg-gray-700 text-gray-900 dark:text-white',
              'focus:outline-none focus:ring-2 focus:ring-blue-500',
              'text-sm'
            )}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
            Longitude
          </label>
          <input
            type="number"
            value={location.lng}
            onChange={(e) => handleLngChange(e.target.value)}
            step="0.0001"
            className={clsx(
              'w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600',
              'bg-white dark:bg-gray-700 text-gray-900 dark:text-white',
              'focus:outline-none focus:ring-2 focus:ring-blue-500',
              'text-sm'
            )}
          />
        </div>
      </div>

      {/* Location Name */}
      <div>
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
          Location Name
        </label>
        <input
          type="text"
          value={location.name}
          onChange={(e) => handleNameChange(e.target.value)}
          placeholder="e.g., Central Park, New York"
          className={clsx(
            'w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600',
            'bg-white dark:bg-gray-700 text-gray-900 dark:text-white',
            'placeholder-gray-500 dark:placeholder-gray-400',
            'focus:outline-none focus:ring-2 focus:ring-blue-500',
            'text-sm'
          )}
        />
      </div>

      {/* Radius Adjustment */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
            Trigger Radius
          </label>
          <span className="text-xs font-mono bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-gray-900 dark:text-white">
            {radius}m
          </span>
        </div>
        <input
          type="range"
          min="10"
          max="10000"
          step="10"
          value={radius}
          onChange={(e) => setRadius(parseInt(e.target.value))}
          className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
        />
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
          Students will receive this activity when within {radius} meters of the location
        </p>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2 pt-4 border-t border-gray-200 dark:border-gray-700">
        <Button
          variant="primary"
          className="flex-1"
          onClick={handleSave}
        >
          Save Location
        </Button>
        {onCancel && (
          <Button
            variant="secondary"
            className="flex-1"
            onClick={onCancel}
          >
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
};

export default LocationPicker;
