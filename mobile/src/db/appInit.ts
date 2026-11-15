// src/db/appInit.ts
// Called once at app launch (from root _layout.tsx after auth loads)
// Initialises DB schema, syncs the questions bank if stale.
//
// DESIGN (2026-09-14): does NOT auto-flush the capture queue on launch.
// Nothing leaves the device except at an explicit "Save to Server"/Submit
// action — see CaptureSheet.tsx's upload() and useConnectivity.ts for the
// matching removals, and the age-scoped-consent plan doc's "Local capture
// is never gated" section for why: silent background sync undermined the
// "your work stays on your device until you choose" guarantee this app is
// built around, most concretely for a capture stuck on
// blocked_reason='consent_required' (src/db/offlineQueue.ts) — that should
// only ever be retried when the student deliberately asks, not on every
// cold start.

import { getDb } from './database';
import { initQuestions } from './questions';
import { pruneActivityCache } from './activityCache';
import * as Network from 'expo-network';

export async function initOfflineLayer(): Promise<void> {
  try {
    // Ensure schema is up to date
    await getDb();

    const state = await Network.getNetworkStateAsync();
    const online = !!(state.isConnected && state.isInternetReachable);

    if (online) {
      await initQuestions();
    } else {
      console.log('📵 Offline at launch — using cached data');
    }

    // activity_cache was never pruned anywhere (PERI_OFFLINE_SPEC_v2.md
    // "SQLite growth") — run on every launch, online or offline, since
    // it's a pure local-DB cleanup with no network dependency. Never
    // blocks startup on failure.
    try {
      const { deleted } = await pruneActivityCache();
      if (deleted > 0) console.log(`🧹 Pruned ${deleted} stale cached activit${deleted === 1 ? 'y' : 'ies'}`);
    } catch (e) {
      console.warn('⊘ pruneActivityCache error:', e);
    }
  } catch (e) {
    console.warn('⊘ initOfflineLayer error:', e);
  }
}
