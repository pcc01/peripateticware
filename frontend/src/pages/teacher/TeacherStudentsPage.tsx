// Copyright (c) 2026 Paul Christopher Cerda
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fmtDate } from '@/utils/date';

interface Student {
  id: string;
  email: string;
  full_name: string;
  first_name: string;
  last_name: string;
  is_active: boolean;
}

function authHeader() {
  const t = localStorage.getItem('auth_token');
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export const TeacherStudentsPage: React.FC = () => {
  const navigate = useNavigate();
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch('/api/v1/activities/teacher/students', { headers: authHeader() })
      .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
      .then(setStudents)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const filtered = students.filter(s =>
    (s.full_name || `${s.first_name} ${s.last_name}`).toLowerCase().includes(search.toLowerCase()) ||
    s.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ fontFamily: 'var(--font-body)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32 }}>
        <button onClick={() => navigate('/teacher')} style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontWeight: 500 }}>← Dashboard</button>
        <h1 style={{ fontFamily: 'var(--font-head)', margin: 0 }}>Students ({students.length})</h1>
      </div>

      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search by name or email…"
        style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', fontSize: '0.95rem', marginBottom: 24, boxSizing: 'border-box' }}
      />

      {loading && <p style={{ color: 'var(--text-muted)' }}>Loading…</p>}
      {error && <p style={{ color: 'var(--error, #c0392b)' }}>{error}</p>}

      {!loading && filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>👥</div>
          <p>{search ? 'No students match your search.' : 'No students have started any of your activities yet.'}</p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.map(s => (
          <div key={s.id} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '14px 18px', background: 'var(--surface)',
            border: '1px solid var(--border)', borderRadius: 10,
          }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                {s.full_name || `${s.first_name || ''} ${s.last_name || ''}`.trim() || s.email}
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 2 }}>{s.email}</div>
            </div>
            <span style={{
              padding: '3px 10px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 600,
              background: s.is_active ? '#dcfce7' : '#f1f5f9',
              color: s.is_active ? '#166534' : '#64748b',
            }}>
              {s.is_active ? 'Active' : 'Inactive'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default TeacherStudentsPage;
