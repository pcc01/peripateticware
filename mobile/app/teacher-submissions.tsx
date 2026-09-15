// app/teacher-submissions.tsx — every session on this teacher's (or
// HOMESCHOOL parent's) activities, grouped class > student in collapsible
// sections (2026-09-15 — was a flat list; classroom_id/classroom_name now
// come back on each row from GET /activities/teacher/submissions, see that
// endpoint's docstring for how a student's classroom is resolved).
// Reached by tapping the "Pending" or "Students" stat cards on
// (tabs)/teacher-dashboard.tsx. Reuses the existing endpoint, just consumes
// two new fields on it.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/src/theme/ThemeContext';
import { fetchTeacherSubmissions, TeacherSubmission } from '@/src/api/teacher';
import CollapsibleSection from '@/src/components/CollapsibleSection';

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

interface ClassGroup {
  key: string;
  name: string;
  items: TeacherSubmission[];
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

  // Grouped by classroom, "Unassigned" (no classroom_id) sorted last —
  // everything else alphabetical by classroom name.
  const groups = useMemo<ClassGroup[]>(() => {
    const byKey = new Map<string, ClassGroup>();
    for (const s of submissions) {
      const key = s.classroom_id ?? '__unassigned__';
      const name = s.classroom_name ?? t('teacherSubmissions.unassigned', 'Unassigned');
      if (!byKey.has(key)) byKey.set(key, { key, name, items: [] });
      byKey.get(key)!.items.push(s);
    }
    return Array.from(byKey.values()).sort((a, b) => {
      if (a.key === '__unassigned__') return 1;
      if (b.key === '__unassigned__') return -1;
      return a.name.localeCompare(b.name);
    });
  }, [submissions, t]);

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
      ) : groups.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyEmoji}>📥</Text>
          <Text style={[styles.emptyText, { fontFamily: theme.fontBody, color: theme.textMuted }]}>
            {t('teacherSubmissions.empty', 'No submissions yet.')}
          </Text>
        </View>
      ) : (
        <ScrollView
          testID="teacher-submissions-list"
          contentContainerStyle={{ padding: 16, gap: 10 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
        >
          {groups.map((group) => (
            <CollapsibleSection
              key={group.key}
              testID={`teacher-submissions-group-${group.key}`}
              title={group.name}
              count={group.items.length}
              theme={theme}
            >
              {group.items.map((item) => (
                <TouchableOpacity
                  key={item.session_id}
                  testID={`teacher-submission-${item.session_id}`}
                  onPress={() => router.push({ pathname: '/teacher-activity/[id]', params: { id: item.activity_id } })}
                  style={[styles.card, { backgroundColor: theme.surfaceAlt, borderColor: theme.border, borderRadius: theme.radiusSm }]}
                  activeOpacity={0.75}
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
              ))}
            </CollapsibleSection>
          ))}
        </ScrollView>
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
  backTouchTarget: { width: 40, alignItems: 'flex-start', justifyContent: 'center', paddingVertical: 4, flexShrink: 0 },
  backArrow:       { fontSize: 28 },
  title:           { fontSize: 17, fontWeight: '700', flex: 1, textAlign: 'center' },
  card:            { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderWidth: 1 },
  studentName:     { fontSize: 15, fontWeight: '700' },
  activityTitle:   { fontSize: 12, marginTop: 1 },
  meta:            { fontSize: 10, letterSpacing: 0.4, marginTop: 2 },
  statusPill:      { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: 1 },
  statusPillText:  { fontSize: 9, letterSpacing: 0.6, textTransform: 'uppercase' },
});
