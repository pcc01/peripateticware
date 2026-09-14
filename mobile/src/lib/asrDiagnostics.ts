// src/lib/asrDiagnostics.ts
//
// Local-only instrumentation for the on-device speech-recognition feature
// (CaptureSheet.tsx running expo-speech-recognition alongside expo-av's
// recording — see AUDIO_TRANSCRIPTION_ON_DEVICE_HANDOFF.md, Task B). Exists
// to answer one question concretely, per recording, instead of by feel:
// "did running on-device ASR alongside the recording cost anything?" —
// battery, recording integrity, or noticeable latency.
//
// Never sent to any server. This is a pre-ship testing aid: rows live in
// the on-device SQLite db (asr_diagnostics table, see db/database.ts) and
// are reviewed/exported from Settings (see
// src/components/AsrDiagnosticsPanel.tsx) via the OS share sheet. Before
// shipping, either remove the Settings panel or gate it behind something
// that keeps it out of a real user's hands — it's intentionally always-on
// for now because this app isn't shipping yet (per 2026-09-13 discussion).

import { Platform } from 'react-native';
import * as Battery from 'expo-battery';
import * as Device from 'expo-device';
import { getDb } from '@/src/db/database';

export interface AsrDiagnosticEntry {
  appLanguage: string;
  sttLocale: string;
  recognitionAvailable: boolean;
  recognitionAttempted: boolean;
  /** ms between calling ExpoSpeechRecognitionModule.start() and receiving
   * the native "start" event — recognition startup overhead. Null if
   * recognition was never attempted, or never actually started. */
  recognitionStartLatencyMs: number | null;
  recognitionErrorCode: string | null;
  recognitionTranscriptLength: number;
  recordingExpectedDurationS: number;
  /** From expo-av's RecordingStatus.durationMillis after stopAndUnloadAsync
   * — compared against the expected duration above as a truncation check. */
  recordingActualDurationMs: number | null;
  recordingFileSizeBytes: number | null;
  /** iOS-only: RecordingStatus.mediaServicesDidReset — true means the audio
   * session was reset mid-recording (e.g. by another audio consumer
   * grabbing it), which is the closest direct signal expo-av exposes for
   * "something interfered with this recording." Always false on Android
   * (the field doesn't exist there). */
  recordingMediaServicesReset: boolean;
  batteryLevelBefore: number | null;
  batteryLevelAfter: number | null;
  batteryStateBefore: string | null;
  lowPowerMode: boolean | null;
  /** Wall-clock ms from starting the recording to finishing the upload
   * hand-off — a rough proxy for whether the whole record+recognize
   * operation feels slow to the student. */
  totalWallTimeMs: number;
}

interface DeviceContext {
  platform: string;
  osVersion: string | null;
  deviceModel: string | null;
  isPhysicalDevice: boolean;
}

function getDeviceContext(): DeviceContext {
  return {
    platform: Platform.OS,
    osVersion: Device.osVersion,
    deviceModel: Device.modelName,
    // Recording/recognition behavior on a simulator/emulator is known to
    // differ from a real device (e.g. iOS Simulator has no mic input at
    // all — see mobile/docs/mobile-test-plan.md's 12.2-audio-capture note)
    // — worth knowing at a glance which rows came from which.
    isPhysicalDevice: Device.isDevice,
  };
}

/** Best-effort battery snapshot — never throws. Returns nulls on a device/
 * emulator that can't report battery state rather than blocking anything. */
export async function snapshotBattery(): Promise<{
  level: number | null;
  state: string | null;
  lowPowerMode: boolean | null;
}> {
  try {
    if (!(await Battery.isAvailableAsync())) return { level: null, state: null, lowPowerMode: null };
    const power = await Battery.getPowerStateAsync();
    return {
      level: power.batteryLevel >= 0 ? power.batteryLevel : null,
      state: Battery.BatteryState[power.batteryState] ?? null,
      lowPowerMode: power.lowPowerMode,
    };
  } catch {
    return { level: null, state: null, lowPowerMode: null };
  }
}

/** Persist one diagnostic row. Best-effort — a failure here must never
 * affect the actual capture upload; callers should fire-and-forget or wrap
 * in their own try/catch. */
export async function recordAsrDiagnostic(entry: AsrDiagnosticEntry): Promise<void> {
  const ctx = getDeviceContext();
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO asr_diagnostics (
      id, captured_at, platform, os_version, device_model, is_physical_device,
      app_language, stt_locale,
      recognition_available, recognition_attempted, recognition_start_latency_ms,
      recognition_error_code, recognition_transcript_length,
      recording_expected_duration_s, recording_actual_duration_ms,
      recording_file_size_bytes, recording_media_services_reset,
      battery_level_before, battery_level_after, battery_state_before, low_power_mode,
      total_wall_time_ms
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      Date.now(),
      ctx.platform,
      ctx.osVersion,
      ctx.deviceModel,
      ctx.isPhysicalDevice ? 1 : 0,
      entry.appLanguage,
      entry.sttLocale,
      entry.recognitionAvailable ? 1 : 0,
      entry.recognitionAttempted ? 1 : 0,
      entry.recognitionStartLatencyMs,
      entry.recognitionErrorCode,
      entry.recognitionTranscriptLength,
      entry.recordingExpectedDurationS,
      entry.recordingActualDurationMs,
      entry.recordingFileSizeBytes,
      entry.recordingMediaServicesReset ? 1 : 0,
      entry.batteryLevelBefore,
      entry.batteryLevelAfter,
      entry.batteryStateBefore,
      entry.lowPowerMode === null ? null : entry.lowPowerMode ? 1 : 0,
      entry.totalWallTimeMs,
    ]
  );
}

export interface AsrDiagnosticRow extends Record<string, unknown> {
  id: string;
  captured_at: number;
  platform: string;
  os_version: string | null;
  device_model: string | null;
  is_physical_device: number;
  app_language: string;
  stt_locale: string;
  recognition_available: number;
  recognition_attempted: number;
  recognition_start_latency_ms: number | null;
  recognition_error_code: string | null;
  recognition_transcript_length: number;
  recording_expected_duration_s: number;
  recording_actual_duration_ms: number | null;
  recording_file_size_bytes: number | null;
  recording_media_services_reset: number;
  battery_level_before: number | null;
  battery_level_after: number | null;
  battery_state_before: string | null;
  low_power_mode: number | null;
  total_wall_time_ms: number;
}

export async function getAsrDiagnostics(limit = 500): Promise<AsrDiagnosticRow[]> {
  const db = await getDb();
  return db.getAllAsync<AsrDiagnosticRow>(
    'SELECT * FROM asr_diagnostics ORDER BY captured_at DESC LIMIT ?',
    [limit]
  );
}

export interface AsrDiagnosticsSummary {
  count: number;
  recognitionAttemptedCount: number;
  recognitionErrorCount: number;
  /** Recordings shorter than 90% of their expected duration — a rough
   * truncation/corruption signal, independent of whether recognition also
   * errored. */
  possibleTruncationCount: number;
  mediaServicesResetCount: number;
  avgRecognitionStartLatencyMs: number | null;
  /** Average battery-level drop (0..1 scale) across rows with both a
   * before and after reading. Null if too few readings to be meaningful. */
  avgBatteryDrop: number | null;
}

export async function getAsrDiagnosticsSummary(): Promise<AsrDiagnosticsSummary> {
  const rows = await getAsrDiagnostics(2000);
  const attempted = rows.filter((r) => r.recognition_attempted);
  const withLatency = attempted.filter((r) => r.recognition_start_latency_ms != null);
  const withBattery = rows.filter((r) => r.battery_level_before != null && r.battery_level_after != null);
  const truncation = rows.filter(
    (r) =>
      r.recording_actual_duration_ms != null &&
      r.recording_expected_duration_s > 0 &&
      r.recording_actual_duration_ms < r.recording_expected_duration_s * 1000 * 0.9
  );

  return {
    count: rows.length,
    recognitionAttemptedCount: attempted.length,
    recognitionErrorCount: rows.filter((r) => r.recognition_error_code).length,
    possibleTruncationCount: truncation.length,
    mediaServicesResetCount: rows.filter((r) => r.recording_media_services_reset).length,
    avgRecognitionStartLatencyMs: withLatency.length
      ? withLatency.reduce((sum, r) => sum + (r.recognition_start_latency_ms ?? 0), 0) / withLatency.length
      : null,
    avgBatteryDrop: withBattery.length
      ? withBattery.reduce((sum, r) => sum + ((r.battery_level_before ?? 0) - (r.battery_level_after ?? 0)), 0) /
        withBattery.length
      : null,
  };
}

export async function exportAsrDiagnosticsJson(): Promise<string> {
  const rows = await getAsrDiagnostics(2000);
  return JSON.stringify(rows, null, 2);
}

export async function clearAsrDiagnostics(): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM asr_diagnostics');
}
