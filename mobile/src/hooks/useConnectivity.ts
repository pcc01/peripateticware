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

    const check = async () => {
      try {
        const state = await Network.getNetworkStateAsync();
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
        // Can't check — assume online
      }
    };

    check();
    const interval = setInterval(check, 15_000); // Check every 15s
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  return { isOnline };
}
