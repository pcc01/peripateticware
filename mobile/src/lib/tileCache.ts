// src/lib/tileCache.ts
// Offline basemap for multi-step scavenger hunts.
//
// react-native-maps' <UrlTile> reads PNG map tiles from a local directory
// laid out as {dir}/{z}/{x}/{y} (the y file has NO extension — that is the
// layout react-native-maps itself uses). We pre-download the OpenStreetMap
// tiles covering a hunt's route while the phone still has a connection, so
// the map still draws in the field with no data.
//
// PRIVACY: tiles are public OSM imagery and carry nothing about the
// student. Nothing here transmits a position. See WAYFINDING_CONSENT_LADDER.md.

import { Directory, File, Paths } from 'expo-file-system';
import type { WayfindingDetail } from '@/src/api/activities';

// Where react-native-maps looks for cached tiles. Passed to <UrlTile
// tileCachePath>. Kept as a plain path (no file:// scheme) — the native
// side accepts either but a bare path is the better-tested form on Android.
const CACHE_DIR = new Directory(Paths.document, 'hunt-map-tiles');
export const TILE_CACHE_PATH = CACHE_DIR.uri.replace(/^file:\/\//, '');
export const TILE_CACHE_MAX_AGE_SEC = 30 * 24 * 60 * 60; // 30 days

const OSM_TILE = (z: number, x: number, y: number) =>
  `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;

// Zoom band to pre-cache. 14 ≈ neighbourhood, 17 ≈ individual buildings —
// enough to walk a route by. offlineMode scales a lower zoom up to 4 levels
// when an exact tile is missing, so this band covers 10–17 in practice.
const DEFAULT_MIN_ZOOM = 14;
const DEFAULT_MAX_ZOOM = 17;
// Hard cap so a sprawling route can't kick off thousands of downloads.
const MAX_TILES = 400;

function lon2tileX(lon: number, z: number): number {
  return Math.floor(((lon + 180) / 360) * 2 ** z);
}
function lat2tileY(lat: number, z: number): number {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z
  );
}

interface Bounds {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

type LatLon = { latitude: number; longitude: number };

function boundsFor(points: LatLon[]): Bounds | null {
  if (points.length === 0) return null;
  let minLat = 90;
  let maxLat = -90;
  let minLon = 180;
  let maxLon = -180;
  for (const p of points) {
    minLat = Math.min(minLat, p.latitude);
    maxLat = Math.max(maxLat, p.latitude);
    minLon = Math.min(minLon, p.longitude);
    maxLon = Math.max(maxLon, p.longitude);
  }
  // Pad ~300 m so there's context around the outer stops.
  const midLat = (minLat + maxLat) / 2;
  const padLat = 0.003;
  const padLon = 0.003 / Math.max(0.2, Math.cos((midLat * Math.PI) / 180));
  return {
    minLat: minLat - padLat,
    maxLat: maxLat + padLat,
    minLon: minLon - padLon,
    maxLon: maxLon + padLon,
  };
}

/** Enumerate [z,x,y] tiles covering `b` across the zoom band (capped). */
export function tilesForBounds(
  b: Bounds,
  minZoom = DEFAULT_MIN_ZOOM,
  maxZoom = DEFAULT_MAX_ZOOM
): [number, number, number][] {
  const tiles: [number, number, number][] = [];
  for (let z = minZoom; z <= maxZoom; z++) {
    const xa = lon2tileX(b.minLon, z);
    const xb = lon2tileX(b.maxLon, z);
    const ya = lat2tileY(b.maxLat, z); // tile Y grows southward
    const yb = lat2tileY(b.minLat, z);
    for (let x = Math.min(xa, xb); x <= Math.max(xa, xb); x++) {
      for (let y = Math.min(ya, yb); y <= Math.max(ya, yb); y++) {
        tiles.push([z, x, y]);
        if (tiles.length >= MAX_TILES) return tiles;
      }
    }
  }
  return tiles;
}

function pointsFor(wayfinding: Pick<WayfindingDetail, 'waypoints' | 'route_geometry'>): LatLon[] {
  const pts: LatLon[] = (wayfinding.waypoints ?? []).map((w) => ({
    latitude: w.latitude,
    longitude: w.longitude,
  }));
  for (const [lon, lat] of wayfinding.route_geometry?.coordinates ?? []) {
    pts.push({ latitude: lat, longitude: lon });
  }
  return pts;
}

let _running = false;

/**
 * Download any missing OSM tiles covering this hunt's route. Safe to call on
 * every mount: it no-ops when already running, skips tiles already on disk,
 * and swallows per-tile failures (that tile just falls back to online).
 * Returns the number of tiles actually fetched. Caller should only invoke
 * this while online.
 */
export async function prefetchTilesForRoute(
  wayfinding: Pick<WayfindingDetail, 'waypoints' | 'route_geometry'>,
  opts: { minZoom?: number; maxZoom?: number } = {}
): Promise<number> {
  if (_running) return 0;
  _running = true;
  let fetched = 0;
  try {
    const b = boundsFor(pointsFor(wayfinding));
    if (!b) return 0;

    CACHE_DIR.create({ idempotent: true, intermediates: true });
    const tiles = tilesForBounds(b, opts.minZoom, opts.maxZoom);

    for (const [z, x, y] of tiles) {
      const xDir = new Directory(CACHE_DIR, String(z), String(x));
      // react-native-maps stores the tile as the bare y-coordinate, no ext.
      const dest = new File(xDir, String(y));
      if (dest.exists) continue;
      try {
        xDir.create({ idempotent: true, intermediates: true });
        await File.downloadFileAsync(OSM_TILE(z, x, y), dest, {
          idempotent: true,
          headers: { 'User-Agent': 'Peripateticware/1.0 (offline hunt cache)' },
        });
        fetched++;
      } catch {
        // one tile failing is fine — map falls back to the online source
      }
    }
  } catch {
    // no write permission / disk full — the map just stays online-only
  } finally {
    _running = false;
  }
  return fetched;
}

/** Best-effort size check — how many tiles are currently cached on disk. */
export async function cachedTileCount(): Promise<number> {
  try {
    if (!CACHE_DIR.exists) return 0;
    let n = 0;
    for (const zEntry of CACHE_DIR.list()) {
      if (!(zEntry instanceof Directory)) continue;
      for (const xEntry of zEntry.list()) {
        if (xEntry instanceof Directory) n += xEntry.list().length;
      }
    }
    return n;
  } catch {
    return 0;
  }
}

/** Wipe the offline tile cache (e.g. from a "free up space" action). */
export function clearTileCache(): void {
  try {
    if (CACHE_DIR.exists) CACHE_DIR.delete();
  } catch {
    // ignore
  }
}
