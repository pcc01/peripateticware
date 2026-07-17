// Copyright (c) 2026 Paul Christopher Cerda
// Business Source License 1.1

/**
 * MonthCalendar — locale-aware (CLDR/ICU via Intl) month-grid calendar.
 * Shared by parent, teacher, student, and homeschool calendar pages so the
 * same correct-per-locale rendering (weekday names, first day of week,
 * month/year title, RTL) lives in exactly one place.
 */

import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  buildMonthGrid, getWeekdayLabels, getMonthLabel, isRTL, isSameDay, toISODate, addMonths,
} from './localeCalendar';

export interface CalendarEvent {
  id: string;
  title: string;
  date: string; // ISO YYYY-MM-DD
  type: 'planned' | 'completed' | 'event' | 'deadline' | 'field_trip' | 'holiday';
  subject?: string;
  description?: string;
  student_name?: string;
}

const TYPE_COLOR: Record<CalendarEvent['type'], string> = {
  planned: '#f3f4f6',
  completed: '#d1fae5',
  event: '#dbeafe',
  deadline: '#fee2e2',
  field_trip: '#fef3c7',
  holiday: '#ede9fe',
};

const TYPE_DOT: Record<CalendarEvent['type'], string> = {
  planned: '#9ca3af',
  completed: '#10b981',
  event: '#3b82f6',
  deadline: '#ef4444',
  field_trip: '#f59e0b',
  holiday: '#8b5cf6',
};

interface Props {
  events: CalendarEvent[];
  locale: string;
  onMonthChange?: (monthStart: Date) => void;
  extraHeaderContent?: React.ReactNode;
  legendTypes?: CalendarEvent['type'][];
}

const MonthCalendar: React.FC<Props> = ({
  events, locale, onMonthChange, extraHeaderContent,
  legendTypes = ['planned', 'completed', 'event', 'deadline', 'field_trip', 'holiday'],
}) => {
  const { t } = useTranslation('landing');
  const [month, setMonth] = useState<Date>(() => new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const rtl = isRTL(locale);
  const grid = useMemo(() => buildMonthGrid(month, locale), [month, locale]);
  const weekdayLabels = useMemo(() => getWeekdayLabels(locale, 'short'), [locale]);
  const monthLabel = useMemo(() => getMonthLabel(locale, month, 'long'), [locale, month]);
  const today = new Date();

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      const list = map.get(ev.date) ?? [];
      list.push(ev);
      map.set(ev.date, list);
    }
    return map;
  }, [events]);

  const changeMonth = (delta: number) => {
    const next = addMonths(month, delta);
    setMonth(next);
    onMonthChange?.(next);
  };

  const goToday = () => {
    setMonth(new Date());
    setSelectedDate(new Date());
    onMonthChange?.(new Date());
  };

  const selectedEvents = selectedDate ? (eventsByDate.get(toISODate(selectedDate)) ?? []) : [];

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} style={{ fontFamily: 'var(--font-body)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <button onClick={() => changeMonth(-1)} aria-label={t('calendar.prev_month', 'Previous month')}
          style={{ padding: 8, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', cursor: 'pointer' }}>
          {rtl ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
        <span style={{ fontWeight: 700, fontSize: '1.05rem', minWidth: 160, textAlign: 'center', textTransform: 'capitalize' }}>
          {monthLabel}
        </span>
        <button onClick={() => changeMonth(1)} aria-label={t('calendar.next_month', 'Next month')}
          style={{ padding: 8, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', cursor: 'pointer' }}>
          {rtl ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
        </button>
        <button onClick={goToday}
          style={{ padding: '6px 14px', border: '1px solid var(--primary)', borderRadius: 8, background: 'none', color: 'var(--primary)', fontWeight: 600, cursor: 'pointer' }}>
          {t('calendar.today', 'Today')}
        </button>
        <div style={{ marginInlineStart: 'auto' }}>{extraHeaderContent}</div>
      </div>

      {/* Weekday header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
        {weekdayLabels.map((label, i) => (
          <div key={i} style={{ textAlign: 'center', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', padding: '4px 0' }}>
            {label}
          </div>
        ))}
      </div>

      {/* Month grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {grid.map((day, i) => {
          const inMonth = day.getMonth() === month.getMonth();
          const dayEvents = eventsByDate.get(toISODate(day)) ?? [];
          const isToday = isSameDay(day, today);
          const isSelected = selectedDate && isSameDay(day, selectedDate);
          return (
            <div
              key={i}
              onClick={() => setSelectedDate(day)}
              style={{
                minHeight: 78, padding: '6px 6px', borderRadius: 8, cursor: 'pointer',
                background: isSelected ? '#eff6ff' : 'var(--surface)',
                border: `1px solid ${isToday ? 'var(--primary)' : 'var(--border)'}`,
                opacity: inMonth ? 1 : 0.4,
              }}
            >
              <div style={{
                fontSize: '0.8rem', fontWeight: isToday ? 700 : 500,
                color: isToday ? 'var(--primary)' : 'var(--text)', marginBottom: 4,
              }}>
                {day.getDate()}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {dayEvents.slice(0, 3).map(ev => (
                  <div key={ev.id} title={ev.title} style={{
                    fontSize: '0.66rem', background: TYPE_COLOR[ev.type], borderRadius: 4, padding: '1px 4px',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 3,
                  }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: TYPE_DOT[ev.type], flexShrink: 0 }} />
                    {ev.title}
                  </div>
                ))}
                {dayEvents.length > 3 && (
                  <div style={{ fontSize: '0.64rem', color: 'var(--text-muted)' }}>+{dayEvents.length - 3} more</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', margin: '16px 0' }}>
        {legendTypes.map(tp => (
          <div key={tp} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: TYPE_COLOR[tp], border: `1px solid ${TYPE_DOT[tp]}` }} />
            {t(`calendar.legend.${tp}`, tp.replace('_', ' '))}
          </div>
        ))}
      </div>

      {/* Selected day agenda */}
      {selectedDate && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px' }}>
          <h3 style={{ margin: '0 0 10px', fontSize: '0.95rem' }}>
            {new Intl.DateTimeFormat(locale, { weekday: 'long', month: 'long', day: 'numeric' }).format(selectedDate)}
          </h3>
          {selectedEvents.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>
              {t('calendar.no_events_this_day', 'Nothing scheduled for this day.')}
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {selectedEvents.map(ev => (
                <div key={ev.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 12px', background: TYPE_COLOR[ev.type], borderRadius: 8 }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{ev.title}</div>
                    {(ev.subject || ev.student_name) && (
                      <div style={{ fontSize: '0.75rem', color: '#4b5563', marginTop: 2 }}>
                        {[ev.student_name, ev.subject].filter(Boolean).join(' · ')}
                      </div>
                    )}
                    {ev.description && <div style={{ fontSize: '0.78rem', color: '#4b5563', marginTop: 4 }}>{ev.description}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MonthCalendar;
