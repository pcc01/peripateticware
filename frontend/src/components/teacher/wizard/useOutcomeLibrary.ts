// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import { useCallback, useEffect, useState } from 'react';

export interface LibraryOutcome {
  id: string;
  text: string;
  subject: string | null;
  grade_min: number | null;
  grade_max: number | null;
  taxonomy_level: string | null;
  evidence_type: string | null;
}

export interface NewLibraryOutcome {
  text: string;
  subject?: string;
  grade_min?: number;
  grade_max?: number;
  taxonomy_level?: string;
  evidence_type?: string;
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('auth_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * The teacher's reusable outcome library (GET/POST/DELETE /api/v1/outcomes).
 * A failed load leaves the library empty and `available` false so the wizard
 * still works for writing outcomes; saving then reports the error instead of
 * pretending it worked.
 */
export function useOutcomeLibrary() {
  const [items, setItems] = useState<LibraryOutcome[]>([]);
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/v1/outcomes', { headers: authHeaders() });
        if (!res.ok) throw new Error(String(res.status));
        const data: LibraryOutcome[] = await res.json();
        if (!cancelled) setItems(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setAvailable(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const save = useCallback(async (outcome: NewLibraryOutcome): Promise<LibraryOutcome> => {
    const res = await fetch('/api/v1/outcomes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(outcome),
    });
    if (!res.ok) throw new Error(`Could not save outcome (${res.status})`);
    const saved: LibraryOutcome = await res.json();
    setItems(prev => (prev.some(p => p.id === saved.id) ? prev : [saved, ...prev]));
    return saved;
  }, []);

  const remove = useCallback(async (id: string) => {
    const res = await fetch(`/api/v1/outcomes/${id}`, { method: 'DELETE', headers: authHeaders() });
    if (!res.ok && res.status !== 404) throw new Error(`Could not remove outcome (${res.status})`);
    setItems(prev => prev.filter(p => p.id !== id));
  }, []);

  return { items, loading, available, save, remove };
}
