// app/session-monitor/[id].tsx — live detail view for one field session.
// Polls GET /sessions/{id}/events every 5s (same interval and mechanism as
// web's useSessionWebSocket hook — see src/api/liveTracking.ts's header
// comment for why this is REST polling, not an actual WebSocket) and shows
// the most recent known location plus a feed of capture/inquiry events as
// they arrive. No map — mobile has no map dependency yet; this is the same
// "lean read-only summary" scope call as the other dashboards.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/src/theme/ThemeContext';
import { fetchSessionEvents, SessionEvent } from '@/src/api/liveTracking';

const POLL_INTERVAL_MS = 5_000;

interface KnownLocation {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  at: string;
}

function agoLabel(iso: string, t: (k: string, d: string, o?: any) => any): string {
  const secs = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return t('liveTracking.secondsAgo', '{{n}}s ago', { n: secs });
  const mins = Math.floor(secs / 60);
  if (mins < 60) return t('liveTracking.minutesAgo', '{{n}}m ago', { n: mins });
  return t('liveTracking.hoursAgo', '{{n}}h ago', { n: Math.floor(mins / 60) });
}

export default function SessionMonitorScreen() {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { id, studentName, activityTitle } = useLocalSearchParams<{ id: string; studentName?: string; activityTitle?: string }>();

  const [location, setLocation] = useState<KnownLocation | null>(null);
  const [events, setEvents] = useState<SessionEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const sinceRef = useRef<string>(new Date(0).toISOString());

  const poll = useCallback(async () => {
    if (!id) return;
    try {
      const newEvents = await fetchSessionEvents(id, sinceRef.current);
      setConnected(true);
      if (newEvents.length > 0) {
        sinceRef.current = newEvents[newEvents.length - 1].created_at;
        setEvents((prev) => [...newEvents.slice().reverse(), ...prev]);
        for (const ev of newEvents) {
          if (ev.event_type === 'location_update' && ev.metadata?.latitude != null && ev.metadata?.longitude != null) {
            setLocation({
              latitude: ev.metadata.latitude,
              longitude: ev.metadata.longitude,
              accuracy: ev.metadata.accuracy ?? null,
              at: ev.created_at,
            });
          }
        }
      }
    } catch {
      setConnected(false);
    }
  }, [id]);

  useEffect(() => {
    sinceRef.current = new Date(0).toISOString();
    setEvents([]);
    setLocation(null);
    poll().finally(() => setLoading(false));
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [id, poll]);

  return (
    <SafeAreaView testID="session-monitor-screen" style={[styles.root, { backgroundColor: theme.bg }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity
          testID="session-monitor-back-btn"
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.backTouchTarget}
          accessibilityRole="button"
          accessibilityLabel={t('common.back', 'Back')}
        >
          <Text style={[styles.backArrow, { color: theme.accent }]}>{'‹'}</Text>
          <Text style={[styles.backBtn, { color: theme.accent }]}>{t('common.back', 'Back')}</Text>
        </TouchableOpacity>
        <View
          style={[styles.connectionPill, { borderColor: connected ? theme.accent : theme.warn }]}
          accessible
          accessibilityLabel={connected ? t('liveTracking.live', 'LIVE') : t('liveTracking.disconnected', 'DISCONNECTED')}
        >
          <View style={[styles.connectionDot, { backgroundColor: connected ? theme.accent : theme.warn }]} />
          <Text style={[styles.connectionText, { fontFamily: theme.fontMono, color: connected ? theme.accent : theme.warn }]}>
            {connected ? t('liveTracking.live', 'LIVE') : t('liveTracking.disconnected', 'DISCONNECTED')}
          </Text>
        </View>
      </View>

      <View style={styles.titleBlock}>
        <Text style={[styles.studentName, { fontFamily: theme.fontHead, color: theme.text }]}>{studentName ?? ''}</Text>
        {!!activityTitle && (
          <Text style={[styles.activityTitle, { fontFamily: theme.fontBody, color: theme.textMuted }]}>{activityTitle}</Text>
        )}
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={theme.accent} size="large" /></View>
      ) : (
        <FlatList
          data={events}
          keyExtractor={(e) => e.id}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          ListHeaderComponent={
            <View style={[styles.locationCard, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: theme.radius }]}>
              <Text style={[styles.sectionLabel, { fontFamily: theme.fontMono, color: theme.textFaint }]}>{t('liveTracking.lastKnownLocation', 'LAST KNOWN LOCATION')}</Text>
              {location ? (
                <>
                  <Text style={[styles.coords, { fontFamily: theme.fontMono, color: theme.text }]}>
                    {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}
                  </Text>
                  <Text style={[styles.coordsMeta, { fontFamily: theme.fontBody, color: theme.textFaint }]}>
                    {location.accuracy != null ? `±${Math.round(location.accuracy)}m · ` : ''}{agoLabel(location.at, t)}
                  </Text>
                </>
              ) : (
                <Text style={[styles.emptyText, { fontFamily: theme.fontBody, color: theme.textMuted }]}>
                  {t('liveTracking.noLocationYet', 'No location update received yet.')}
                </Text>
              )}
              <Text style={[styles.sectionLabel, { fontFamily: theme.fontMono, color: theme.textFaint, marginTop: 14 }]}>{t('liveTracking.activityFeed', 'ACTIVITY FEED')}</Text>
            </View>
          }
          ListEmptyComponent={
            <Text style={[styles.emptyText, { fontFamily: theme.fontBody, color: theme.textMuted, textAlign: 'center', paddingVertical: 16 }]}>
              {t('liveTracking.noEvents', 'No activity yet.')}
            </Text>
          }
          renderItem={({ item }) => (
            <View style={[styles.eventRow, { backgroundColor: theme.surfaceAlt, borderColor: theme.border, borderRadius: theme.radiusSm }]}>
              <Text style={[styles.eventType, { fontFamily: theme.fontBody, color: theme.text }]}>
                {item.event_type === 'capture_added' ? '📸' : item.event_type === 'location_update' ? '📍' : '•'} {item.event_type.replace('_', ' ')}
              </Text>
              <Text style={[styles.eventTime, { fontFamily: theme.fontMono, color: theme.textFaint }]}>{agoLabel(item.created_at, t)}</Text>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:        { flex: 1 },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  backTouchTarget: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 },
  backArrow:   { fontSize: 16 },
  backBtn:     { fontSize: 16 },
  connectionPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderRadius: 999 },
  connectionDot:  { width: 7, height: 7, borderRadius: 4 },
  connectionText: { fontSize: 10, letterSpacing: 0.6 },
  titleBlock:  { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  studentName: { fontSize: 22, fontWeight: '700' },
  activityTitle: { fontSize: 13, marginTop: 2 },
  center:      { flex: 1, alignItems: 'center', justifyContent: 'center' },
  locationCard:{ padding: 14, borderWidth: 1, gap: 4, marginBottom: 4 },
  sectionLabel:{ fontSize: 9, letterSpacing: 1.4, textTransform: 'uppercase' },
  coords:      { fontSize: 16, fontWeight: '600', marginTop: 4 },
  coordsMeta:  { fontSize: 12, marginTop: 2 },
  emptyText:   { fontSize: 13, lineHeight: 19 },
  eventRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 10, borderWidth: 1 },
  eventType:   { fontSize: 13, textTransform: 'capitalize' },
  eventTime:   { fontSize: 10, letterSpacing: 0.4 },
});
