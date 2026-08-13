// src/components/CalendarEventList.tsx
// Shared date-grouped event list — used by app/teacher-calendar.tsx and
// app/child-calendar.tsx (TEACHER/HOMESCHOOL-as-classroom-owner vs
// PARENT/HOMESCHOOL-as-child-viewer both consume the same
// src/api/calendar.ts response shape, just scoped differently server-side).
// A simple chronological list rather than a month grid — matches this
// app's other mobile list screens (teacher-submissions.tsx etc.) and is
// faster to scan on a phone than a grid would be.

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { CalendarEvent } from '@/src/api/calendar';

const TYPE_EMOJI: Record<string, string> = {
  planned: '🔵',
  completed: '✅',
  event: '📌',
  deadline: '⏰',
  field_trip: '🚌',
  holiday: '🎉',
};

function groupByDate(events: CalendarEvent[]): [string, CalendarEvent[]][] {
  const map = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    if (!map.has(e.date)) map.set(e.date, []);
    map.get(e.date)!.push(e);
  }
  return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
}

function formatDateHeader(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  const today = new Date();
  const diffDays = Math.round((d.setHours(0, 0, 0, 0) - today.setHours(0, 0, 0, 0)) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function CalendarEventList({
  events, theme, t, onDelete, showStudentName,
}: {
  events: CalendarEvent[];
  theme: any;
  t: (k: string, d: string, o?: any) => any;
  onDelete?: (event: CalendarEvent) => void;
  showStudentName?: boolean;
}) {
  const grouped = groupByDate(events);

  if (events.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyEmoji}>📅</Text>
        <Text style={[styles.emptyText, { fontFamily: theme.fontBody, color: theme.textMuted }]}>
          {t('calendar.empty', 'Nothing on the calendar for this range.')}
        </Text>
      </View>
    );
  }

  return (
    <View style={{ gap: 18 }}>
      {grouped.map(([date, dayEvents]) => (
        <View key={date}>
          <Text style={[styles.dateHeader, { fontFamily: theme.fontMono, color: theme.textFaint }]}>
            {formatDateHeader(date).toUpperCase()}
          </Text>
          <View style={{ gap: 8 }}>
            {dayEvents.map((e) => (
              <View
                key={e.id}
                style={[styles.eventRow, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: theme.radiusSm }]}
              >
                <Text style={styles.eventEmoji}>{TYPE_EMOJI[e.type] ?? '📌'}</Text>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.eventTitle, { fontFamily: theme.fontBody, color: theme.text }]} numberOfLines={1}>{e.title}</Text>
                  <Text style={[styles.eventMeta, { fontFamily: theme.fontMono, color: theme.textFaint }]} numberOfLines={1}>
                    {[showStudentName ? e.student_name : null, e.subject].filter(Boolean).join(' · ')}
                  </Text>
                  {!!e.description && (
                    <Text style={[styles.eventDesc, { fontFamily: theme.fontBody, color: theme.textMuted }]} numberOfLines={2}>{e.description}</Text>
                  )}
                </View>
                {onDelete && e.source === 'classroom_event' && (
                  <TouchableOpacity
                    testID={`calendar-event-delete-${e.id}`}
                    onPress={() => onDelete(e)}
                    hitSlop={10}
                    style={{ padding: 4 }}
                  >
                    <Text style={{ color: theme.warn, fontSize: 16 }}>✕</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  emptyState:  { alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  emptyEmoji:  { fontSize: 40 },
  emptyText:   { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  dateHeader:  { fontSize: 10, letterSpacing: 1.2, marginBottom: 8 },
  eventRow:    { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderWidth: 1 },
  eventEmoji:  { fontSize: 18 },
  eventTitle:  { fontSize: 14, fontWeight: '600' },
  eventMeta:   { fontSize: 10, letterSpacing: 0.4, marginTop: 2 },
  eventDesc:   { fontSize: 12, marginTop: 4, lineHeight: 17 },
});
