// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import { useEffect, useState } from 'react';
import { syncManager } from '../services/syncManager';
import { offlineQueue, QueuedRequest } from '../services/offlineQueue';

/**
 * Hook for monitoring network connectivity
 */
export const useConnectivity = () => {
  const [isOnline, setIsOnline] = useState(syncManager.isConnected());

  useEffect(() => {
    const unsubscribe = syncManager.subscribe((online) => {
      setIsOnline(online);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  return {
    isOnline,
    isOffline: !isOnline,
  };
};

/**
 * Hook for monitoring offline queue
 */
export const useOfflineQueue = () => {
  const [queue, setQueue] = useState<QueuedRequest[]>(offlineQueue.getQueue());
  const [queueSize, setQueueSize] = useState(offlineQueue.getQueueSize());
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    const unsubscribe = offlineQueue.subscribe((updatedQueue) => {
      setQueue(updatedQueue);
      setQueueSize(updatedQueue.length);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const removeRequest = async (id: string) => {
    await offlineQueue.removeRequest(id);
  };

  const clearQueue = async () => {
    await offlineQueue.clear();
  };

  const sync = async () => {
    setIsSyncing(true);
    try {
      await syncManager.manualSync();
    } finally {
      setIsSyncing(false);
    }
  };

  return {
    queue,
    queueSize,
    hasQueue: queueSize > 0,
    isSyncing,
    removeRequest,
    clearQueue,
    sync,
  };
};

/**
 * Hook combining connectivity and queue status
 */
export const useNetworkStatus = () => {
  const { isOnline, isOffline } = useConnectivity();
  const { queueSize, isSyncing } = useOfflineQueue();

  return {
    isOnline,
    isOffline,
    queueSize,
    isPending: queueSize > 0,
    isSyncing,
    hasNetworkIssues: isOffline || queueSize > 0,
  };
};

