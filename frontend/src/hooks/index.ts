// ==============================================================================
// frontend/src/hooks/useCapture.ts
// Hook for managing student captures
// ==============================================================================

import { useState, useCallback } from 'react';
import { create } from 'zustand';
import { CaptureType, StudentCapture } from '../types/student';
import { captureService } from '../services/captureService';
import { offlineStorage } from '../services/offlineStorage';

interface CaptureStore {
  captures: StudentCapture[];
  addCapture: (file: File, type: CaptureType, metadata: any) => Promise<StudentCapture>;
  removeCapture: (id: string) => Promise<void>;
  updateCapture: (id: string, updates: Partial<StudentCapture>) => Promise<void>;
  listCaptures: (filters?: any) => Promise<void>;
}

export const useCaptureStore = create<CaptureStore>((set, get) => ({
  captures: [],
  
  addCapture: async (file: File, type: CaptureType, metadata: any) => {
    try {
      // Save locally first (offline support)
      const localId = `local_${Date.now()}`;
      await offlineStorage.saveCapture({
        id: localId,
        file,
        metadata: { ...metadata, type },
        uploadedAt: undefined
      });

      // Upload to server
      const capture = await captureService.uploadCapture(file, type, metadata);
      
      set(state => ({
        captures: [capture, ...state.captures]
      }));

      // Mark as uploaded in local storage
      await offlineStorage.saveCapture({
        id: localId,
        file,
        metadata: { ...metadata, type },
        uploadedAt: Date.now()
      });

      return capture;
    } catch (error) {
      console.error('Failed to add capture:', error);
      throw error;
    }
  },

  removeCapture: async (id: string) => {
    try {
      await captureService.deleteCapture(id);
      set(state => ({
        captures: state.captures.filter(c => c.id !== id)
      }));
    } catch (error) {
      console.error('Failed to remove capture:', error);
      throw error;
    }
  },

  updateCapture: async (id: string, updates: Partial<StudentCapture>) => {
    set(state => ({
      captures: state.captures.map(c => c.id === id ? { ...c, ...updates } : c)
    }));
  },

  listCaptures: async (filters?: any) => {
    try {
      const captures = await captureService.listCaptures(filters);
      set({ captures });
    } catch (error) {
      console.error('Failed to list captures:', error);
    }
  }
}));

export const useCapture = () => {
  const store = useCaptureStore();

  return {
    captures: store.captures,
    addCapture: store.addCapture,
    removeCapture: store.removeCapture,
    updateCapture: store.updateCapture,
    listCaptures: store.listCaptures
  };
};


// ==============================================================================
// frontend/src/hooks/useNotebook.ts
// Hook for managing notebook entries
// ==============================================================================

import { create } from 'zustand';
import { StudentNotebook, NotebookEntryType } from '../types/student';
import { notebookService } from '../services/notebookService';

interface NotebookStore {
  entries: StudentNotebook[];
  addEntry: (data: {
    entryType: NotebookEntryType;
    content: string;
    activityId?: string;
    prompt?: string;
    learningObjectivesTagged?: string[];
    competenciesAddressed?: string[];
  }) => Promise<StudentNotebook>;
  updateEntry: (id: string, data: Partial<StudentNotebook>) => Promise<StudentNotebook>;
  removeEntry: (id: string) => Promise<void>;
  listEntries: (filters?: any) => Promise<void>;
  linkCapture: (entryId: string, captureId: string) => Promise<void>;
}

export const useNotebookStore = create<NotebookStore>((set) => ({
  entries: [],

  addEntry: async (data) => {
    const entry = await notebookService.createEntry(data);
    set(state => ({
      entries: [entry, ...state.entries]
    }));
    return entry;
  },

  updateEntry: async (id: string, data: Partial<StudentNotebook>) => {
    const entry = await notebookService.updateEntry(id, data as any);
    set(state => ({
      entries: state.entries.map(e => e.id === id ? entry : e)
    }));
    return entry;
  },

  removeEntry: async (id: string) => {
    // Delete via API would be implemented in notebookService
    set(state => ({
      entries: state.entries.filter(e => e.id !== id)
    }));
  },

  listEntries: async (filters?: any) => {
    const entries = await notebookService.listEntries(filters);
    set({ entries });
  },

  linkCapture: async (entryId: string, captureId: string) => {
    await notebookService.linkCapture(entryId, captureId);
  }
}));

export const useNotebook = () => {
  const store = useNotebookStore();
  return store;
};


// ==============================================================================
// frontend/src/hooks/useProgress.ts
// Hook for learning progress tracking
// ==============================================================================

import { useState, useEffect } from 'react';
import { portfolioService } from '../services/portfolioService';

export interface ProgressData {
  activitiesCompleted: number;
  evidenceCollected: number;
  entriesWritten: number;
  competencies: any[];
  totalProgress: number;
}

export const useProgress = () => {
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadProgress();
  }, []);

  const loadProgress = async () => {
    setLoading(true);
    try {
      const [portfolio, competencies] = await Promise.all([
        portfolioService.getPortfolio(),
        portfolioService.getCompetencies()
      ]);

      setProgress({
        activitiesCompleted: 0, // Would come from backend
        evidenceCollected: portfolio?.captures?.length || 0,
        entriesWritten: portfolio?.notebook_entries?.length || 0,
        competencies: competencies || [],
        totalProgress: (competencies || []).reduce((sum, c) => sum + c.progress_percent, 0) / Math.max((competencies || []).length, 1)
      });
    } catch (error) {
      console.error('Failed to load progress:', error);
    } finally {
      setLoading(false);
    }
  };

  return {
    progress,
    loading,
    reload: loadProgress
  };
};


// ==============================================================================
// frontend/src/hooks/useOfflineSync.ts
// Hook for offline-first synchronization
// ==============================================================================

import { useEffect, useState } from 'react';
import { offlineStorage } from '../services/offlineStorage';
import { captureService } from '../services/captureService';

export const useOfflineSync = () => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

  const syncCaptures = async () => {
    setIsSyncing(true);
    setSyncError(null);

    try {
      const unsyncedCaptures = await offlineStorage.getUnsyncedCaptures();

      for (const capture of unsyncedCaptures) {
        try {
          // Upload capture
          const result = await captureService.uploadCapture(
            capture.file,
            capture.metadata.type,
            capture.metadata
          );

          // Mark as synced
          await offlineStorage.saveCapture({
            ...capture,
            uploadedAt: Date.now()
          });
        } catch (error) {
          console.error(`Failed to sync capture ${capture.id}:`, error);
        }
      }

      setLastSyncTime(new Date());
    } catch (error) {
      setSyncError((error as Error).message);
      console.error('Sync error:', error);
    } finally {
      setIsSyncing(false);
    }
  };

  // Auto-sync on network reconnection
  useEffect(() => {
    const handleOnline = () => {
      syncCaptures();
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, []);

  return {
    isSyncing,
    syncError,
    lastSyncTime,
    syncCaptures
  };
};
