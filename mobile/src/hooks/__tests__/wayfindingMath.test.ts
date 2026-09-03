// Unit tests for src/hooks/wayfindingMath.ts — pure geo/selection helpers
// behind useWayfinding. Run: npx jest --config jest.unit.config.js
// See WAYFINDING_CONSENT_LADDER.md.

import {
  haversineMeters,
  bearingDegrees,
  relativeBearing,
  nextActiveWaypoint,
  isWithinArrivalRadius,
  RUNG_ORDER,
} from '../wayfindingMath';

import type { Waypoint } from '@/src/api/activities';

const wp = (id: string, seq: number, lat: number, lon: number, r = 25): Waypoint => ({
  id,
  sequence_index: seq,
  name: `Stop ${seq + 1}`,
  latitude: lat,
  longitude: lon,
  arrival_radius_meters: r,
  required: true,
});

describe('haversineMeters', () => {
  it('is ~0 for the same point', () => {
    expect(haversineMeters(37.8716, -122.2727, 37.8716, -122.2727)).toBeCloseTo(0, 5);
  });

  it('~111.2 km per degree of latitude', () => {
    const d = haversineMeters(0, 0, 1, 0);
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(112_000);
  });

  it('is symmetric', () => {
    const a = haversineMeters(37.87, -122.27, 37.88, -122.25);
    const b = haversineMeters(37.88, -122.25, 37.87, -122.27);
    expect(a).toBeCloseTo(b, 6);
  });
});

describe('bearingDegrees', () => {
  it('due north', () => {
    expect(bearingDegrees(0, 0, 1, 0)).toBeCloseTo(0, 3);
  });
  it('due east', () => {
    expect(bearingDegrees(0, 0, 0, 1)).toBeCloseTo(90, 3);
  });
  it('due south', () => {
    expect(bearingDegrees(1, 0, 0, 0)).toBeCloseTo(180, 3);
  });
  it('due west', () => {
    expect(bearingDegrees(0, 1, 0, 0)).toBeCloseTo(270, 3);
  });
});

describe('relativeBearing', () => {
  it('wraps into [0,360)', () => {
    expect(relativeBearing(10, 350)).toBeCloseTo(20, 6);
    expect(relativeBearing(350, 10)).toBeCloseTo(340, 6);
    expect(relativeBearing(90, 90)).toBeCloseTo(0, 6);
  });
});

describe('nextActiveWaypoint', () => {
  const a = wp('a', 0, 37.8716, -122.2727);
  const b = wp('b', 1, 37.8726, -122.2717);
  const c = wp('c', 2, 37.8736, -122.2707);

  it('ordered: first un-reached by sequence, ignoring position', () => {
    const near_c = { lat: 37.8736, lon: -122.2707 };
    expect(nextActiveWaypoint([a, b, c], new Set(), true, near_c)?.id).toBe('a');
    expect(nextActiveWaypoint([a, b, c], new Set(['a']), true, near_c)?.id).toBe('b');
  });

  it('free choice: nearest un-reached', () => {
    const near_c = { lat: 37.8736, lon: -122.2707 };
    expect(nextActiveWaypoint([a, b, c], new Set(), false, near_c)?.id).toBe('c');
    expect(nextActiveWaypoint([a, b, c], new Set(['c']), false, near_c)?.id).toBe('b');
  });

  it('free choice with no fix falls back to first', () => {
    expect(nextActiveWaypoint([a, b, c], new Set(), false, null)?.id).toBe('a');
  });

  it('returns null once every stop is reached', () => {
    expect(nextActiveWaypoint([a, b, c], new Set(['a', 'b', 'c']), true, null)).toBeNull();
  });
});

describe('isWithinArrivalRadius', () => {
  const stop = wp('s', 0, 37.8716, -122.2727, 60);

  it('true when standing on the stop', () => {
    expect(isWithinArrivalRadius(stop, 37.8716, -122.2727)).toBe(true);
  });

  it('false ~150 m away with a 60 m radius', () => {
    // ~0.00135 deg lat ≈ 150 m
    expect(isWithinArrivalRadius(stop, 37.8716 + 0.00135, -122.2727)).toBe(false);
  });

  it('defaults radius to 25 m when unset', () => {
    const noRadius = { latitude: 0, longitude: 0, arrival_radius_meters: 0 };
    expect(isWithinArrivalRadius(noRadius, 0, 0.0001)).toBe(true); // ~11 m
    expect(isWithinArrivalRadius(noRadius, 0, 0.0005)).toBe(false); // ~55 m
  });
});

describe('RUNG_ORDER', () => {
  it('is monotonic A<B<C<D<E', () => {
    expect(RUNG_ORDER.A).toBeLessThan(RUNG_ORDER.B);
    expect(RUNG_ORDER.B).toBeLessThan(RUNG_ORDER.C);
    expect(RUNG_ORDER.C).toBeLessThan(RUNG_ORDER.D);
    expect(RUNG_ORDER.D).toBeLessThan(RUNG_ORDER.E);
  });
});
