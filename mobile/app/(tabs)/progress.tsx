// app/(tabs)/progress.tsx — "Achievements": competencies, badges, streak,
// plus a leaderboard picker for student-created activities. File name kept
// as progress.tsx (route path/tab-bar wiring unaffected); only the visible
// label changed to Achievements — see app/(tabs)/_layout.tsx.

import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, RefreshControl, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/src/theme/ThemeContext';
import { fetchProgress, ProgressData } from '@/src/api/journal';
import { fetchProposedActivities, ProposedActivity } from '@/src/api/leaderboard';

export default function ProgressScreen() {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const [data, setData] = useState<ProgressData | null>(null);
  const [proposedActivities, setProposedActivities] = useState<ProposedActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setData(await fetchProgress()); } catch { /* endpoint may not exist yet */ }
    try { setProposedActivities(await fetchProposedActivities()); } catch { /* best-effort */ }
  }, []);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);

  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  return (
    <SafeAreaView testID="progress-screen" style={[styles.root, { backgroundColor: theme.bg }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { fontFamily: theme.fontHead, color: theme.text }]}>{t('tabs.achievements', 'Achievements')}</Text>
      </View>
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={theme.accent} size="large" /></View>
      ) : (
        <ScrollView
          testID="progress-scroll"
          contentContainerStyle={{ padding: 16, gap: 16 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
        >
          {/* Stats row */}
          <View style={styles.statsRow}>
            {[
              { label: t('progress.stats.activities', 'Activities'), value: data?.total_activities_completed ?? 0, emoji: '🏅' },
              { label: t('progress.stats.captures', 'Captures'),  value: data?.total_captures ?? 0,              emoji: '📷' },
              { label: t('progress.stats.dayStreak', 'Day streak'), value: data?.current_streak_days ?? 0,        emoji: '🔥' },
            ].map((stat) => (
              <View key={stat.label} style={[styles.statCard, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: theme.radius }]}>
                <Text style={styles.statEmoji}>{stat.emoji}</Text>
                <Text style={[styles.statValue, { fontFamily: theme.fontHead, color: theme.text }]}>{stat.value}</Text>
                <Text style={[styles.statLabel, { fontFamily: theme.fontMono, color: theme.textFaint }]}>{stat.label.toUpperCase()}</Text>
              </View>
            ))}
          </View>

          {/* Competencies */}
          {(data?.competencies ?? []).length > 0 && (
            <View style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: theme.radius }]}>
              <Text style={[styles.sectionLabel, { fontFamily: theme.fontMono, color: theme.textFaint }]}>{t('progress.competenciesLabel', 'COMPETENCIES')}</Text>
              {data!.competencies.map((c, i) => (
                <View key={i} style={styles.compRow}>
                  <Text style={[styles.compName, { fontFamily: theme.fontBody, color: theme.text }]}>{c.name}</Text>
                  <View style={[styles.barBg, { backgroundColor: theme.border, borderRadius: 4 }]}>
                    <View style={[styles.barFill, { backgroundColor: theme.accent, borderRadius: 4, width: `${(c.level / c.max_level) * 100}%` as any }]} />
                  </View>
                  <Text style={[styles.compLevel, { fontFamily: theme.fontMono, color: theme.textFaint }]}>{c.level}/{c.max_level}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Badges */}
          {(data?.badges ?? []).length > 0 && (
            <View style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: theme.radius }]}>
              <Text style={[styles.sectionLabel, { fontFamily: theme.fontMono, color: theme.textFaint }]}>{t('progress.badgesLabel', 'BADGES')}</Text>
              <View style={styles.badgeGrid}>
                {data!.badges.map((b) => (
                  <View key={b.id} style={[styles.badge, { backgroundColor: theme.accentMuted, borderRadius: theme.radiusSm }]}>
                    <Text style={styles.badgeEmoji}>{b.emoji}</Text>
                    <Text style={[styles.badgeName, { fontFamily: theme.fontBody, color: theme.text }]} numberOfLines={2}>{b.name}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {!data && (
            <View style={styles.center}>
              <Text style={{ fontSize: 40 }}>🌱</Text>
              <Text style={[{ fontFamily: theme.fontBody, color: theme.textMuted, textAlign: 'center', fontSize: 14, lineHeight: 22 }]}>
                {t('progress.empty', 'Complete your first activity to start tracking progress.')}
              </Text>
            </View>
          )}

          {/* Leaderboards — student-proposed ("reverse scavenger hunt")
              activities. Tapping one opens app/leaderboard/[id].tsx. */}
          <View style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: theme.radius }]}>
            <Text style={[styles.sectionLabel, { fontFamily: theme.fontMono, color: theme.textFaint }]}>{t('progress.leaderboardsLabel', 'LEADERBOARDS')}</Text>
            {proposedActivities.length === 0 ? (
              <Text style={[styles.leaderboardEmptyText, { fontFamily: theme.fontBody, color: theme.textMuted }]}>
                {t('progress.leaderboardsEmpty', 'No student-created challenges yet — propose one to start a leaderboard.')}
              </Text>
            ) : (
              proposedActivities.map((a) => (
                <TouchableOpacity
                  key={a.id}
                  testID={`leaderboard-entry-${a.id}`}
                  onPress={() => router.push({ pathname: '/leaderboard/[id]', params: { id: a.id, title: a.title } })}
                  style={[styles.leaderboardRow, { borderColor: theme.border, borderRadius: theme.radiusSm, backgroundColor: theme.surfaceAlt }]}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel={`${a.title}, ${t('progress.participantCount', '{{count}} taking part', { count: a.participant_count })}`}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.leaderboardTitle, { fontFamily: theme.fontBody, color: theme.text }]} numberOfLines={1}>{a.title}</Text>
                    <Text style={[styles.leaderboardMeta, { fontFamily: theme.fontMono, color: theme.textFaint }]}>
                      {t('progress.participantCount', '{{count}} taking part', { count: a.participant_count })}
                      {a.proposed_by ? ` · ${t('progress.proposedBy', 'by {{name}}', { name: a.proposed_by })}` : ''}
                    </Text>
                  </View>
                  <Text style={[styles.chevron, { color: theme.textFaint }]}>›</Text>
                </TouchableOpacity>
              ))
            )}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:        { flex: 1 },
  header:      { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  title:       { fontSize: 28, fontWeight: '700' },
  center:      { alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  statsRow:    { flexDirection: 'row', gap: 10 },
  statCard:    { flex: 1, alignItems: 'center', padding: 14, borderWidth: 1, gap: 4 },
  statEmoji:   { fontSize: 24 },
  statValue:   { fontSize: 26, fontWeight: '700' },
  statLabel:   { fontSize: 8, letterSpacing: 1, textTransform: 'uppercase' },
  section:     { padding: 14, borderWidth: 1, gap: 10 },
  sectionLabel:{ fontSize: 9, letterSpacing: 1.4, textTransform: 'uppercase' },
  compRow:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  compName:    { fontSize: 13, flex: 1 },
  barBg:       { height: 6, flex: 1 },
  barFill:     { height: 6 },
  compLevel:   { fontSize: 10, minWidth: 28, textAlign: 'right' },
  badgeGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  badge:       { width: 72, alignItems: 'center', padding: 10, gap: 4 },
  badgeEmoji:  { fontSize: 28 },
  badgeName:   { fontSize: 11, textAlign: 'center', lineHeight: 14 },
  leaderboardEmptyText: { fontSize: 13, lineHeight: 19 },
  leaderboardRow:   { flexDirection: 'row', alignItems: 'center', padding: 10, borderWidth: 1, gap: 8 },
  leaderboardTitle: { fontSize: 14, fontWeight: '600' },
  leaderboardMeta:  { fontSize: 10, letterSpacing: 0.4, marginTop: 2 },
  chevron:          { fontSize: 20, fontWeight: '300' },
});
