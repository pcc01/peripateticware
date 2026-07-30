// app/(tabs)/homeschool-dashboard.tsx — "Children" tab for HOMESCHOOL
// accounts: per-child progress cards, same idea as parent-dashboard.tsx's
// "this role also tracks individual kids" view. This used to also carry a
// stats-row summary (activities/sessions/standards) and be the *primary*
// tab for HOMESCHOOL, but HOMESCHOOL now mirrors TEACHER's Dashboard +
// Live Tracking tabs exactly (see app/(tabs)/_layout.tsx) — those stats
// live there now. This is kept as a secondary "Children" tab, HOMESCHOOL
// only, since a homeschool parent tracking individual kids is the one
// thing TEACHER's tabs genuinely don't cover. Adding/editing children,
// standards coverage, and portfolio export stay web-only.

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/src/theme/ThemeContext';
import {
  fetchHomeschoolChildren, fetchHomeschoolChildProgress,
  HomeschoolChild, HomeschoolChildProgress,
} from '@/src/api/homeschool';

function ChildCard({ child, theme, t }: { child: HomeschoolChild; theme: any; t: (k: string, d: string, o?: any) => any }) {
  const [progress, setProgress] = useState<HomeschoolChildProgress | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHomeschoolChildProgress(child.id)
      .then(setProgress)
      .catch(() => setProgress(null))
      .finally(() => setLoading(false));
  }, [child.id]);

  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: theme.radius }]}>
      <View style={styles.cardHeaderRow}>
        <Text style={styles.avatarEmoji}>🧑</Text>
        <View style={{ flex: 1 }}>
          <Text style={[styles.childName, { fontFamily: theme.fontHead, color: theme.text }]}>{child.full_name}</Text>
          {child.grade_level != null && (
            <Text style={[styles.childMeta, { fontFamily: theme.fontMono, color: theme.textFaint }]}>
              {t('homeschoolDashboard.gradeLabel', 'GRADE {{grade}}', { grade: child.grade_level })}
            </Text>
          )}
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={theme.accent} style={{ marginVertical: 10 }} />
      ) : !progress ? (
        <Text style={[styles.emptyText, { color: theme.textMuted, fontFamily: theme.fontBody }]}>
          {t('homeschoolDashboard.progressUnavailable', "Could not load this child's progress.")}
        </Text>
      ) : (
        <>
          <View style={styles.statsRow}>
            {[
              { label: t('homeschoolDashboard.stats.sessions', 'Sessions'), value: progress.total_sessions },
              { label: t('homeschoolDashboard.stats.completed', 'Completed'), value: progress.completed_sessions },
            ].map((stat) => (
              <View key={stat.label} style={styles.statCol}>
                <Text style={[styles.statValue, { fontFamily: theme.fontHead, color: theme.text }]}>{stat.value}</Text>
                <Text style={[styles.statLabel, { fontFamily: theme.fontMono, color: theme.textFaint }]}>{stat.label.toUpperCase()}</Text>
              </View>
            ))}
          </View>
          <View style={[styles.barBg, { backgroundColor: theme.border, borderRadius: 4 }]}>
            <View style={[styles.barFill, { backgroundColor: theme.accent, borderRadius: 4, width: `${progress.overall_progress}%` as any }]} />
          </View>
          <Text style={[styles.progressLabel, { fontFamily: theme.fontMono, color: theme.textFaint }]}>
            {t('homeschoolDashboard.overallProgress', '{{percent}}% overall progress', { percent: progress.overall_progress })}
          </Text>
        </>
      )}
    </View>
  );
}

export default function HomeschoolDashboardScreen() {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const [children, setChildren] = useState<HomeschoolChild[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(false);
      setChildren(await fetchHomeschoolChildren());
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
    <SafeAreaView testID="homeschool-dashboard-screen" style={[styles.root, { backgroundColor: theme.bg }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { fontFamily: theme.fontHead, color: theme.text }]}>{t('homeschoolDashboard.childrenTitle', 'Children')}</Text>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={theme.accent} size="large" /></View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={[styles.emptyText, { color: theme.textMuted, fontFamily: theme.fontBody }]}>
            {t('homeschoolDashboard.loadError', 'Could not load your dashboard.')}
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 16 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
        >
          {children.length === 0 ? (
            <View style={styles.center}>
              <Text style={styles.emptyEmoji}>👨‍👩‍👧</Text>
              <Text style={[styles.emptyText, { fontFamily: theme.fontBody, color: theme.textMuted }]}>
                {t('homeschoolDashboard.empty', 'No children added yet. Add a child in the web app to see their progress here.')}
              </Text>
            </View>
          ) : (
            children.map((child) => <ChildCard key={child.id} child={child} theme={theme} t={t} />)
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:         { flex: 1 },
  header:       { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  title:        { fontSize: 28, fontWeight: '700' },
  center:       { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  emptyEmoji:   { fontSize: 48 },
  emptyText:    { fontSize: 14, textAlign: 'center', lineHeight: 22 },
  sectionLabel: { fontSize: 9, letterSpacing: 1.4, textTransform: 'uppercase' },
  card:         { padding: 14, borderWidth: 1, gap: 10 },
  cardHeaderRow:{ flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatarEmoji:  { fontSize: 32 },
  childName:    { fontSize: 17, fontWeight: '700' },
  childMeta:    { fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase' },
  statsRow:     { flexDirection: 'row', justifyContent: 'space-around' },
  statCol:      { alignItems: 'center', gap: 2 },
  statValue:    { fontSize: 18, fontWeight: '700' },
  statLabel:    { fontSize: 8, letterSpacing: 0.8, textTransform: 'uppercase' },
  barBg:        { height: 6 },
  barFill:      { height: 6 },
  progressLabel:{ fontSize: 10, letterSpacing: 0.4 },
});
