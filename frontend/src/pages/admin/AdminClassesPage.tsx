// Copyright (c) 2026 Paul Christopher Cerda
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fmtDate } from '@/utils/date';

interface ClassItem { id: string; name: string; description: string; grade_level: number; school_year: string; is_active: boolean; created_at: string; teacher_name?: string; student_count?: number; }

function authHeader() {
  const t = localStorage.getItem('auth_token');
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export const AdminClassesPage: React.FC = () => {
  const navigate = useNavigate();
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch('/api/v1/admin/classes', { headers: authHeader() })
      .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
      .then(d => setClasses(Array.isArray(d) ? d : d.items || []))
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const filtered = classes.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.teacher_name || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ fontFamily: 'var(--font-body)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32 }}>
        <button onClick={() => navigate('/admin')} style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontWeight: 500 }}>← Dashboard</button>
        <h1 style={{ fontFamily: 'var(--font-head)', margin: 0 }}>Class Management ({classes.length})</h1>
      </div>

      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search classes…"
        style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', fontSize: '0.95rem', marginBottom: 24, boxSizing: 'border-box' }} />

      {error && <p style={{ color: 'var(--error, #c0392b)' }}>{error}</p>}
      {loading && <p style={{ color: 'var(--text-muted)' }}>Loading…</p>}

      {!loading && filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>🏫</div>
          <p>{search ? 'No classes match your search.' : 'No classes found.'}</p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.map(c => (
          <div key={c.id} style={{ padding: '16px 20px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontWeight: 600 }}>{c.name}</div>
              {c.description && <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: 2 }}>{c.description}</div>}
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 6, display: 'flex', gap: 16 }}>
                {c.grade_level > 0 && <span>Grade {c.grade_level}</span>}
                {c.school_year && <span>{c.school_year}</span>}
                {c.teacher_name && <span>Teacher: {c.teacher_name}</span>}
                {c.student_count != null && <span>{c.student_count} students</span>}
                <span>Created {fmtDate(c.created_at)}</span>
              </div>
            </div>
            <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 600, flexShrink: 0,
              background: c.is_active ? '#dcfce7' : '#f1f5f9', color: c.is_active ? '#166534' : '#64748b' }}>
              {c.is_active ? 'Active' : 'Inactive'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdminClassesPage;
