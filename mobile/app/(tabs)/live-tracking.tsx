// app/(tabs)/live-tracking.tsx — list of currently in-progress field
// sessions on this teacher's activities. Tapping one opens
// app/session-monitor/[id].tsx for live polling detail. See
// src/api/liveTracking.ts for why this polls GET /sessions/{id}/events
// instead of using a WebSocket — the backend WS endpoint was never
// implemented; REST polling is the real, working mechanism web already
// settled on.

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import MapView, { UrlTile, Marker } from 'react-native-maps';
import { useTheme } from '@/src/theme/ThemeContext';
import { fetchActiveSessions, ActiveSession } from '@/src/api/liveTracking';

// Same OSM tile source web's Leaflet Map.tsx uses. NOTE: on Android this still
// needs a real Google Maps API key (AndroidManifest.xml) — react-native-maps
// wraps the real Google Maps SDK there, which won't render this overlay (or
// anything else) without one. Confirmed via adb logcat "Authorization failure".
const OSM_TILE_URL = 'https://{a-c}.tile.openstreetmap.org/{z}/{x}/{y}.png';

// Stable per-activity color, same hashing approach as web's ProjectLiveTracker.
const ACTIVITY_COLORS = ['#2563eb', '#16a34a', '#dc2626', '#9333ea', '#ea580c', '#0891b2', '#be185d', '#ca8a04'];
function activityColor(activityId: string): string {
  const hash = activityId.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return ACTIVITY_COLORS[hash % ACTIVITY_COLORS.length];
}

function elapsedLabel(startedAt: string | null): string {
  if (!startedAt) return '';
  const ms = Date.now() - new Date(startedAt).getTime();
  const mins = Math.max(0, Math.floor(ms / 60000));
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export default function LiveTrackingScreen() {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const mappable = sessions.filter((s) => s.latitude != null && s.longitude != null);

  const load = useCallback(async () => {
    try {
      setError(false);
      setSessions(await fetchActiveSessions());
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
    // Refresh the roster of who's currently active every 15s — the
    // session-monitor detail screen polls its own events much more often;
    // this list only needs to catch students starting/finishing sessions.
    const interval = setInterval(load, 15_000);
    return () => clearInterval(interval);
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return (
    <SafeAreaView testID="live-tracking-screen" style={[styles.root, { backgroundColor: theme.bg }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { fontFamily: theme.fontHead, color: theme.text }]}>{t('liveTracking.title', 'Live Tracking')}</Text>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={theme.accent} size="large" /></View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={[styles.emptyText, { color: theme.textMuted, fontFamily: theme.fontBody }]}>
            {t('liveTracking.loadError', 'Could not load active sessions.')}
          </Text>
        </View>
      ) : (
        <FlatList
          testID="live-tracking-list"
          data={sessions}
          keyExtractor={(s) => s.session_id}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
          ListHeaderComponent={
            mappable.length > 0 ? (
              <MapView
                testID="live-tracking-map"
                style={styles.overviewMap}
                initialRegion={{
                  latitude: mappable[0].latitude as number,
                  longitude: mappable[0].longitude as number,
                  latitudeDelta: 0.2,
                  longitudeDelta: 0.2,
                }}
              >
                <UrlTile urlTemplate={OSM_TILE_URL} maximumZ={19} flipY={false} />
                {mappable.map((s) => (
                  <Marker
                    key={s.session_id}
                    coordinate={{ latitude: s.latitude as number, longitude: s.longitude as number }}
                    pinColor={activityColor(s.activity_id)}
                    title={s.student_name}
                    description={s.activity_title}
                    onPress={() => router.push({ pathname: '/session-monitor/[id]', params: { id: s.session_id, studentName: s.student_name, activityTitle: s.activity_title, lat: s.latitude ?? '', lng: s.longitude ?? '' } })}
                  />
                ))}
              </MapView>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyEmoji}>📍</Text>
              <Text style={[styles.emptyText, { fontFamily: theme.fontBody, color: theme.textMuted }]}>
                {t('liveTracking.empty', 'No students are currently out in the field.')}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              testID={`live-session-${item.session_id}`}
              onPress={() => router.push({ pathname: '/session-monitor/[id]', params: { id: item.session_id, studentName: item.student_name, activityTitle: item.activity_title, lat: item.latitude ?? '', lng: item.longitude ?? '' } })}
              style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: theme.radius }]}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel={t('liveTracking.cardAccessibilityLabel', '{{name}}, {{activity}}, started {{elapsed}} ago', { name: item.student_name, activity: item.activity_title, elapsed: elapsedLabel(item.started_at) })}
            >
              <View style={styles.cardHeaderRow}>
                <View style={[styles.liveDot, { backgroundColor: theme.warn }]} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.studentName, { fontFamily: theme.fontHead, color: theme.text }]}>{item.student_name}</Text>
                  <Text style={[styles.activityTitle, { fontFamily: theme.fontBody, color: theme.textMuted }]} numberOfLines={1}>{item.activity_title}</Text>
                </View>
                <Text style={[styles.elapsed, { fontFamily: theme.fontMono, color: theme.textFaint }]}>{elapsedLabel(item.started_at)}</Text>
              </View>
              {!!item.location_name && (
                <Text style={[styles.locationName, { fontFamily: theme.fontMono, color: theme.textFaint }]}>📍 {item.location_name}</Text>
              )}
            </TouchableOpacity>
          )}
        />
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
  overviewMap:  { width: '100%', height: 200, borderRadius: 12, marginBottom: 10 },
  card:         { padding: 14, borderWidth: 1, gap: 6 },
  cardHeaderRow:{ flexDirection: 'row', alignItems: 'center', gap: 10 },
  liveDot:      { width: 8, height: 8, borderRadius: 4 },
  studentName:  { fontSize: 16, fontWeight: '700' },
  activityTitle:{ fontSize: 12, marginTop: 1 },
  elapsed:      { fontSize: 11, letterSpacing: 0.4 },
  locationName: { fontSize: 11, letterSpacing: 0.3 },
});
