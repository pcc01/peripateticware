// src/hooks/useConnectivity.ts
// Polls network state; triggers queue flush when coming back online

import { useEffect, useRef, useState } from 'react';
import * as Network from 'expo-network';
import { flushQueue } from '@/src/db/offlineQueue';

export function useConnectivity() {
  const [isOnline, setIsOnline] = useState(true);
  const wasOffline = useRef(false);

  useEffect(() => {
    let cancelled = false;
    // Guards against overlapping check() calls: getNetworkStateAsync() has
    // no timeout of its own, and this hook lives at the app root (AuthGuard)
    // for the entire session — if that native call ever hangs (observed in
    // CI: Detox e2e runs on iOS Simulator/Android emulator never went idle,
    // "N work items pending on the dispatch queue" forever, blocking every
    // toBeVisible() check regardless of how long it was given), the bare
    // setInterval below would queue a fresh overlapping call every 15s on
    // top of the still-pending one, forever, since nothing here previously
    // waited for or timed out the in-flight call before starting another.
    let inFlight = false;

    const check = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const state = await Promise.race([
          Network.getNetworkStateAsync(),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('getNetworkStateAsync timed out')), 5000)),
        ]);
        const online = !!(state.isConnected && state.isInternetReachable);
        if (cancelled) return;

        if (online && wasOffline.current) {
          // Just came back online — flush the queue
          console.log('📶 Back online — flushing offline queue');
          flushQueue().then(({ uploaded, failed }) => {
            if (uploaded > 0) console.log(`✅ Synced ${uploaded} items`);
            if (failed > 0)   console.warn(`⚠ ${failed} items failed to sync`);
          });
        }

        wasOffline.current = !online;
        setIsOnline(online);
      } catch {
        // Can't check (or timed out) — assume online
      } finally {
        inFlight = false;
      }
    };

    check();
    const interval = setInterval(check, 15_000); // Check every 15s
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  return { isOnline };
}
