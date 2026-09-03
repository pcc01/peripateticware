// Unit tests for the offline-basemap slippy-map tile math. expo-file-system
// is mocked away — only the pure enumeration logic is under test here.

jest.mock('expo-file-system', () => ({
  Directory: class {
    uri = 'file:///doc/hunt-map-tiles';
    exists = false;
    create() {}
    delete() {}
    list() {
      return [];
    }
  },
  File: class {
    exists = false;
    static downloadFileAsync() {
      return Promise.resolve();
    }
  },
  Paths: { document: { uri: 'file:///doc/' } },
}));

import { tilesForBounds, TILE_CACHE_PATH } from '../tileCache';

describe('tilesForBounds', () => {
  // A tight box around UC Berkeley campus (the demo hunt's area).
  const box = { minLat: 37.869, maxLat: 37.875, minLon: -122.276, maxLon: -122.268 };

  it('returns tiles across the requested zoom band', () => {
    const tiles = tilesForBounds(box, 14, 16);
    expect(tiles.length).toBeGreaterThan(0);
    const zooms = new Set(tiles.map(([z]) => z));
    expect(zooms).toEqual(new Set([14, 15, 16]));
  });

  it('produces more tiles at higher zoom', () => {
    const z14 = tilesForBounds(box, 14, 14).length;
    const z17 = tilesForBounds(box, 17, 17).length;
    expect(z17).toBeGreaterThan(z14);
  });

  it('agrees with the reference slippy-map formula at z16', () => {
    // Independent implementation of the OSM tile formula.
    const z = 16;
    const refX = (lon: number) => Math.floor(((lon + 180) / 360) * 2 ** z);
    const refY = (lat: number) => {
      const r = (lat * Math.PI) / 180;
      return Math.floor(
        ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z
      );
    };
    const tiles = tilesForBounds(box, z, z);
    const midX = refX((box.minLon + box.maxLon) / 2);
    const midY = refY((box.minLat + box.maxLat) / 2);
    expect(tiles).toContainEqual([z, midX, midY]);
    // Bounds corners are covered too.
    expect(tiles).toContainEqual([z, refX(box.minLon), refY(box.maxLat)]);
    expect(tiles).toContainEqual([z, refX(box.maxLon), refY(box.minLat)]);
  });

  it('never exceeds the safety cap', () => {
    const huge = { minLat: 30, maxLat: 45, minLon: -125, maxLon: -110 };
    const tiles = tilesForBounds(huge, 10, 18);
    expect(tiles.length).toBeLessThanOrEqual(400);
  });

  it('exposes a plain (schemeless) cache path', () => {
    expect(TILE_CACHE_PATH.startsWith('file://')).toBe(false);
    expect(TILE_CACHE_PATH).toContain('hunt-map-tiles');
  });
});
