// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

/**
 * StandardsExplorer
 *
 * Search box over the GraphRAG standards graph (GET /inference/rag-retrieve).
 * Unlike a flat similarity search, each result carries a `relation` — a
 * direct semantic match, or context pulled in by graph expansion (an
 * ancestor standard, a cross-jurisdiction equivalent, a prerequisite, or
 * content already aligned to the same standard). Results are grouped and
 * badged by that relation instead of presented as one undifferentiated
 * ranked list, per PRD-graphrag-migration-2026-08-16.md §3/§10 (Phase 4).
 *
 * First real frontend consumer of /inference/rag-retrieve — the endpoint
 * existed (and, before this migration, the graph-expansion pipeline behind
 * it) with no UI surface at all.
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { inferenceService } from '@/services/inferenceService';
import { RagDocument } from '@/types/api';

const RELATION_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  match:            { bg: '#dbeafe', color: '#1d4ed8', label: 'Match' },
  ancestor:         { bg: '#ede9fe', color: '#6d28d9', label: 'Ancestor' },
  cross_reference:  { bg: '#ccfbf1', color: '#0f766e', label: 'Cross-reference' },
  prerequisite:     { bg: '#ffedd5', color: '#c2410c', label: 'Prerequisite' },
  aligned_content:  { bg: '#dcfce7', color: '#15803d', label: 'Aligned content' },
};

function RelationBadge({ relation }: { relation: string }) {
  const s = RELATION_STYLE[relation] ?? RELATION_STYLE.match;
  return (
    <span style={{
      flexShrink: 0, fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px',
      borderRadius: 20, background: s.bg, color: s.color, whiteSpace: 'nowrap',
    }}>
      {s.label}
    </span>
  );
}

function ResultCard({ doc }: { doc: RagDocument }) {
  const meta = doc.metadata || {};
  const code = (meta as any).human_coding_scheme || (meta as any).criterion_id;
  return (
    <div style={{
      padding: '12px 16px', background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <RelationBadge relation={doc.relation} />
        {code && (
          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
            {code}
          </span>
        )}
        {doc.source_name && (
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            {doc.source_name}
          </span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--text-muted)', flexShrink: 0 }}>
          {Math.round(doc.relevance_score * 100)}%
        </span>
      </div>
      <div style={{ fontSize: '0.85rem', color: 'var(--text)' }}>{doc.content}</div>
    </div>
  );
}

export const StandardsExplorer: React.FC<{ sourceType?: string }> = ({ sourceType }) => {
  const { t } = useTranslation('landing');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [documents, setDocuments] = useState<RagDocument[] | null>(null);
  const [meta, setMeta] = useState<{ seedCount: number; expandedCount: number; ms: number } | null>(null);
  const [includeRelated, setIncludeRelated] = useState(true);

  const runSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await inferenceService.ragRetrieve(query, {
        topK: 8,
        sourceType,
        includeAncestors: includeRelated,
        includeRelated: includeRelated,
      });
      setDocuments(res.documents);
      setMeta({ seedCount: res.seed_count, expandedCount: res.expanded_count, ms: res.retrieval_time_ms });
    } catch (err) {
      setError(t('components_standards_explorer.search_failed', 'Search failed. Try again in a moment.'));
      setDocuments(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ fontFamily: 'var(--font-body)' }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>
          {t('components_standards_explorer.title', 'Explore Standards')}
        </div>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 2 }}>
          {t(
            'components_standards_explorer.subtitle',
            'Search across every standard, rubric, and requirement — results include structurally related standards (ancestors, cross-references, prerequisites), not just the closest text match.'
          )}
        </div>
      </div>

      <form onSubmit={runSearch} style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={t('components_standards_explorer.placeholder', 'e.g. "fraction equivalence" or "advocate for learning goals"…')}
          style={{ flex: 1, minWidth: 240, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: '0.9rem', background: 'var(--surface)', color: 'var(--text)' }}
        />
        <button
          type="submit"
          disabled={loading || !query.trim()}
          style={{ padding: '8px 18px', borderRadius: 8, background: 'var(--primary)', color: 'white', border: 'none', cursor: loading ? 'default' : 'pointer', fontWeight: 600, opacity: loading ? 0.6 : 1 }}
        >
          {loading ? t('components_standards_explorer.searching', 'Searching…') : t('components_standards_explorer.search', 'Search')}
        </button>
      </form>

      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: 'var(--text-muted)', cursor: 'pointer', marginBottom: 16 }}>
        <input type="checkbox" checked={includeRelated} onChange={e => setIncludeRelated(e.target.checked)} />
        {t('components_standards_explorer.include_related', 'Include related standards (ancestors, cross-references, prerequisites)')}
      </label>

      {error && (
        <div style={{ padding: '10px 14px', borderRadius: 8, background: '#fee2e2', color: '#b91c1c', fontSize: '0.85rem', marginBottom: 12 }}>
          {error}
        </div>
      )}

      {documents && documents.length === 0 && !loading && (
        <div style={{ padding: '20px', textAlign: 'center', background: 'var(--surface)', border: '1px dashed var(--border)', borderRadius: 10, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          {t('components_standards_explorer.no_results', 'No matching standards found.')}
        </div>
      )}

      {documents && documents.length > 0 && (
        <>
          {meta && (
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 10 }}>
              {t('components_standards_explorer.result_summary', '{{seedCount}} direct matches, {{expandedCount}} related via the standards graph — {{ms}}ms', {
                seedCount: meta.seedCount, expandedCount: meta.expandedCount, ms: meta.ms,
              })}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {documents.map((doc, i) => (
              <ResultCard key={doc.id ?? `${doc.node_type}-${doc.node_id}-${i}`} doc={doc} />
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default StandardsExplorer;
