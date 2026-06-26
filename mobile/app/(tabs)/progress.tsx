// app/(tabs)/progress.tsx — Competencies, badges, streak

import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/src/theme/ThemeContext';
import { useBand } from '@/src/bands/BandContext';
import { fetchProgress, ProgressData } from '@/src/api/journal';

export default function ProgressScreen() {
  const { theme } = useTheme();
  const { band } = useBand();
  const [data, setData] = useState<ProgressData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setData(await fetchProgress()); } catch { /* endpoint may not exist yet */ }
  }, []);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);

  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.bg }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { fontFamily: theme.fontHead, color: theme.text }]}>Progress</Text>
      </View>
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={theme.accent} size="large" /></View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 16 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
        >
          {/* Stats row */}
          <View style={styles.statsRow}>
            {[
              { label: band === 'k6' ? 'Adventures' : 'Activities', value: data?.total_activities_completed ?? 0, emoji: '🏅' },
              { label: 'Captures',  value: data?.total_captures ?? 0,              emoji: '📷' },
              { label: 'Day streak', value: data?.current_streak_days ?? 0,        emoji: '🔥' },
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
              <Text style={[styles.sectionLabel, { fontFamily: theme.fontMono, color: theme.textFaint }]}>COMPETENCIES</Text>
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
              <Text style={[styles.sectionLabel, { fontFamily: theme.fontMono, color: theme.textFaint }]}>BADGES</Text>
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
                Complete your first activity to start tracking progress.
              </Text>
            </View>
          )}
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
});
