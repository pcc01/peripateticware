// src/components/AsrDiagnosticsPanel.tsx
// Settings panel for reviewing/exporting the on-device ASR diagnostics
// collected by src/lib/asrDiagnostics.ts (one row per audio recording — see
// that file's header comment and CaptureSheet.tsx's recordCaptureDiagnostic
// for what's captured and why).
//
// Pre-ship testing tool, not a real-user-facing feature — always visible
// for now because this app isn't shipping yet (per 2026-09-13 discussion).
// Before shipping, either remove this from settings.tsx or gate it behind
// something that keeps it out of a real user's hands.

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Share, Alert, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Theme } from '@/src/theme/tokens';
import { getAsrDiagnosticsSummary, exportAsrDiagnosticsJson, clearAsrDiagnostics, AsrDiagnosticsSummary } from '@/src/lib/asrDiagnostics';

function fmtMs(ms: number | null): string {
  return ms == null ? '—' : `${Math.round(ms)} ms`;
}

function fmtPct(fraction: number | null): string {
  return fraction == null ? '—' : `${(fraction * 100).toFixed(1)}%`;
}

export default function AsrDiagnosticsPanel({ theme }: { theme: Theme }) {
  const { t } = useTranslation();
  const [summary, setSummary] = useState<AsrDiagnosticsSummary | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    getAsrDiagnosticsSummary().then(setSummary).catch(() => setSummary(null));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleShare = async () => {
    setBusy(true);
    try {
      const json = await exportAsrDiagnosticsJson();
      await Share.share({ message: json, title: 'ASR diagnostics' });
    } catch {
      Alert.alert(t('common.error', 'Something went wrong'), t('settings.asrDiagnostics.shareError', 'Could not export diagnostics.'));
    } finally {
      setBusy(false);
    }
  };

  const handleClear = () => {
    Alert.alert(
      t('settings.asrDiagnostics.clearTitle', 'Clear diagnostics?'),
      t('settings.asrDiagnostics.clearBody', 'This deletes all recorded diagnostics rows from this device. Export first if you need them.'),
      [
        { text: t('common.cancel', 'Cancel'), style: 'cancel' },
        {
          text: t('common.clear', 'Clear'),
          style: 'destructive',
          onPress: async () => {
            await clearAsrDiagnostics();
            refresh();
          },
        },
      ]
    );
  };

  if (!summary) {
    return (
      <View style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: theme.radius }]}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  return (
    <View style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: theme.radius }]}>
      <Text style={[styles.sectionLabel, { fontFamily: theme.fontMono, color: theme.textFaint }]}>
        {t('settings.asrDiagnostics.label', 'ASR DIAGNOSTICS (TESTING)')}
      </Text>
      <Text style={[styles.desc, { fontFamily: theme.fontBody, color: theme.textMuted }]}>
        {t('settings.asrDiagnostics.desc', 'One row per voice recording, to check whether on-device transcription costs anything — battery, recording quality, or speed. Never leaves this device except when you export it below.')}
      </Text>

      <View style={styles.statsGrid} testID="asr-diagnostics-summary">
        <Stat theme={theme} label={t('settings.asrDiagnostics.recordings', 'Recordings logged')} value={String(summary.count)} />
        <Stat theme={theme} label={t('settings.asrDiagnostics.attempted', 'Recognition attempted')} value={String(summary.recognitionAttemptedCount)} />
        <Stat theme={theme} label={t('settings.asrDiagnostics.avgLatency', 'Avg. start latency')} value={fmtMs(summary.avgRecognitionStartLatencyMs)} />
        <Stat theme={theme} label={t('settings.asrDiagnostics.avgBatteryDrop', 'Avg. battery drop')} value={fmtPct(summary.avgBatteryDrop)} />
        <Stat
          theme={theme}
          label={t('settings.asrDiagnostics.mediaReset', 'Recording interrupted (iOS)')}
          value={String(summary.mediaServicesResetCount)}
          flagged={summary.mediaServicesResetCount > 0}
        />
        <Stat
          theme={theme}
          label={t('settings.asrDiagnostics.truncated', 'Possibly truncated')}
          value={String(summary.possibleTruncationCount)}
          flagged={summary.possibleTruncationCount > 0}
        />
      </View>

      <View style={styles.buttonRow}>
        <TouchableOpacity
          testID="asr-diagnostics-share"
          onPress={handleShare}
          disabled={busy || summary.count === 0}
          style={[styles.button, { borderColor: theme.accent, borderRadius: theme.radiusSm, opacity: summary.count === 0 ? 0.5 : 1 }]}
          accessibilityRole="button"
        >
          <Text style={[styles.buttonLabel, { color: theme.accent, fontFamily: theme.fontBody }]}>
            {t('settings.asrDiagnostics.share', 'Share diagnostics (JSON)')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="asr-diagnostics-clear"
          onPress={handleClear}
          disabled={busy || summary.count === 0}
          style={[styles.button, { borderColor: theme.warn, borderRadius: theme.radiusSm, opacity: summary.count === 0 ? 0.5 : 1 }]}
          accessibilityRole="button"
        >
          <Text style={[styles.buttonLabel, { color: theme.warn, fontFamily: theme.fontBody }]}>
            {t('common.clear', 'Clear')}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function Stat({ theme, label, value, flagged }: { theme: Theme; label: string; value: string; flagged?: boolean }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { fontFamily: theme.fontHead, color: flagged ? theme.warn : theme.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { fontFamily: theme.fontBody, color: theme.textFaint }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section:     { padding: 14, borderWidth: 1, gap: 10 },
  sectionLabel:{ fontSize: 9, letterSpacing: 1.4, textTransform: 'uppercase' },
  desc:        { fontSize: 12, lineHeight: 18 },
  statsGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  stat:        { width: '45%', gap: 2 },
  statValue:   { fontSize: 18, fontWeight: '700' },
  statLabel:   { fontSize: 10, lineHeight: 14 },
  buttonRow:   { flexDirection: 'row', gap: 10 },
  button:      { flex: 1, borderWidth: 1, padding: 10, alignItems: 'center' },
  buttonLabel: { fontSize: 13, fontWeight: '600' },
});
