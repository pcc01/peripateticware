// Copyright (c) 2026 Paul Christopher Cerda
// Teacher: view and manage imported standards sets
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fmtDate } from '@/utils/date';

interface StandardsSet {
  id: string;
  name: string;
  description: string;
  type: string;
  state_code: string | null;
  is_global: boolean;
  criteria_count: number;
  created_at: string;
}

function authHeader() {
  const t = localStorage.getItem('auth_token');
  return t ? { Authorization: `Bearer ${t}` } : {};
}

const TYPE_LABEL: Record<string, string> = {
  rubric: 'Rubric',
  curriculum: 'Standards',
  state_reporting: 'State Requirements',
};

export const TeacherStandardsPage: React.FC = () => {
  const navigate = useNavigate();
  const [sets, setSets] = useState<StandardsSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    fetch('/api/v1/standards', { headers: authHeader() })
      .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
      .then(setSets)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    await fetch(`/api/v1/standards/${id}`, { method: 'DELETE', headers: authHeader() });
    load();
  };

  const myStandards = sets.filter(s => s.type === 'curriculum' && !s.is_global);
  const globalStandards = sets.filter(s => s.is_global);
  const rubrics = sets.filter(s => s.type === 'rubric');

  const Section: React.FC<{ title: string; items: StandardsSet[]; showDelete?: boolean }> = ({ title, items, showDelete }) => (
    items.length === 0 ? null : (
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 12 }}>{title}</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map(s => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{s.name}</div>
                {s.description && <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 2 }}>{s.description}</div>}
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4, display: 'flex', gap: 16 }}>
                  <span>{s.criteria_count} criteria</span>
                  {s.state_code && <span>{s.state_code}</span>}
                  <span>Added {fmtDate(s.created_at)}</span>
                </div>
              </div>
              <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 600, background: 'var(--accent-muted)', color: 'var(--primary)', flexShrink: 0 }}>
                {TYPE_LABEL[s.type] || s.type}
              </span>
              {showDelete && (
                <button onClick={() => handleDelete(s.id, s.name)}
                  style={{ background: 'none', border: '1px solid #fecdd3', color: '#be123c', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: '0.75rem', flexShrink: 0 }}>
                  Delete
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    )
  );

  return (
    <div style={{ fontFamily: 'var(--font-body)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32 }}>
        <h1 style={{ fontFamily: 'var(--font-head)', margin: 0, flex: 1 }}>Learning Standards</h1>
        <button onClick={() => navigate('/teacher/standards/import')}
          style={{ padding: '8px 18px', borderRadius: 8, background: 'var(--primary)', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
          📄 Import Standards
        </button>
      </div>

      {error && <p style={{ color: 'var(--error, #c0392b)', marginBottom: 16 }}>{error}</p>}
      {loading && <p style={{ color: 'var(--text-muted)' }}>Loading…</p>}

      {!loading && sets.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📐</div>
          <p style={{ marginBottom: 20 }}>No standards imported yet. Upload a PDF or CSV of your discipline's learning standards.</p>
          <button onClick={() => navigate('/teacher/standards/import')}
            style={{ padding: '10px 28px', borderRadius: 8, background: 'var(--primary)', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
            Import Standards
          </button>
        </div>
      )}

      <Section title="My Discipline Standards" items={myStandards} showDelete />
      <Section title="School-wide / Global Standards" items={globalStandards} showDelete={false} />
      <Section title="My Rubrics" items={rubrics} showDelete />
    </div>
  );
};

export default TeacherStandardsPage;
