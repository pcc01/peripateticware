// app/leaderboard/[id].tsx — ranked standings for one student-created
// activity. See backend/routes/student_activities.py's leaderboard
// endpoint for the ranking rules: completed sessions first, fastest time
// first; in-progress sessions follow, ranked by evidence captured so far
// (the closest real signal to "how far along" on a multi-step challenge —
// there's no explicit step/checkpoint count in the data model).

import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/src/theme/ThemeContext';
import { fetchLeaderboard, LeaderboardEntry } from '@/src/api/leaderboard';
import SpeakerButton from '@/src/components/SpeakerButton';

function formatDuration(totalSeconds: number, t: (k: string, d: string, o?: any) => any): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  if (mins === 0) return t('leaderboard.secondsFormat', '{{s}}s', { s: secs });
  return t('leaderboard.minutesSecondsFormat', '{{m}}m {{s}}s', { m: mins, s: secs });
}

const RANK_MEDAL: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };

export default function LeaderboardScreen() {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { id, title } = useLocalSearchParams<{ id: string; title?: string }>();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetchLeaderboard(id)
      .then((data) => setEntries(data.entries))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [id]);

  const myEntry = entries.find((e) => e.is_you);
  const mySummary = myEntry
    ? myEntry.status === 'completed' && myEntry.time_taken_seconds != null
      ? t('leaderboard.mySummaryFinished', "You're ranked {{rank}}. You finished in {{time}}.", { rank: myEntry.rank, time: formatDuration(myEntry.time_taken_seconds, t) })
      : t('leaderboard.mySummaryInProgress', "You're ranked {{rank}}. You have {{count}} pieces of evidence so far.", { rank: myEntry.rank, count: myEntry.captures_count })
    : '';

  return (
    <SafeAreaView testID="leaderboard-screen" style={[styles.root, { backgroundColor: theme.bg }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity
          testID="leaderboard-back-btn"
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.backTouchTarget}
          accessibilityRole="button"
          accessibilityLabel={t('common.back', 'Back')}
        >
          <Text style={[styles.backArrow, { color: theme.accent }]}>{'‹'}</Text>
          <Text style={[styles.backBtn, { color: theme.accent }]}>{t('common.back', 'Back')}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.titleBlock}>
        <Text style={[styles.title, { fontFamily: theme.fontHead, color: theme.text }]} numberOfLines={2}>{title ?? t('progress.leaderboardsLabel', 'LEADERBOARDS')}</Text>
      </View>

      {!loading && myEntry && (
        <View style={[styles.myStandingCard, { backgroundColor: theme.accentMuted, borderRadius: theme.radiusSm }]}>
          <Text style={[styles.myStandingText, { fontFamily: theme.fontBody, color: theme.text }]}>{mySummary}</Text>
          <SpeakerButton testID="leaderboard-my-standing-speaker" text={mySummary} theme={theme} size={22} />
        </View>
      )}

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={theme.accent} size="large" /></View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={[styles.emptyText, { color: theme.textMuted, fontFamily: theme.fontBody }]}>
            {t('leaderboard.loadError', 'Could not load this leaderboard.')}
          </Text>
        </View>
      ) : (
        <FlatList
          testID="leaderboard-list"
          data={entries}
          keyExtractor={(e) => e.student_id}
          contentContainerStyle={{ padding: 16, gap: 8 }}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyEmoji}>🏁</Text>
              <Text style={[styles.emptyText, { fontFamily: theme.fontBody, color: theme.textMuted }]}>
                {t('leaderboard.empty', 'Nobody has started this challenge yet.')}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View
              style={[
                styles.row,
                {
                  backgroundColor: item.is_you ? theme.accentMuted : theme.surface,
                  borderColor: item.is_you ? theme.accent : theme.border,
                  borderRadius: theme.radius,
                },
              ]}
            >
              <Text style={[styles.rank, { fontFamily: theme.fontHead, color: theme.text }]}>
                {RANK_MEDAL[item.rank] ?? `#${item.rank}`}
              </Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.studentName, { fontFamily: theme.fontBody, color: theme.text }]} numberOfLines={1}>
                  {item.student_name}{item.is_you ? ` (${t('leaderboard.you', 'You')})` : ''}
                </Text>
                <Text style={[styles.statusText, { fontFamily: theme.fontMono, color: theme.textFaint }]}>
                  {item.status === 'completed'
                    ? t('leaderboard.finished', 'Finished')
                    : t('leaderboard.stepsSoFar', '{{count}} pieces of evidence so far', { count: item.captures_count })}
                </Text>
              </View>
              <Text style={[styles.metric, { fontFamily: theme.fontMono, color: theme.accent }]}>
                {item.status === 'completed' && item.time_taken_seconds != null
                  ? formatDuration(item.time_taken_seconds, t)
                  : `${item.captures_count}`}
              </Text>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:        { flex: 1 },
  header:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  backTouchTarget: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 },
  backArrow:   { fontSize: 16 },
  backBtn:     { fontSize: 16 },
  titleBlock:  { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  title:       { fontSize: 22, fontWeight: '700' },
  myStandingCard: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginTop: 8, padding: 12, borderRadius: 10 },
  myStandingText: { flex: 1, fontSize: 13, lineHeight: 19 },
  center:      { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  emptyEmoji:  { fontSize: 48 },
  emptyText:   { fontSize: 14, textAlign: 'center', lineHeight: 22 },
  row:         { flexDirection: 'row', alignItems: 'center', padding: 12, borderWidth: 1, gap: 12 },
  rank:        { fontSize: 18, width: 34, textAlign: 'center' },
  studentName: { fontSize: 15, fontWeight: '600' },
  statusText:  { fontSize: 10, letterSpacing: 0.4, marginTop: 2 },
  metric:      { fontSize: 14, fontWeight: '700' },
});
