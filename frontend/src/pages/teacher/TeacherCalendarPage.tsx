// Copyright (c) 2026 Paul Christopher Cerda
// Business Source License 1.1

/**
 * TeacherCalendarPage — /teacher/calendar
 *
 * The teacher-side counterpart to ParentCalendarPage: pick a classroom, see
 * every student's planned/completed activity dates on one calendar, plus any
 * explicit classroom events (deadlines, field trips, holidays) the teacher
 * has created. Uses the same shared MonthCalendar component so rendering is
 * locale-correct (CLDR/ICU via Intl) everywhere it's used.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, X } from 'lucide-react';
import apiClient from '@/config/api';
import { getErrorMessage } from '@/utils/errorMessage';
import MonthCalendar, { CalendarEvent } from '@/components/calendar/MonthCalendar';

interface Classroom { id: string; name: string; }

const EVENT_TYPES = ['event', 'deadline', 'field_trip', 'holiday'] as const;

const TeacherCalendarPage: React.FC = () => {
  const { t, i18n } = useTranslation('landing');
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [classroomId, setClassroomId] = useState('');
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<{ start: string; end: string } | null>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventType, setEventType] = useState<typeof EVENT_TYPES[number]>('event');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    apiClient.get('/classrooms')
      .then(r => {
        const list = Array.isArray(r.data) ? r.data : [];
        setClassrooms(list);
        if (list.length) setClassroomId(list[0].id);
      })
      .catch(e => setError(getErrorMessage(e, 'Could not load classrooms')));
  }, []);

  const fetchEvents = useCallback(async () => {
    if (!classroomId) return;
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = { classroom_id: classroomId };
      if (range) { params.start = range.start; params.end = range.end; }
      const r = await apiClient.get('/calendar/events', { params });
      setEvents(Array.isArray(r.data) ? r.data : []);
    } catch (e: any) {
      setError(getErrorMessage(e, 'Could not load calendar'));
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [classroomId, range]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  const addEvent = async () => {
    if (!title.trim() || !eventDate) {
      setSaveError('Please give the event a title and a date.');
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await apiClient.post('/calendar/events', {
        classroom_id: classroomId,
        title: title.trim(),
        description: description.trim() || undefined,
        event_date: eventDate,
        event_type: eventType,
      });
      setTitle(''); setDescription(''); setEventDate(''); setEventType('event');
      setShowAdd(false);
      fetchEvents();
    } catch (e: any) {
      setSaveError(getErrorMessage(e, 'Could not create event'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '2rem 1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>{t('pages_teacher_teachercalendarpage.title', 'Calendar')}</h1>
          <p style={{ color: 'var(--text-muted)', marginTop: 4, fontSize: '0.9rem' }}>
            {t('pages_teacher_teachercalendarpage.subtitle', 'Planned and completed activities for your class, plus any events you add.')}
          </p>
        </div>
        <button onClick={() => setShowAdd(s => !s)}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.6rem 1.2rem', borderRadius: 8, background: 'var(--primary)', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer' }}>
          {showAdd ? <><X size={16} /> Cancel</> : <><Plus size={16} /> Add Event</>}
        </button>
      </div>

      {classrooms.length > 1 && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
          {classrooms.map(c => (
            <button key={c.id} onClick={() => setClassroomId(c.id)}
              style={{
                padding: '6px 16px', borderRadius: 20,
                border: `2px solid ${classroomId === c.id ? 'var(--primary)' : 'var(--border)'}`,
                background: classroomId === c.id ? 'var(--primary)' : 'var(--surface)',
                color: classroomId === c.id ? '#fff' : 'var(--text)', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem',
              }}>
              {c.name}
            </button>
          ))}
        </div>
      )}

      {showAdd && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '1.25rem', marginBottom: 24 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>Title</label>
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. River study field trip"
                style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>Date</label>
              <input type="date" value={eventDate} onChange={e => setEventDate(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>Type</label>
              <select value={eventType} onChange={e => setEventType(e.target.value as any)}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)' }}>
                {EVENT_TYPES.map(tp => <option key={tp} value={tp}>{tp.replace('_', ' ')}</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>Description (optional)</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }} />
          </div>
          {saveError && <div style={{ background: '#fee2e2', color: '#b91c1c', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: '0.85rem' }}>{saveError}</div>}
          <button onClick={addEvent} disabled={saving}
            style={{ padding: '0.5rem 1.2rem', borderRadius: 8, background: 'var(--primary)', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving…' : 'Save Event'}
          </button>
        </div>
      )}

      {error && <div style={{ background: '#fee2e2', color: '#b91c1c', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>{error}</div>}

      {classroomId && (
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

export default TeacherCalendarPage;
