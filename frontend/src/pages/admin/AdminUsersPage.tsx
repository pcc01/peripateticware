// Copyright (c) 2026 Paul Christopher Cerda
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fmtDate } from '@/utils/date';
import { useTranslation } from 'react-i18next';
import { useEscapeKey } from '@/hooks/useEscapeKey';

interface User { id: string; email: string; full_name: string; role: string; is_active: boolean; created_at: string; }

function authHeader() {
  const t = localStorage.getItem('auth_token');
  return t ? { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` } : { 'Content-Type': 'application/json' };
}

const ROLE_COLORS: Record<string, { bg: string; color: string }> = {
  TEACHER: { bg: '#dcfce7', color: '#166534' },
  STUDENT: { bg: '#dbeafe', color: '#1e40af' },
  PARENT:  { bg: '#fef9c3', color: '#854d0e' },
  ADMIN:   { bg: '#f3e8ff', color: '#6b21a8' },
};

export const AdminUsersPage: React.FC = () => {
  const { t } = useTranslation('landing');
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState(() => {
    // Allow drill-down from Analytics: /admin/users?role=TEACHER
    if (typeof window !== 'undefined') {
      const r = new URLSearchParams(window.location.search).get('role');
      if (r) return r.toUpperCase();
    }
    return '';
  });
  const [showCreate, setShowCreate] = useState(false);
  const [newUser, setNewUser] = useState({ email: '', full_name: '', password: '', role: 'STUDENT' });
  const [creating, setCreating] = useState(false);

  // Assign-to-class modal state
  const [assignUser, setAssignUser] = useState<User | null>(null);
  useEscapeKey(!!assignUser, () => setAssignUser(null));
  const [classOptions, setClassOptions] = useState<{ id: string; name: string }[]>([]);
  const [assignClass, setAssignClass] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [assignOk, setAssignOk] = useState(false);

  const load = (skip = 0) => {
    setLoading(true);
    fetch(`/api/v1/admin/users?skip=${skip}&limit=50`, { headers: authHeader() })
      .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
      .then(d => { setUsers(d.items || []); setTotal(d.total || 0); })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const r = await fetch('/api/v1/admin/users', { method: 'POST', headers: authHeader(), body: JSON.stringify(newUser) });
      if (!r.ok) throw new Error(await r.text());
      setShowCreate(false);
      setNewUser({ email: '', full_name: '', password: '', role: 'STUDENT' });
      load();
    } catch (e) { setError(String(e)); }
    finally { setCreating(false); }
  };

  const handleDelete = async (id: string, email: string) => {
    if (!confirm(`Delete user ${email}? This cannot be undone.`)) return;
    await fetch(`/api/v1/admin/users/${id}`, { method: 'DELETE', headers: authHeader() });
    load();
  };

  const openAssign = (u: User) => {
    setAssignUser(u);
    setAssignError(null);
    setAssignOk(false);
    setAssignClass('');
    fetch('/api/v1/admin/classes', { headers: authHeader() })
      .then(r => r.ok ? r.json() : [])
      .then(d => {
        const list = (Array.isArray(d) ? d : d.items || []).map((c: any) => ({ id: c.id, name: c.name }));
        setClassOptions(list);
        if (list.length) setAssignClass(list[0].id);
      })
      .catch(() => setClassOptions([]));
  };

  const handleAssign = async () => {
    if (!assignUser || !assignClass) { setAssignError('Select a class.'); return; }
    setAssigning(true);
    setAssignError(null);
    try {
      const r = await fetch(`/api/v1/classrooms/${assignClass}/students`, {
        method: 'POST',
        headers: authHeader(),
        body: JSON.stringify({ student_id: assignUser.id }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.detail || `Assign failed (${r.status})`);
      }
      setAssignOk(true);
    } catch (e: any) {
      setAssignError(e?.message || 'Could not assign to class.');
    } finally {
      setAssigning(false);
    }
  };

  const filtered = users.filter(u =>
    (!roleFilter || u.role === roleFilter) &&
    (!search || u.email.toLowerCase().includes(search.toLowerCase()) || (u.full_name || '').toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div style={{ fontFamily: 'var(--font-body)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <button onClick={() => navigate('/admin')} style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontWeight: 500 }}>← Dashboard</button>
        <h1 style={{ fontFamily: 'var(--font-head)', margin: 0, flex: 1 }}>User Management ({total})</h1>
        <button onClick={() => setShowCreate(s => !s)} style={{ padding: '8px 18px', borderRadius: 8, background: 'var(--primary)', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
          {showCreate ? 'Cancel' : '+ Create User'}
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, marginBottom: 24, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <input required placeholder={t('pages_admin_adminuserspage.placeholder_email', 'Email')} type="email" aria-label={t('pages_admin_adminuserspage.aria_label_new_user_email', 'New user email')} value={newUser.email} onChange={e => setNewUser(p => ({ ...p, email: e.target.value }))} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: '0.9rem' }} />
          <input required placeholder={t('pages_admin_adminuserspage.placeholder_full_name', 'Full name')} aria-label={t('pages_admin_adminuserspage.aria_label_new_user_full_name', 'New user full name')} value={newUser.full_name} onChange={e => setNewUser(p => ({ ...p, full_name: e.target.value }))} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: '0.9rem' }} />
          <input required placeholder={t('pages_admin_adminuserspage.placeholder_password', 'Password')} type="password" aria-label={t('pages_admin_adminuserspage.aria_label_new_user_password', 'New user password')} value={newUser.password} onChange={e => setNewUser(p => ({ ...p, password: e.target.value }))} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: '0.9rem' }} />
          <select value={newUser.role} onChange={e => setNewUser(p => ({ ...p, role: e.target.value }))} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: '0.9rem' }}>
            {['STUDENT','TEACHER','PARENT','ADMIN'].map(r => <option key={r}>{r}</option>)}
          </select>
          <button type="submit" disabled={creating} style={{ gridColumn: 'span 2', padding: '10px', borderRadius: 8, background: 'var(--primary)', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
            {creating ? 'Creating…' : 'Create User'}
          </button>
        </form>
      )}

      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('pages_admin_adminuserspage.placeholder_search_name_or_email', 'Search name or email…')} aria-label={t('pages_admin_adminuserspage.aria_label_search_users_by_name_or_email', 'Search users by name or email')} style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: '0.9rem' }} />
        <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: '0.9rem' }}>
          <option value="">{t('pages_admin_adminuserspage.all_roles', 'All roles')}</option>
          {['STUDENT','TEACHER','PARENT','ADMIN'].map(r => <option key={r}>{r}</option>)}
        </select>
      </div>

      {error && <p style={{ color: 'var(--error, #c0392b)', marginBottom: 16 }}>{error}</p>}
      {loading && <p style={{ color: 'var(--text-muted)' }}>{t('pages_admin_adminuserspage.loading', 'Loading…')}</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {filtered.map(u => {
          const rc = ROLE_COLORS[u.role] || { bg: '#f1f5f9', color: '#64748b' };
          return (
            <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{u.full_name || u.email}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>{u.email} · Joined {fmtDate(u.created_at)}</div>
              </div>
              <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 700, background: rc.bg, color: rc.color, flexShrink: 0 }}>{u.role}</span>
              <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 600, background: u.is_active ? '#dcfce7' : '#f1f5f9', color: u.is_active ? '#166534' : '#64748b', flexShrink: 0 }}>{u.is_active ? 'Active' : 'Inactive'}</span>
              {u.role === 'STUDENT' && (
                <button onClick={() => openAssign(u)} style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--primary)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: '0.75rem', flexShrink: 0 }}>Add to class</button>
              )}
              <button onClick={() => handleDelete(u.id, u.email)} style={{ background: 'none', border: '1px solid #fecdd3', color: '#be123c', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: '0.75rem', flexShrink: 0 }}>Delete</button>
            </div>
          );
        })}
      </div>

      {assignUser && (
        <div
          onClick={() => setAssignUser(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
        >
          <div role="dialog" aria-modal="true" aria-labelledby="assign-class-dialog-title" onClick={e => e.stopPropagation()} style={{ background: 'var(--surface, #fff)', borderRadius: 12, padding: 28, width: 440, maxWidth: '92vw' }}>
            <h2 id="assign-class-dialog-title" style={{ margin: '0 0 6px', fontFamily: 'var(--font-head)' }}>{t('pages_admin_adminuserspage.add_to_class', 'Add to Class')}</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 0, marginBottom: 16 }}>{assignUser.full_name || assignUser.email}</p>

            {classOptions.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', marginBottom: 20 }}>{t('pages_admin_adminuserspage.no_classes_exist_yet_create_one_in_class', 'No classes exist yet. Create one in Class Management first.')}</p>
            ) : (
              <>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 6, fontSize: '0.9rem' }}>{t('pages_admin_adminuserspage.class', 'Class')}</label>
                <select value={assignClass} onChange={e => setAssignClass(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', marginBottom: 16, boxSizing: 'border-box' }}>
                  {classOptions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </>
            )}

            {assignOk && <div style={{ background: '#dcfce7', border: '1px solid #86efac', color: '#166534', borderRadius: 8, padding: '8px 12px', marginBottom: 16, fontSize: '0.85rem' }}>{t('pages_admin_adminuserspage.added_to_class', 'Added to class.')}</div>}
            {assignError && <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', color: '#be123c', borderRadius: 8, padding: '8px 12px', marginBottom: 16, fontSize: '0.85rem' }}>{assignError}</div>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button onClick={() => setAssignUser(null)} style={{ padding: '10px 18px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', fontWeight: 500 }}>{assignOk ? 'Done' : 'Cancel'}</button>
              {classOptions.length > 0 && !assignOk && (
                <button onClick={handleAssign} disabled={assigning} style={{ padding: '10px 18px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: '#fff', fontWeight: 600, cursor: assigning ? 'wait' : 'pointer', opacity: assigning ? 0.6 : 1 }}>
                  {assigning ? 'Adding…' : 'Add to Class'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminUsersPage;
