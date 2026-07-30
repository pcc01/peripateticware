// app/(tabs)/parent-dashboard.tsx — read-only summary for PARENT accounts.
// Linking a child, messaging, and weekly/monthly report exports stay
// web-only; this mirrors why students are mobile-only for field capture —
// each surface does the one thing it's actually good for. See
// app/(tabs)/_layout.tsx for how this tab is shown only when the signed-in
// account's role is PARENT.

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/src/theme/ThemeContext';
import { fetchLinkedChildren, fetchChildProgress, LinkedChild, ChildProgress } from '@/src/api/parent';

function ChildCard({ child, theme, t }: { child: LinkedChild; theme: any; t: (k: string, d: string, o?: any) => any }) {
  const [progress, setProgress] = useState<ChildProgress | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchChildProgress(child.child_id)
      .then(setProgress)
      .catch(() => setProgress(null))
      .finally(() => setLoading(false));
  }, [child.child_id]);

  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: theme.radius }]}>
      <View style={styles.cardHeaderRow}>
        <Text style={styles.avatarEmoji}>{child.child_avatar || '🧑'}</Text>
        <View style={{ flex: 1 }}>
          <Text style={[styles.childName, { fontFamily: theme.fontHead, color: theme.text }]}>{child.child_name}</Text>
          <Text style={[styles.childMeta, { fontFamily: theme.fontMono, color: theme.textFaint }]}>{child.relationship}</Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={theme.accent} style={{ marginVertical: 10 }} />
      ) : !progress ? (
        <Text style={[styles.emptyText, { color: theme.textMuted, fontFamily: theme.fontBody }]}>
          {t('parentDashboard.progressUnavailable', "Could not load this child's progress.")}
        </Text>
      ) : (
        <>
          <View style={styles.statsRow}>
            {[
              { label: t('parentDashboard.stats.activities', 'Activities'), value: progress.activities_completed },
              { label: t('parentDashboard.stats.hours', 'Hours'), value: progress.hours_learned.toFixed(1) },
              { label: t('parentDashboard.stats.engagement', 'Engagement'), value: `${progress.engagement_score}%` },
            ].map((stat) => (
              <View key={stat.label} style={styles.statCol}>
                <Text style={[styles.statValue, { fontFamily: theme.fontHead, color: theme.text }]}>{stat.value}</Text>
                <Text style={[styles.statLabel, { fontFamily: theme.fontMono, color: theme.textFaint }]}>{stat.label.toUpperCase()}</Text>
              </View>
            ))}
          </View>

          {progress.competencies.length > 0 && (
            <View style={{ gap: 8, marginTop: 8 }}>
              {progress.competencies.map((c, i) => (
                <View key={i} style={styles.compRow}>
                  <Text style={[styles.compName, { fontFamily: theme.fontBody, color: theme.text }]} numberOfLines={1}>{c.name}</Text>
                  <View style={[styles.barBg, { backgroundColor: theme.border, borderRadius: 4 }]}>
                    <View style={[styles.barFill, { backgroundColor: theme.accent, borderRadius: 4, width: `${(c.level / c.max_level) * 100}%` as any }]} />
                  </View>
                </View>
              ))}
            </View>
          )}

          <Text style={[styles.lastActive, { fontFamily: theme.fontMono, color: theme.textFaint }]}>
            {t('parentDashboard.lastActive', 'Last active: {{date}}', { date: new Date(progress.last_active).toLocaleDateString() })}
          </Text>
        </>
      )}
    </View>
  );
}

export default function ParentDashboardScreen() {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const [children, setChildren] = useState<LinkedChild[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(false);
      setChildren(await fetchLinkedChildren());
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
    <SafeAreaView testID="parent-dashboard-screen" style={[styles.root, { backgroundColor: theme.bg }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { fontFamily: theme.fontHead, color: theme.text }]}>{t('parentDashboard.title', 'My Children')}</Text>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={theme.accent} size="large" /></View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={[styles.emptyText, { color: theme.textMuted, fontFamily: theme.fontBody }]}>
            {t('parentDashboard.loadError', 'Could not load your dashboard.')}
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 12 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
        >
          {children.length === 0 ? (
            <View style={styles.center}>
              <Text style={styles.emptyEmoji}>👨‍👩‍👧</Text>
              <Text style={[styles.emptyText, { fontFamily: theme.fontBody, color: theme.textMuted }]}>
                {t('parentDashboard.empty', 'No children linked yet. Link a child in the web app to see their progress here.')}
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
  card:         { padding: 14, borderWidth: 1, gap: 10 },
  cardHeaderRow:{ flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatarEmoji:  { fontSize: 32 },
  childName:    { fontSize: 17, fontWeight: '700' },
  childMeta:    { fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase' },
  statsRow:     { flexDirection: 'row', justifyContent: 'space-around' },
  statCol:      { alignItems: 'center', gap: 2 },
  statValue:    { fontSize: 18, fontWeight: '700' },
  statLabel:    { fontSize: 8, letterSpacing: 0.8, textTransform: 'uppercase' },
  compRow:      { gap: 4 },
  compName:     { fontSize: 12 },
  barBg:        { height: 6 },
  barFill:      { height: 6 },
  lastActive:   { fontSize: 10, letterSpacing: 0.4, marginTop: 4 },
});
