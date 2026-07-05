// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import UpgradeCTA from '../../components/UpgradeCTA';

// ── Types ─────────────────────────────────────────────────────────────────

interface ActivityRef {
  activity_id: string;
  activity_title: string;
  subject: string;
  coverage_level: 'full' | 'partial';
  notes: string;
}

interface Criterion {
  id: string;
  code: string;
  subject: string;
  description: string;
  status: 'met' | 'partial' | 'not_met';
  activities: ActivityRef[];
}

interface StandardsSet {
  id: string;
  name: string;
  description: string;
  state_code: string;
  total_criteria: number;
  met: number;
  partial: number;
  not_met: number;
  criteria: Criterion[];
}

interface CoverageData {
  standards_sets: StandardsSet[];
  total_sessions: number;
  completed_sessions: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function authHeader() {
  const t = localStorage.getItem('auth_token');
  return t ? { Authorization: `Bearer ${t}` } : {};
}

const STATUS: Record<string, { bg: string; text: string; label: string; icon: string }> = {
  met:     { bg: '#dcfce7', text: '#15803d', label: 'Met',     icon: '✓' },
  partial: { bg: '#fef9c3', text: '#a16207', label: 'Partial', icon: '◑' },
  not_met: { bg: '#fee2e2', text: '#b91c1c', label: 'Not met', icon: '○' },
};

function ProgressBar({ met, partial, total }: { met: number; partial: number; total: number }) {
  const metPct     = total ? (met     / total) * 100 : 0;
  const partialPct = total ? (partial / total) * 100 : 0;
  return (
    <div style={{ height: 10, borderRadius: 6, background: 'var(--border)', overflow: 'hidden', display: 'flex' }}>
      <div style={{ width: `${metPct}%`,     background: '#22c55e', transition: 'width 0.4s' }} />
      <div style={{ width: `${partialPct}%`, background: '#facc15', transition: 'width 0.4s' }} />
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div>
      <div style={{ fontSize: '1.5rem', fontWeight: 800, color: accent ?? 'var(--text)', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────

export const HomeschoolCoveragePage: React.FC = () => {
  const { t } = useTranslation('landing');
  const navigate  = useNavigate();
  const [data, setData]       = useState<CoverageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [upgradeDetail, setUpgradeDetail] = useState<{ current_tier: string } | null>(null);

  useEffect(() => {
    fetch('/api/v1/homeschool/coverage', { headers: authHeader() })
      .then(async r => {
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          const detail = d.detail ?? d;
          if (r.status === 402 && detail?.code === 'UPGRADE_REQUIRED') {
            setUpgradeDetail({ current_tier: detail.current_tier ?? 'free' });
            window.dispatchEvent(new CustomEvent('upgrade-required', { detail }));
          }
          return null;
        }
        return r.json();
      })
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  const toggle = (key: string) => setExpanded(e => ({ ...e, [key]: !e[key] }));

  if (loading) return <p style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)', padding: 32 }}>{t('pages_homeschool_homeschoolcoveragepage.loading', 'Loading…')}</p>;

  if (upgradeDetail) {
    return (
      <div style={{ fontFamily: 'var(--font-body)', maxWidth: 820 }}>
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontFamily: 'var(--font-head)', marginBottom: 6 }}>{t('pages_homeschool_homeschoolcoveragepage.coverage_report', 'Coverage Report')}</h1>
        </div>
        <UpgradeCTA
          featureName="State Standards Compliance Report"
          requiredTier="homeschool_family"
          currentTier={upgradeDetail.current_tier}
        />
      </div>
    );
  }

  const sets = data?.standards_sets ?? [];

  return (
    <div style={{ fontFamily: 'var(--font-body)', maxWidth: 820 }}>

      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: 'var(--font-head)', marginBottom: 6 }}>{t('pages_homeschool_homeschoolcoveragepage.coverage_report', 'Coverage Report')}</h1>
        <p style={{ color: 'var(--text-muted)', margin: 0 }}>{t('pages_homeschool_homeschoolcoveragepage.which_state_requirements_have_your_child', 'Which state requirements have your children\'s activities covered this year?')}</p>
      </div>

      {/* Session summary */}
      {data && data.total_sessions > 0 && (
        <div style={{
          display: 'flex', gap: 24, marginBottom: 28, padding: '16px 20px',
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, flexWrap: 'wrap',
        }}>
          <Stat label="Total sessions"   value={data.total_sessions} />
          <Stat label="Completed"        value={data.completed_sessions}                         accent="#22c55e" />
          <Stat label="In progress"      value={data.total_sessions - data.completed_sessions}   accent="#f59e0b" />
        </div>
      )}

      {/* Empty state */}
      {sets.length === 0 && (
        <div style={{ textAlign: 'center', padding: '56px 0' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📈</div>
          <p style={{ color: 'var(--text-muted)', marginBottom: 20, maxWidth: 440, margin: '0 auto 20px' }}>{t('pages_homeschool_homeschoolcoveragepage.import_your_states_homeschool_reporting_', 'Import your state\'s homeschool reporting requirements to start tracking coverage.')}</p>
          <button onClick={() => navigate('/homeschool/requirements')}
            style={{ padding: '10px 24px', borderRadius: 8, background: 'var(--primary)', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
            Import State Requirements
          </button>
        </div>
      )}

      {/* One card per standards set */}
      {sets.map(set => {
        const pct = set.total_criteria
          ? Math.round(((set.met + set.partial * 0.5) / set.total_criteria) * 100)
          : 0;

        return (
          <div key={set.id} style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 14, marginBottom: 20, overflow: 'hidden',
          }}>
            {/* Set header */}
            <div style={{ padding: '20px 24px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>{set.name}</div>
                  {set.state_code && (
                    <span style={{
                      display: 'inline-block', marginTop: 4,
                      fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.05em',
                      background: '#dbeafe', color: '#1d4ed8', padding: '2px 8px', borderRadius: 20,
                    }}>{set.state_code}</span>
                  )}
                  {set.description && (
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: 6, marginBottom: 0 }}>
                      {set.description}
                    </p>
                  )}
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: '1.8rem', fontWeight: 800, lineHeight: 1 }}>{pct}%</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>covered</div>
                </div>
              </div>

              <ProgressBar met={set.met} partial={set.partial} total={set.total_criteria} />

              <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: '0.8rem' }}>
                <span style={{ color: '#15803d', fontWeight: 600 }}>✓ {set.met} met</span>
                <span style={{ color: '#a16207', fontWeight: 600 }}>◑ {set.partial} partial</span>
                <span style={{ color: '#9ca3af'             }}>○ {set.not_met} not yet covered</span>
              </div>
            </div>

            {/* Criteria rows */}
            <div style={{ borderTop: '1px solid var(--border)' }}>
              {set.criteria.map(c => {
                const st   = STATUS[c.status];
                const key  = `${set.id}-${c.id}`;
                const open = !!expanded[key];

                return (
                  <div key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <button
                      onClick={() => c.activities.length > 0 && toggle(key)}
                      style={{
                        width: '100%', textAlign: 'left', background: 'none', border: 'none',
                        padding: '13px 24px', display: 'flex', alignItems: 'center', gap: 12,
                        cursor: c.activities.length > 0 ? 'pointer' : 'default',
                      }}
                    >
                      <span style={{
                        flexShrink: 0, minWidth: 74, textAlign: 'center',
                        fontSize: '0.72rem', fontWeight: 700, padding: '3px 8px',
                        borderRadius: 20, background: st.bg, color: st.text,
                      }}>
                        {st.icon} {st.label}
                      </span>

                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{c.subject}</div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.77rem', marginTop: 2 }}>
                          {c.description}
                        </div>
                      </div>

                      {c.activities.length > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                          <span style={{ fontSize: '0.77rem', color: 'var(--text-muted)' }}>
                            {c.activities.length} {c.activities.length === 1 ? 'activity' : 'activities'}
                          </span>
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                            {open ? '▲' : '▼'}
                          </span>
                        </div>
                      )}
                    </button>

                    {open && c.activities.length > 0 && (
                      <div style={{ padding: '0 24px 14px 116px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {c.activities.map(a => (
                          <div key={a.activity_id} style={{
                            display: 'flex', alignItems: 'flex-start', gap: 10,
                            padding: '8px 12px', borderRadius: 8,
                            background: a.coverage_level === 'full' ? '#f0fdf4' : '#fefce8',
                            border: `1px solid ${a.coverage_level === 'full' ? '#bbf7d0' : '#fef08a'}`,
                          }}>
                            <span style={{
                              flexShrink: 0, fontSize: '0.7rem', fontWeight: 700, marginTop: 2,
                              color: a.coverage_level === 'full' ? '#15803d' : '#a16207',
                            }}>
                              {a.coverage_level === 'full' ? 'FULL' : 'PART'}
                            </span>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{a.activity_title}</div>
                              {a.notes && (
                                <div style={{ fontSize: '0.77rem', color: 'var(--text-muted)', marginTop: 2 }}>
                                  {a.notes}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {sets.length > 0 && (
        <p style={{ fontSize: '0.77rem', color: 'var(--text-muted)', marginTop: 4 }}>
          ✓ <strong>Met</strong> — at least one activity fully covers this requirement &nbsp;·&nbsp;
          ◑ <strong>Partial</strong> — activities partially address it &nbsp;·&nbsp;
          ○ <strong>Not met</strong> — no activities mapped yet
        </p>
      )}
    </div>
  );
};

export default HomeschoolCoveragePage;
