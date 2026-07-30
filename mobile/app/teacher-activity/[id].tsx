// app/teacher-activity/[id].tsx — read-only activity detail for TEACHER/
// HOMESCHOOL accounts. Reached by tapping an activity row on
// (tabs)/teacher-dashboard.tsx (Session 47 Addendum 3, item 1 — rows had no
// tap target at all before this). Reuses the generic GET /activities/{id}
// (backend/routes/activities.py get_activity) rather than the
// student-scoped /student/activities/{id} — this is an owner viewing their
// own activity, not a student taking it. Full create/edit stays web-only,
// same "lean read-only mobile" pattern as the rest of this tab.

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/src/theme/ThemeContext';
import { fetchTeacherActivityDetail, fetchTeacherSubmissions, TeacherActivityDetail, TeacherSubmission } from '@/src/api/teacher';

const STATUS_COLOR_KEY: Record<string, 'accent' | 'textMuted' | 'warn'> = {
  published: 'accent',
  draft: 'textMuted',
  archived: 'textMuted',
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

export default function TeacherActivityDetailScreen() {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [activity, setActivity] = useState<TeacherActivityDetail | null>(null);
  const [submissions, setSubmissions] = useState<TeacherSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setError(false);
      const [detail, allSubmissions] = await Promise.all([
        fetchTeacherActivityDetail(id),
        fetchTeacherSubmissions(),
      ]);
      setActivity(detail);
      setSubmissions(allSubmissions.filter((s) => s.activity_id === id));
    } catch {
      setError(true);
    }
  }, [id]);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);

  return (
    <SafeAreaView testID="teacher-activity-screen" style={[styles.root, { backgroundColor: theme.bg }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity
          testID="teacher-activity-back-btn"
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.backTouchTarget}
          accessibilityRole="button"
          accessibilityLabel={t('common.back', 'Back')}
        >
          <Text style={[styles.backArrow, { color: theme.accent }]}>{'‹'}</Text>
          <Text style={[styles.backBtn, { color: theme.accent }]} numberOfLines={1}>{t('common.back', 'Back')}</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={theme.accent} size="large" /></View>
      ) : error || !activity ? (
        <View style={styles.center}>
          <Text style={[styles.emptyText, { color: theme.textMuted, fontFamily: theme.fontBody }]}>
            {t('teacherActivity.loadError', 'Could not load this activity.')}
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
          <View>
            <View style={styles.titleRow}>
              <Text style={[styles.title, { fontFamily: theme.fontHead, color: theme.text }]}>{activity.title}</Text>
              <View style={[styles.statusPill, { borderColor: theme[STATUS_COLOR_KEY[activity.status] ?? 'textMuted'] }]}>
                <Text style={[styles.statusPillText, { fontFamily: theme.fontMono, color: theme[STATUS_COLOR_KEY[activity.status] ?? 'textMuted'] }]}>{activity.status}</Text>
              </View>
            </View>
            <Text style={[styles.meta, { fontFamily: theme.fontMono, color: theme.textFaint }]}>
              {[activity.subject, t('teacherActivity.gradeLabel', 'Grade {{grade}}', { grade: activity.grade_level }), t('teacherActivity.minutesLabel', '{{n}} min', { n: activity.estimated_duration_minutes })].filter(Boolean).join(' · ')}
            </Text>
            {!!activity.location_name && (
              <Text style={[styles.meta, { fontFamily: theme.fontMono, color: theme.textFaint }]}>📍 {activity.location_name}</Text>
            )}
          </View>

          <View style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: theme.radius }]}>
            <Text style={[styles.sectionLabel, { fontFamily: theme.fontMono, color: theme.textFaint }]}>{t('teacherActivity.descriptionLabel', 'DESCRIPTION')}</Text>
            <Text style={[styles.description, { fontFamily: theme.fontBody, color: theme.text }]}>{activity.description}</Text>
          </View>

          {activity.learning_objectives?.length > 0 && (
            <View style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: theme.radius }]}>
              <Text style={[styles.sectionLabel, { fontFamily: theme.fontMono, color: theme.textFaint }]}>{t('teacherActivity.objectivesLabel', 'LEARNING OBJECTIVES')}</Text>
              {activity.learning_objectives.map((obj, i) => (
                <Text key={i} style={[styles.objective, { fontFamily: theme.fontBody, color: theme.text }]}>{'•'} {obj}</Text>
              ))}
            </View>
          )}

          <View style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: theme.radius }]}>
            <Text style={[styles.sectionLabel, { fontFamily: theme.fontMono, color: theme.textFaint }]}>{t('teacherActivity.submissionsLabel', 'SUBMISSIONS')}</Text>
            {submissions.length === 0 ? (
              <Text style={[styles.emptyText, { color: theme.textMuted, fontFamily: theme.fontBody }]}>
                {t('teacherActivity.noSubmissions', 'No students have started this activity yet.')}
              </Text>
            ) : (
              submissions.map((s) => (
                <View key={s.session_id} style={[styles.submissionRow, { borderColor: theme.border }]}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.submissionName, { fontFamily: theme.fontBody, color: theme.text }]} numberOfLines={1}>{s.student_name}</Text>
                    <Text style={[styles.submissionMeta, { fontFamily: theme.fontMono, color: theme.textFaint }]}>{agoLabel(s.started_at, t)}</Text>
                  </View>
                  <View style={[styles.statusPill, { flexShrink: 0, borderColor: theme[STATUS_COLOR_KEY[s.status] ?? 'textMuted'] }]}>
                    <Text style={[styles.statusPillText, { fontFamily: theme.fontMono, color: theme[STATUS_COLOR_KEY[s.status] ?? 'textMuted'] }]}>{s.status}</Text>
                  </View>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:            { flex: 1 },
  center:          { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  header:          { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  backTouchTarget: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, flexShrink: 1, minWidth: 0 },
  backArrow:       { fontSize: 16 },
  backBtn:         { fontSize: 16, flexShrink: 1 },
  emptyText:       { fontSize: 14, textAlign: 'center', lineHeight: 22 },
  titleRow:        { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  title:           { fontSize: 22, fontWeight: '700', flex: 1, flexShrink: 1 },
  meta:            { fontSize: 11, letterSpacing: 0.4, marginTop: 4 },
  section:         { padding: 14, borderWidth: 1, gap: 8 },
  sectionLabel:    { fontSize: 9, letterSpacing: 1.4, textTransform: 'uppercase' },
  description:     { fontSize: 14, lineHeight: 21 },
  objective:       { fontSize: 14, lineHeight: 21 },
  submissionRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderTopWidth: 1 },
  submissionName:  { fontSize: 14, fontWeight: '600' },
  submissionMeta:  { fontSize: 10, letterSpacing: 0.4, marginTop: 2 },
  statusPill:      { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: 1 },
  statusPillText:  { fontSize: 9, letterSpacing: 0.6, textTransform: 'uppercase' },
});
