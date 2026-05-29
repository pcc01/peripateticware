import { useTranslation } from 'react-i18next';
import React, { useState, useEffect } from 'react';
import styles from './WikiLocationInfo.module.css';

interface LocationInfo {
  name: string;
  description: string;
  wikiId?: string;
  type?: string;
  features?: string[];
  historicalContext?: string;
  educationalValue?: string;
}

interface WikiLocationInfoProps {
  latitude: number;
  longitude: number;
  onInfoLoaded: (info: LocationInfo) => void;
}

export const WikiLocationInfo = ({ latitude, longitude, onInfoLoaded }: WikiLocationInfoProps) => {
  const { t } = useTranslation('landing');
  
  
  
  
  
  const [locationInfo, setLocationInfo] = useState<LocationInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    fetchLocationInfo();
  }, [latitude, longitude]);

  const fetchLocationInfo = async () => {
    setIsLoading(true);
    setError('');

    try {
      // Step 1: Get location name from reverse geocoding
      const geoResponse = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`
      );
      const geoData = await geoResponse.json();

      const locationName = geoData.address?.city ||
      geoData.address?.county ||
      geoData.address?.state ||
      `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;

      // Step 2: Search Wikipedia for location info
      const wikiResponse = await fetch(
        `https://en.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=${latitude}|${longitude}&gsradius=10000&format=json&origin=*`
      );
      const wikiData = await wikiResponse.json();

      if (wikiData.query?.geosearch?.length > 0) {
        const result = wikiData.query.geosearch[0];
        const pageTitle = result.title;

        // Step 3: Get detailed page content
        const pageResponse = await fetch(
          `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(pageTitle)}&prop=extracts|pageimages&exintro&explaintext&format=json&origin=*`
        );
        const pageData = await pageResponse.json();
        const pages = pageData.query?.pages;
        const pageContent = pages ? Object.values(pages)[0] : null;

        const info: LocationInfo = {
          name: (pageContent as any)?.title || locationName,
          description: (pageContent as any)?.extract || `Location near ${locationName}`,
          wikiId: pageTitle,
          type: result.type || 'location',
          features: extractFeatures((pageContent as any)?.extract || '')
        };

        setLocationInfo(info);
        onInfoLoaded(info);
      } else {
        // Fallback: use only geocoding info
        const fallbackInfo: LocationInfo = {
          name: locationName,
          description: `${locationName} is a location at coordinates ${latitude.toFixed(4)}, ${longitude.toFixed(4)}. ` +
          `Educators can use this location for outdoor learning activities, field observations, and place-based education.`,
          features: extractLocationFeatures(geoData.address || {})
        };
        setLocationInfo(fallbackInfo);
        onInfoLoaded(fallbackInfo);
      }
    } catch (err) {
      console.error('Error fetching location info:', err);
      setError('Could not fetch location information');

      // Provide basic fallback info
      const fallbackInfo: LocationInfo = {
        name: `Location ${latitude.toFixed(2)}, ${longitude.toFixed(2)}`,
        description: `This location can be used for outdoor education and field-based learning activities. ` +
        `Students can conduct observations, collect environmental data, and engage in place-based inquiry.`,
        educationalValue: 'Outdoor learning site'
      };
      setLocationInfo(fallbackInfo);
      onInfoLoaded(fallbackInfo);
    } finally {
      setIsLoading(false);
    }
  };

  const extractFeatures = (text: string): string[] => {
    const features: string[] = [];
    const keywords = [
    'park', 'forest', 'river', 'mountain', 'beach', 'wetland',
    'museum', 'historical', 'monument', 'garden', 'lake', 'trail'];


    keywords.forEach((keyword) => {
      if (text.toLowerCase().includes(keyword)) {
        features.push(keyword.charAt(0).toUpperCase() + keyword.slice(1));
      }
    });

    return features.slice(0, 5);
  };

  const extractLocationFeatures = (address: Record<string, string>): string[] => {
    const features = [];
    if (address.state) features.push(address.state);
    if (address.county) features.push(address.county);
    if (address.country) features.push(address.country);
    return features;
  };

  const getEducationalSuggestions = (info: LocationInfo): string[] => {
    const suggestions = [];

    if (!info.description) return suggestions;

    const desc = info.description.toLowerCase();

    if (desc.includes('park') || desc.includes('forest') || desc.includes('nature')) {
      suggestions.push('🌳 Ecology & Biology observations');
      suggestions.push('🍃 Plant & animal identification');
      suggestions.push('📊 Environmental data collection');
    }

    if (desc.includes('river') || desc.includes('water') || desc.includes('lake')) {
      suggestions.push('💧 Aquatic ecosystem studies');
      suggestions.push('🌊 Water quality testing');
      suggestions.push('⚖️ Hydrology & erosion concepts');
    }

    if (desc.includes('mountain') || desc.includes('hill')) {
      suggestions.push('⛰️ Geology & topography');
      suggestions.push('🏔️ Physical geography');
      suggestions.push('📏 Measurement & scale');
    }

    if (desc.includes('historical') || desc.includes('museum') || desc.includes('monument')) {
      suggestions.push('📚 Historical analysis');
      suggestions.push('🏛️ Cultural heritage studies');
      suggestions.push('⏰ Timeline & chronology');
    }

    if (suggestions.length === 0) {
      suggestions.push('🔬 Scientific observation');
      suggestions.push('📍 Geospatial skills');
      suggestions.push('🗺️ Map & navigation');
    }

    return suggestions.slice(0, 3);
  };

  return (
    <div className={styles.container}>
      {isLoading &&
      <div className={styles.loading}>
          <div className={styles.spinner}></div>
          <p>{t("landing:gathering_location_information", "Gathering location information...")}</p>
        </div>
      }

      {error &&
      <div className={styles.error}>
          <p>{error}</p>
          <p style={{ fontSize: '12px', marginTop: '8px' }}>{t("landing:using_basic_fallback_information", "Using basic fallback information")}

        </p>
        </div>
      }

      {locationInfo &&
      <>
          <div className={styles.header}>
            <h3>{locationInfo.name}</h3>
            {locationInfo.type &&
          <span className={styles.typeBadge}>{locationInfo.type}</span>
          }
          </div>

          <div className={styles.description}>
            <p>{locationInfo.description}</p>
          </div>

          {locationInfo.features && locationInfo.features.length > 0 &&
        <div className={styles.featuresSection}>
              <h4>{t("landing:notable_features", "Notable Features")}</h4>
              <div className={styles.featuresList}>
                {locationInfo.features.map((feature, index) =>
            <span key={index} className={styles.featureTag}>
                    {feature}
                  </span>
            )}
              </div>
            </div>
        }

          <div className={styles.educationalSection}>
            <h4>{t("landing:educational_opportunities", "\uD83D\uDCDA Educational Opportunities")}</h4>
            <ul className={styles.suggestionsUl}>
              {getEducationalSuggestions(locationInfo).map((suggestion, index) =>
            <li key={index}>{suggestion}</li>
            )}
            </ul>
          </div>

          <div className={styles.coordinatesSection}>
            <div className={styles.coordinatePair}>
              <span className={styles.label}>{t("landing:wikilocationinfo.latitude", "Latitude:")}</span>
              <span className={styles.value}>{latitude.toFixed(6)}</span>
            </div>
            <div className={styles.coordinatePair}>
              <span className={styles.label}>{t("landing:wikilocationinfo.longitude", "Longitude:")}</span>
              <span className={styles.value}>{longitude.toFixed(6)}</span>
            </div>
            <a
            href={`https://www.google.com/maps/@${latitude},${longitude},15z`}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.mapLink}>{t("landing:view_on_google_maps", "\uD83D\uDDFA\uFE0F View on Google Maps")}


          </a>
          </div>

          <div className={styles.info}>
            <p>
              💡 <strong>{t("landing:teaching_tip", "Teaching Tip:")}</strong>{t("landing:use_this_location_information_to_create_", "Use this location information to create \n              place-based learning activities that connect student inquiry to real-world contexts.")}

          </p>
          </div>

          <button
          onClick={fetchLocationInfo}
          className={styles.refreshBtn}>{t("landing:refresh_information", "\uD83D\uDD04 Refresh Information")}


        </button>
        </>
      }
    </div>);

};