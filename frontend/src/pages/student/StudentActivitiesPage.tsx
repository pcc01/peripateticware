// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import 'leaflet/dist/leaflet.css';
import React, { useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStudentStore } from '@/stores';
import { Activity } from '@/types';
import Map from '@/components/common/Map';
import { useTranslation } from 'react-i18next';

// The backend ActivityResponse includes geo fields that the frontend Activity type
// does not yet enumerate. Extend locally so we get type safety without touching
// the shared type file.
interface ActivityWithGeo extends Activity {
  location_latitude?: number | null;
  location_longitude?: number | null;
  location_name?: string;
  estimated_duration_minutes?: number | null;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function computeCentroid(
  activities: ActivityWithGeo[]
): [number, number] | null {
  const geoActivities = activities.filter(
    (a) =>
      typeof a.location_latitude === 'number' &&
      typeof a.location_longitude === 'number'
  );
  if (geoActivities.length === 0) return null;
  const sumLat = geoActivities.reduce(
    (acc, a) => acc + (a.location_latitude as number),
    0
  );
  const sumLng = geoActivities.reduce(
    (acc, a) => acc + (a.location_longitude as number),
    0
  );
  return [sumLat / geoActivities.length, sumLng / geoActivities.length];
}

// ─── component ────────────────────────────────────────────────────────────────

export const StudentActivitiesPage: React.FC = () => {
  const { t } = useTranslation('landing');
  const navigate = useNavigate();
  const { activities, loading, error, fetchActivities, clearError } =
    useStudentStore();

  // Refs for card elements so we can scroll to them on marker click
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [highlightedId, setHighlightedId] = React.useState<string | null>(null);

  // Fetch published activities on mount
  useEffect(() => {
    fetchActivities();
  }, []);

  const geoActivities = activities as ActivityWithGeo[];

  // Build markers for the Map component
  const markers = geoActivities
    .filter(
      (a) =>
        typeof a.location_latitude === 'number' &&
        typeof a.location_longitude === 'number'
    )
    .map((a) => ({
      location: {
        latitude: a.location_latitude as number,
        longitude: a.location_longitude as number,
      },
      label: a.title,
    }));

  const mapCenter = computeCentroid(geoActivities) ?? undefined;

  // Scroll to & highlight a card when a marker is clicked.
  // The Map component doesn't expose per-marker click callbacks, so we use
  // onLocationSelect (fired on map click) as a proximity heuristic: find the
  // activity whose geo coordinates are closest to the clicked latlng.
  const handleLocationSelect = useCallback(
    (location: { latitude: number; longitude: number }) => {
      let bestId: string | null = null;
      let bestDist = Infinity;
      for (const a of geoActivities) {
        if (
          typeof a.location_latitude !== 'number' ||
          typeof a.location_longitude !== 'number'
        )
          continue;
        const d =
          Math.abs(a.location_latitude - location.latitude) +
          Math.abs(a.location_longitude - location.longitude);
        if (d < bestDist) {
          bestDist = d;
          bestId = a.id;
        }
      }
      if (bestId && bestDist < 0.05) {
        setHighlightedId(bestId);
        cardRefs.current[bestId]?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }
    },
    [geoActivities]
  );

  // ─── render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col min-h-screen bg-color-bg-primary">
      {/* Page header */}
      <div className="px-6 pt-6 pb-4">
        <h1 className="text-2xl font-bold text-color-text-primary">{t('pages_student_studentactivitiespage.find_activities', 'Find Activities')}</h1>
        <p className="text-sm text-color-text-secondary mt-1">{t('pages_student_studentactivitiespage.explore_published_activities_near_you', 'Explore published activities near you')}</p>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-6 mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 flex items-center justify-between">
          <span className="text-sm text-red-700">{error}</span>
          <button
            onClick={clearError}
            className="ml-4 text-sm font-medium text-red-600 hover:underline"
          >{t('pages_student_studentactivitiespage.dismiss', 'Dismiss')}</button>
        </div>
      )}

      {/* Map section */}
      <div className="px-6 pb-4" style={{ height: '40vh', minHeight: '240px' }}>
        <Map
          center={mapCenter}
          zoom={mapCenter ? 12 : 10}
          markers={markers}
          onLocationSelect={handleLocationSelect}
          height="100%"
        />
      </div>

      {/* Loading state */}
      {loading && activities.length === 0 && (
        <div className="flex flex-col items-center justify-center flex-1 py-16">
          <div className="w-10 h-10 border-4 border-color-primary border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-color-text-secondary text-sm">{t('pages_student_studentactivitiespage.loading_activities', 'Loading activities...')}</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && activities.length === 0 && (
        <div className="flex flex-col items-center justify-center flex-1 py-16 px-6 text-center">
          <div className="text-5xl mb-4">🗺️</div>
          <h2 className="text-lg font-semibold text-color-text-primary mb-2">{t('pages_student_studentactivitiespage.no_activities_available', 'No activities available')}</h2>
          <p className="text-sm text-color-text-secondary max-w-sm">{t('pages_student_studentactivitiespage.there_are_no_published_activities_yet_ch', 'There are no published activities yet. Check back soon — your teacher may be preparing something!')}</p>
        </div>
      )}

      {/* Activity grid */}
      {activities.length > 0 && (
        <div className="px-6 pb-8">
          <h2 className="text-lg font-semibold text-color-text-primary mb-4">
            {activities.length} {activities.length === 1 ? 'Activity' : 'Activities'}
            {loading && (
              <span className="ml-2 text-sm font-normal text-color-text-secondary">{t('pages_student_studentactivitiespage.refreshing', 'Refreshing...')}</span>
            )}
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {(geoActivities as ActivityWithGeo[]).map((activity) => {
              const isHighlighted = activity.id === highlightedId;
              return (
                <div
                  key={activity.id}
                  ref={(el) => {
                    cardRefs.current[activity.id] = el;
                  }}
                  className={[
                    'rounded-xl border p-4 flex flex-col gap-3 cursor-pointer transition-all duration-200',
                    'bg-color-bg-secondary hover:shadow-md',
                    isHighlighted
                      ? 'border-color-primary ring-2 ring-color-primary ring-opacity-40 shadow-md'
                      : 'border-color-border',
                  ].join(' ')}
                  onClick={() => navigate(`/student/activities/${activity.id}`)}
                >
                  {/* Title row */}
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-color-text-primary leading-snug">
                      {activity.title}
                    </h3>
                    <span
                      className={[
                        'shrink-0 text-xs font-medium px-2 py-0.5 rounded-full',
                        activity.status === 'active'
                          ? 'bg-green-100 text-green-700'
                          : activity.status === 'completed'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-gray-100 text-gray-600',
                      ].join(' ')}
                    >
                      {activity.status}
                    </span>
                  </div>

                  {/* Meta pills */}
                  <div className="flex flex-wrap gap-2">
                    {activity.subject && (
                      <span className="text-xs bg-color-bg-primary border border-color-border rounded-full px-2 py-0.5 text-color-text-secondary">
                        {activity.subject}
                      </span>
                    )}
                    {activity.grade_level && (
                      <span className="text-xs bg-color-bg-primary border border-color-border rounded-full px-2 py-0.5 text-color-text-secondary">
                        Grade {activity.grade_level}
                      </span>
                    )}
                    {activity.estimated_duration_minutes && (
                      <span className="text-xs bg-color-bg-primary border border-color-border rounded-full px-2 py-0.5 text-color-text-secondary">
                        {activity.estimated_duration_minutes} min
                      </span>
                    )}
                  </div>

                  {/* Location */}
                  {(activity.location_name || activity.location) && (
                    <div className="flex items-center gap-1.5 text-sm text-color-text-secondary">
                      <svg
                        className="w-4 h-4 shrink-0"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1.8}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M12 21c-4.97-5.4-7-8.7-7-11a7 7 0 1114 0c0 2.3-2.03 5.6-7 11z"
                        />
                        <circle cx="12" cy="10" r="2" />
                      </svg>
                      <span className="truncate">
                        {activity.location_name || activity.location}
                      </span>
                    </div>
                  )}

                  {/* View button */}
                  <button
                    className="mt-auto self-start text-sm font-medium text-color-primary hover:underline"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/student/activities/${activity.id}`);
                    }}
                  >
                    View details →
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentActivitiesPage;
