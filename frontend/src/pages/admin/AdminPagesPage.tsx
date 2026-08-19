// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

/**
 * AdminPagesPage  —  /admin/pages
 *
 * Manage console for WYSIWYG-lite page copy: every editable block across
 * every page (grouped by page_key), with its live status and a link into
 * the editor. New blocks only appear here once a developer has wired a
 * `usePageBlocks().block('some.key', 'fallback')` call into a page's JSX
 * AND an admin has created the matching row — this page's "+ New Block"
 * button is how that row gets created.
 */

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fmtDate } from '@/utils/date';
import { adminListBlocks, adminDeleteBlock, PageBlock } from '@/services/pageContentService';

const AdminPagesPage: React.FC = () => {
  const navigate = useNavigate();
  const [blocks, setBlocks] = useState<PageBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    adminListBlocks()
      .then(setBlocks)
      .catch((e) => setError(e?.response?.data?.detail || 'Could not load page blocks.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (b: PageBlock) => {
    if (!confirm(`Delete "${b.block_key}"? The page will revert to its built-in default text.`)) return;
    setBusyId(b.id);
    try {
      await adminDeleteBlock(b.id);
      load();
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Could not delete this block.');
    } finally {
      setBusyId(null);
    }
  };

  const filtered = search
    ? blocks.filter((b) => b.block_key.toLowerCase().includes(search.toLowerCase()) || b.content.toLowerCase().includes(search.toLowerCase()))
    : blocks;

  const grouped = filtered.reduce<Record<string, PageBlock[]>>((acc, b) => {
    (acc[b.page_key] ||= []).push(b);
    return acc;
  }, {});

  return (
    <div style={{ fontFamily: 'var(--font-body)', maxWidth: 900 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 28, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-head)', marginBottom: 4 }}>Pages</h1>
          <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.88rem' }}>
            Edit copy directly on live pages without a code deploy. Only fields a developer has wired up appear here.
          </p>
        </div>
        <button
          onClick={() => navigate('/admin/pages/new')}
          style={{ padding: '10px 18px', borderRadius: 8, background: 'var(--primary)', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', flexShrink: 0 }}
        >
          + New Block
        </button>
      </div>

      {error && (
        <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8, background: '#fee2e2', color: '#b91c1c', fontSize: '0.85rem' }}>
          {error}
        </div>
      )}

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by block key or content…"
        style={{ width: '100%', marginBottom: 20, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: '0.9rem', background: 'var(--surface)', color: 'var(--text)' }}
      />

      {loading && <p style={{ color: 'var(--text-muted)' }}>Loading…</p>}

      {!loading && filtered.length === 0 && (
        <div style={{ padding: '2rem', textAlign: 'center', background: 'var(--surface)', border: '1px dashed var(--border)', borderRadius: 10, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          {search ? 'No blocks match your search.' : 'No page blocks yet.'}
        </div>
      )}

      {Object.entries(grouped).map(([pageKey, pageBlocks]) => (
        <div key={pageKey} style={{ marginBottom: 32 }}>
          <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 10 }}>
            {pageKey} <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: '0.85rem' }}>({pageBlocks.length})</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {pageBlocks.map((b) => (
              <div
                key={b.id}
                style={{
                  padding: '14px 18px',
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  display: 'flex', alignItems: 'flex-start', gap: 14,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span
                      style={{ fontWeight: 600, fontSize: '0.85rem', fontFamily: 'var(--font-mono, monospace)', cursor: 'pointer' }}
                      onClick={() => navigate(`/admin/pages/${b.id}`)}
                    >
                      {b.block_key}
                    </span>
                    <span style={{
                      fontSize: '0.68rem', fontWeight: 700, padding: '1px 9px', borderRadius: 20,
                      background: b.status === 'published' ? '#dcfce7' : '#f1f5f9',
                      color: b.status === 'published' ? '#15803d' : '#64748b',
                    }}>
                      {b.status === 'published' ? '● Published' : '○ Draft'}
                    </span>
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{b.locale}</span>
                  </div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text)', marginTop: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 560 }}>
                    {b.content}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
                    Updated {fmtDate(b.updated_at)}{b.updated_by_name ? ` by ${b.updated_by_name}` : ''}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button
                    onClick={() => navigate(`/admin/pages/${b.id}`)}
                    style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontSize: '0.75rem', color: 'var(--text-muted)' }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(b)}
                    disabled={busyId === b.id}
                    style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #fecdd3', background: 'none', cursor: 'pointer', fontSize: '0.75rem', color: '#be123c', opacity: busyId === b.id ? 0.5 : 1 }}
                  >
                    {busyId === b.id ? '…' : 'Revert'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export default AdminPagesPage;
