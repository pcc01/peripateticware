// app/(tabs)/teacher-dashboard.tsx — read-only summary for TEACHER and
// HOMESCHOOL accounts (see app/(tabs)/_layout.tsx — HOMESCHOOL mirrors
// TEACHER's tabs exactly, since a homeschool parent owns activities the
// same way a teacher does). Full classroom/roster/rubric management stays
// web-only; this mirrors why students are mobile-only for field capture —
// each surface does the one thing it's actually good for.
//
// Stat cards and activity rows are real tap targets (Session 47 Addendum 3,
// item 1 — they used to be plain Views with no onPress at all): activity
// rows and the "Active" card open the full activities list
// (app/teacher-activities.tsx — the dashboard's own Recent Activities
// section only shows the last 5); "Pending" and "Students" cards open the
// submissions list (app/teacher-submissions.tsx), since both numbers are
// drawn from the same underlying session data; "Classes" opens a read-only
// class list (app/teacher-classes.tsx).

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, RefreshControl, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/src/theme/ThemeContext';
import { fetchTeacherDashboard, TeacherDashboard } from '@/src/api/teacher';

const STATUS_COLOR_KEY: Record<string, 'accent' | 'textMuted' | 'warn'> = {
  published: 'accent',
  draft: 'textMuted',
  archived: 'textMuted',
};

const STAT_DESTINATION: Record<string, string> = {
  students: '/teacher-submissions',
  pending: '/teacher-submissions',
  active: '/teacher-activities',
  classes: '/teacher-classes',
};

export default function TeacherDashboardScreen() {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const [data, setData] = useState<TeacherDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(false);
      setData(await fetchTeacherDashboard());
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
    <SafeAreaView testID="teacher-dashboard-screen" style={[styles.root, { backgroundColor: theme.bg }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { fontFamily: theme.fontHead, color: theme.text }]}>{t('teacherDashboard.title', 'Teacher Dashboard')}</Text>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={theme.accent} size="large" /></View>
      ) : error || !data ? (
        <View style={styles.center}>
          <Text style={[styles.emptyText, { color: theme.textMuted, fontFamily: theme.fontBody }]}>
            {t('teacherDashboard.loadError', 'Could not load your dashboard.')}
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 16 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
        >
          <View style={styles.statsRow}>
            {[
              { key: 'students', label: t('teacherDashboard.stats.students', 'Students'), value: data.total_students, emoji: '🧑‍🎓' },
              { key: 'classes', label: t('teacherDashboard.stats.classes', 'Classes'), value: data.total_classes, emoji: '🏫' },
              { key: 'active', label: t('teacherDashboard.stats.active', 'Active'), value: data.active_activities, emoji: '📍' },
              { key: 'pending', label: t('teacherDashboard.stats.pending', 'Pending'), value: data.pending_submissions, emoji: '📥' },
            ].map((stat) => (
              <TouchableOpacity
                key={stat.key}
                testID={`teacher-dashboard-stat-${stat.key}`}
                onPress={() => router.push(STAT_DESTINATION[stat.key] as any)}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel={`${stat.label}, ${stat.value}`}
                style={[styles.statCard, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: theme.radius }]}
              >
                <Text style={styles.statEmoji}>{stat.emoji}</Text>
                <Text style={[styles.statValue, { fontFamily: theme.fontHead, color: theme.text }]}>{stat.value}</Text>
                <Text style={[styles.statLabel, { fontFamily: theme.fontMono, color: theme.textFaint }]}>{stat.label.toUpperCase()}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: theme.radius }]}>
            <Text style={[styles.sectionLabel, { fontFamily: theme.fontMono, color: theme.textFaint }]}>{t('teacherDashboard.recentLabel', 'RECENT ACTIVITIES')}</Text>
            {data.activities.length === 0 ? (
              <Text style={[styles.emptyText, { color: theme.textMuted, fontFamily: theme.fontBody }]}>
                {t('teacherDashboard.noActivities', "You haven't created any activities yet — use the web app to build one.")}
              </Text>
            ) : (
              data.activities.map((a) => (
                <TouchableOpacity
                  key={a.id}
                  testID={`teacher-dashboard-activity-${a.id}`}
                  onPress={() => router.push({ pathname: '/teacher-activity/[id]', params: { id: a.id } })}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel={a.title}
                  style={[styles.activityRow, { borderColor: theme.border }]}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.activityTitle, { fontFamily: theme.fontBody, color: theme.text }]} numberOfLines={1}>{a.title}</Text>
                    <Text style={[styles.activityMeta, { fontFamily: theme.fontMono, color: theme.textFaint }]}>
                      {[a.subject, a.created_at ? new Date(a.created_at).toLocaleDateString() : null].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <View style={[styles.statusPill, { flexShrink: 0, borderColor: theme[STATUS_COLOR_KEY[a.status] ?? 'textMuted'] }]}>
                    <Text style={[styles.statusPillText, { fontFamily: theme.fontMono, color: theme[STATUS_COLOR_KEY[a.status] ?? 'textMuted'] }]}>{a.status}</Text>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>

          <Text style={[styles.webHint, { fontFamily: theme.fontBody, color: theme.textFaint }]}>
            {t('teacherDashboard.webHint', 'For classrooms, rosters, and rubrics, use the web app.')}
          </Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:        { flex: 1 },
  header:      { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  title:       { fontSize: 28, fontWeight: '700' },
  center:      { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  emptyText:   { fontSize: 14, textAlign: 'center', lineHeight: 22 },
  statsRow:    { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  statCard:    { flexGrow: 1, flexBasis: '45%', alignItems: 'center', padding: 14, borderWidth: 1, gap: 4 },
  statEmoji:   { fontSize: 22 },
  statValue:   { fontSize: 24, fontWeight: '700' },
  statLabel:   { fontSize: 8, letterSpacing: 1, textTransform: 'uppercase' },
  section:     { padding: 14, borderWidth: 1, gap: 10 },
  sectionLabel:{ fontSize: 9, letterSpacing: 1.4, textTransform: 'uppercase' },
  activityRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderTopWidth: 1, borderColor: 'transparent' },
  activityTitle:{ fontSize: 14, fontWeight: '600' },
  activityMeta: { fontSize: 10, letterSpacing: 0.6, marginTop: 2 },
  statusPill:      { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: 1 },
  statusPillText:  { fontSize: 9, letterSpacing: 0.6, textTransform: 'uppercase' },
  webHint:     { fontSize: 12, textAlign: 'center', paddingVertical: 8 },
});
