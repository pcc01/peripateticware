// Copyright (c) 2026 Paul Christopher Cerda
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fmtDate } from '@/utils/date';
import { useTranslation } from 'react-i18next';

interface ClassItem { id: string; name: string; description: string; grade_level: number; school_year: string; is_active: boolean; created_at: string; teacher_name?: string; student_count?: number; }

function authHeader() {
  const t = localStorage.getItem('auth_token');
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export const AdminClassesPage: React.FC = () => {
  const { t } = useTranslation('landing');
  const navigate = useNavigate();
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // New-class modal state
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newGrade, setNewGrade] = useState('');
  const [newSubject, setNewSubject] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    fetch('/api/v1/admin/classes', { headers: authHeader() })
      .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
      .then(d => setClasses(Array.isArray(d) ? d : d.items || []))
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const resetCreate = () => {
    setShowCreate(false);
    setNewName(''); setNewGrade(''); setNewSubject('');
    setCreateError(null);
  };

  const handleCreate = async () => {
    if (!newName.trim()) { setCreateError('Class name is required.'); return; }
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch('/api/v1/classrooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({
          name: newName.trim(),
          grade_level: newGrade ? parseInt(newGrade, 10) : null,
          subject: newSubject.trim() || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail || `Create failed (${res.status})`);
      }
      resetCreate();
      load();
    } catch (e: any) {
      setCreateError(e?.message || 'Could not create class.');
    } finally {
      setCreating(false);
    }
  };

  const filtered = classes.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.teacher_name || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ fontFamily: 'var(--font-body)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32 }}>
        <button onClick={() => navigate('/admin')} style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontWeight: 500 }}>← Dashboard</button>
        <h1 style={{ fontFamily: 'var(--font-head)', margin: 0 }}>Class Management ({classes.length})</h1>
        <button
          onClick={() => setShowCreate(true)}
          style={{ marginLeft: 'auto', padding: '10px 18px', borderRadius: 8, border: 'none',
                   background: 'var(--primary)', color: '#fff', fontWeight: 600, cursor: 'pointer' }}
        >
          + New Class
        </button>
      </div>

      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search classes…"
        style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', fontSize: '0.95rem', marginBottom: 24, boxSizing: 'border-box' }} />

      {error && <p style={{ color: 'var(--error, #c0392b)' }}>{error}</p>}
      {loading && <p style={{ color: 'var(--text-muted)' }}>{t('pages_admin_adminclassespage.loading', 'Loading…')}</p>}

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

      {showCreate && (
        <div
          onClick={resetCreate}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex',
                   alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: 'var(--surface, #fff)', borderRadius: 12, padding: 28, width: 420, maxWidth: '92vw' }}
          >
            <h2 style={{ margin: '0 0 16px', fontFamily: 'var(--font-head)' }}>{t('pages_admin_adminclassespage.new_class', 'New Class')}</h2>

            <label style={{ display: 'block', fontWeight: 600, marginBottom: 6, fontSize: '0.9rem' }}>{t('pages_admin_adminclassespage.class_name', 'Class name *')}</label>
            <input
              value={newName} onChange={e => setNewName(e.target.value)} autoFocus
              placeholder="e.g. Period 3 Biology"
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', marginBottom: 16, boxSizing: 'border-box' }}
            />

            <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 6, fontSize: '0.9rem' }}>{t('pages_admin_adminclassespage.grade_level', 'Grade level')}</label>
                <input
                  type="number" min={1} max={12} value={newGrade} onChange={e => setNewGrade(e.target.value)}
                  placeholder="Optional"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 6, fontSize: '0.9rem' }}>{t('pages_admin_adminclassespage.subject', 'Subject')}</label>
                <input
                  value={newSubject} onChange={e => setNewSubject(e.target.value)}
                  placeholder="Optional"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            {createError && (
              <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', color: '#be123c',
                            borderRadius: 8, padding: '8px 12px', marginBottom: 16, fontSize: '0.85rem' }}>
                {createError}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button onClick={resetCreate} style={{ padding: '10px 18px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', fontWeight: 500 }}>
                Cancel
              </button>
              <button
                onClick={handleCreate} disabled={creating || !newName.trim()}
                style={{ padding: '10px 18px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: '#fff',
                         fontWeight: 600, cursor: creating ? 'wait' : 'pointer', opacity: creating || !newName.trim() ? 0.6 : 1 }}
              >
                {creating ? 'Creating…' : 'Create Class'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminClassesPage;
