# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

import AsyncStorage from '@react-native-async-storage/async-storage';
import axios, { AxiosRequestConfig } from 'axios';

export interface QueuedRequest {
  id: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  data?: any;
  timestamp: number;
  retries: number;
  maxRetries: number;
}

const QUEUE_STORAGE_KEY = 'offline_queue';
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

/**
 * Offline Queue Manager
 * Handles queuing API requests when offline and syncing when online
 */
class OfflineQueueManager {
  private queue: QueuedRequest[] = [];
  private isSyncing = false;
  private syncListeners: Set<(queue: QueuedRequest[]) => void> = new Set();

  /**
   * Initialize queue from storage
   */
  async initialize(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(QUEUE_STORAGE_KEY);
      if (stored) {
        this.queue = JSON.parse(stored);
        console.log(`Loaded ${this.queue.length} queued requests`);
      }
    } catch (error) {
      console.error('Failed to load queue from storage:', error);
    }
  }

  /**
   * Add request to queue
   */
  async addRequest(
    method: QueuedRequest['method'],
    url: string,
    data?: any
  ): Promise<string> {
    const id = `${Date.now()}-${Math.random()}`;

    const request: QueuedRequest = {
      id,
      method,
      url,
      data,
      timestamp: Date.now(),
      retries: 0,
      maxRetries: MAX_RETRIES,
    };

    this.queue.push(request);
    await this.persistQueue();

    console.log(`Added request to queue: ${method} ${url}`);

    return id;
  }

  /**
   * Get all queued requests
   */
  getQueue(): QueuedRequest[] {
    return [...this.queue];
  }

  /**
   * Get queue size
   */
  getQueueSize(): number {
    return this.queue.length;
  }

  /**
   * Sync queued requests
   */
  async sync(apiClient: any): Promise<void> {
    if (this.isSyncing || this.queue.length === 0) {
      return;
    }

    this.isSyncing = true;
    console.log(`Starting sync of ${this.queue.length} requests`);

    const failedRequests: QueuedRequest[] = [];

    for (const request of this.queue) {
      try {
        console.log(
          `Syncing: ${request.method} ${request.url} (attempt ${request.retries + 1})`
        );

        const config: AxiosRequestConfig = {
          method: request.method.toLowerCase() as any,
          url: request.url,
        };

        if (request.data) {
          config.data = request.data;
        }

        await apiClient(config);
        console.log(`✓ Synced: ${request.id}`);
      } catch (error: any) {
        console.warn(
          `✗ Failed to sync ${request.id}: ${error.message}`
        );

        request.retries++;

        if (request.retries < request.maxRetries) {
          failedRequests.push(request);
          // Wait before retry
          await new Promise((resolve) =>
            setTimeout(resolve, RETRY_DELAY * request.retries)
          );
        } else {
          console.error(
            `Max retries exceeded for ${request.id}, discarding`
          );
        }
      }
    }

    // Update queue with failed requests
    this.queue = failedRequests;
    await this.persistQueue();

    this.isSyncing = false;

    const syncedCount = (this.queue.length > 0
      ? this.queue.length
      : 0) - failedRequests.length;
    console.log(
      `Sync complete. Synced: ${syncedCount}, Failed: ${failedRequests.length}`
    );

    // Notify listeners
    this.notifyListeners();
  }

  /**
   * Clear queue
   */
  async clear(): Promise<void> {
    this.queue = [];
    await this.persistQueue();
    this.notifyListeners();
  }

  /**
   * Remove request from queue
   */
  async removeRequest(id: string): Promise<void> {
    this.queue = this.queue.filter((r) => r.id !== id);
    await this.persistQueue();
    this.notifyListeners();
  }

  /**
   * Subscribe to queue changes
   */
  subscribe(listener: (queue: QueuedRequest[]) => void): () => void {
    this.syncListeners.add(listener);
    // Return unsubscribe function
    return () => {
      this.syncListeners.delete(listener);
    };
  }

  /**
   * Notify all listeners of queue changes
   */
  private notifyListeners(): void {
    this.syncListeners.forEach((listener) => {
      listener(this.queue);
    });
  }

  /**
   * Persist queue to storage
   */
  private async persistQueue(): Promise<void> {
    try {
      await AsyncStorage.setItem(
        QUEUE_STORAGE_KEY,
        JSON.stringify(this.queue)
      );
    } catch (error) {
      console.error('Failed to persist queue:', error);
    }
  }
}

// Export singleton instance
export const offlineQueue = new OfflineQueueManager();
