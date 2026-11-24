// src/api/spontaneousDiscovery.ts
// PERI_SPONTANEOUS_DISCOVERY_SPEC_v1.md -- a student standing at an
// unplanned place taps one button and gets a real, place-grounded Peri
// question, no teacher having authored an Activity for that spot first.
//
// All three /locations/* endpoints below now require auth (Design D) --
// this module is their first mobile caller.

import { apiFetch } from './client';

export interface LocationCandidate {
  name: string;
  latitude: number;
  longitude: number;
  location_type: string;
  address: string;
  place_id: string;
  is_cached: boolean;
}

/** Candidate named places near a GPS coordinate -- never silently picks
 * one, the student taps which place they're actually at. */
export async function searchNearbyLocations(
  latitude: number,
  longitude: number,
  lang?: string
): Promise<LocationCandidate[]> {
  return apiFetch<LocationCandidate[]>('/api/v1/locations/search', {
    method: 'POST',
    body: JSON.stringify({ latitude, longitude, radius_meters: 500, lang }),
  });
}

/** Forward-geocode a typed place name ("Golden Gate Bridge") to a real
 * coordinate -- backs the "Type where you are" path (no GPS). */
export async function geocodeLocationName(
  query: string
): Promise<{ latitude: number; longitude: number; display_name: string; is_approximate: boolean }> {
  return apiFetch('/api/v1/locations/geocode', {
    method: 'POST',
    body: JSON.stringify({ query }),
  });
}

export interface LocationEnrichment {
  name?: string;
  description?: string;
  keywords?: string[];
  architect_or_artist?: string;
  historical_significance?: string;
  wikidata_id?: string;
  content_language?: string;
  source?: string; // 'ai_generated' when no real Wikipedia/Wikidata match
}

/** Wikidata/Wikipedia educational enrichment for a place_id from
 * searchNearbyLocations() -- same shape mobile's Activity.location_wiki_data
 * already expects. */
export async function enrichLocation(placeId: string, lang?: string): Promise<LocationEnrichment> {
  const params = lang ? `?lang=${encodeURIComponent(lang)}` : '';
  return apiFetch<LocationEnrichment>(`/api/v1/locations/${encodeURIComponent(placeId)}/enrich${params}`);
}

export interface SpontaneousActivityResult {
  activity_id: string;
  validation_issue_count: number;
}

/** Auto-fills a new Activity from a confirmed place and synchronously
 * generates + validates + auto-approves its Peri script. Scoped to this
 * student only -- never surfaced to other students until a teacher reviews
 * it (not yet built; out of scope for this version). */
export async function createSpontaneousActivity(args: {
  locationName: string;
  subject: string;
  latitude?: number;
  longitude?: number;
  locationWikiData?: LocationEnrichment | null;
}): Promise<SpontaneousActivityResult> {
  return apiFetch<SpontaneousActivityResult>('/api/v1/student/activities/spontaneous', {
    method: 'POST',
    body: JSON.stringify({
      location_name: args.locationName,
      subject: args.subject,
      latitude: args.latitude ?? null,
      longitude: args.longitude ?? null,
      location_wiki_data: args.locationWikiData ?? null,
    }),
  });
}
