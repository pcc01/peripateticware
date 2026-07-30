// app/teacher-activities.tsx — full list of this teacher's (or HOMESCHOOL
// parent's) published activities. Reached by tapping the "Active" stat card
// on (tabs)/teacher-dashboard.tsx (Session 47 Addendum 3, item 1 — that card
// had no tap target before this). The dashboard's own Recent Activities
// section only ever shows the last 5; this is the full list. Reuses the
// existing GET /api/v1/activities?status=published, no backend change.

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/src/theme/ThemeContext';
import { fetchTeacherActivities, TeacherActivityListItem } from '@/src/api/teacher';

export default function TeacherActivitiesScreen() {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const [activities, setActivities] = useState<TeacherActivityListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(false);
      setActivities(await fetchTeacherActivities());
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
    <SafeAreaView testID="teacher-activities-screen" style={[styles.root, { backgroundColor: theme.bg }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity
          testID="teacher-activities-back-btn"
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.backTouchTarget}
          accessibilityRole="button"
          accessibilityLabel={t('common.back', 'Back')}
        >
          <Text style={[styles.backArrow, { color: theme.accent }]}>{'‹'}</Text>
          <Text style={[styles.backBtn, { color: theme.accent }]} numberOfLines={1}>{t('common.back', 'Back')}</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { fontFamily: theme.fontHead, color: theme.text }]} numberOfLines={1}>{t('teacherActivities.title', 'Active Activities')}</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={theme.accent} size="large" /></View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={[styles.emptyText, { color: theme.textMuted, fontFamily: theme.fontBody }]}>
            {t('teacherActivities.loadError', 'Could not load activities.')}
          </Text>
        </View>
      ) : (
        <FlatList
          testID="teacher-activities-list"
          data={activities}
          keyExtractor={(a) => a.id}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyEmoji}>📍</Text>
              <Text style={[styles.emptyText, { fontFamily: theme.fontBody, color: theme.textMuted }]}>
                {t('teacherActivities.empty', 'No published activities yet.')}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              testID={`teacher-activities-row-${item.id}`}
              onPress={() => router.push({ pathname: '/teacher-activity/[id]', params: { id: item.id } })}
              style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: theme.radius }]}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel={item.title}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.activityTitle, { fontFamily: theme.fontHead, color: theme.text }]} numberOfLines={1}>{item.title}</Text>
                <Text style={[styles.meta, { fontFamily: theme.fontMono, color: theme.textFaint }]}>
                  {[item.subject, t('teacherActivity.gradeLabel', 'Grade {{grade}}', { grade: item.grade_level }), item.created_at ? new Date(item.created_at).toLocaleDateString() : null].filter(Boolean).join(' · ')}
                </Text>
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
  card:            { padding: 14, borderWidth: 1 },
  activityTitle:   { fontSize: 15, fontWeight: '700' },
  meta:            { fontSize: 10, letterSpacing: 0.4, marginTop: 4 },
});
