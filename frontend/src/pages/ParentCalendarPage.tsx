// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

/**
 * ParentCalendarPage
 * Route: /parent/calendar
 *
 * Previously filtered activities by `due_date`/`status` fields the backend
 * never actually returned (see GET /parent/children/:id/activities in
 * routes/parent.py — ActivityResponse has no due_date), so the calendar grid
 * was always empty regardless of how much a child had done. Now uses the
 * real, role-aware GET /api/v1/calendar/events endpoint and a shared,
 * locale-correct (CLDR/ICU via Intl) month calendar component.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import MonthCalendar, { CalendarEvent } from '@/components/calendar/MonthCalendar';
import { getErrorMessage } from '@/utils/errorMessage';

const API = '/api/v1';
const getAuth = () => {
  const token = localStorage.getItem('auth_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

interface Child { id: string; full_name: string; verified?: boolean }

const ParentCalendarPage: React.FC = () => {
  const { t, i18n } = useTranslation('landing');
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<{ start: string; end: string } | null>(null);

  useEffect(() => {
    axios.get(`${API}/parent/children`, { headers: getAuth() })
      .then(r => {
        const list: Child[] = Array.isArray(r.data) ? r.data : [];
        setChildren(list);
        if (list.length > 0) setSelectedChildId(list[0].id);
      })
      .catch(e => setError(getErrorMessage(e, 'Could not load children')));
  }, []);

  const fetchEvents = useCallback(async () => {
    if (!selectedChildId) return;
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = { child_id: selectedChildId };
      if (range) { params.start = range.start; params.end = range.end; }
      const r = await axios.get(`${API}/calendar/events`, { headers: getAuth(), params });
      setEvents(Array.isArray(r.data) ? r.data : []);
    } catch (e: any) {
      setError(getErrorMessage(e, 'Could not load calendar'));
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [selectedChildId, range]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  return (
    <div style={{ padding: '32px 0', maxWidth: 960, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.8rem', fontWeight: 700, color: 'var(--text)' }}>
            {t('calendar', 'Calendar')}
          </h1>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)' }}>
            {t('activity_schedule', 'Activity schedule for your children')}
          </p>
        </div>
        <button onClick={fetchEvents} disabled={loading}
          style={{ padding: '8px 18px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
          {loading ? t('pages_parentcalendarpage.loading', 'Loading…') : t('pages_parentcalendarpage.refresh', 'Refresh')}
        </button>
      </div>

      {error && (
        <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: '12px 16px', marginBottom: 20, color: '#991b1b' }}>
          {error}
        </div>
      )}

      {children.length > 0 && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
          {children.map(child => (
            <button
              key={child.id}
              onClick={() => setSelectedChildId(child.id)}
              style={{
                padding: '6px 16px', borderRadius: 20,
                border: `2px solid ${selectedChildId === child.id ? 'var(--primary)' : 'var(--border)'}`,
                background: selectedChildId === child.id ? 'var(--primary)' : 'var(--surface)',
                color: selectedChildId === child.id ? '#fff' : 'var(--text)', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem',
              }}
            >
              {child.full_name}
              {!child.verified && <span style={{ fontSize: '0.7rem', marginLeft: 6, opacity: 0.7 }}>{t('pages_parentcalendarpage.pending', '(pending)')}</span>}
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
        <MonthCalendar
          events={events}
          locale={i18n.language || 'en'}
          legendTypes={['planned', 'completed', 'event', 'deadline', 'field_trip', 'holiday']}
          onMonthChange={(m) => {
            const start = new Date(m.getFullYear(), m.getMonth() - 1, 1);
            const end = new Date(m.getFullYear(), m.getMonth() + 2, 0);
            setRange({ start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) });
          }}
        />
      )}
    </div>
  );
};

export default ParentCalendarPage;
