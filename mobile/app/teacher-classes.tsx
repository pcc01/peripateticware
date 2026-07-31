// app/teacher-classes.tsx — read-only list of this teacher's active
// classes. Reached by tapping the "Classes" stat card on
// (tabs)/teacher-dashboard.tsx (Session 47 Addendum 3, item 1). Rows are
// not tappable — there's no mobile class-detail screen (roster/rubric
// management stays web-only, same as everywhere else on this tab); this is
// just a lean read-only list, matching the class name/grade/year info
// already available from the existing GET /activities/teacher/classes
// endpoint, no backend change.

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/src/theme/ThemeContext';
import { fetchTeacherClasses, TeacherClass } from '@/src/api/teacher';

export default function TeacherClassesScreen() {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const [classes, setClasses] = useState<TeacherClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(false);
      setClasses(await fetchTeacherClasses());
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
    <SafeAreaView testID="teacher-classes-screen" style={[styles.root, { backgroundColor: theme.bg }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity
          testID="teacher-classes-back-btn"
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.backTouchTarget}
          accessibilityRole="button"
          accessibilityLabel={t('common.back', 'Back')}
        >
          <Text style={[styles.backArrow, { color: theme.accent }]}>{'‹'}</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { fontFamily: theme.fontHead, color: theme.text }]} numberOfLines={1}>{t('teacherClasses.title', 'Classes')}</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={theme.accent} size="large" /></View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={[styles.emptyText, { color: theme.textMuted, fontFamily: theme.fontBody }]}>
            {t('teacherClasses.loadError', 'Could not load classes.')}
          </Text>
        </View>
      ) : (
        <FlatList
          testID="teacher-classes-list"
          data={classes}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyEmoji}>🏫</Text>
              <Text style={[styles.emptyText, { fontFamily: theme.fontBody, color: theme.textMuted }]}>
                {t('teacherClasses.empty', 'No classes yet — use the web app to create one.')}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: theme.radius }]}>
              <Text style={[styles.className, { fontFamily: theme.fontHead, color: theme.text }]} numberOfLines={1}>{item.name}</Text>
              <Text style={[styles.meta, { fontFamily: theme.fontMono, color: theme.textFaint }]}>
                {[item.grade_level != null ? t('teacherActivity.gradeLabel', 'Grade {{grade}}', { grade: item.grade_level }) : null, item.school_year].filter(Boolean).join(' · ')}
              </Text>
              {!!item.description && (
                <Text style={[styles.description, { fontFamily: theme.fontBody, color: theme.textMuted }]}>{item.description}</Text>
              )}
            </View>
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
  backTouchTarget: { width: 40, alignItems: 'flex-start', justifyContent: 'center', paddingVertical: 4, flexShrink: 0 },
  backArrow:       { fontSize: 28 },
  title:           { fontSize: 17, fontWeight: '700', flex: 1, textAlign: 'center' },
  card:            { padding: 14, borderWidth: 1, gap: 4 },
  className:       { fontSize: 15, fontWeight: '700' },
  meta:            { fontSize: 10, letterSpacing: 0.4 },
  description:     { fontSize: 13, marginTop: 4, lineHeight: 19 },
});
