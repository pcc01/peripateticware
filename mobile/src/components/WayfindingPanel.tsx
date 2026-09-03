// src/components/WayfindingPanel.tsx
// Multi-step scavenger-hunt navigation UI: a map with the route + stops, a
// "next stop" card with live distance and a bearing arrow, and progress.
//
// Rung B — the student's position is read on the phone (useWayfinding) and
// never sent. On arrival we report only WHICH stop was reached
// (recordWaypointArrival). See WAYFINDING_CONSENT_LADDER.md.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import MapView, { UrlTile, Marker, Polyline } from 'react-native-maps';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/src/theme/ThemeContext';
import type { WayfindingDetail, Waypoint } from '@/src/api/activities';
import {
  recordWaypointArrival,
  fetchWaypointProgress,
  fetchMyCapability,
  postLivePosition,
  postTrackBatch,
  WaypointProgress,
  WayfindingCapability,
} from '@/src/api/wayfinding';
import { useWayfinding } from '@/src/hooks/useWayfinding';
import WayfindingConsentCard from '@/src/components/WayfindingConsentCard';
import { useConnectivity } from '@/src/hooks/useConnectivity';
import {
  recordLocalArrival,
  markLocalArrivalSynced,
  getLocalArrivedIds,
} from '@/src/db/wayfindingStore';
import {
  prefetchTilesForRoute,
  TILE_CACHE_PATH,
  TILE_CACHE_MAX_AGE_SEC,
} from '@/src/lib/tileCache';

const OSM_TILE_URL = 'https://{a-c}.tile.openstreetmap.org/{z}/{x}/{y}.png';

interface Props {
  activityId: string;
  wayfinding: WayfindingDetail;
  sessionId: string | null;
  /** Called when the reached stop asks for a photo/note so the parent can
   *  open the existing CaptureSheet. */
  onCaptureRequested?: (mode: 'photo' | 'note') => void;
}

function regionForWaypoints(wps: Waypoint[]) {
  const lats = wps.map((w) => w.latitude);
  const lons = wps.map((w) => w.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLon + maxLon) / 2,
    latitudeDelta: Math.max(0.005, (maxLat - minLat) * 1.6),
    longitudeDelta: Math.max(0.005, (maxLon - minLon) * 1.6),
  };
}

export default function WayfindingPanel({
  activityId,
  wayfinding,
  sessionId,
  onCaptureRequested,
}: Props) {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { isOnline } = useConnectivity();
  const mountedAt = useRef(Date.now());

  const [progress, setProgress] = useState<WaypointProgress | null>(null);
  const [localArrivedIds, setLocalArrivedIds] = useState<Set<string>>(new Set());
  const [busyWaypointId, setBusyWaypointId] = useState<string | null>(null);
  const [capability, setCapability] = useState<WayfindingCapability | null>(null);

  const refreshCapability = useCallback(async () => {
    const c = await fetchMyCapability(activityId);
    if (c) setCapability(c);
  }, [activityId]);

  useEffect(() => {
    refreshCapability();
  }, [refreshCapability]);

  const waypoints = useMemo(
    () => [...wayfinding.waypoints].sort((a, b) => a.sequence_index - b.sequence_index),
    [wayfinding.waypoints]
  );

  // Reached stops = server progress ∪ this device's local mirror. The local
  // set is authoritative for advancing the hunt offline; the server set adds
  // anything reached on another device / before this install.
  const arrivedIds = useMemo(() => {
    const s = new Set<string>(localArrivedIds);
    progress?.progress?.forEach((p) => {
      if (p.arrived_at) s.add(p.waypoint_id);
    });
    return s;
  }, [progress, localArrivedIds]);

  const refreshProgress = useCallback(async () => {
    if (!sessionId) return;
    const p = await fetchWaypointProgress(sessionId);
    if (p) setProgress(p);
  }, [sessionId]);

  useEffect(() => {
    refreshProgress();
  }, [refreshProgress]);

  // Seed the local reached-set from the on-device mirror (works offline).
  useEffect(() => {
    let cancelled = false;
    getLocalArrivedIds(activityId).then((ids) => {
      if (!cancelled && ids.size) setLocalArrivedIds(ids);
    });
    return () => {
      cancelled = true;
    };
  }, [activityId]);

  // Pre-cache the basemap tiles for this route whenever we have a connection,
  // so the map still draws in the field with no data.
  useEffect(() => {
    if (isOnline && wayfinding.waypoints?.length) {
      prefetchTilesForRoute(wayfinding).catch(() => {});
    }
  }, [isOnline, wayfinding]);

  const handleArrive = useCallback(
    async (wp: Waypoint, inSequence: boolean) => {
      setBusyWaypointId(wp.id);
      // 1. Local-first — the hunt advances and is queued for sync even with
      //    no signal and no session yet.
      await recordLocalArrival(activityId, wp, { inSequence });
      setLocalArrivedIds((prev) => {
        if (prev.has(wp.id)) return prev;
        const next = new Set(prev);
        next.add(wp.id);
        return next;
      });
      // 2. Best-effort direct report when a live session exists.
      if (sessionId) {
        const updated = await recordWaypointArrival(sessionId, wp.id, { inSequence });
        if (updated) {
          setProgress(updated);
          await markLocalArrivalSynced(activityId, wp.id);
        } else {
          await refreshProgress();
        }
      }
      setBusyWaypointId(null);

      const reqs = wp.capture_requirements || {};
      if (reqs.photo) onCaptureRequested?.('photo');
      else if (reqs.note) onCaptureRequested?.('note');
    },
    [activityId, sessionId, refreshProgress, onCaptureRequested]
  );

  const handleLiveFix = useCallback(
    (lat: number, lon: number, acc: number | null) => {
      if (sessionId) postLivePosition(sessionId, lat, lon, acc);
    },
    [sessionId]
  );

  const { activeWaypoint, distanceMeters, relativeBearing, bearingDegrees, tracking, drainBreadcrumbs } =
    useWayfinding({
      waypoints,
      mode: wayfinding.mode,
      arrivedIds,
      enabled: true,
      // Always allow — handleArrive writes to the local mirror first, so an
      // arrival is never lost even before the session (or network) is ready.
      canArrive: true,
      onArrive: handleArrive,
      capabilityRung: capability?.effective_rung,
      onLiveFix: handleLiveFix,
    });

  // Rung E — flush buffered breadcrumbs every 30 s and once on unmount.
  useEffect(() => {
    if (!sessionId || capability?.effective_rung !== 'E') return;
    const flush = () => {
      const pts = drainBreadcrumbs();
      if (pts.length) postTrackBatch(sessionId, pts);
    };
    const iv = setInterval(flush, 30_000);
    return () => {
      clearInterval(iv);
      flush();
    };
  }, [sessionId, capability?.effective_rung, drainBreadcrumbs]);

  // Merged reached-set drives the bar; waypoint list length is always known
  // from the cached detail so it's the reliable total.
  const total = waypoints.length || progress?.total || 0;
  const reached = Math.min(arrivedIds.size, total || arrivedIds.size);
  const requiredIds = useMemo(
    () => waypoints.filter((w) => w.required).map((w) => w.id),
    [waypoints]
  );
  const localComplete =
    requiredIds.length > 0
      ? requiredIds.every((id) => arrivedIds.has(id))
      : total > 0 && arrivedIds.size >= total;
  const complete = (progress?.complete ?? false) || localComplete;

  const routeCoords = useMemo(
    () =>
      (wayfinding.route_geometry?.coordinates ?? []).map(([lon, lat]) => ({
        latitude: lat,
        longitude: lon,
      })),
    [wayfinding.route_geometry]
  );

  const initialRegion = useMemo(
    () => (waypoints.length ? regionForWaypoints(waypoints) : undefined),
    [waypoints]
  );

  const clueVisible = (wp: Waypoint): boolean => {
    if (!wp.clue_text) return false;
    switch (wp.hint_unlock_rule) {
      case 'on_arrival':
        return arrivedIds.has(wp.id);
      case 'after_minutes': {
        const mins = (Date.now() - mountedAt.current) / 60000;
        return mins >= (wp.hint_unlock_minutes ?? 0);
      }
      default:
        return true; // 'immediate' / null
    }
  };

  const markerColor = (wp: Waypoint) => {
    if (arrivedIds.has(wp.id)) return theme.accent; // reached
    if (activeWaypoint?.id === wp.id) return theme.warn; // next target
    return theme.textFaint; // pending
  };

  const arrowRotation = relativeBearing ?? bearingDegrees ?? 0;

  return (
    <View
      testID="wayfinding-panel"
      style={[styles.wrap, { borderColor: theme.border, borderRadius: theme.radius }]}
    >
      {capability && capability.consent_needed_for.length > 0 && (
        <View style={styles.consentWrap}>
          <WayfindingConsentCard
            activityId={activityId}
            rungs={capability.consent_needed_for}
            retentionCopy={capability.retention_copy}
            onChanged={refreshCapability}
          />
        </View>
      )}
      {initialRegion && (
        <MapView
          testID="wayfinding-map"
          style={styles.map}
          initialRegion={initialRegion}
          showsUserLocation
          showsMyLocationButton={false}
        >
          <UrlTile
            urlTemplate={OSM_TILE_URL}
            maximumZ={19}
            flipY={false}
            // Offline basemap: read/write tiles under this dir; when we have
            // no connection, use only what's already cached (with RN-maps'
            // built-in scale-from-lower-zoom fallback).
            tileCachePath={TILE_CACHE_PATH}
            tileCacheMaxAge={TILE_CACHE_MAX_AGE_SEC}
            offlineMode={!isOnline}
          />
          {routeCoords.length >= 2 && (
            <Polyline coordinates={routeCoords} strokeWidth={3} strokeColor={theme.accent} />
          )}
          {waypoints.map((wp, i) => (
            <Marker
              key={wp.id}
              testID={`wayfinding-marker-${i}`}
              coordinate={{ latitude: wp.latitude, longitude: wp.longitude }}
              title={`${i + 1}. ${wp.name}`}
              description={clueVisible(wp) ? wp.clue_text ?? undefined : undefined}
              pinColor={markerColor(wp)}
            />
          ))}
        </MapView>
      )}

      {/* Progress */}
      <View style={styles.progressRow}>
        <Text style={[styles.progressText, { fontFamily: theme.fontMono, color: theme.textMuted }]}>
          {t('wayfinding.progress', '{{reached}} of {{total}} stops', { reached, total })}
        </Text>
        <View style={[styles.progressTrack, { backgroundColor: theme.surfaceAlt }]}>
          <View
            style={[
              styles.progressFill,
              {
                backgroundColor: theme.accent,
                width: `${total ? Math.round((reached / total) * 100) : 0}%`,
              },
            ]}
          />
        </View>
      </View>

      {/* Next-stop card / done state */}
      {complete ? (
        <View style={[styles.card, { backgroundColor: theme.accentMuted, borderColor: theme.accent }]}>
          <Text style={[styles.doneText, { fontFamily: theme.fontHead, color: theme.accent }]}>
            {t('wayfinding.allFound', 'All stops found! 🎉')}
          </Text>
        </View>
      ) : activeWaypoint ? (
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.cardHead}>
            <View
              testID="wayfinding-bearing-arrow"
              style={[styles.arrow, { transform: [{ rotate: `${arrowRotation}deg` }] }]}
            >
              <Text style={[styles.arrowGlyph, { color: theme.accent }]}>↑</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.nextLabel, { fontFamily: theme.fontMono, color: theme.textFaint }]}>
                {t('wayfinding.nextStop', 'NEXT STOP')}
              </Text>
              <Text style={[styles.nextName, { fontFamily: theme.fontHead, color: theme.text }]}>
                {activeWaypoint.name}
              </Text>
            </View>
            <Text style={[styles.distance, { fontFamily: theme.fontMono, color: theme.text }]}>
              {distanceMeters != null
                ? distanceMeters >= 1000
                  ? `${(distanceMeters / 1000).toFixed(1)} km`
                  : `${distanceMeters} m`
                : tracking
                ? '…'
                : t('wayfinding.noFix', 'no GPS')}
            </Text>
          </View>

          {clueVisible(activeWaypoint) && (
            <Text style={[styles.clue, { fontFamily: theme.fontBody, color: theme.textMuted }]}>
              {activeWaypoint.clue_text}
            </Text>
          )}

          {!activeWaypoint.required && (
            <TouchableOpacity
              testID="wayfinding-skip"
              onPress={() => handleArrive(activeWaypoint, true)}
              disabled={busyWaypointId === activeWaypoint.id}
              style={[styles.skipBtn, { borderColor: theme.border }]}
            >
              {busyWaypointId === activeWaypoint.id ? (
                <ActivityIndicator color={theme.textMuted} />
              ) : (
                <Text style={[styles.skipText, { fontFamily: theme.fontBody, color: theme.textMuted }]}>
                  {t('wayfinding.skip', 'Skip this optional stop')}
                </Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderWidth: 1, overflow: 'hidden' },
  consentWrap: { padding: 12 },
  map: { width: '100%', height: 260 },
  progressRow: { paddingHorizontal: 14, paddingTop: 12, gap: 6 },
  progressText: { fontSize: 11, letterSpacing: 0.5 },
  progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3 },
  card: { margin: 14, padding: 14, borderWidth: 1, borderRadius: 10, gap: 10 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  arrow: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  arrowGlyph: { fontSize: 28, fontWeight: '900', lineHeight: 30 },
  nextLabel: { fontSize: 9, letterSpacing: 1.4 },
  nextName: { fontSize: 17, fontWeight: '700' },
  distance: { fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  clue: { fontSize: 14, lineHeight: 20 },
  doneText: { fontSize: 16, fontWeight: '700', textAlign: 'center' },
  skipBtn: { borderWidth: 1, borderRadius: 8, padding: 10, alignItems: 'center' },
  skipText: { fontSize: 13 },
});
