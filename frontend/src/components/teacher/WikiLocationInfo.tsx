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
  // Wikidata-sourced fields (backend /locations/{place_id}/enrich pipeline)
  wikidataId?: string;
  architectOrArtist?: string;
  constructionDate?: string;
  historicalSignificance?: string;
  keywords?: string[];
  learningOpportunities?: string[];
  // Other real, named places /locations/search found in the same radius —
  // previously discarded entirely (only searchResults[0] was ever used),
  // even though the backend was already finding up to 20 of these per call.
  nearbyPoints?: { name: string; type: string }[];
  // True when `description` came from the LLM's general knowledge rather
  // than a real Wikipedia/Wikidata match (backend enrich.source ===
  // 'ai_generated') — small local sites with no wiki presence at all.
  // Must be visibly distinguished from sourced content in the UI: an LLM's
  // knowledge of an obscure place can be thin or simply wrong on specifics.
  aiGenerated?: boolean;
}

interface WikiLocationInfoProps {
  latitude: number;
  longitude: number;
  subject?: string;
  // The name the teacher actually typed into the "Location Name" field
  // (e.g. "Burke Museum of Natural History and Culture"). Used to pick the
  // matching result out of /locations/search instead of blindly taking
  // whichever place happens to be geographically first/closest — which,
  // for a landmark with several smaller POIs inside or right next to it
  // (a museum's on-site restaurant, a park's memorial, etc.), is often the
  // wrong place entirely. Optional: falls back to the previous
  // closest-result behavior when not provided.
  locationName?: string;
  onInfoLoaded: (info: LocationInfo) => void;
}

// Picks the /locations/search result that actually matches what the teacher
// typed, rather than assuming index 0 (nearest by distance) is the intended
// place. Nearest-by-distance breaks down whenever a smaller POI (a cafe, a
// statue, a parking lot) is geographically closer to the pinned coordinates
// than the landmark itself.
const pickBestMatch = (results: any[], targetName?: string): any => {
  if (!targetName || !targetName.trim() || results.length === 0) {
    return results[0];
  }
  const norm = (s: string) => (s || '').toLowerCase().trim().replace(/[^\w\s]/g, '');
  const target = norm(targetName);
  if (!target) return results[0];

  const exact = results.find((r) => norm(r.name) === target);
  if (exact) return exact;

  // Either name containing the other handles both a teacher typing a
  // shortened name ("Burke Museum") and the index having a longer official
  // name ("Burke Museum of Natural History and Culture"), or vice versa.
  const contains = results.find((r) => {
    const rn = norm(r.name);
    return rn && (rn.includes(target) || target.includes(rn));
  });
  if (contains) return contains;

  // No name match at all (teacher hasn't typed a name yet, or the indexed
  // place uses an entirely different name) — fall back to the prior
  // closest-result behavior rather than guessing further.
  return results[0];
};

export const WikiLocationInfo = ({ latitude, longitude, subject, locationName, onInfoLoaded }: WikiLocationInfoProps) => {
  const { t } = useTranslation('landing');
  
  
  
  
  
  const [locationInfo, setLocationInfo] = useState<LocationInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  // Separate from isLoading: gates only the enrichment sub-panel
  // (description/architect/keywords), not the whole component. Without this
  // split, the entire panel — including the nearby-places list, which
  // /locations/search already has by the time this component would even
  // start rendering — sat behind one spinner for as long as the slowest
  // part (Wikidata/Wikipedia enrichment) took.
  const [isEnriching, setIsEnriching] = useState(false);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    fetchLocationInfo();
  }, [latitude, longitude]);

  /**
   * Fast phase: POST /api/v1/locations/search to find a nearby indexed POI.
   * Returns null (not an error) when nothing is found, so the caller can
   * fall through to the client-side Nominatim/Wikipedia fallback below.
   */
  const fetchSearchMatch = async (): Promise<{ target: any; nearbyPoints: LocationInfo['nearbyPoints'] } | null> => {
    const searchResponse = await fetch('/api/v1/locations/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ latitude, longitude, radius_meters: 500 }),
    });
    if (!searchResponse.ok) {
      throw new Error(`locations/search failed (${searchResponse.status})`);
    }
    const searchResults = await searchResponse.json();
    if (!Array.isArray(searchResults) || searchResults.length === 0) {
      return null;
    }

    const target = pickBestMatch(searchResults, locationName);
    // /locations/search returns up to 20 real nearby places in one call —
    // only the matched one gets enriched. Surface the rest (excluding
    // whichever one was matched, by place_id rather than a fixed index —
    // the match is no longer guaranteed to be index 0) as a "what else is
    // nearby" list instead of discarding them; no extra network calls
    // needed since this data was already fetched.
    const nearbyPoints = searchResults
      .filter((r: any) => r.place_id !== target.place_id && r.name)
      .slice(0, 8)
      .map((r: any) => ({ name: r.name, type: r.location_type || 'location' }));

    return { target, nearbyPoints: nearbyPoints.length > 0 ? nearbyPoints : undefined };
  };

  /**
   * Slower phase: GET /api/v1/locations/{place_id}/enrich for
   * Wikidata/Wikipedia-sourced educational metadata (or an AI-generated
   * fallback synopsis when neither has an entry for this place).
   */
  const fetchEnrichment = async (placeId: string, forceRefresh: boolean): Promise<any> => {
    const params = new URLSearchParams();
    if (subject) params.set('subject', subject);
    // Bypasses the backend's up-to-7-day enrichment cache. Without this,
    // clicking "Refresh Information" for a place that was already enriched
    // once just re-serves the same cached (possibly stale/thin) result —
    // there was no way to actually force a fresh Wikidata/Wikipedia fetch.
    if (forceRefresh) params.set('refresh', 'true');
    const qs = params.toString();
    const enrichResponse = await fetch(
      `/api/v1/locations/${encodeURIComponent(placeId)}/enrich${qs ? `?${qs}` : ''}`
    );
    if (!enrichResponse.ok) {
      throw new Error(`locations/${placeId}/enrich failed (${enrichResponse.status})`);
    }
    return enrichResponse.json();
  };

  const fetchLocationInfo = async (forceRefresh: boolean = false) => {
    setIsLoading(true);
    setError('');

    try {
      // Primary: backend pipeline. If the search phase throws, fall through
      // below to the client-side fallback rather than propagating.
      try {
        const match = await fetchSearchMatch();
        if (match) {
          const { target, nearbyPoints } = match;
          const placeId = target.place_id;

          // Render immediately with what /locations/search already gave us
          // — don't make the teacher wait for the slower Wikidata/Wikipedia
          // enrichment just to see the place name and what's nearby.
          const partialInfo: LocationInfo = {
            name: target.name || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
            description: '',
            type: target.location_type || 'location',
            features: [],
            nearbyPoints,
          };
          setLocationInfo(partialInfo);
          setIsLoading(false);

          setIsEnriching(true);
          try {
            const enrich = await fetchEnrichment(placeId, forceRefresh);
            const description =
              enrich.description || `Location near ${enrich.name || target.name || placeId}`;
            const fullInfo: LocationInfo = {
              ...partialInfo,
              name: enrich.name || partialInfo.name,
              description,
              // Repurposed: wikiId now sources from the Wikidata QID instead of a
              // Wikipedia page title. Confirmed UI-only display state — never sent
              // in the activity save payload — so this is a zero-risk change.
              wikiId: enrich.wikidata_id || undefined,
              features: extractFeatures(description),
              wikidataId: enrich.wikidata_id || undefined,
              architectOrArtist: enrich.architect_or_artist || undefined,
              constructionDate: enrich.construction_date || undefined,
              historicalSignificance: enrich.historical_significance || undefined,
              keywords: enrich.keywords && enrich.keywords.length > 0 ? enrich.keywords : undefined,
              learningOpportunities:
                enrich.learning_opportunities && enrich.learning_opportunities.length > 0
                  ? enrich.learning_opportunities
                  : undefined,
              aiGenerated: enrich.source === 'ai_generated',
            };
            setLocationInfo(fullInfo);
            onInfoLoaded(fullInfo);
          } catch (enrichErr) {
            console.warn('Location enrichment failed, showing basic place info only:', enrichErr);
            onInfoLoaded(partialInfo);
          } finally {
            setIsEnriching(false);
          }
          return;
        }
        // match === null: /locations/search found no nearby POI — fall
        // through to the client-side fallback below.
      } catch (backendErr) {
        console.warn('Backend location search failed, falling back to client-side lookup:', backendErr);
      }

      // Fallback: client-side reverse-geocode (Nominatim) + Wikipedia geosearch
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
            {locationInfo.aiGenerated &&
          <p style={{ fontSize: '12px', fontWeight: 600, color: '#92610e', marginBottom: 4 }}>
                {t("landing:ai_generated_overview", "🤖 AI-generated overview — verify details")}
              </p>
          }
            {locationInfo.description
          ? <p>{locationInfo.description}</p>
          : isEnriching &&
          <p style={{ fontSize: '13px', color: '#888', fontStyle: 'italic' }}>
                  {t("landing:looking_up_more_about_this_place", "Looking up more about this place…")}
                </p>
          }
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

          {(locationInfo.architectOrArtist || locationInfo.constructionDate || locationInfo.historicalSignificance ||
          (locationInfo.keywords && locationInfo.keywords.length > 0) || locationInfo.wikidataId) &&
        <div className={styles.featuresSection}>
              <h4>{t("landing:learn_about_this_place", "Learn about this place")}</h4>
              {locationInfo.architectOrArtist &&
          <div className={styles.coordinatePair}>
                  <span className={styles.label}>{t("landing:wikilocationinfo.architect_or_artist", "Architect/Artist:")}</span>
                  <span className={styles.value}>{locationInfo.architectOrArtist}</span>
                </div>
          }
              {locationInfo.constructionDate &&
          <div className={styles.coordinatePair}>
                  <span className={styles.label}>{t("landing:wikilocationinfo.construction_date", "Constructed:")}</span>
                  <span className={styles.value}>{locationInfo.constructionDate}</span>
                </div>
          }
              {locationInfo.historicalSignificance &&
          <div className={styles.coordinatePair}>
                  <span className={styles.label}>{t("landing:wikilocationinfo.historical_significance", "Historical Significance:")}</span>
                  <span className={styles.value}>{locationInfo.historicalSignificance}</span>
                </div>
          }
              {locationInfo.keywords && locationInfo.keywords.length > 0 &&
          <div className={styles.featuresList} style={{ marginTop: 8 }}>
                  {locationInfo.keywords.map((keyword, index) =>
            <span key={index} className={styles.featureTag}>
                      {keyword}
                    </span>
            )}
                </div>
          }
              {locationInfo.wikidataId &&
          <a
            href={`https://www.wikidata.org/wiki/${locationInfo.wikidataId}`}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.mapLink}
            style={{ display: 'inline-block', marginTop: 8 }}>{t("landing:view_on_wikidata", "View on Wikidata")}
          </a>
          }
            </div>
        }

          {locationInfo.nearbyPoints && locationInfo.nearbyPoints.length > 0 &&
        <div className={styles.featuresSection}>
              <h4>{t("landing:nearby_points_of_interest", "🗺️ Nearby Points of Interest")}</h4>
              {locationInfo.nearbyPoints.map((poi, index) =>
            <div key={index} className={styles.coordinatePair}>
                  <span className={styles.label}>{poi.name}</span>
                  <span className={styles.value}>{poi.type}</span>
                </div>
            )}
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
              💡 <strong>{t("landing:teaching_tip", "Teaching Tip:")}</strong> {t("landing:use_this_location_information_to_create_", "Use this location information to create place-based learning activities that connect student inquiry to real-world contexts.")}

          </p>
          </div>

          <button
          onClick={() => fetchLocationInfo(true)}
          className={styles.refreshBtn}>{t("landing:refresh_information", "\uD83D\uDD04 Refresh Information")}


        </button>
        </>
      }
    </div>);

};