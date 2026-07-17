// Copyright (c) 2026 Paul Christopher Cerda
// Business Source License 1.1

/**
 * HomeschoolCalendarPage — /homeschool/calendar
 * Same idea as ParentCalendarPage, but the child list comes from
 * GET /api/v1/homeschool/children (owned child accounts) instead of
 * /parent/children (linked-by-invite children). The shared
 * GET /api/v1/calendar/events endpoint already accepts either relationship
 * for the HOMESCHOOL role (it checks both parent_child_links and
 * homeschool_children).
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import apiClient from '@/config/api';
import { getErrorMessage } from '@/utils/errorMessage';
import MonthCalendar, { CalendarEvent } from '@/components/calendar/MonthCalendar';

interface Child { id: string; full_name: string; }

const HomeschoolCalendarPage: React.FC = () => {
  const { t, i18n } = useTranslation('landing');
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<{ start: string; end: string } | null>(null);

  useEffect(() => {
    apiClient.get('/homeschool/children')
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
      const r = await apiClient.get('/calendar/events', { params });
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
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '2rem 1.5rem' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>{t('calendar', 'Calendar')}</h1>
        <p style={{ color: 'var(--text-muted)', marginTop: 4, fontSize: '0.9rem' }}>
          {t('activity_schedule', 'Activity schedule for your children')}
        </p>
      </div>

      {error && <div style={{ background: '#fee2e2', color: '#b91c1c', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>{error}</div>}

      {children.length > 0 && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
          {children.map(child => (
            <button key={child.id} onClick={() => setSelectedChildId(child.id)}
              style={{
                padding: '6px 16px', borderRadius: 20,
                border: `2px solid ${selectedChildId === child.id ? 'var(--primary)' : 'var(--border)'}`,
                background: selectedChildId === child.id ? 'var(--primary)' : 'var(--surface)',
                color: selectedChildId === child.id ? '#fff' : 'var(--text)', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem',
              }}>
              {child.full_name}
            </button>
          ))}
        </div>
      )}

      {children.length === 0 && !error && (
        <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '3rem', marginBottom: 12 }}>👧</div>
          <p>{t('pages_homeschool_homeschoolcalendarpage.add_a_child_to_see_their_calendar', 'Add a child from "Children" to see their calendar.')}</p>
        </div>
      )}

      {selectedChildId && (
        <MonthCalendar
          events={events}
          locale={i18n.language || 'en'}
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

export default HomeschoolCalendarPage;
