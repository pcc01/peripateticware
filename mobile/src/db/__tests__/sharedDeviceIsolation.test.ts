// Contract tests for PERI_OFFLINE_SPEC_v2.md "Shared-device data isolation":
// every read of capture_queue/note_queue/wp_progress/wp_arrival_queue must be
// scoped to the CURRENT logged-in user, and every write must tag its row
// with that user. These assert the exact SQL + bound params each function
// sends to the db, rather than re-implementing SQLite's own WHERE-clause
// semantics in a fake -- the guarantee lives in "did we filter/tag by
// owner_user_id at all", not in SQLite's well-tested matching logic.

jest.mock('react-native-get-random-values', () => ({}));
jest.mock('@/src/api/client', () => ({
  getStoredUser: jest.fn(),
  apiFetch: jest.fn(),
  ApiError: class ApiError extends Error {},
}));
jest.mock('@/src/api/captures', () => ({ uploadCapture: jest.fn() }));
jest.mock('@/src/api/wayfinding', () => ({ recordWaypointArrival: jest.fn() }));
jest.mock('@/src/api/activities', () => ({ startActivitySession: jest.fn() }));

const mockRunAsync = jest.fn().mockResolvedValue({ changes: 1 });
const mockGetAllAsync = jest.fn().mockResolvedValue([]);
jest.mock('../database', () => ({
  getDb: jest.fn(async () => ({
    runAsync: mockRunAsync,
    getAllAsync: mockGetAllAsync,
  })),
}));

import { getStoredUser } from '@/src/api/client';
import {
  queueCapture,
  getPendingCaptures,
  queueNote,
  getPendingNotes,
  getConsentBlockedCaptures,
} from '../offlineQueue';
import { recordLocalArrival, markLocalArrivalSynced, getLocalProgress, flushArrivals } from '../wayfindingStore';

function asUser(id: string) {
  (getStoredUser as jest.Mock).mockResolvedValue({ id });
}

beforeEach(() => {
  mockRunAsync.mockClear();
  mockGetAllAsync.mockClear().mockResolvedValue([]);
});

describe('capture_queue isolation', () => {
  it('tags a queued capture with the current user', async () => {
    asUser('user-a');
    await queueCapture({ local_uri: 'file://x.jpg', capture_type: 'photo' });
    const [sql, params] = mockRunAsync.mock.calls[0];
    expect(sql).toMatch(/owner_user_id/);
    expect(params).toContain('user-a');
  });

  it('reads only the current user\'s pending captures', async () => {
    asUser('user-b');
    await getPendingCaptures();
    const [sql, params] = mockGetAllAsync.mock.calls[0];
    expect(sql).toMatch(/owner_user_id\s*=\s*\?/);
    expect(params).toEqual(['user-b']);
  });

  it('reads only the current user\'s consent-blocked captures', async () => {
    asUser('user-b');
    await getConsentBlockedCaptures();
    const [sql, params] = mockGetAllAsync.mock.calls[0];
    expect(sql).toMatch(/owner_user_id\s*=\s*\?/);
    expect(params).toEqual(['user-b']);
  });
});

describe('note_queue isolation', () => {
  it('tags a queued note with the current user', async () => {
    asUser('user-a');
    await queueNote({ type: 'field_note', content: 'hi' });
    const [sql, params] = mockRunAsync.mock.calls[0];
    expect(sql).toMatch(/owner_user_id/);
    expect(params).toContain('user-a');
  });

  it('reads only the current user\'s pending notes', async () => {
    asUser('user-b');
    await getPendingNotes();
    const [sql, params] = mockGetAllAsync.mock.calls[0];
    expect(sql).toMatch(/owner_user_id\s*=\s*\?/);
    expect(params).toEqual(['user-b']);
  });
});

describe('wayfinding isolation', () => {
  it('tags a local arrival (wp_progress insert+update, wp_arrival_queue insert) with the current user', async () => {
    asUser('user-a');
    await recordLocalArrival('activity-1', { id: 'wp-1', sequence_index: 0 });
    for (const [sql, params] of mockRunAsync.mock.calls) {
      expect(sql).toMatch(/owner_user_id/);
      expect(params).toContain('user-a');
    }
  });

  it('getLocalProgress scopes to the current user only', async () => {
    asUser('user-b');
    await getLocalProgress('activity-1');
    const [sql, params] = mockGetAllAsync.mock.calls[0];
    expect(sql).toMatch(/owner_user_id\s*=\s*\?/);
    expect(params[0]).toBe('user-b');
  });

  it('markLocalArrivalSynced scopes its delete+update to the current user', async () => {
    asUser('user-a');
    await markLocalArrivalSynced('activity-1', 'wp-1');
    for (const [sql, params] of mockRunAsync.mock.calls) {
      expect(sql).toMatch(/owner_user_id\s*=\s*\?/);
      expect(params[0]).toBe('user-a');
    }
  });

  it('flushArrivals only reads the current user\'s queued arrivals', async () => {
    asUser('user-b');
    await flushArrivals();
    const [sql, params] = mockGetAllAsync.mock.calls[0];
    expect(sql).toMatch(/owner_user_id\s*=\s*\?/);
    expect(params).toContain('user-b');
  });
});
