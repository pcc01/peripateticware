// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

/**
 * ParentCalendarPage
 * Route: /parent/calendar
 * Shows a week-view calendar of child activities (planned / completed / missed).
 * Uses: GET /api/v1/parent/children  and  GET /api/v1/parent/children/:id/activities
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';

const API = '/api/v1';
const getAuth = () => {
  const token = localStorage.getItem('auth_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

interface Child { id: string; full_name: string; verified?: boolean }
interface Activity {
  id: string;
  title: string;
  description?: string;
  subject?: string;
  due_date?: string;
  status?: string;
  location?: string;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function activityStatusColor(status?: string): string {
  switch ((status || '').toLowerCase()) {
    case 'completed': return '#d1fae5';
    case 'in_progress': return '#dbeafe';
    case 'missed': return '#fee2e2';
    default: return '#f3f4f6'; // planned / draft
  }
}

function activityStatusText(status?: string): string {
  switch ((status || '').toLowerCase()) {
    case 'completed': return '✅ Completed';
    case 'in_progress': return '🔵 In Progress';
    case 'missed': return '❌ Missed';
    default: return '📅 Planned';
  }
}

const ParentCalendarPage: React.FC = () => {
  const { t } = useTranslation('landing');
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch children on mount
  useEffect(() => {
    axios.get(`${API}/parent/children`, { headers: getAuth() })
      .then(r => {
        const list: Child[] = Array.isArray(r.data) ? r.data : [];
        setChildren(list);
        if (list.length > 0) setSelectedChildId(list[0].id);
      })
      .catch(e => setError(e?.response?.data?.detail || 'Could not load children'));
  }, []);

  // Fetch activities when child or week changes
  const fetchActivities = useCallback(async () => {
    if (!selectedChildId) return;
    setLoading(true);
    setError(null);
    try {
      const r = await axios.get(`${API}/parent/children/${selectedChildId}/activities`, {
        headers: getAuth(),
      });
      const data = Array.isArray(r.data) ? r.data : [];
      setActivities(data);
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Could not load activities');
      setActivities([]);
    } finally {
      setLoading(false);
    }
  }, [selectedChildId]);

  useEffect(() => { fetchActivities(); }, [fetchActivities]);

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  // Group activities by day
  function activitiesForDay(day: Date): Activity[] {
    return activities.filter(a => {
      if (!a.due_date) return false;
      try {
        return isSameDay(new Date(a.due_date), day);
      } catch { return false; }
    });
  }

  // Activities with no date — show in sidebar
  const undatedActivities = activities.filter(a => !a.due_date);

  const today = new Date();
  const weekLabel = `${MONTHS[weekStart.getMonth()]} ${weekStart.getDate()} – ${MONTHS[addDays(weekStart, 6).getMonth()]} ${addDays(weekStart, 6).getDate()}, ${addDays(weekStart, 6).getFullYear()}`;

  return (
    <div style={{ padding: '32px 0', maxWidth: 960, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.8rem', fontWeight: 700, color: 'var(--text)' }}>
            {t('calendar', 'Calendar')}
          </h1>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)' }}>
            {t('activity_schedule', 'Activity schedule for your children')}
          </p>
        </div>
        <button
          onClick={fetchActivities}
          disabled={loading}
          style={{
            padding: '8px 18px',
            background: 'var(--primary)',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: '12px 16px', marginBottom: 20, color: '#991b1b' }}>
          {error}
        </div>
      )}

      {/* Child selector */}
      {children.length > 0 && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
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
              {!child.verified && <span style={{ fontSize: '0.7rem', marginLeft: 6, opacity: 0.7 }}>(pending)</span>}
            </button>
          ))}
        </div>
      )}

      {children.length === 0 && !error && (
        <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '3rem', marginBottom: 12 }}>👨‍👩‍👧</div>
          <p>{t('pages_parentcalendarpage.link_a_child_from_the_dashboard_to_see_t', 'Link a child from the Dashboard to see their calendar.')}</p>
        </div>
      )}

      {selectedChildId && (
        <>
          {/* Week navigation */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
            <button
              onClick={() => setWeekStart(w => addDays(w, -7))}
              style={{ padding: '6px 14px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', cursor: 'pointer' }}
            >
              ‹ Prev
            </button>
            <span style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text)', minWidth: 280, textAlign: 'center' }}>
              {weekLabel}
            </span>
            <button
              onClick={() => setWeekStart(w => addDays(w, 7))}
              style={{ padding: '6px 14px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', cursor: 'pointer' }}
            >
              Next ›
            </button>
            <button
              onClick={() => setWeekStart(startOfWeek(new Date()))}
              style={{ padding: '6px 14px', border: '1px solid var(--primary)', borderRadius: 8, background: 'none', color: 'var(--primary)', cursor: 'pointer', fontWeight: 600 }}
            >
              Today
            </button>
          </div>

          {/* Week grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8, marginBottom: 28 }}>
            {weekDays.map((day, i) => {
              const dayActivities = activitiesForDay(day);
              const isToday = isSameDay(day, today);
              return (
                <div
                  key={i}
                  style={{
                    background: isToday ? '#eff6ff' : 'var(--surface)',
                    border: `1px solid ${isToday ? '#93c5fd' : 'var(--border)'}`,
                    borderRadius: 10,
                    padding: '10px 8px',
                    minHeight: 120,
                  }}
                >
                  <div style={{ textAlign: 'center', marginBottom: 8 }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                      {DAYS[i]}
                    </div>
                    <div style={{
                      fontSize: '1.1rem',
                      fontWeight: 700,
                      color: isToday ? 'var(--primary)' : 'var(--text)',
                      width: 30,
                      height: 30,
                      borderRadius: '50%',
                      background: isToday ? '#dbeafe' : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '2px auto 0',
                    }}>
                      {day.getDate()}
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {dayActivities.map(act => (
                      <div
                        key={act.id}
                        title={`${act.title}\n${activityStatusText(act.status)}`}
                        style={{
                          background: activityStatusColor(act.status),
                          borderRadius: 6,
                          padding: '4px 6px',
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          color: '#1f2937',
                          overflow: 'hidden',
                          whiteSpace: 'nowrap',
                          textOverflow: 'ellipsis',
                          cursor: 'default',
                        }}
                      >
                        {act.title}
                      </div>
                    ))}
                    {dayActivities.length === 0 && (
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-faint)', textAlign: 'center', marginTop: 4 }}>—</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', gap: 16, marginBottom: 28, flexWrap: 'wrap' }}>
            {[
              { label: 'Planned', color: '#f3f4f6' },
              { label: 'In Progress', color: '#dbeafe' },
              { label: 'Completed', color: '#d1fae5' },
              { label: 'Missed', color: '#fee2e2' },
            ].map(({ label, color }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                <div style={{ width: 14, height: 14, borderRadius: 3, background: color, border: '1px solid #e5e7eb' }} />
                {label}
              </div>
            ))}
          </div>

          {/* Activities without a date */}
          {undatedActivities.length > 0 && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 24px' }}>
              <h3 style={{ margin: '0 0 14px', color: 'var(--text)', fontSize: '1rem' }}>
                📋 Activities — No Date Assigned ({undatedActivities.length})
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {undatedActivities.map(act => (
                  <div
                    key={act.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '10px 14px',
                      background: activityStatusColor(act.status),
                      borderRadius: 8,
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#1f2937' }}>{act.title}</div>
                      {act.subject && <div style={{ fontSize: '0.78rem', color: '#6b7280', marginTop: 2 }}>{act.subject}</div>}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#6b7280', whiteSpace: 'nowrap' }}>
                      {activityStatusText(act.status)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activities.length === 0 && !loading && (
            <div style={{ textAlign: 'center', padding: '40px 24px', color: 'var(--text-muted)', background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>🗓️</div>
              <p style={{ margin: 0 }}>{t('pages_parentcalendarpage.no_activities_found_for_this_child', 'No activities found for this child.')}</p>
              <p style={{ margin: '8px 0 0', fontSize: '0.85rem' }}>{t('pages_parentcalendarpage.activities_assigned_by_teachers_will_app', 'Activities assigned by teachers will appear here.')}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ParentCalendarPage;
