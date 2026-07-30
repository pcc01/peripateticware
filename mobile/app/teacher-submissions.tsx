// app/teacher-submissions.tsx — flat list of every session on this
// teacher's (or HOMESCHOOL parent's) activities. Reached by tapping the
// "Pending" or "Students" stat cards on (tabs)/teacher-dashboard.tsx
// (Session 47 Addendum 3, item 1 — those cards had no tap target at all
// before this). "Active"/"Classes" cards are left non-interactive: there's
// no built mobile screen for either (classroom/roster management stays
// web-only, and "Active" just duplicates the Recent Activities list already
// visible on the dashboard itself) — a scope call, not an oversight.
// Reuses the existing GET /activities/teacher/submissions, no backend change.

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/src/theme/ThemeContext';
import { fetchTeacherSubmissions, TeacherSubmission } from '@/src/api/teacher';

const STATUS_COLOR_KEY: Record<string, 'accent' | 'textMuted' | 'warn'> = {
  completed: 'accent',
  in_progress: 'warn',
};

function agoLabel(iso: string | null, t: (k: string, d: string, o?: any) => any): string {
  if (!iso) return '';
  const secs = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return t('liveTracking.secondsAgo', '{{n}}s ago', { n: secs });
  const mins = Math.floor(secs / 60);
  if (mins < 60) return t('liveTracking.minutesAgo', '{{n}}m ago', { n: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t('liveTracking.hoursAgo', '{{n}}h ago', { n: hours });
  return t('teacherActivity.daysAgo', '{{n}}d ago', { n: Math.floor(hours / 24) });
}

export default function TeacherSubmissionsScreen() {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const [submissions, setSubmissions] = useState<TeacherSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(false);
      setSubmissions(await fetchTeacherSubmissions());
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return (
    <SafeAreaView testID="teacher-submissions-screen" style={[styles.root, { backgroundColor: theme.bg }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity
          testID="teacher-submissions-back-btn"
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.backTouchTarget}
          accessibilityRole="button"
          accessibilityLabel={t('common.back', 'Back')}
        >
          <Text style={[styles.backArrow, { color: theme.accent }]}>{'‹'}</Text>
          <Text style={[styles.backBtn, { color: theme.accent }]} numberOfLines={1}>{t('common.back', 'Back')}</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { fontFamily: theme.fontHead, color: theme.text }]} numberOfLines={1}>{t('teacherSubmissions.title', 'Submissions')}</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={theme.accent} size="large" /></View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={[styles.emptyText, { color: theme.textMuted, fontFamily: theme.fontBody }]}>
            {t('teacherSubmissions.loadError', 'Could not load submissions.')}
          </Text>
        </View>
      ) : (
        <FlatList
          testID="teacher-submissions-list"
          data={submissions}
          keyExtractor={(s) => s.session_id}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyEmoji}>📥</Text>
              <Text style={[styles.emptyText, { fontFamily: theme.fontBody, color: theme.textMuted }]}>
                {t('teacherSubmissions.empty', 'No submissions yet.')}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              testID={`teacher-submission-${item.session_id}`}
              onPress={() => router.push({ pathname: '/teacher-activity/[id]', params: { id: item.activity_id } })}
              style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: theme.radius }]}
              activeOpacity={0.75}
              accessibilityRole="button"
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.studentName, { fontFamily: theme.fontHead, color: theme.text }]} numberOfLines={1}>{item.student_name}</Text>
                <Text style={[styles.activityTitle, { fontFamily: theme.fontBody, color: theme.textMuted }]} numberOfLines={1}>{item.activity_title}</Text>
                <Text style={[styles.meta, { fontFamily: theme.fontMono, color: theme.textFaint }]}>{agoLabel(item.started_at, t)}</Text>
              </View>
              <View style={[styles.statusPill, { flexShrink: 0, borderColor: theme[STATUS_COLOR_KEY[item.status] ?? 'textMuted'] }]}>
                <Text style={[styles.statusPillText, { fontFamily: theme.fontMono, color: theme[STATUS_COLOR_KEY[item.status] ?? 'textMuted'] }]}>{item.status}</Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:            { flex: 1 },
  center:          { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  emptyEmoji:      { fontSize: 48 },
  emptyText:       { fontSize: 14, textAlign: 'center', lineHeight: 22 },
  header:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  backTouchTarget: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, flexShrink: 1, minWidth: 0 },
  backArrow:       { fontSize: 16 },
  backBtn:         { fontSize: 16, flexShrink: 1 },
  title:           { fontSize: 17, fontWeight: '700', flexShrink: 1 },
  card:            { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderWidth: 1 },
  studentName:     { fontSize: 16, fontWeight: '700' },
  activityTitle:   { fontSize: 12, marginTop: 1 },
  meta:            { fontSize: 10, letterSpacing: 0.4, marginTop: 2 },
  statusPill:      { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: 1 },
  statusPillText:  { fontSize: 9, letterSpacing: 0.6, textTransform: 'uppercase' },
});
