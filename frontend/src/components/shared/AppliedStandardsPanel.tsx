// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

/**
 * AppliedStandardsPanel
 *
 * The standards applied to one activity — shared by both the auto-apply
 * flow (routes/activities.py::suggest-standards writes rows here with
 * method='ai_suggested'/status='suggested' right after every save) and
 * standards-first authoring (a teacher's picks from StandardsExplorer land
 * here as method='manual'/status='approved'). The panel doesn't care which
 * produced a row — every one gets the same three override actions: approve
 * or reject an AI suggestion, remove a standard outright, or add one
 * manually via search. See PRD/plan iridescent-shimmying-wombat.md.
 *
 * Replaces the old "State / Curriculum Standards" CurriculumMapper block,
 * which wrote to the empty, unrelated curriculum_units table.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { inferenceService } from '@/services/inferenceService';
import { RagDocument } from '@/types/api';

interface AppliedStandard {
  alignment_id: string;
  item_id: string;
  code: string;
  title: string;
  rationale: string;
  confidence: number | null;
  status: 'suggested' | 'approved' | 'rejected';
  method: 'ai_suggested' | 'manual';
}

function authHeader(): Record<string, string> {
  const token = localStorage.getItem('auth_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function activitiesApi<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api/v1/activities${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...authHeader(), ...(options.headers as Record<string, string> | undefined) },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(detail || `${res.status} ${res.statusText}`);
  }
  return res.status === 204 ? (undefined as unknown as T) : res.json();
}

/** Fires the auto-suggest pass right after a create/update — exported so
 * ActivityManager can call it from its save handler without either file
 * needing to know the other's internals beyond this one function. */
export async function triggerStandardsSuggestion(activityId: string): Promise<void> {
  try {
    await activitiesApi(`/${activityId}/suggest-standards`, { method: 'POST' });
  } catch (err) {
    // Non-fatal — the activity itself already saved; a teacher can always
    // add standards manually via this panel, or retry by reopening it.
    console.warn('suggest-standards failed:', err);
  }
}

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  suggested: { bg: '#fef3c7', color: '#92400e', label: 'Suggested' },
  approved: { bg: '#dcfce7', color: '#15803d', label: 'Applied' },
  rejected: { bg: '#fee2e2', color: '#991b1b', label: 'Rejected' },
};

export const AppliedStandardsPanel: React.FC<{
  activityId?: string;
  /** Reports the count of non-rejected standards whenever the list changes,
   * so a parent form (ActivityManager's "Assessments" summary) can reflect
   * it without lifting the whole list into its own state. */
  onCountChange?: (count: number) => void;
}> = ({ activityId, onCountChange }) => {
  const { t } = useTranslation('landing');
  const [standards, setStandards] = useState<AppliedStandard[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [showSearch, setShowSearch] = useState(false);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<RagDocument[] | null>(null);
  const [searching, setSearching] = useState(false);

  const load = useCallback(() => {
    if (!activityId) return;
    setLoading(true);
    activitiesApi<AppliedStandard[]>(`/${activityId}/standards`)
      .then(setStandards)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, [activityId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    onCountChange?.(standards.filter(s => s.status !== 'rejected').length);
  }, [standards, onCountChange]);

  const review = async (alignmentId: string, status: 'approved' | 'rejected') => {
    if (!activityId) return;
    setBusyId(alignmentId);
    try {
      await activitiesApi(`/${activityId}/standards/${alignmentId}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      await load();
    } catch (e) { setError(String(e)); } finally { setBusyId(null); }
  };

  const remove = async (alignmentId: string) => {
    if (!activityId) return;
    setBusyId(alignmentId);
    try {
      await activitiesApi(`/${activityId}/standards/${alignmentId}`, { method: 'DELETE' });
      await load();
    } catch (e) { setError(String(e)); } finally { setBusyId(null); }
  };

  const runSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    try {
      const res = await inferenceService.ragRetrieve(query, { topK: 6, sourceType: 'standards' });
      setSearchResults(res.documents);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const addStandard = async (doc: RagDocument) => {
    if (!activityId || !doc.node_id) return;
    setBusyId(doc.node_id);
    try {
      await activitiesApi<AppliedStandard>(`/${activityId}/standards`, {
        method: 'POST',
        body: JSON.stringify({ item_id: doc.node_id }),
      });
      setQuery('');
      setSearchResults(null);
      setShowSearch(false);
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusyId(null);
    }
  };

  if (!activityId) {
    return (
      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
        {t('components_applied_standards.save_first', 'Save this activity to see standards applied automatically from its content — you can also add your own once it exists.')}
      </p>
    );
  }

  const alreadyApplied = new Set(standards.map(s => s.item_id));

  return (
    <div>
      {loading && standards.length === 0 && (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{t('components_applied_standards.loading', 'Checking standards…')}</p>
      )}
      {error && <p style={{ color: '#b91c1c', fontSize: '0.8rem' }}>{error}</p>}

      {standards.length === 0 && !loading && (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 8 }}>
          {t('components_applied_standards.none_yet', "No standards matched this activity's content yet — you can add one manually below.")}
        </p>
      )}

      {standards.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
          {standards.map(s => {
            const style = STATUS_STYLE[s.status] || STATUS_STYLE.suggested;
            return (
              <div key={s.alignment_id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: '0.72rem', fontWeight: 700 }}>{s.code}</span>
                    <span style={{ padding: '1px 8px', borderRadius: 20, fontSize: '0.65rem', fontWeight: 700, background: style.bg, color: style.color }}>
                      {style.label}
                    </span>
                    {s.confidence != null && (
                      <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{Math.round(s.confidence * 100)}%</span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }} title={s.rationale}>{s.title}</div>
                </div>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  {s.status === 'suggested' && (
                    <>
                      <button type="button" disabled={busyId === s.alignment_id} onClick={() => review(s.alignment_id, 'approved')}
                        style={{ fontSize: '0.7rem', padding: '3px 8px', borderRadius: 6, border: '1px solid #86efac', background: '#f0fdf4', color: '#15803d', cursor: 'pointer' }}>
                        {t('components_applied_standards.approve', 'Approve')}
                      </button>
                      <button type="button" disabled={busyId === s.alignment_id} onClick={() => review(s.alignment_id, 'rejected')}
                        style={{ fontSize: '0.7rem', padding: '3px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                        {t('components_applied_standards.dismiss', 'Dismiss')}
                      </button>
                    </>
                  )}
                  {s.status === 'approved' && (
                    <button type="button" disabled={busyId === s.alignment_id} onClick={() => remove(s.alignment_id)}
                      style={{ fontSize: '0.7rem', padding: '3px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                      {t('components_applied_standards.remove', 'Remove')}
                    </button>
                  )}
                  {s.status === 'rejected' && (
                    <button type="button" disabled={busyId === s.alignment_id} onClick={() => review(s.alignment_id, 'approved')}
                      style={{ fontSize: '0.7rem', padding: '3px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                      {t('components_applied_standards.restore', 'Restore')}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!showSearch ? (
        <button type="button" onClick={() => setShowSearch(true)}
          style={{ fontSize: '0.78rem', padding: '5px 12px', borderRadius: 6, border: '1px dashed var(--border)', background: 'none', color: 'var(--primary)', cursor: 'pointer' }}>
          {t('components_applied_standards.add_standard', '+ Add a standard')}
        </button>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
          <form onSubmit={runSearch} style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              autoFocus
              placeholder={t('components_applied_standards.search_placeholder', 'Search standards…')}
              style={{ flex: 1, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: '0.82rem', background: 'var(--surface)', color: 'var(--text)' }}
            />
            <button type="submit" disabled={searching || !query.trim()}
              style={{ padding: '6px 14px', borderRadius: 6, background: 'var(--primary)', color: 'white', border: 'none', fontSize: '0.78rem', cursor: 'pointer', opacity: searching ? 0.6 : 1 }}>
              {searching ? '…' : t('components_applied_standards.search', 'Search')}
            </button>
            <button type="button" onClick={() => { setShowSearch(false); setSearchResults(null); setQuery(''); }}
              style={{ padding: '6px 10px', borderRadius: 6, background: 'none', border: '1px solid var(--border)', fontSize: '0.78rem', cursor: 'pointer' }}>
              {t('components_applied_standards.cancel', 'Cancel')}
            </button>
          </form>

          {searchResults && searchResults.length === 0 && (
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{t('components_applied_standards.no_results', 'No matches.')}</p>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 240, overflowY: 'auto' }}>
            {(searchResults || []).map((doc, i) => {
              const canAdd = doc.node_type === 'standards_item' && !!doc.node_id;
              const already = doc.node_id ? alreadyApplied.has(doc.node_id) : false;
              const code = (doc.metadata as Record<string, unknown> | undefined)?.human_coding_scheme
                || (doc.metadata as Record<string, unknown> | undefined)?.criterion_id;
              return (
                <div key={doc.id ?? `${doc.node_type}-${doc.node_id}-${i}`}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6, background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {!!code && <span style={{ fontFamily: 'monospace', fontSize: '0.68rem', fontWeight: 700, marginRight: 6 }}>{String(code)}</span>}
                    <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>{doc.content?.slice(0, 90)}</span>
                  </div>
                  <button
                    type="button"
                    disabled={!canAdd || already || busyId === doc.node_id}
                    onClick={() => addStandard(doc)}
                    style={{
                      fontSize: '0.7rem', padding: '3px 10px', borderRadius: 6, border: 'none', flexShrink: 0,
                      background: already ? 'var(--border)' : 'var(--primary)',
                      color: already ? 'var(--text-muted)' : 'white',
                      cursor: canAdd && !already ? 'pointer' : 'default',
                    }}
                  >
                    {already ? t('components_applied_standards.added', 'Added') : t('components_applied_standards.add', 'Add')}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default AppliedStandardsPanel;
