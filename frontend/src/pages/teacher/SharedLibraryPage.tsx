// Copyright (c) 2026 Paul Christopher Cerda
// Business Source License 1.1

import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Globe, Building2, Copy, Eye, ChevronDown } from 'lucide-react';
import apiClient from '@/config/api';
import { getErrorMessage } from '@/utils/errorMessage';
import { useTranslation } from 'react-i18next';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SharedActivity {
  id: string;
  title: string;
  description: string;
  subject: string;
  grade_level: number;
  difficulty_level: number;
  estimated_duration_minutes: number;
  activity_type: string;
  bloom_level: number;
  location_name: string;
  share_scope: 'org' | 'all';
  language: string | null;
  state_standard: string | null;
  discipline: string | null;
  author_name: string | null;
  author_org: string | null;
  created_at: string;
}

const BLOOM_LABELS: Record<number, string> = {
  1: 'Remember', 2: 'Understand', 3: 'Apply',
  4: 'Analyze', 5: 'Evaluate', 6: 'Create',
};

const ACTIVITY_ICONS: Record<string, string> = {
  inquiry: '🔬', discussion: '💬', hands_on: '🖐',
  virtual: '💻', hybrid: '🔀', outdoor: '🌿',
  field_study: '🌿', lab: '⚗️', project: '📂', discovery: '🗺️',
};

// ── Component ─────────────────────────────────────────────────────────────────

const SharedLibraryPage: React.FC = () => {
  const { t } = useTranslation('landing');
  const navigate = useNavigate();

  // Filters
  const [scope, setScope] = useState<'' | 'org' | 'all'>('');
  const [search, setSearch] = useState('');
  const [subject, setSubject] = useState('');
  const [gradeLevel, setGradeLevel] = useState('');
  const [language, setLanguage] = useState('');
  const [stateStandard, setStateStandard] = useState('');
  const [discipline, setDiscipline] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Data
  const [activities, setActivities] = useState<SharedActivity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copying, setCopying] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchLibrary = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params: Record<string, string> = {};
      if (scope) params.scope = scope;
      if (search) params.search = search;
      if (subject) params.subject = subject;
      if (gradeLevel) params.grade_level = gradeLevel;
      if (language) params.language = language;
      if (stateStandard) params.state_standard = stateStandard;
      if (discipline) params.discipline = discipline;

      const { data } = await apiClient.get('/activities/shared-library', { params });
      // Guard: only an array is renderable; an error object/string here would crash the list.
      setActivities(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(getErrorMessage(e, 'Failed to load shared library.'));
    } finally {
      setLoading(false);
    }
  }, [scope, search, subject, gradeLevel, language, stateStandard, discipline]);

  useEffect(() => {
    fetchLibrary();
  }, [fetchLibrary]);

  const handleCopy = async (id: string) => {
    setCopying(id);
    try {
      await apiClient.post(`/activities/${id}/copy`);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 3000);
    } catch (e: any) {
      alert(getErrorMessage(e, 'Copy failed.'));
    } finally {
      setCopying(null);
    }
  };

  const clearFilters = () => {
    setScope(''); setSearch(''); setSubject('');
    setGradeLevel(''); setLanguage(''); setStateStandard(''); setDiscipline('');
  };

  const hasActiveFilters = !!(scope || subject || gradeLevel || language || stateStandard || discipline);

  return (
    <div style={{ maxWidth: 900 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'var(--font-head)', fontSize: '1.6rem', fontWeight: 800, marginBottom: 6 }}>{t('pages_teacher_sharedlibrarypage.shared_activity_library', '🌐 Shared Activity Library')}</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{t('pages_teacher_sharedlibrarypage.browse_activities_shared_by_teachers_acr', 'Browse activities shared by teachers across your organisation and globally. Copy any to your own library.')}</p>
      </div>

      {/* Search + scope toggle row */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
          <Search size={15} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder={t('pages_teacher_sharedlibrarypage.placeholder_search_title_description_location', 'Search title, description, location…')}
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%', padding: '8px 12px 8px 32px', borderRadius: 8,
              border: '1px solid var(--border)', background: 'var(--surface)',
              fontSize: '0.88rem', boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Scope toggle */}
        <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          {(['', 'org', 'all'] as const).map((s) => (
            <button
              key={s || 'both'}
              onClick={() => setScope(s)}
              style={{
                padding: '7px 14px', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
                border: 'none', display: 'flex', alignItems: 'center', gap: 5,
                background: scope === s ? 'var(--primary)' : 'var(--surface)',
                color: scope === s ? 'white' : 'var(--text-muted)',
              }}
            >
              {s === '' ? '🌐 All' : s === 'org' ? <><Building2 size={13} /> My Org</> : <><Globe size={13} /> Global</>}
            </button>
          ))}
        </div>

        {/* More filters toggle */}
        <button
          onClick={() => setShowFilters(f => !f)}
          style={{
            padding: '7px 14px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 600,
            border: `1px solid ${hasActiveFilters ? 'var(--primary)' : 'var(--border)'}`,
            background: hasActiveFilters ? 'var(--primary-muted, #e8f5e9)' : 'var(--surface)',
            color: hasActiveFilters ? 'var(--primary)' : 'var(--text-muted)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
          }}
        >
          Filters {hasActiveFilters && '•'} <ChevronDown size={13} style={{ transform: showFilters ? 'rotate(180deg)' : 'none' }} />
        </button>

        {hasActiveFilters && (
          <button onClick={clearFilters}
            style={{ fontSize: '0.8rem', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>{t('pages_teacher_sharedlibrarypage.clear', 'Clear')}</button>
        )}
      </div>

      {/* Expanded filters */}
      {showFilters && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
          gap: 10, marginBottom: 16, padding: 14,
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
        }}>
          <div>
            <label style={{ fontSize: '0.73rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t('pages_teacher_sharedlibrarypage.subject', 'Subject')}</label>
            <input value={subject} onChange={e => setSubject(e.target.value)} placeholder={t('pages_teacher_sharedlibrarypage.placeholder_eg_science', 'e.g. Science')}
              style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: '0.84rem', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize: '0.73rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t('pages_teacher_sharedlibrarypage.grade_level', 'Grade level')}</label>
            <select value={gradeLevel} onChange={e => setGradeLevel(e.target.value)}
              style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: '0.84rem' }}>
              <option value="">{t('pages_teacher_sharedlibrarypage.any', 'Any')}</option>
              {Array.from({ length: 10 }, (_, i) => i + 3).map(g => (
                <option key={g} value={g}>Grade {g}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ fontSize: '0.73rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t('pages_teacher_sharedlibrarypage.language', 'Language')}</label>
            <input value={language} onChange={e => setLanguage(e.target.value)} placeholder={t('pages_teacher_sharedlibrarypage.placeholder_eg_english', 'e.g. English')}
              style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: '0.84rem', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize: '0.73rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t('pages_teacher_sharedlibrarypage.state_standard', 'State standard')}</label>
            <select value={stateStandard} onChange={e => setStateStandard(e.target.value)}
              style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: '0.84rem' }}>
              <option value="">{t('pages_teacher_sharedlibrarypage.any', 'Any')}</option>
              {['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
                'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
                'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'].map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ fontSize: '0.73rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t('pages_teacher_sharedlibrarypage.discipline', 'Discipline')}</label>
            <select value={discipline} onChange={e => setDiscipline(e.target.value)}
              style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: '0.84rem' }}>
              <option value="">{t('pages_teacher_sharedlibrarypage.any', 'Any')}</option>
              {['STEM','Humanities','Arts','Social Studies','Physical Education','Foreign Language','Computer Science','Career & Technical'].map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-muted)' }}>{t('pages_teacher_sharedlibrarypage.loading', 'Loading…')}</div>
      )}

      {/* Error */}
      {!loading && error && (
        <div style={{ padding: 16, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, color: '#991b1b', fontSize: '0.88rem' }}>
          {error}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && activities.length === 0 && (
        <div style={{
          textAlign: 'center', padding: '56px 20px',
          background: 'var(--surface)', borderRadius: 14,
          border: '1px dashed var(--border)',
        }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📚</div>
          <p style={{ color: 'var(--text-muted)', marginBottom: 8 }}>{t('pages_teacher_sharedlibrarypage.no_shared_activities_found', 'No shared activities found.')}</p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>{t('pages_teacher_sharedlibrarypage.try_adjusting_your_filters_or_publish_an', 'Try adjusting your filters, or publish and share one of your own activities.')}</p>
        </div>
      )}

      {/* Activity list */}
      {!loading && !error && activities.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {activities.map(activity => (
            <div
              key={activity.id}
              style={{
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 12, padding: '18px 22px',
                display: 'flex', alignItems: 'flex-start', gap: 16,
              }}
            >
              {/* Icon */}
              <div style={{
                fontSize: '1.4rem', flexShrink: 0,
                width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--primary-muted, #e8f5e9)', borderRadius: 10,
              }}>
                {ACTIVITY_ICONS[activity.activity_type] ?? '📋'}
              </div>

              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                {/* Title row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                  <span style={{ fontWeight: 700, fontSize: '1rem' }}>{activity.title}</span>

                  {/* Scope badge */}
                  <span style={{
                    fontSize: '0.68rem', fontWeight: 700, padding: '2px 7px', borderRadius: 20,
                    background: activity.share_scope === 'all' ? '#dbeafe' : '#f0fdf4',
                    color: activity.share_scope === 'all' ? '#1d4ed8' : '#16a34a',
                    display: 'flex', alignItems: 'center', gap: 3,
                  }}>
                    {activity.share_scope === 'all' ? <><Globe size={9} /> Global</> : <><Building2 size={9} /> Org</>}
                  </span>

                  {activity.subject && (
                    <span style={{ fontSize: '0.72rem', fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: '#ede9fe', color: '#7c3aed' }}>
                      {activity.subject}
                    </span>
                  )}
                  <span style={{ fontSize: '0.72rem', fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: '#f3e8ff', color: '#7c3aed' }}>
                    Grade {activity.grade_level}
                  </span>
                </div>

                {/* Description */}
                <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', marginBottom: 6, lineHeight: 1.45 }}>
                  {activity.description.slice(0, 160)}{activity.description.length > 160 ? '…' : ''}
                </p>

                {/* Meta row */}
                <div style={{ display: 'flex', gap: 14, fontSize: '0.77rem', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                  {activity.location_name && <span>📍 {activity.location_name}</span>}
                  <span>⏱ {activity.estimated_duration_minutes} min</span>
                  <span>🧠 {BLOOM_LABELS[activity.bloom_level] ?? `Level ${activity.bloom_level}`}</span>
                  {activity.language && <span>🌍 {activity.language}</span>}
                  {activity.state_standard && <span>📋 {activity.state_standard}</span>}
                  {activity.discipline && <span>🎓 {activity.discipline}</span>}
                  {activity.author_name && (
                    <span>👤 {activity.author_name}{activity.author_org ? ` · ${activity.author_org}` : ''}</span>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
                <button
                  onClick={() => navigate(`/teacher/activities/${activity.id}`)}
                  style={{
                    padding: '7px 14px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 600,
                    background: 'transparent', color: 'var(--primary)',
                    border: '1px solid var(--primary)', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 5,
                  }}
                >
                  <Eye size={13} /> View
                </button>
                <button
                  onClick={() => handleCopy(activity.id)}
                  disabled={copying === activity.id}
                  style={{
                    padding: '7px 14px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 600,
                    background: copiedId === activity.id ? '#16a34a' : 'var(--primary)',
                    color: 'white', border: 'none', cursor: copying === activity.id ? 'wait' : 'pointer',
                    display: 'flex', alignItems: 'center', gap: 5, opacity: copying === activity.id ? 0.7 : 1,
                  }}
                >
                  <Copy size={13} />
                  {copiedId === activity.id ? 'Copied!' : copying === activity.id ? '…' : 'Copy'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <p style={{ fontSize: '0.77rem', color: 'var(--text-muted)', marginTop: 20 }}>
        {activities.length} {activities.length === 1 ? 'activity' : 'activities'} found
      </p>
    </div>
  );
};

export default SharedLibraryPage;
