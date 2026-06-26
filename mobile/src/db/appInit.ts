// src/db/appInit.ts
// Called once at app launch (from root _layout.tsx after auth loads)
// Initialises DB schema, syncs questions if stale, flushes any pending queue

import { getDb } from './database';
import { initQuestions } from './questions';
import { flushQueue } from './offlineQueue';
import * as Network from 'expo-network';

export async function initOfflineLayer(): Promise<void> {
  try {
    // Ensure schema is up to date
    await getDb();

    const state = await Network.getNetworkStateAsync();
    const online = !!(state.isConnected && state.isInternetReachable);

    if (online) {
      // Parallel: refresh questions + flush any pending uploads
      await Promise.allSettled([
        initQuestions(),
        flushQueue(),
      ]);
    } else {
      console.log('📵 Offline at launch — using cached data');
    }
  } catch (e) {
    console.warn('⊘ initOfflineLayer error:', e);
  }
}
