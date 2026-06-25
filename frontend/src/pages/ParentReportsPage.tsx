// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

/**
 * ParentReportsPage
 * Route: /parent/reports
 * Shows weekly and monthly progress reports for linked children.
 * Uses: GET /api/v1/parent/children  and  /children/:id/reports/weekly|monthly
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';

const API = '/api/v1';
const getAuth = () => {
  const token = localStorage.getItem('auth_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};
const getParentId = (): string => {
  try { return JSON.parse(localStorage.getItem('auth_user') || '{}').id || ''; } catch { return ''; }
};

interface Child { id: string; full_name: string; verified?: boolean }

interface WeeklyReport {
  child_id: string;
  week_starting: string;
  week_ending: string;
  activities_completed: number;
  total_hours: number;
  new_competencies: string[];
  highlights: string[];
  concerns: string[];
  average_engagement: number;
  class_average: number;
}

interface MonthlyReport {
  child_id: string;
  month: string;
  year: number;
  activities_completed: number;
  total_hours: number;
  competencies_achieved: string[];
  growth_areas: string[];
  recommendations: string[];
}

function StatCard({ icon, label, value, sub }: { icon: string; label: string; value: string | number; sub?: string }) {
  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      padding: '18px 20px',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: '1.8rem', marginBottom: 6 }}>{icon}</div>
      <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--text)', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 4 }}>{label}</div>
      {sub && <div style={{ fontSize: '0.76rem', color: 'var(--text-faint)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function EngagementBar({ value, reference, label }: { value: number; reference?: number; label: string }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: '0.85rem' }}>
        <span style={{ color: 'var(--text-muted)' }}>{label}</span>
        <span style={{ fontWeight: 700, color: 'var(--text)' }}>{value}%</span>
      </div>
      <div style={{ height: 10, background: 'var(--surface-alt)', borderRadius: 5, position: 'relative' }}>
        <div style={{ height: '100%', background: 'var(--primary)', borderRadius: 5, width: `${Math.min(value, 100)}%` }} />
        {reference !== undefined && (
          <div style={{
            position: 'absolute',
            top: -3,
            left: `${Math.min(reference, 100)}%`,
            width: 2,
            height: 16,
            background: '#f59e0b',
            borderRadius: 1,
          }} title={`Class avg: ${reference}%`} />
        )}
      </div>
      {reference !== undefined && (
        <div style={{ fontSize: '0.72rem', color: 'var(--text-faint)', marginTop: 2 }}>
          Class average: {reference}%
        </div>
      )}
    </div>
  );
}

const ParentReportsPage: React.FC = () => {
  const { t } = useTranslation('landing');
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [view, setView] = useState<'weekly' | 'monthly'>('weekly');
  const [weekly, setWeekly] = useState<WeeklyReport | null>(null);
  const [monthly, setMonthly] = useState<MonthlyReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    axios.get(`${API}/parent/children`, { headers: getAuth() })
      .then(r => {
        const list: Child[] = Array.isArray(r.data) ? r.data : [];
        setChildren(list);
        if (list.length > 0) setSelectedChildId(list[0].id);
      })
      .catch(e => setError(e?.response?.data?.detail || 'Could not load children'));
  }, []);

  const fetchReport = useCallback(async () => {
    if (!selectedChildId) return;
    setLoading(true);
    setError(null);
    const parentId = getParentId();
    try {
      if (view === 'weekly') {
        const r = await axios.get(
          `${API}/parent/children/${selectedChildId}/reports/weekly`,
          { headers: getAuth(), params: parentId ? { parent_id: parentId } : {} }
        );
        setWeekly(r.data as WeeklyReport);
      } else {
        const r = await axios.get(
          `${API}/parent/children/${selectedChildId}/reports/monthly`,
          { headers: getAuth(), params: parentId ? { parent_id: parentId } : {} }
        );
        setMonthly(r.data as MonthlyReport);
      }
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Could not load report');
    } finally {
      setLoading(false);
    }
  }, [selectedChildId, view]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  const selectedChild = children.find(c => c.id === selectedChildId);
  const report = view === 'weekly' ? weekly : monthly;

  return (
    <div style={{ padding: '32px 0', maxWidth: 800, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.8rem', fontWeight: 700, color: 'var(--text)' }}>
            📋 {t('progress_reports', 'Progress Reports')}
          </h1>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)' }}>
            {t('reports_subtitle', 'Weekly and monthly summaries for your children')}
          </p>
        </div>
        <button
          onClick={fetchReport}
          disabled={loading}
          style={{ padding: '8px 18px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: '12px 16px', marginBottom: 20, color: '#991b1b' }}>
          {error}
        </div>
      )}

      {children.length === 0 && !error && (
        <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-muted)', background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: '3rem', marginBottom: 12 }}>👨‍👩‍👧</div>
          <p>{t('pages_parentreportspage.link_a_child_from_the_dashboard_to_see_t', 'Link a child from the Dashboard to see their reports.')}</p>
        </div>
      )}

      {children.length > 0 && (
        <>
          {/* Child selector */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
            {children.map(child => (
              <button
                key={child.id}
                onClick={() => setSelectedChildId(child.id)}
                style={{
                  padding: '6px 16px',
                  borderRadius: 20,
                  border: `2px solid ${selectedChildId === child.id ? 'var(--primary)' : 'var(--border)'}`,
                  background: selectedChildId === child.id ? 'var(--primary)' : 'var(--surface)',
                  color: selectedChildId === child.id ? '#fff' : 'var(--text)',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                }}
              >
                {child.full_name}
              </button>
            ))}
          </div>

          {/* Weekly / Monthly toggle */}
          <div style={{ display: 'flex', gap: 0, marginBottom: 28, border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', width: 'fit-content' }}>
            {(['weekly', 'monthly'] as const).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                style={{
                  padding: '9px 24px',
                  border: 'none',
                  background: view === v ? 'var(--primary)' : 'var(--surface)',
                  color: view === v ? '#fff' : 'var(--text-muted)',
                  fontWeight: view === v ? 700 : 400,
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  textTransform: 'capitalize',
                }}
              >
                {v === 'weekly' ? '📅 Weekly' : '📆 Monthly'}
              </button>
            ))}
          </div>

          {loading && (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Loading report…</div>
          )}

          {!loading && report && view === 'weekly' && weekly && (
            <>
              {/* Period */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 20px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: '1.2rem' }}>📅</span>
                <div>
                  <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: '1rem' }}>
                    {selectedChild?.full_name} — Weekly Report
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    {new Date(weekly.week_starting).toLocaleDateString()} – {new Date(weekly.week_ending).toLocaleDateString()}
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14, marginBottom: 28 }}>
                <StatCard icon="✅" label="Activities Completed" value={weekly.activities_completed} />
                <StatCard icon="⏱️" label="Total Hours" value={`${weekly.total_hours.toFixed(1)}h`} />
                <StatCard icon="🧠" label="New Competencies" value={weekly.new_competencies?.length ?? 0} />
                <StatCard icon="📊" label="Engagement" value={`${weekly.average_engagement}%`} sub={`Class avg: ${weekly.class_average}%`} />
              </div>

              {/* Engagement bar */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 22px', marginBottom: 20 }}>
                <h3 style={{ margin: '0 0 16px', color: 'var(--text)', fontSize: '1rem' }}>{t('pages_parentreportspage.engagement', 'Engagement')}</h3>
                <EngagementBar
                  value={weekly.average_engagement}
                  reference={weekly.class_average}
                  label={`${selectedChild?.full_name ?? 'Child'}`}
                />
              </div>

              {/* Highlights */}
              {(weekly.highlights?.length > 0 || weekly.new_competencies?.length > 0) && (
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, padding: '18px 22px', marginBottom: 16 }}>
                  <h3 style={{ margin: '0 0 12px', color: '#15803d', fontSize: '1rem' }}>{t('pages_parentreportspage.highlights', '🌟 Highlights')}</h3>
                  {weekly.new_competencies?.map((c, i) => (
                    <div key={i} style={{ fontSize: '0.88rem', color: '#166534', marginBottom: 6 }}>✓ New competency: {c}</div>
                  ))}
                  {weekly.highlights?.map((h, i) => (
                    <div key={i} style={{ fontSize: '0.88rem', color: '#166534', marginBottom: 6 }}>• {h}</div>
                  ))}
                </div>
              )}

              {/* Concerns */}
              {weekly.concerns?.length > 0 && (
                <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 12, padding: '18px 22px', marginBottom: 16 }}>
                  <h3 style={{ margin: '0 0 12px', color: '#c2410c', fontSize: '1rem' }}>{t('pages_parentreportspage.areas_to_watch', '⚠️ Areas to Watch')}</h3>
                  {weekly.concerns.map((c, i) => (
                    <div key={i} style={{ fontSize: '0.88rem', color: '#9a3412', marginBottom: 6 }}>• {c}</div>
                  ))}
                </div>
              )}

              {weekly.activities_completed === 0 && weekly.total_hours === 0 && (
                <div style={{ textAlign: 'center', padding: '32px 24px', color: 'var(--text-muted)', borderRadius: 12, border: '1px solid var(--border)' }}>
                  No activity this week. Check in with their teacher if unexpected.
                </div>
              )}
            </>
          )}

          {!loading && report && view === 'monthly' && monthly && (
            <>
              {/* Period */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 20px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: '1.2rem' }}>📆</span>
                <div>
                  <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: '1rem' }}>
                    {selectedChild?.full_name} — Monthly Report
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    {monthly.month} {monthly.year}
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14, marginBottom: 28 }}>
                <StatCard icon="✅" label="Activities Completed" value={monthly.activities_completed} />
                <StatCard icon="⏱️" label="Total Hours" value={`${monthly.total_hours.toFixed(1)}h`} />
                <StatCard icon="🏆" label="Competencies Achieved" value={monthly.competencies_achieved?.length ?? 0} />
                <StatCard icon="📈" label="Growth Areas" value={monthly.growth_areas?.length ?? 0} />
              </div>

              {/* Competencies */}
              {monthly.competencies_achieved?.length > 0 && (
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, padding: '18px 22px', marginBottom: 16 }}>
                  <h3 style={{ margin: '0 0 12px', color: '#15803d', fontSize: '1rem' }}>{t('pages_parentreportspage.competencies_achieved', '🏆 Competencies Achieved')}</h3>
                  {monthly.competencies_achieved.map((c, i) => (
                    <div key={i} style={{ fontSize: '0.88rem', color: '#166534', marginBottom: 6 }}>✓ {c}</div>
                  ))}
                </div>
              )}

              {/* Growth areas */}
              {monthly.growth_areas?.length > 0 && (
                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 12, padding: '18px 22px', marginBottom: 16 }}>
                  <h3 style={{ margin: '0 0 12px', color: '#1d4ed8', fontSize: '1rem' }}>{t('pages_parentreportspage.growth_areas', '📈 Growth Areas')}</h3>
                  {monthly.growth_areas.map((g, i) => (
                    <div key={i} style={{ fontSize: '0.88rem', color: '#1e40af', marginBottom: 6 }}>→ {g}</div>
                  ))}
                </div>
              )}

              {/* Recommendations */}
              {monthly.recommendations?.length > 0 && (
                <div style={{ background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: 12, padding: '18px 22px', marginBottom: 16 }}>
                  <h3 style={{ margin: '0 0 12px', color: '#7c3aed', fontSize: '1rem' }}>{t('pages_parentreportspage.teacher_recommendations', '💡 Teacher Recommendations')}</h3>
                  {monthly.recommendations.map((r, i) => (
                    <div key={i} style={{ fontSize: '0.88rem', color: '#6d28d9', marginBottom: 6 }}>• {r}</div>
                  ))}
                </div>
              )}

              {monthly.activities_completed === 0 && monthly.total_hours === 0 && (
                <div style={{ textAlign: 'center', padding: '32px 24px', color: 'var(--text-muted)', borderRadius: 12, border: '1px solid var(--border)' }}>
                  No data available for {monthly.month} {monthly.year} yet.
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
};

export default ParentReportsPage;
