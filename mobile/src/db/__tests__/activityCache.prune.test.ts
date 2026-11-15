// Unit tests for pruneActivityCache() — the activity_cache cleanup added
// per PERI_OFFLINE_SPEC_v2.md ("SQLite growth": this table was the one
// never pruned anywhere). getDb() is mocked with a minimal fake that only
// understands the exact queries pruneActivityCache() issues.

const NOW_SEC = Math.floor(Date.now() / 1000);
const DAY = 86400;

interface FakeState {
  captureActivityIds: string[];
  noteActivityIds: string[];
  arrivalActivityIds: string[];
  inProgressActivityIds: string[]; // unsynced wp_progress
  cacheRows: { id: string; cached_at: number }[]; // pre-sorted desc by caller
  deletedCacheIds: string[];
  deletedProgressIds: string[];
}

let mockState: FakeState;

function mockMakeFakeDb() {
  return {
    getAllAsync: jest.fn(async (sql: string) => {
      if (sql.includes('FROM capture_queue')) {
        return mockState.captureActivityIds.map((activity_id) => ({ activity_id }));
      }
      if (sql.includes('FROM note_queue')) {
        return mockState.noteActivityIds.map((activity_id) => ({ activity_id }));
      }
      if (sql.includes('FROM wp_arrival_queue')) {
        return mockState.arrivalActivityIds.map((activity_id) => ({ activity_id }));
      }
      if (sql.includes('FROM wp_progress')) {
        return mockState.inProgressActivityIds.map((activity_id) => ({ activity_id }));
      }
      if (sql.includes('FROM activity_cache')) {
        return mockState.cacheRows;
      }
      throw new Error(`unexpected query in test: ${sql}`);
    }),
    runAsync: jest.fn(async (sql: string, args: any[]) => {
      if (sql.startsWith('DELETE FROM activity_cache')) {
        mockState.deletedCacheIds.push(args[0]);
      } else if (sql.startsWith('DELETE FROM wp_progress')) {
        mockState.deletedProgressIds.push(args[0]);
      }
    }),
  };
}

jest.mock('../database', () => ({
  getDb: jest.fn(async () => mockMakeFakeDb()),
}));

import { pruneActivityCache, CACHE_PRUNE_KEEP_MOST_RECENT } from '../activityCache';

beforeEach(() => {
  mockState = {
    captureActivityIds: [],
    noteActivityIds: [],
    arrivalActivityIds: [],
    inProgressActivityIds: [],
    cacheRows: [],
    deletedCacheIds: [],
    deletedProgressIds: [],
  };
});

describe('pruneActivityCache', () => {
  it('deletes rows older than the age cutoff', async () => {
    mockState.cacheRows = [
      { id: 'fresh', cached_at: NOW_SEC - 1 * DAY },
      { id: 'stale', cached_at: NOW_SEC - 40 * DAY },
    ];
    const result = await pruneActivityCache();
    expect(result.deleted).toBe(1);
    expect(mockState.deletedCacheIds).toEqual(['stale']);
  });

  it('never deletes an activity with a queued capture', async () => {
    mockState.captureActivityIds = ['stale-but-protected'];
    mockState.cacheRows = [{ id: 'stale-but-protected', cached_at: NOW_SEC - 40 * DAY }];
    const result = await pruneActivityCache();
    expect(result.deleted).toBe(0);
  });

  it('never deletes an activity with a queued note', async () => {
    mockState.noteActivityIds = ['stale-but-protected'];
    mockState.cacheRows = [{ id: 'stale-but-protected', cached_at: NOW_SEC - 40 * DAY }];
    const result = await pruneActivityCache();
    expect(result.deleted).toBe(0);
  });

  it('never deletes an activity with a queued arrival', async () => {
    mockState.arrivalActivityIds = ['stale-but-protected'];
    mockState.cacheRows = [{ id: 'stale-but-protected', cached_at: NOW_SEC - 40 * DAY }];
    const result = await pruneActivityCache();
    expect(result.deleted).toBe(0);
  });

  it('never deletes an activity with an in-progress (unsynced) hunt', async () => {
    mockState.inProgressActivityIds = ['stale-but-protected'];
    mockState.cacheRows = [{ id: 'stale-but-protected', cached_at: NOW_SEC - 40 * DAY }];
    const result = await pruneActivityCache();
    expect(result.deleted).toBe(0);
  });

  it('composes age-based pruning with protection correctly', async () => {
    mockState.cacheRows = [
      { id: 'a', cached_at: NOW_SEC },
      { id: 'b', cached_at: NOW_SEC - 40 * DAY },
    ];
    mockState.captureActivityIds = ['b'];
    const result = await pruneActivityCache();
    expect(result.deleted).toBe(0);
  });

  it('keeps only the most recent N rows, even if all are within the age cutoff', async () => {
    // Freshly cached (well within the age cutoff), but there are more rows
    // than the keep-most-recent cap -- the oldest ones beyond the cap
    // should still be pruned.
    const total = CACHE_PRUNE_KEEP_MOST_RECENT + 3;
    mockState.cacheRows = Array.from({ length: total }, (_, i) => ({
      id: `recent-${i}`,
      cached_at: NOW_SEC - i, // index 0 = most recent, already sorted desc
    }));
    const result = await pruneActivityCache();
    expect(result.deleted).toBe(3);
    expect(mockState.deletedCacheIds).toEqual([
      `recent-${CACHE_PRUNE_KEEP_MOST_RECENT}`,
      `recent-${CACHE_PRUNE_KEEP_MOST_RECENT + 1}`,
      `recent-${CACHE_PRUNE_KEEP_MOST_RECENT + 2}`,
    ]);
  });

  it('a protected activity beyond the keep-most-recent cap is still kept', async () => {
    const total = CACHE_PRUNE_KEEP_MOST_RECENT + 1;
    mockState.cacheRows = Array.from({ length: total }, (_, i) => ({
      id: `recent-${i}`,
      cached_at: NOW_SEC - i,
    }));
    mockState.captureActivityIds = [`recent-${CACHE_PRUNE_KEEP_MOST_RECENT}`]; // the one that would be pruned
    const result = await pruneActivityCache();
    expect(result.deleted).toBe(0);
  });

  it('also deletes wp_progress rows for every activity it removes', async () => {
    mockState.cacheRows = [{ id: 'stale', cached_at: NOW_SEC - 40 * DAY }];
    const result = await pruneActivityCache();
    expect(result.deleted).toBe(1);
    expect(mockState.deletedProgressIds).toEqual(['stale']);
  });

  it('does nothing when there is nothing to prune', async () => {
    mockState.cacheRows = [{ id: 'fresh', cached_at: NOW_SEC }];
    const result = await pruneActivityCache();
    expect(result.deleted).toBe(0);
    expect(mockState.deletedCacheIds).toEqual([]);
  });
});
