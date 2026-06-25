// Copyright (c) 2026 Paul Christopher Cerda
// Business Source License 1.1

/**
 * TeacherClassroomsPage — /teacher/classrooms
 * Lists all classrooms for the logged-in teacher.
 * Each card links to /teacher/classrooms/:id for the detail + invite view.
 */

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Users, BookOpen, AlertCircle } from 'lucide-react';
import apiClient from '@/config/api';
import { useTranslation } from 'react-i18next';

const API = import.meta.env.VITE_API_URL || '/api/v1';

interface Classroom {
  id:            string;
  name:          string;
  grade_level:   number | null;
  subject:       string | null;
  is_active:     boolean;
  student_count: number;
  max_students_per_classroom: number;
  at_capacity:   boolean;
  created_at:    string | null;
}

const TeacherClassroomsPage: React.FC = () => {
  const { t } = useTranslation('landing');
  const navigate = useNavigate();
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [creating, setCreating]     = useState(false);
  const [newName, setNewName]       = useState('');
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    apiClient.get(`${API}/classrooms`)
      .then(r => setClassrooms(r.data))
      .catch(() => setError('Could not load classrooms.'))
      .finally(() => setLoading(false));
  }, []);

  const createClassroom = async () => {
    if (!newName.trim()) return;
    setCreateError(null);
    try {
      const r = await apiClient.post(`${API}/classrooms`, { name: newName.trim() });
      navigate(`/teacher/classrooms/${r.data.id}`);
    } catch (e: any) {
      setCreateError(e?.response?.data?.detail || 'Failed to create classroom.');
    }
  };

  if (loading) return (
    <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
      Loading classrooms…
    </div>
  );

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '2rem 1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text)', margin: 0 }}>{t('pages_teacher_teacherclassroomspage.my_classrooms', 'My Classrooms')}</h1>
          <p style={{ color: 'var(--text-muted)', marginTop: '0.3rem', fontSize: '0.9rem' }}>
            {classrooms.length} classroom{classrooms.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => setCreating(c => !c)}
          style={{
            display: 'flex', alignItems: 'center', gap: '0.4rem',
            padding: '0.6rem 1.2rem', borderRadius: '0.4rem',
            background: 'var(--primary)', color: '#fff',
            border: 'none', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer',
          }}
        >
          <Plus size={16} /> New Classroom
        </button>
      </div>

      {/* Create form */}
      {creating && (
        <div style={{
          padding: '1.25rem', background: 'var(--surface)',
          border: '1px solid var(--border)', borderRadius: '0.5rem', marginBottom: '1.5rem',
        }}>
          <p style={{ fontWeight: 600, color: 'var(--text)', marginBottom: '0.75rem' }}>{t('pages_teacher_teacherclassroomspage.new_classroom', 'New classroom')}</p>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createClassroom()}
              placeholder="e.g. Year 6 Science — Period 2"
              style={{
                flex: '1 1 260px', padding: '0.5rem 0.75rem',
                border: '1px solid var(--border)', borderRadius: '0.35rem',
                background: 'var(--bg)', color: 'var(--text)', fontSize: '0.875rem',
              }}
              autoFocus
            />
            <button
              onClick={createClassroom}
              disabled={!newName.trim()}
              style={{
                padding: '0.5rem 1.1rem', borderRadius: '0.35rem',
                background: 'var(--primary)', color: '#fff', border: 'none',
                fontWeight: 600, fontSize: '0.875rem',
                cursor: newName.trim() ? 'pointer' : 'not-allowed', opacity: newName.trim() ? 1 : 0.5,
              }}
            >
              Create
            </button>
            <button
              onClick={() => { setCreating(false); setNewName(''); setCreateError(null); }}
              style={{ padding: '0.5rem 0.75rem', borderRadius: '0.35rem', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.875rem' }}
            >
              Cancel
            </button>
          </div>
          {createError && (
            <p style={{ color: '#b91c1c', fontSize: '0.8rem', marginTop: '0.5rem' }}>{createError}</p>
          )}
        </div>
      )}

      {error && (
        <div style={{ padding: '1rem', background: '#fee2e2', borderRadius: '0.4rem', color: '#b91c1c', marginBottom: '1rem', fontSize: '0.875rem' }}>
          {error}
        </div>
      )}

      {/* Classroom cards */}
      {classrooms.length === 0 && !creating ? (
        <div style={{
          textAlign: 'center', padding: '4rem 2rem',
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '0.5rem',
        }}>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>{t('pages_teacher_teacherclassroomspage.you_dont_have_any_classrooms_yet', 'You don\'t have any classrooms yet.')}</p>
          <button
            onClick={() => setCreating(true)}
            style={{
              padding: '0.6rem 1.4rem', borderRadius: '0.4rem',
              background: 'var(--primary)', color: '#fff',
              border: 'none', fontWeight: 600, cursor: 'pointer',
            }}
          >
            Create your first classroom
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1rem' }}>
          {classrooms.map(c => (
            <div
              key={c.id}
              onClick={() => navigate(`/teacher/classrooms/${c.id}`)}
              style={{
                padding: '1.25rem', background: 'var(--surface)',
                border: '1px solid var(--border)', borderRadius: '0.5rem',
                cursor: 'pointer', transition: 'box-shadow 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)')}
              onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                <h3 style={{ fontWeight: 600, color: 'var(--text)', margin: 0, fontSize: '1rem' }}>{c.name}</h3>
                {!c.is_active && (
                  <span style={{ fontSize: '0.7rem', background: '#f1f5f9', color: '#64748b', padding: '2px 6px', borderRadius: '1rem' }}>
                    Archived
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', gap: '1rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {c.grade_level && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <BookOpen size={13} /> Year {c.grade_level}
                  </span>
                )}
                {c.subject && <span>{c.subject}</span>}
              </div>

              <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  <Users size={13} /> {c.student_count} / {c.max_students_per_classroom} students
                </span>
                {c.at_capacity && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', color: '#b45309' }}>
                    <AlertCircle size={12} /> Full
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TeacherClassroomsPage;
