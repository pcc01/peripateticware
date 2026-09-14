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
  } catch (e) {
    console.warn('⊘ initOfflineLayer error:', e);
  }
}
