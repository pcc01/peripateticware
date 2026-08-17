// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

/**
 * AdminStandardsPage
 *
 * Central management console for global standards sets.
 * Admins can see, expire, delete, and trigger re-upload of any global set.
 *
 * Two sections:
 *   State Academic Standards  (type = 'state_standards')
 *     TEKS, NGSS, Common Core, etc. Shared globally across all users.
 *     Import via "Import Standards" nav item (CurriculumImportPage).
 *
 *   State Reporting Requirements  (type = 'state_reporting', is_global=TRUE)
 *     Homeschool annual reporting requirements, one per state.
 *     Pre-seeded for 15 states; admins can add/update any state.
 */

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fmtDate } from '@/utils/date';
import { useTranslation } from 'react-i18next';
import StandardsExplorer from '@/components/shared/StandardsExplorer';

interface StandardsSet {
  id: string;
  name: string;
  description: string;
  type: string;
  state_code: string | null;
  is_global: boolean;
  criteria_count: number;
  processing_status: string;
  last_processed_at: string | null;
  valid_until: string | null;
  is_expired: boolean;
  days_until_expiry: number | null;
  created_at: string;
}

function authHeader(): Record<string, string> {
  const t = localStorage.getItem('auth_token');
  return t ? { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` } : { 'Content-Type': 'application/json' };
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    complete:   { bg: '#dcfce7', color: '#15803d', label: '✓ Ready' },
    pending:    { bg: '#e0f2fe', color: '#0369a1', label: '⏳ Queued' },
    processing: { bg: '#fef9c3', color: '#a16207', label: '⚙️ Processing' },
    failed:     { bg: '#fee2e2', color: '#b91c1c', label: '✗ Failed' },
  };
  const s = map[status] ?? map.complete;
  return (
    <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

function ExpiryBadge({ set }: { set: StandardsSet }) {
  const { t } = useTranslation('landing');
  if (!set.valid_until) return <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{t('pages_admin_adminstandardspage.no_expiry', 'No expiry')}</span>;
  if (set.is_expired) return (
    <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: '#fee2e2', color: '#b91c1c' }}>{t('pages_admin_adminstandardspage.expired', 'EXPIRED')}</span>
  );
  const d = set.days_until_expiry ?? 999;
  return (
    <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 20,
      background: d <= 30 ? '#fef9c3' : '#f1f5f9', color: d <= 30 ? '#a16207' : '#64748b' }}>
      Expires {fmtDate(set.valid_until)}{d <= 30 ? ` (${d}d)` : ''}
    </span>
  );
}

const AdminStandardsPage: React.FC = () => {
  const { t } = useTranslation('landing');
  const navigate = useNavigate();
  const [sets, setSets]         = useState<StandardsSet[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [search, setSearch]     = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showExpired, setShowExpired] = useState(true);

  const load = () => {
    setLoading(true);
    fetch('/api/v1/standards?include_expired=true', { headers: authHeader() })
      .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
      .then((all: StandardsSet[]) => setSets(all.filter(s => s.type === 'state_standards' || s.type === 'state_reporting')))
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"? This removes it for all users.`)) return;
    setDeleting(id);
    try {
      await fetch(`/api/v1/standards/${id}`, { method: 'DELETE', headers: authHeader() });
      load();
    } catch (e: any) {
      setError(String(e));
    } finally {
      setDeleting(null);
    }
  };

  const handleExtendValidity = async (id: string) => {
    const newDate = prompt('Enter new valid_until date (YYYY-MM-DD):',
      new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10));
    if (!newDate) return;
    await fetch(`/api/v1/standards/${id}`, {
      method: 'PUT',
      headers: authHeader(),
      body: JSON.stringify({ valid_until: newDate }),
    });
    load();
  };

  const standards  = sets.filter(s => s.type === 'state_standards');
  const reporting  = sets.filter(s => s.type === 'state_reporting' && s.is_global);

  const filter = (list: StandardsSet[]) => {
    let out = list;
    if (!showExpired) out = out.filter(s => !s.is_expired);
    if (search) out = out.filter(s =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      (s.state_code || '').toLowerCase().includes(search.toLowerCase())
    );
    return out;
  };

  return (
    <div style={{ fontFamily: 'var(--font-body)', maxWidth: 900 }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: 'var(--font-head)', marginBottom: 4 }}>{t('pages_admin_adminstandardspage.standards_library', 'Standards Library')}</h1>
        <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.88rem' }}>{t('pages_admin_adminstandardspage.global_standards_sets_shared_across_all_', 'Global standards sets shared across all users. State academic standards (TEKS, NGSS, Common Core) and state homeschool reporting requirements are managed here.')}</p>
      </div>

      {error && (
        <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8, background: '#fee2e2', color: '#b91c1c', fontSize: '0.85rem' }}>
          {error}
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t('pages_admin_adminstandardspage.placeholder_search_by_name_or_state_code', 'Search by name or state code…')}
          style={{ flex: 1, minWidth: 200, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: '0.9rem', background: 'var(--surface)', color: 'var(--text)' }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', cursor: 'pointer', color: 'var(--text-muted)' }}>
          <input type="checkbox" id="show-expired" checked={showExpired} onChange={e => setShowExpired(e.target.checked)} aria-label={t('pages_admin_adminstandardspage.aria_label_show_expired_standards', 'Show expired standards')} />
          Show expired
        </label>
        <button
          onClick={() => navigate('/admin/curriculum/import')}
          style={{ padding: '8px 16px', borderRadius: 8, background: 'var(--primary)', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}
        >
          + Import Standards
        </button>
      </div>

      {loading && <p style={{ color: 'var(--text-muted)' }}>{t('pages_admin_adminstandardspage.loading', 'Loading…')}</p>}

      {/* ── State Academic Standards ───────────────────────────────────────── */}
      <Section
        title={t('pages_admin_adminstandardspage.title_state_academic_standards', 'State Academic Standards')}
        subtitle={`${standards.length} sets — TEKS, NGSS, Common Core, etc. Shared globally; all users can map activities against these.`}
        count={filter(standards).length}
        onImport={() => navigate('/admin/curriculum/import')}
        importLabel="Import Standards"
        empty={filter(standards).length === 0 && !loading}
        emptyText={search ? 'No standards match your search.' : 'No state academic standards uploaded yet. Use Import Standards to add the first set.'}
      >
        {filter(standards).map(s => (
          <SetRow key={s.id} set={s}
            onDelete={() => handleDelete(s.id, s.name)}
            onExtend={() => handleExtendValidity(s.id)}
            deleting={deleting === s.id}
          />
        ))}
      </Section>

      {/* ── State Reporting Requirements ──────────────────────────────────── */}
      <Section
        title={t('pages_admin_adminstandardspage.title_state_reporting_requirements', 'State Reporting Requirements')}
        subtitle={`${reporting.length} states seeded — homeschool annual reporting requirements. Pre-seeded for 15 states; upload for additional states via homeschool reporting upload.`}
        count={filter(reporting).length}
        empty={filter(reporting).length === 0 && !loading}
        emptyText={search ? 'No reporting sets match your search.' : 'No global reporting requirement sets found.'}
      >
        {filter(reporting).map(s => (
          <SetRow key={s.id} set={s}
            onDelete={() => handleDelete(s.id, s.name)}
            onExtend={() => handleExtendValidity(s.id)}
            deleting={deleting === s.id}
          />
        ))}
      </Section>

      {/* Summary */}
      {!loading && (
        <div style={{ marginTop: 16, padding: '12px 16px', borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border)', fontSize: '0.82rem', color: 'var(--text-muted)', display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <span><strong style={{ color: 'var(--text)' }}>{sets.length}</strong> total global sets</span>
          <span><strong style={{ color: '#15803d' }}>{sets.filter(s => !s.is_expired).length}</strong> active</span>
          <span><strong style={{ color: '#b91c1c' }}>{sets.filter(s => s.is_expired).length}</strong> expired</span>
          <span><strong style={{ color: '#a16207' }}>{sets.filter(s => !s.is_expired && (s.days_until_expiry ?? 999) <= 30).length}</strong> expiring within 30 days</span>
        </div>
      )}

      {/* ── Standards graph search ──────────────────────────────────────── */}
      <div style={{ marginTop: 32, paddingTop: 28, borderTop: '1px solid var(--border)' }}>
        <StandardsExplorer />
      </div>
    </div>
  );
};

// ── Set row ───────────────────────────────────────────────────────────────────

function SetRow({ set, onDelete, onExtend, deleting }: {
  set: StandardsSet;
  onDelete: () => void;
  onExtend: () => void;
  deleting: boolean;
}) {
  const { t } = useTranslation('landing');
  return (
    <div style={{
      padding: '14px 18px',
      background: set.is_expired ? '#fff7f7' : 'var(--surface)',
      border: `1px solid ${set.is_expired ? '#fecdd3' : 'var(--border)'}`,
      borderRadius: 10,
      display: 'flex', alignItems: 'flex-start', gap: 14,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{set.name}</span>
          {set.state_code && (
            <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '1px 7px', borderRadius: 20, background: '#dbeafe', color: '#1d4ed8' }}>
              {set.state_code}
            </span>
          )}
        </div>
        {set.description && (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 500 }}>
            {set.description}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 7, flexWrap: 'wrap', alignItems: 'center' }}>
          <StatusBadge status={set.processing_status} />
          <ExpiryBadge set={set} />
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            {set.criteria_count} criteria · Added {fmtDate(set.created_at)}
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        <button
          onClick={onExtend}
          style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontSize: '0.75rem', color: 'var(--text-muted)' }}
        >{t('pages_admin_adminstandardspage.extend', 'Extend')}</button>
        <button
          onClick={onDelete}
          disabled={deleting}
          style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #fecdd3', background: 'none', cursor: 'pointer', fontSize: '0.75rem', color: '#be123c', opacity: deleting ? 0.5 : 1 }}
        >
          {deleting ? '…' : 'Delete'}
        </button>
      </div>
    </div>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ title, subtitle, count, onImport, importLabel, empty, emptyText, children }: {
  title: string; subtitle: string; count: number;
  onImport?: () => void; importLabel?: string;
  empty: boolean; emptyText: string; children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: '1rem' }}>{title} <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: '0.85rem' }}>({count})</span></div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 3 }}>{subtitle}</div>
        </div>
        {onImport && (
          <button onClick={onImport} style={{ flexShrink: 0, padding: '6px 14px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 600, background: 'var(--primary)', color: 'white', border: 'none', cursor: 'pointer' }}>
            {importLabel}
          </button>
        )}
      </div>
      {empty ? (
        <div style={{ padding: '20px', textAlign: 'center', background: 'var(--surface)', border: '1px dashed var(--border)', borderRadius: 10, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          {emptyText}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>
      )}
    </div>
  );
}

export default AdminStandardsPage;
