// Copyright (c) 2026 Paul Christopher Cerda
// Business Source License 1.1

/**
 * StudentCalendarPage — /student/calendar
 * A student's own planned/completed activities, plus any classroom events
 * their teacher has posted. Uses GET /api/v1/calendar/events with no
 * child_id/classroom_id (the backend resolves "self" from the JWT for the
 * STUDENT role) and the same shared, locale-correct MonthCalendar used by
 * the parent and teacher calendars.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import apiClient from '@/config/api';
import { getErrorMessage } from '@/utils/errorMessage';
import MonthCalendar, { CalendarEvent } from '@/components/calendar/MonthCalendar';

const StudentCalendarPage: React.FC = () => {
  const { t, i18n } = useTranslation('landing');
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<{ start: string; end: string } | null>(null);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {};
      if (range) { params.start = range.start; params.end = range.end; }
      const r = await apiClient.get('/calendar/events', { params });
      setEvents(Array.isArray(r.data) ? r.data : []);
    } catch (e: any) {
      setError(getErrorMessage(e, 'Could not load calendar'));
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '2rem 1.5rem' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>{t('calendar', 'Calendar')}</h1>
        <p style={{ color: 'var(--text-muted)', marginTop: 4, fontSize: '0.9rem' }}>
          {t('pages_student_studentcalendarpage.subtitle', 'Your planned and completed activities, and anything your teacher has scheduled.')}
        </p>
      </div>

      {error && <div style={{ background: '#fee2e2', color: '#b91c1c', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>{error}</div>}
      {loading && <p style={{ color: 'var(--text-muted)' }}>{t('pages_parentcalendarpage.loading', 'Loading…')}</p>}

      <MonthCalendar
        events={events}
        locale={i18n.language || 'en'}
        onMonthChange={(m) => {
          const start = new Date(m.getFullYear(), m.getMonth() - 1, 1);
          const end = new Date(m.getFullYear(), m.getMonth() + 2, 0);
          setRange({ start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) });
        }}
      />
    </div>
  );
};

export default StudentCalendarPage;
