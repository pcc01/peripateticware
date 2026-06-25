// Copyright (c) 2026 Paul Christopher Cerda
import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

interface Child { id: string; full_name: string; email: string; grade_level: number; }
interface Progress { child_id: string; child_name: string; total_sessions: number; completed_sessions: number; overall_progress: number; }

function authHeader() {
  const t = localStorage.getItem('auth_token');
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export const HomeschoolProgressPage: React.FC = () => {
  const { t } = useTranslation('landing');
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [children, setChildren] = useState<Child[]>([]);
  const [selected, setSelected] = useState<string>(params.get('child') || '');
  const [progress, setProgress] = useState<Progress | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/v1/homeschool/children', { headers: authHeader() })
      .then(r => r.ok ? r.json() : [])
      .then((data: Child[]) => {
        setChildren(data);
        if (!selected && data.length > 0) setSelected(data[0].id);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selected) return;
    fetch(`/api/v1/homeschool/children/${selected}/progress`, { headers: authHeader() })
      .then(r => r.ok ? r.json() : null)
      .then(setProgress);
  }, [selected]);

  if (loading) return <p style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>{t('pages_homeschool_homeschoolprogresspage.loading', 'Loading…')}</p>;

  if (children.length === 0) return (
    <div style={{ fontFamily: 'var(--font-body)', textAlign: 'center', padding: '48px 0' }}>
      <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📊</div>
      <p style={{ color: 'var(--text-muted)', marginBottom: 20 }}>{t('pages_homeschool_homeschoolprogresspage.add_children_first_to_track_their_progre', 'Add children first to track their progress.')}</p>
      <button onClick={() => navigate('/homeschool/children')}
        style={{ padding: '10px 24px', borderRadius: 8, background: 'var(--primary)', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
        Add Children
      </button>
    </div>
  );

  return (
    <div style={{ fontFamily: 'var(--font-body)' }}>
      <h1 style={{ fontFamily: 'var(--font-head)', marginBottom: 24 }}>{t('pages_homeschool_homeschoolprogresspage.progress', 'Progress')}</h1>

      {/* Child selector */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 28, flexWrap: 'wrap' }}>
        {children.map(c => (
          <button key={c.id} onClick={() => setSelected(c.id)}
            style={{ padding: '8px 18px', borderRadius: 20, border: '2px solid', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem',
              borderColor: selected === c.id ? 'var(--primary)' : 'var(--border)',
              background: selected === c.id ? 'var(--accent-muted)' : 'var(--surface)',
              color: selected === c.id ? 'var(--primary)' : 'var(--text-muted)',
            }}>
            {c.full_name}
          </button>
        ))}
      </div>

      {progress && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 32 }}>
            {[
              { label: 'Overall Progress', value: `${progress.overall_progress}%`, color: progress.overall_progress > 70 ? '#16a34a' : progress.overall_progress > 40 ? '#b45309' : 'var(--text)' },
              { label: 'Total Sessions', value: progress.total_sessions },
              { label: 'Completed', value: progress.completed_sessions },
            ].map(s => (
              <div key={s.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 24px' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 8 }}>{s.label}</div>
                <div style={{ fontSize: '2rem', fontWeight: 700, color: (s as any).color || 'var(--text)' }}>{s.value}</div>
              </div>
            ))}
          </div>

          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 24px' }}>
            <div style={{ fontWeight: 600, marginBottom: 10 }}>Overall Progress</div>
            <div style={{ background: 'var(--surface-alt)', borderRadius: 999, height: 12, overflow: 'hidden' }}>
              <div style={{ width: `${progress.overall_progress}%`, height: '100%', background: 'var(--primary)', borderRadius: 999, transition: 'width 0.5s' }} />
            </div>
            <div style={{ marginTop: 8, fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              {progress.completed_sessions} of {progress.total_sessions} sessions completed
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default HomeschoolProgressPage;
