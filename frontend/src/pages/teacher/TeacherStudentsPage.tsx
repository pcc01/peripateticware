// Copyright (c) 2026 Paul Christopher Cerda
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fmtDate } from '@/utils/date';
import { useTranslation } from 'react-i18next';

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

interface Classroom { id: string; name: string; }

export const TeacherStudentsPage: React.FC = () => {
  const { t } = useTranslation('landing');
  const navigate = useNavigate();
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Invite-student modal state
  const [showInvite, setShowInvite] = useState(false);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteOk, setInviteOk] = useState(false);

  useEffect(() => {
    fetch('/api/v1/activities/teacher/students', { headers: authHeader() })
      .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
      .then(setStudents)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const openInvite = () => {
    setShowInvite(true);
    setInviteError(null);
    setInviteOk(false);
    fetch('/api/v1/classrooms', { headers: authHeader() })
      .then(r => r.ok ? r.json() : [])
      .then((cs: Classroom[]) => {
        setClassrooms(cs);
        if (cs.length) setSelectedClass(cs[0].id);
      })
      .catch(() => setClassrooms([]));
  };

  const closeInvite = () => {
    setShowInvite(false);
    setInviteEmail('');
    setInviteError(null);
    setInviteOk(false);
  };

  const handleInvite = async () => {
    if (!selectedClass) { setInviteError('Create a class first, then invite students to it.'); return; }
    if (!inviteEmail.trim()) { setInviteError('Enter the student’s email address.'); return; }
    setInviting(true);
    setInviteError(null);
    try {
      const res = await fetch(`/api/v1/classrooms/${selectedClass}/invites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({ emails: [inviteEmail.trim()] }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail || `Invite failed (${res.status})`);
      }
      setInviteOk(true);
      setInviteEmail('');
    } catch (e: any) {
      setInviteError(e?.message || 'Could not send invite.');
    } finally {
      setInviting(false);
    }
  };

  const filtered = students.filter(s =>
    (s.full_name || `${s.first_name} ${s.last_name}`).toLowerCase().includes(search.toLowerCase()) ||
    s.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ fontFamily: 'var(--font-body)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32 }}>
        <button onClick={() => navigate('/teacher')} style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontWeight: 500 }}>← Dashboard</button>
        <h1 style={{ fontFamily: 'var(--font-head)', margin: 0 }}>Students ({students.length})</h1>
        <button
          onClick={openInvite}
          style={{ marginLeft: 'auto', padding: '10px 18px', borderRadius: 8, border: 'none',
                   background: 'var(--primary)', color: '#fff', fontWeight: 600, cursor: 'pointer' }}
        >{t('pages_teacher_teacherstudentspage.invite_student', '+ Invite Student')}</button>
      </div>

      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder={t('pages_teacher_teacherstudentspage.placeholder_search_by_name_or_email', 'Search by name or email…')}
        style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', fontSize: '0.95rem', marginBottom: 24, boxSizing: 'border-box' }}
      />

      {loading && <p style={{ color: 'var(--text-muted)' }}>{t('pages_teacher_teacherstudentspage.loading', 'Loading…')}</p>}
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
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{
                padding: '3px 10px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 600,
                background: s.is_active ? '#dcfce7' : '#f1f5f9',
                color: s.is_active ? '#166534' : '#64748b',
              }}>
                {s.is_active ? 'Active' : 'Inactive'}
              </span>
              <button
                onClick={() => navigate(`/teacher/classrooms/${s.id}`)}
                style={{
                  padding: '4px 12px', borderRadius: 6, fontSize: '0.78rem',
                  background: 'var(--primary)', color: '#fff', border: 'none', cursor: 'pointer',
                }}
              >
                View Details
              </button>
            </div>
          </div>
        ))}
      </div>

      {showInvite && (
        <div
          onClick={closeInvite}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex',
                   alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: 'var(--surface, #fff)', borderRadius: 12, padding: 28, width: 440, maxWidth: '92vw' }}
          >
            <h2 style={{ margin: '0 0 16px', fontFamily: 'var(--font-head)' }}>{t('pages_teacher_teacherstudentspage.invite_a_student', 'Invite a Student')}</h2>

            {classrooms.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', marginBottom: 20 }}>{t('pages_teacher_teacherstudentspage.you_dont_have_any_classes_yet_create_a_c', 'You don’t have any classes yet. Create a class first, then invite students to it.')}</p>
            ) : (
              <>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 6, fontSize: '0.9rem' }}>{t('pages_teacher_teacherstudentspage.class', 'Class')}</label>
                <select
                  value={selectedClass} onChange={e => setSelectedClass(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', marginBottom: 16, boxSizing: 'border-box' }}
                >
                  {classrooms.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>

                <label style={{ display: 'block', fontWeight: 600, marginBottom: 6, fontSize: '0.9rem' }}>{t('pages_teacher_teacherstudentspage.student_email', 'Student email')}</label>
                <input
                  type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} autoFocus
                  placeholder={t('pages_teacher_teacherstudentspage.placeholder_studentexamplecom', 'student@example.com')}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', marginBottom: 16, boxSizing: 'border-box' }}
                />
              </>
            )}

            {inviteOk && (
              <div style={{ background: '#dcfce7', border: '1px solid #86efac', color: '#166534',
                            borderRadius: 8, padding: '8px 12px', marginBottom: 16, fontSize: '0.85rem' }}>{t('pages_teacher_teacherstudentspage.invitation_sent_the_student_will_get_an_', 'Invitation sent. The student will get an email with a join link.')}</div>
            )}
            {inviteError && (
              <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', color: '#be123c',
                            borderRadius: 8, padding: '8px 12px', marginBottom: 16, fontSize: '0.85rem' }}>
                {inviteError}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button onClick={closeInvite} style={{ padding: '10px 18px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', fontWeight: 500 }}>
                {inviteOk ? 'Done' : 'Cancel'}
              </button>
              {classrooms.length > 0 && (
                <button
                  onClick={handleInvite} disabled={inviting || !inviteEmail.trim()}
                  style={{ padding: '10px 18px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: '#fff',
                           fontWeight: 600, cursor: inviting ? 'wait' : 'pointer', opacity: inviting || !inviteEmail.trim() ? 0.6 : 1 }}
                >
                  {inviting ? 'Sending…' : 'Send Invite'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeacherStudentsPage;
