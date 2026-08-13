// app/child-calendar.tsx — read-only calendar for one child, shared by
// PARENT and HOMESCHOOL (both hit backend/routes/calendar.py's child_id
// path — see src/api/calendar.ts's header comment for why this is NOT the
// same code path TEACHER uses, despite HOMESCHOOL otherwise mirroring
// TEACHER's tabs elsewhere in this app). No create/delete here — only a
// teacher/homeschool-as-classroom-owner can add classroom_events; this
// screen only ever reads. Reached from a ChildCard's "📅" button on either
// (tabs)/parent-dashboard.tsx or (tabs)/homeschool-dashboard.tsx.

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, RefreshControl, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/src/theme/ThemeContext';
import { fetchCalendarEvents, CalendarEvent } from '@/src/api/calendar';
import CalendarEventList from '@/src/components/CalendarEventList';

export default function ChildCalendarScreen() {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { childId, childName } = useLocalSearchParams<{ childId: string; childName?: string }>();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    if (!childId) return;
    try {
      setError(false);
      setEvents(await fetchCalendarEvents({ childId }));
    } catch {
      setError(true);
    }
  }, [childId]);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return (
    <SafeAreaView testID="child-calendar-screen" style={[styles.root, { backgroundColor: theme.bg }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity testID="child-calendar-back-btn" onPress={() => router.back()} hitSlop={12} style={styles.backTouchTarget} accessibilityRole="button" accessibilityLabel={t('common.back', 'Back')}>
          <Text style={[styles.backArrow, { color: theme.accent }]}>{'‹'}</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { fontFamily: theme.fontHead, color: theme.text }]} numberOfLines={1}>
          {childName ? t('childCalendar.titleWithName', "{{name}}'s Calendar", { name: childName }) : t('childCalendar.title', 'Calendar')}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={theme.accent} size="large" /></View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={[styles.emptyText, { color: theme.textMuted, fontFamily: theme.fontBody }]}>{t('childCalendar.loadError', 'Could not load the calendar.')}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}>
          <CalendarEventList events={events} theme={theme} t={t} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:            { flex: 1 },
  center:          { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  emptyText:       { fontSize: 14, textAlign: 'center', lineHeight: 22 },
  header:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  backTouchTarget: { width: 40, alignItems: 'flex-start', justifyContent: 'center', paddingVertical: 4, flexShrink: 0 },
  backArrow:       { fontSize: 28 },
  title:           { fontSize: 17, fontWeight: '700', flex: 1, textAlign: 'center' },
});
