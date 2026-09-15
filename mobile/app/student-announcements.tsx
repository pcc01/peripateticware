// app/student-announcements.tsx — read-only classroom-wide announcements
// for the student, consuming the existing GET /student/announcements
// endpoint (backend/routes/student.py's get_student_announcements). One-way
// broadcast — no reply capability, see backend/routes/
// teacher_communication.py's docstring above create_announcement for why
// this is a distinct model from the 1:1 messages in student-messages.tsx.
// Reached from (tabs)/index.tsx's header.

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/src/theme/ThemeContext';
import { fetchStudentAnnouncements, StudentAnnouncement } from '@/src/api/studentAnnouncements';

export default function StudentAnnouncementsScreen() {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const [announcements, setAnnouncements] = useState<StudentAnnouncement[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(false);
      setAnnouncements(await fetchStudentAnnouncements());
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
    <SafeAreaView testID="student-announcements-screen" style={[styles.root, { backgroundColor: theme.bg }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity testID="student-announcements-back-btn" onPress={() => router.back()} hitSlop={12} style={styles.backTouchTarget} accessibilityRole="button" accessibilityLabel={t('common.back', 'Back')}>
          <Text style={[styles.backArrow, { color: theme.accent }]}>{'‹'}</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { fontFamily: theme.fontHead, color: theme.text }]} numberOfLines={1}>{t('studentAnnouncements.title', 'Announcements')}</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={theme.accent} size="large" /></View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={[styles.emptyText, { color: theme.textMuted, fontFamily: theme.fontBody }]}>{t('studentAnnouncements.loadError', 'Could not load announcements.')}</Text>
        </View>
      ) : (
        <FlatList
          testID="student-announcements-list"
          data={announcements}
          keyExtractor={(a) => a.id}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyEmoji}>📣</Text>
              <Text style={[styles.emptyText, { fontFamily: theme.fontBody, color: theme.textMuted }]}>{t('studentAnnouncements.empty', 'No announcements yet.')}</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View
              testID={`student-announcement-${item.id}`}
              style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: theme.radius }]}
            >
              <Text style={[styles.cardTitle, { fontFamily: theme.fontHead, color: theme.text }]} numberOfLines={2}>{item.title}</Text>
              <Text style={[styles.cardBody, { fontFamily: theme.fontBody, color: theme.text }]}>{item.body}</Text>
              <Text style={[styles.cardMeta, { fontFamily: theme.fontMono, color: theme.textFaint }]} numberOfLines={1}>
                {item.teacher_name} · {item.classroom_name}
              </Text>
              <Text style={[styles.cardMeta, { fontFamily: theme.fontMono, color: theme.textFaint }]}>
                {item.created_at ? new Date(item.created_at).toLocaleString() : ''}
              </Text>
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
  cardTitle:       { fontSize: 15, fontWeight: '700' },
  cardBody:        { fontSize: 13, lineHeight: 19 },
  cardMeta:        { fontSize: 10, letterSpacing: 0.4 },
});
