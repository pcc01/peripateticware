import { useTranslation } from 'react-i18next';
import React, { useState, useRef, useEffect } from 'react';
import styles from './LocationPicker.module.css';

interface LocationPickerProps {
  onLocationSelected: (location: {
    latitude: number;
    longitude: number;
    address?: string;
  }) => void;
}

// Simple map component (use leaflet or similar in production)
const SimpleMap = ({ onMapClick }: {onMapClick: (lat: number, lng: number) => void;}) => {
  const { t } = useTranslation('landing');
  return (
    <div className={styles.mapContainer}>
      <div className={styles.mapPlaceholder}>
        <p>{t("landing:map_integration", "\uD83D\uDDFA\uFE0F Map Integration")}</p>
        <p style={{ fontSize: '12px', marginTop: '10px' }}>{t("landing:in_production_integrate_leaflet_or_googl", "In production, integrate Leaflet or Google Maps here.\n          Users can click on the map to select a location.")}


        </p>
        <p style={{ fontSize: '12px', color: '#666', marginTop: '10px' }}>{t("landing:for_now_use_manual_coordinate_entry_belo", "For now, use manual coordinate entry below.")}

        </p>
      </div>
    </div>);

};

export const LocationPicker = ({ onLocationSelected }: LocationPickerProps) => {
  const { t } = useTranslation('landing');
  
  
  
  
  
  const [latitude, setLatitude] = useState<string>('');
  const [longitude, setLongitude] = useState<string>('');
  const [address, setAddress] = useState<string>('');
  const [useCurrentLocation, setUseCurrentLocation] = useState(false);
  const [locationError, setLocationError] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  const handleUseCurrentLocation = () => {
    setIsLoading(true);
    setLocationError('');

    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by your browser');
      setIsLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude: lat, longitude: lng } = position.coords;
        setLatitude(lat.toFixed(6));
        setLongitude(lng.toFixed(6));
        setUseCurrentLocation(true);
        setIsLoading(false);

        // Reverse geocode to get address (optional - requires API)
        reverseGeocode(lat, lng);
      },
      (error) => {
        setLocationError(`Error getting location: ${error.message}`);
        setIsLoading(false);
      }
    );
  };

  const reverseGeocode = async (lat: number, lng: number) => {
    try {
      // Use OSM Nominatim for free reverse geocoding
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`
      );
      const data = await response.json();
      if (data.address) {
        setAddress(data.address.name || data.display_name);
      }
    } catch (error) {
      console.warn('Reverse geocoding failed:', error);
    }
  };

  const handleSubmit = () => {
    if (!latitude || !longitude) {
      setLocationError('Please enter both latitude and longitude');
      return;
    }

    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);

    if (isNaN(lat) || isNaN(lng)) {
      setLocationError('Latitude and longitude must be valid numbers');
      return;
    }

    if (lat < -90 || lat > 90) {
      setLocationError('Latitude must be between -90 and 90');
      return;
    }

    if (lng < -180 || lng > 180) {
      setLocationError('Longitude must be between -180 and 180');
      return;
    }

    onLocationSelected({
      latitude: lat,
      longitude: lng,
      address: address || undefined
    });
  };

  const handleClear = () => {
    setLatitude('');
    setLongitude('');
    setAddress('');
    setUseCurrentLocation(false);
    setLocationError('');
  };

  return (
    <div className={styles.container}>
      <div className={styles.methodTabs}>
        <button
          className={`${styles.tab} ${!useCurrentLocation ? styles.active : ''}`}
          onClick={() => setUseCurrentLocation(false)}>{t("landing:manual_entry", "Manual Entry")}


        </button>
        <button
          className={`${styles.tab} ${useCurrentLocation ? styles.active : ''}`}
          onClick={() => {
            if (!useCurrentLocation) {
              handleUseCurrentLocation();
            }
          }}>{t("landing:current_location", "Current Location")}


        </button>
      </div>

      {/* Map Placeholder */}
      <SimpleMap onMapClick={(lat, lng) => {
        setLatitude(lat.toString());
        setLongitude(lng.toString());
      }} />

      {/* Coordinate Input Section */}
      <div className={styles.coordSection}>
        <h3>{t("landing:enter_coordinates", "Enter Coordinates")}</h3>

        <div className={styles.coordPair}>
          <div className={styles.coordInput}>
            <label htmlFor="latitude">{t("landing:locationpicker.latitude", "Latitude")}</label>
            <input
              id="latitude"
              type="number"
              value={latitude}
              onChange={(e) => setLatitude(e.target.value)}
              placeholder={t("landing:eg_476062", "e.g., 47.6062")}
              step="0.0001"
              min="-90"
              max="90"
              className={styles.input} />
            
            <p className={styles.hint}>{t("landing:90_to_90", "-90 to 90")}</p>
          </div>

          <div className={styles.coordInput}>
            <label htmlFor="longitude">{t("landing:locationpicker.longitude", "Longitude")}</label>
            <input
              id="longitude"
              type="number"
              value={longitude}
              onChange={(e) => setLongitude(e.target.value)}
              placeholder={t("landing:eg_1223321", "e.g., -122.3321")}
              step="0.0001"
              min="-180"
              max="180"
              className={styles.input} />
            
            <p className={styles.hint}>{t("landing:180_to_180", "-180 to 180")}</p>
          </div>
        </div>

        <div className={styles.addressInput}>
          <label htmlFor="address">{t("landing:address_optional", "Address (optional)")}</label>
          <input
            id="address"
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder={t("landing:eg_seattle_wa", "e.g., Seattle, WA")}
            className={styles.input} />
          
        </div>

        {locationError &&
        <div className={styles.error}>
            {locationError}
          </div>
        }

        <div className={styles.actions}>
          <button
            onClick={handleClear}
            className={styles.secondaryBtn}>{t("landing:clear", "Clear")}


          </button>
          <button
            onClick={handleUseCurrentLocation}
            disabled={isLoading}
            className={styles.secondaryBtn}>
            
            {isLoading ? '⏳ Getting location...' : '📍 Use My Location'}
          </button>
          <button
            onClick={handleSubmit}
            disabled={!latitude || !longitude}
            className={styles.primaryBtn}>{t("landing:confirm_location", "Confirm Location")}


          </button>
        </div>
      </div>

      {/* Example Locations */}
      <div className={styles.examplesSection}>
        <h3>{t("landing:example_locations", "Example Locations")}</h3>
        <div className={styles.examples}>
          <button
            onClick={() => {
              setLatitude('47.6062');
              setLongitude('-122.3321');
              setAddress('Seattle, WA');
            }}
            className={styles.exampleBtn}>{t("landing:seattle_wa", "Seattle, WA")}


          </button>
          <button
            onClick={() => {
              setLatitude('37.7749');
              setLongitude('-122.4194');
              setAddress('San Francisco, CA');
            }}
            className={styles.exampleBtn}>{t("landing:san_francisco_ca", "San Francisco, CA")}


          </button>
          <button
            onClick={() => {
              setLatitude('40.7128');
              setLongitude('-74.0060');
              setAddress('New York, NY');
            }}
            className={styles.exampleBtn}>{t("landing:new_york_ny", "New York, NY")}


          </button>
          <button
            onClick={() => {
              setLatitude('45.5152');
              setLongitude('-122.6784');
              setAddress('Portland, OR');
            }}
            className={styles.exampleBtn}>{t("landing:portland_or", "Portland, OR")}


          </button>
        </div>
      </div>
    </div>);

};