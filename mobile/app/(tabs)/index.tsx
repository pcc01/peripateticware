// app/(tabs)/index.tsx — Discover screen
// Lists nearby activities from GET /api/v1/student/activities

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, ActivityIndicator,
  TouchableOpacity, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTheme } from '@/src/theme/ThemeContext';
import { fetchActivities, Activity } from '@/src/api/activities';
import { t } from '@/src/i18n/t';
import { useConnectivity } from '@/src/hooks/useConnectivity';
import PeriSpeech from '@/src/components/PeriSpeech';

const SUBJECT_EMOJI: Record<string, string> = {
  science: '🔬', math: '📐', history: '🏛', art: '🎨',
  language: '📖', biology: '🌿', default: '📍',
};

export default function DiscoverScreen() {
  const { theme } = useTheme();
  const { isOnline } = useConnectivity();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchActivities();
      setActivities(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load activities');
    }
  }, []);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const periText = activities.length > 0
    ? `${activities.length} activit${activities.length === 1 ? 'y' : 'ies'} waiting for you. Where will you explore today?`
    : "Let's find something to explore nearby.";

  return (
    <SafeAreaView testID="discover-screen" style={[styles.root, { backgroundColor: theme.bg }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { fontFamily: theme.fontHead, color: theme.text }]}>
          Discover
        </Text>
      </View>

      {!isOnline && (
        <View style={[styles.offlineBanner, { backgroundColor: theme.warnLight }]}>
          <Text style={[styles.offlineText, { fontFamily: theme.fontMono, color: theme.warn }]}>
            📵 OFFLINE — showing cached activities
          </Text>
        </View>
      )}

      <PeriSpeech text={periText} theme={theme} size={36} />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.accent} size="large" />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={[styles.errorText, { color: theme.warn, fontFamily: theme.fontBody }]}>
            {error}
          </Text>
          <TouchableOpacity
            onPress={load}
            style={[styles.retryBtn, { borderColor: theme.accent, borderRadius: theme.radiusSm }]}
            accessibilityRole="button"
            accessibilityLabel={t('common.tryAgain', 'Try again')}
          >
            <Text style={[styles.retryLabel, { color: theme.accent, fontFamily: theme.fontBody }]}>{t('common.tryAgain', 'Try again')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          testID="discover-list"
          data={activities}
          keyExtractor={(a) => a.id}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={[styles.emptyText, { color: theme.textMuted, fontFamily: theme.fontBody }]}>
                No activities yet — your teacher will add some soon.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <ActivityCard
              activity={item}
              theme={theme}
              onPress={() => router.push({ pathname: '/activity/[id]', params: { id: item.id } })}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

function ActivityCard({ activity, theme, onPress }: { activity: Activity; theme: any; onPress: () => void }) {
  const emoji = SUBJECT_EMOJI[activity.subject?.toLowerCase()] ?? SUBJECT_EMOJI.default;
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: theme.radius }]}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={activity.title}
    >
      <View style={[styles.iconBg, { backgroundColor: theme.accentMuted, borderRadius: theme.radiusSm }]}>
        <Text style={styles.cardEmoji}>{emoji}</Text>
      </View>
      <View style={styles.cardBody}>
        <Text style={[styles.cardTitle, { fontFamily: theme.fontHead, color: theme.text }]} numberOfLines={2}>
          {activity.title}
        </Text>
        <Text style={[styles.cardMeta, { fontFamily: theme.fontMono, color: theme.textFaint }]}>
          {[activity.subject, activity.estimated_duration_minutes ? `${activity.estimated_duration_minutes} min` : null]
            .filter(Boolean).join(' · ')}
        </Text>
        {activity.location_name && (
          <Text style={[styles.cardLocation, { fontFamily: theme.fontBody, color: theme.textMuted }]} numberOfLines={1}>
            📍 {activity.location_name}
          </Text>
        )}
      </View>
      <Text style={[styles.chevron, { color: theme.textFaint }]}>›</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root:         { flex: 1 },
  header:       { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  title:        { fontSize: 28, fontWeight: '700' },
  center:       { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  errorText:    { fontSize: 14, textAlign: 'center' },
  emptyText:    { fontSize: 14, textAlign: 'center', lineHeight: 22 },
  retryBtn:     { borderWidth: 1, paddingHorizontal: 16, paddingVertical: 8 },
  retryLabel:   { fontSize: 14 },
  card:         { flexDirection: 'row', alignItems: 'center', padding: 12, borderWidth: 1, gap: 12 },
  iconBg:       { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  cardEmoji:    { fontSize: 22 },
  cardBody:     { flex: 1, gap: 3 },
  cardTitle:    { fontSize: 15, fontWeight: '600', lineHeight: 20 },
  cardMeta:     { fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase' },
  cardLocation: { fontSize: 12 },
  chevron:       { fontSize: 22, fontWeight: '300' },
  offlineBanner: { marginHorizontal: 16, marginTop: 4, padding: 8, borderRadius: 6 },
  offlineText:   { fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', textAlign: 'center' },
});
