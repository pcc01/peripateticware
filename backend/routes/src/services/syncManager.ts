import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { offlineQueue } from './offlineQueue';
import { useAuthStore } from '../stores/authStore';
import axios from 'axios';

interface SyncManagerOptions {
  onOnline?: () => void;
  onOffline?: () => void;
  autoSync?: boolean;
}

/**
 * Sync Manager
 * Monitors network connectivity and manages offline queue synchronization
 */
class SyncManager {
  private isOnline = true;
  private unsubscribe: (() => void) | null = null;
  private autoSync = true;
  private syncInterval: NodeJS.Timeout | null = null;
  private listeners: Set<(isOnline: boolean) => void> = new Set();
  private onOnlineCallback?: () => void;
  private onOfflineCallback?: () => void;

  /**
   * Initialize sync manager
   */
  async initialize(options: SyncManagerOptions = {}): Promise<void> {
    this.autoSync = options.autoSync !== false;
    this.onOnlineCallback = options.onOnline;
    this.onOfflineCallback = options.onOffline;

    // Initialize offline queue
    await offlineQueue.initialize();

    // Check current network state
    const state = await NetInfo.fetch();
    this.isOnline = state.isConnected ?? false;

    console.log(`SyncManager initialized. Online: ${this.isOnline}`);

    // Subscribe to network state changes
    this.unsubscribe = NetInfo.addEventListener(
      this.handleNetworkStateChange.bind(this)
    );

    // Start auto-sync if enabled
    if (this.autoSync) {
      this.startAutoSync();
    }
  }

  /**
   * Handle network state changes
   */
  private async handleNetworkStateChange(state: NetInfoState): Promise<void> {
    const wasOnline = this.isOnline;
    this.isOnline = state.isConnected ?? false;

    console.log(`Network state changed: ${this.isOnline}`);

    if (!wasOnline && this.isOnline) {
      // Came online
      console.log('Device came online, syncing queue...');
      this.onOnlineCallback?.();
      await this.syncQueue();
    } else if (wasOnline && !this.isOnline) {
      // Went offline
      console.log('Device went offline');
      this.onOfflineCallback?.();
    }

    this.notifyListeners();
  }

  /**
   * Sync offline queue
   */
  async syncQueue(): Promise<void> {
    if (!this.isOnline) {
      console.warn('Cannot sync: device is offline');
      return;
    }

    const queueSize = offlineQueue.getQueueSize();
    if (queueSize === 0) {
      console.log('Queue is empty');
      return;
    }

    try {
      const authStore = useAuthStore.getState();
      const apiClient = axios.create({
        baseURL: process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000',
        headers: {
          Authorization: `Bearer ${authStore.token}`,
        },
      });

      await offlineQueue.sync(apiClient);
    } catch (error) {
      console.error('Failed to sync queue:', error);
    }
  }

  /**
   * Start automatic sync
   */
  private startAutoSync(): void {
    // Sync every 30 seconds if online
    this.syncInterval = setInterval(async () => {
      if (this.isOnline && offlineQueue.getQueueSize() > 0) {
        await this.syncQueue();
      }
    }, 30000);

    console.log('Auto-sync enabled');
  }

  /**
   * Stop automatic sync
   */
  private stopAutoSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  /**
   * Get online status
   */
  isConnected(): boolean {
    return this.isOnline;
  }

  /**
   * Manually trigger sync
   */
  async manualSync(): Promise<void> {
    await this.syncQueue();
  }

  /**
   * Subscribe to connectivity changes
   */
  subscribe(listener: (isOnline: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Notify all listeners
   */
  private notifyListeners(): void {
    this.listeners.forEach((listener) => {
      listener(this.isOnline);
    });
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.unsubscribe?.();
    this.stopAutoSync();
    this.listeners.clear();
  }
}

// Export singleton instance
export const syncManager = new SyncManager();
