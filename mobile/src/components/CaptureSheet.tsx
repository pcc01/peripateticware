// src/components/CaptureSheet.tsx
// Native capture tools: photo (image picker), audio (expo-av), text note
// M-6: wraps upload to POST /api/v1/student/captures/upload

import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  Alert, ActivityIndicator, Modal, KeyboardAvoidingView, Platform, Linking,
} from 'react-native';
import { Audio } from 'expo-av';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { File } from 'expo-file-system';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { Theme } from '@/src/theme/tokens';
import { Capture } from '@/src/api/captures';
import { queueCapture } from '@/src/db/offlineQueue';
import InAppCamera, { CapturedFile } from '@/src/components/InAppCamera';
import SketchCanvas, { SketchCanvasHandle, SketchTool } from '@/src/components/SketchCanvas';
import { t } from '@/src/i18n/t';
import i18n from '@/src/i18n/index';
import { getSttLocale } from '@/src/i18n/locales';
import { recordAsrDiagnostic, snapshotBattery } from '@/src/lib/asrDiagnostics';

type CaptureMode = null | 'photo' | 'audio' | 'note' | 'video' | 'sketch';

interface Props {
  visible: boolean;
  onClose: () => void;
  onCaptured: (capture: Capture) => void;
  theme: Theme;
  sessionId?: string;
  activityId?: string;
  latitude?: number;
  longitude?: number;
  /** Jump straight into this mode instead of showing the picker — set when
   * the caller already knows which tool the student tapped (e.g. the
   * activity screen's own photo/audio/note/video row). Omit/null to show
   * the picker, e.g. when opened from a generic "add evidence" entry point. */
  initialMode?: CaptureMode;
}

/** Races a promise against a timeout so a hang in native code (expo-av,
 * expo-speech-recognition — anything this component doesn't control)
 * can't wedge the calling function forever. Rejects with `message` on
 * timeout; the original promise's eventual settlement past that point is
 * simply ignored (there's no way to cancel a native call from here). */
function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);
}

const MODES = [
  { mode: 'photo'  as CaptureMode, emoji: '📷', label: t('capture.mode.photo', 'Photo')  },
  { mode: 'audio'  as CaptureMode, emoji: '🎤', label: t('capture.mode.audio', 'Voice')  },
  { mode: 'note'   as CaptureMode, emoji: '✏️', label: t('capture.mode.note', 'Note')   },
  { mode: 'sketch' as CaptureMode, emoji: '🎨', label: t('capture.mode.sketch', 'Draw') },
  { mode: 'video'  as CaptureMode, emoji: '🎥', label: t('capture.mode.video', 'Video')  },
];

// Draw mode's color/thickness/shape palette (2026-09-14). A fixed, small
// set rather than a full color picker or a slider — this is a field
// activity sketch tool on a phone screen, not an illustration app; a
// handful of clearly-distinct colors and three thickness steps cover what
// a student actually needs (labeling a diagram, circling a detail,
// sketching a shape) without a control that's fiddly to hit accurately
// mid-activity. Matches this app's existing emoji-icon convention for
// buttons rather than introducing a new slider/picker component.
const SKETCH_COLORS = ['#1a1a1a', '#e53935', '#1e88e5', '#43a047', '#fb8c00', '#8e24aa'];
const SKETCH_WIDTHS: { value: number; label: string }[] = [
  { value: 2, label: 'S' },
  { value: 4, label: 'M' },
  { value: 8, label: 'L' },
];
const SKETCH_TOOLS: { tool: SketchTool; emoji: string; labelKey: string; fallback: string }[] = [
  { tool: 'pen',     emoji: '✏️', labelKey: 'capture.sketchTool.pen',     fallback: 'Pen' },
  { tool: 'line',    emoji: '📏', labelKey: 'capture.sketchTool.line',    fallback: 'Line' },
  { tool: 'rect',    emoji: '⬜', labelKey: 'capture.sketchTool.rect',    fallback: 'Rectangle' },
  { tool: 'ellipse', emoji: '⚪', labelKey: 'capture.sketchTool.ellipse', fallback: 'Circle' },
];

export default function CaptureSheet({
  visible, onClose, onCaptured, theme,
  sessionId, activityId, latitude, longitude, initialMode = null,
}: Props) {
  const [mode, setMode] = useState<CaptureMode>(initialMode);
  const [uploading, setUploading] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [justSaved, setJustSaved] = useState<{ mode: CaptureMode } | null>(null);

  // The sheet stays mounted across opens (only `visible` toggles), so re-sync
  // the starting mode each time it's opened — otherwise a second open with a
  // different initialMode would still show whatever mode was left over from
  // the previous session (or force everyone back through the picker after
  // the first use).
  React.useEffect(() => {
    if (visible) setMode(initialMode);
  }, [visible, initialMode]);

  // Audio recording state
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // On-device speech recognition, run as a SEPARATE session in parallel with
  // expo-av's Audio.Recording (which keeps recording the actual .m4a file
  // exactly as before, unchanged) — expo-speech-recognition has no API to
  // transcribe an already-recorded file, only to recognize a live mic
  // stream, so both consumers listen to the mic at once for the duration of
  // a recording. This is a real integration risk worth device-testing
  // explicitly (some OS/OEM combinations may only allow one exclusive audio
  // session): if recognition fails to start or errors mid-session, it must
  // never affect the underlying recording — the capture always saves either
  // way, just without a transcript. See
  // AUDIO_TRANSCRIPTION_ON_DEVICE_HANDOFF.md, Task B.
  const transcriptPartsRef = useRef<string[]>([]);
  const recognitionActiveRef = useRef(false);
  const recognitionEndResolverRef = useRef<(() => void) | null>(null);
  // Surfaced in the recording screen (Android only) when the on-device
  // speech model for the current language isn't downloaded yet — see
  // startOnDeviceRecognition's own comment for why this needed to become a
  // distinguishable, actionable state instead of a silent "unavailable".
  const [sttModelMissing, setSttModelMissing] = useState(false);

  // Diagnostics only (src/lib/asrDiagnostics.ts) — answers "did on-device
  // ASR cost anything?" concretely instead of by feel. None of this affects
  // the actual capture/upload; every value here is best-effort.
  const recognitionAvailableRef = useRef(false);
  const recognitionStartedAtRef = useRef<number | null>(null);
  const recognitionStartLatencyMsRef = useRef<number | null>(null);
  const recognitionErrorCodeRef = useRef<string | null>(null);
  const recordingStartedAtRef = useRef<number | null>(null);
  const batteryBeforeRef = useRef<{ level: number | null; state: string | null; lowPowerMode: boolean | null } | null>(null);

  useSpeechRecognitionEvent('result', (event) => {
    if (!event.isFinal) return;
    const text = event.results[0]?.transcript?.trim();
    if (text) transcriptPartsRef.current.push(text);
  });
  useSpeechRecognitionEvent('start', () => {
    if (recognitionStartedAtRef.current != null) {
      recognitionStartLatencyMsRef.current = Date.now() - recognitionStartedAtRef.current;
    }
  });
  useSpeechRecognitionEvent('end', () => {
    recognitionEndResolverRef.current?.();
    recognitionEndResolverRef.current = null;
  });
  useSpeechRecognitionEvent('error', (event) => {
    // Not fatal — the audio recording is a fully separate session and is
    // unaffected. The capture just won't have an on-device transcript.
    recognitionActiveRef.current = false;
    recognitionErrorCodeRef.current = event.error;
  });

  // Shared by the proactive mode-entry check below and startOnDeviceRecognition
  // itself — Android only; iOS has no public API to inspect on-device model
  // status (SFSpeechRecognizer downloads transparently). Returns null (not
  // false) when the check itself couldn't be completed (timeout/API
  // hiccup), so callers can tell "confirmed missing" apart from "unknown"
  // rather than treating a check failure as if the model were absent.
  const isSttModelInstalled = async (): Promise<boolean | null> => {
    if (Platform.OS !== 'android') return true;
    try {
      const sttLocale = getSttLocale(i18n.language);
      const { installedLocales } = await withTimeout(
        ExpoSpeechRecognitionModule.getSupportedLocales({}),
        4000,
        'getSupportedLocales timed out'
      );
      return installedLocales.includes(sttLocale);
    } catch {
      return null;
    }
  };

  // Proactive check (2026-09-14): as soon as the student opens the audio
  // recorder — before they've tapped record at all — so they can go set up
  // offline transcription first instead of only discovering the gap after
  // already recording something. startOnDeviceRecognition's own check
  // (right before actually starting recognition) stays as the authoritative
  // gate; this is purely for earlier, better-timed messaging.
  React.useEffect(() => {
    if (mode !== 'audio') return;
    let cancelled = false;
    isSttModelInstalled().then((installed) => {
      if (!cancelled && installed === false) setSttModelMissing(true);
    });
    return () => { cancelled = true; };
  }, [mode]);

  const startOnDeviceRecognition = async () => {
    transcriptPartsRef.current = [];
    recognitionActiveRef.current = false;
    recognitionErrorCodeRef.current = null;
    recognitionStartLatencyMsRef.current = null;
    recognitionStartedAtRef.current = null;
    setSttModelMissing(false);
    try {
      // isRecognitionAvailable() covers both "no speech recognizer on this
      // device at all" and "not available for the current OS version" —
      // either way, skip silently rather than degrade to network-based
      // recognition, which is not an option here (see requiresOnDeviceRecognition
      // below).
      const available = ExpoSpeechRecognitionModule.isRecognitionAvailable();
      recognitionAvailableRef.current = available;
      if (!available) return;

      // BUG FIX (2026-09-14, real report: "transcript unavailable on every
      // field recording"): isRecognitionAvailable() only answers "does this
      // device have a speech recognizer service at all" — it says nothing
      // about whether the ON-DEVICE model for this specific locale is
      // actually downloaded, which is a SEPARATE, Android-specific
      // requirement (see OfflineTranscriptionSettings.tsx's own docstring:
      // the offline model is opt-in, downloaded once via Settings, never
      // automatically). requiresOnDeviceRecognition:true is non-negotiable
      // here (privacy requirement, see below), so starting recognition
      // without that model installed doesn't fail loudly — it just
      // produces zero results, landing on transcript_status='unavailable'
      // with no indication anywhere of why. Checking here means: (a) skip
      // the doomed attempt entirely rather than pay its latency/battery
      // cost, and (b) know it's specifically a missing-model case so the
      // recording screen can say something the student can act on instead
      // of a bare "unavailable". iOS has no equivalent check (SFSpeechRecognizer
      // downloads transparently, no public API to inspect it) — this only
      // runs on Android.
      const modelInstalled = await isSttModelInstalled();
      if (modelInstalled === false) {
        recognitionErrorCodeRef.current = 'offline_model_not_installed';
        setSttModelMissing(true);
        return;
      }
      // modelInstalled === null: couldn't determine (timeout/API hiccup) —
      // fall through and attempt recognition anyway rather than assume
      // failure; the 'error' event handler still catches a genuine
      // missing-model failure downstream, just without this earlier, more
      // specific signal.

      recognitionStartedAtRef.current = Date.now();
      ExpoSpeechRecognitionModule.start({
        lang: getSttLocale(i18n.language),
        interimResults: false,
        continuous: true,
        // Hard requirement, not a tunable default: this must stay true so
        // recognition audio never leaves the device. Flipping it would
        // quietly recreate the exact third-party-audio-leak problem this
        // feature exists to close (see
        // AUDIO_TRANSCRIPTION_ON_DEVICE_HANDOFF.md) — Ollama-based
        // server-side transcription was removed specifically so this
        // doesn't happen, and on-device recognition earns that "on-device"
        // description only if this stays true.
        requiresOnDeviceRecognition: true,
        addsPunctuation: true,
      });
      recognitionActiveRef.current = true;
    } catch {
      recognitionActiveRef.current = false;
    }
  };

  const stopOnDeviceRecognitionAndCollect = async (): Promise<string | undefined> => {
    if (!recognitionActiveRef.current) return undefined;
    recognitionActiveRef.current = false;
    try {
      const ended = new Promise<void>((resolve) => {
        recognitionEndResolverRef.current = resolve;
      });
      ExpoSpeechRecognitionModule.stop();
      // stop() is fire-and-forget; the last "result" event (with the final
      // transcript segment) can arrive slightly after it returns. Wait
      // briefly for "end", but never block the upload indefinitely if it
      // doesn't fire for some reason.
      await Promise.race([ended, new Promise((resolve) => setTimeout(resolve, 1500))]);
    } catch {
      // best-effort only — fall through to whatever was collected so far
    }
    const text = transcriptPartsRef.current.join(' ').trim();
    transcriptPartsRef.current = [];
    return text || undefined;
  };

  // Persists one src/lib/asrDiagnostics.ts row for this recording. Always
  // best-effort — wrapped so a diagnostics failure (or the feature being
  // unavailable at all, e.g. Battery.isAvailableAsync() false on some
  // emulators) can never affect the actual capture upload above it.
  const recordCaptureDiagnostic = async (
    recordingStatus: Audio.RecordingStatus,
    uri: string | null,
    transcript: string | undefined
  ) => {
    let fileSizeBytes: number | null = null;
    if (uri) {
      try {
        const f = new File(uri);
        fileSizeBytes = f.exists ? f.size : null;
      } catch {
        // best-effort only
      }
    }
    const batteryAfter = await snapshotBattery();
    await recordAsrDiagnostic({
      appLanguage: i18n.language,
      sttLocale: getSttLocale(i18n.language),
      recognitionAvailable: recognitionAvailableRef.current,
      recognitionAttempted: recognitionStartedAtRef.current != null,
      recognitionStartLatencyMs: recognitionStartLatencyMsRef.current,
      recognitionErrorCode: recognitionErrorCodeRef.current,
      recognitionTranscriptLength: transcript?.length ?? 0,
      recordingExpectedDurationS: recordingDuration,
      recordingActualDurationMs: recordingStatus.durationMillis ?? null,
      recordingFileSizeBytes: fileSizeBytes,
      recordingMediaServicesReset: !!recordingStatus.mediaServicesDidReset,
      batteryLevelBefore: batteryBeforeRef.current?.level ?? null,
      batteryLevelAfter: batteryAfter.level,
      batteryStateBefore: batteryBeforeRef.current?.state ?? null,
      lowPowerMode: batteryBeforeRef.current?.lowPowerMode ?? null,
      totalWallTimeMs: recordingStartedAtRef.current != null ? Date.now() - recordingStartedAtRef.current : 0,
    });
  };

  // By design, a capture always saves to the device first — it never blocks
  // on or depends on network state at the moment of capture (a field
  // activity can't assume signal), and nothing here calls uploadCapture()
  // directly. src/db/offlineQueue.ts's capture_queue is the single source
  // of truth.
  //
  // DESIGN (2026-09-14): the queue used to also drain itself silently in
  // the background (an opportunistic flushQueue() right here, plus a
  // reconnect-triggered one in useConnectivity.ts, plus one on every app
  // launch). All three are removed — nothing leaves the device except at an
  // explicit "Save to Server"/Submit action in app/activity/[id].tsx
  // (handleSaveProgress/handleSaveDraft/handleSubmit). See the age-scoped-
  // consent plan doc's "Local capture is never gated" section: a silent
  // background sync undermined the "your work stays on your device until
  // you choose" guarantee this app is built around, most concretely once a
  // capture can be permanently blocked_reason='consent_required'
  // (offlineQueue.ts) — that should only ever be retried when the student
  // deliberately asks, not on a timer they don't know is running.
  const upload = async (
    file: { uri: string; name: string; type: string },
    captureType: string,
    localText?: string,
    transcript?: string
  ) => {
    setUploading(true);
    try {
      const queueId = await queueCapture({
        local_uri: file.uri,
        capture_type: captureType,
        session_id: sessionId,
        activity_id: activityId,
        latitude,
        longitude,
        transcript,
      });
      // Attached client-side only (never sent to / returned by the backend)
      // so the activity screen can show an instant review without an
      // authenticated re-fetch of the file once it's synced.
      onCaptured({
        id: queueId,
        capture_type: captureType,
        file_path: file.uri,
        created_at: new Date().toISOString(),
        transcript: transcript ?? null,
        // 'unavailable', not 'pending' — transcription is synchronous now
        // (on-device, done before upload even starts), so there is no
        // later async step that could still complete it.
        transcript_status: captureType === 'audio' ? (transcript ? 'completed' : 'unavailable') : undefined,
        local_uri: localText ? undefined : file.uri,
        local_text: localText,
      });

      // Brief in-sheet confirmation before closing — saving is instant and
      // always succeeds locally, so this never waits on a network call.
      // No opportunistic sync here by design — see this function's own
      // comment above; the capture stays local until an explicit
      // "Save to Server"/Submit.
      setJustSaved({ mode });
      setTimeout(() => {
        setJustSaved(null);
        onClose();
      }, 900);
    } catch (e) {
      Alert.alert(t('capture.uploadFailed.title', 'Upload failed'), e instanceof Error ? e.message : t('common.tryAgain', 'Try again'));
    } finally {
      setUploading(false);
    }
  };

  // ── Photo / Video ────────────────────────────────────────────────────────
  // Both use the in-app camera (InAppCamera, wrapping expo-camera's
  // CameraView) instead of handing off to the OS system Camera app —
  // keeps capture fully inside our own UI/testIDs.
  const handleCameraCaptured = async (file: CapturedFile) => {
    const captureType = mode === 'video' ? 'video' : 'photo';
    setMode(null);
    await upload(file, captureType);
  };

  // ── Audio ─────────────────────────────────────────────────────────────────
  const [requestingMic, setRequestingMic] = useState(false);

  const startRecording = async () => {
    if (requestingMic) return;
    setRequestingMic(true);
    try {
      // Check first, only request if actually needed. Confirmed 2026-09-13:
      // requestPermissionsAsync() routes through expo-modules-core's
      // Activity-callback-based permission manager (askForPermissions...),
      // which hung indefinitely (never resolved, no error) on this build —
      // a broken permission-request-callback round-trip with MainActivity,
      // the same class of bridgeless/New-Architecture wiring issue as
      // today's Reanimated crash. getPermissionsAsync() is a plain
      // synchronous checkSelfPermission with no callback dependency, so it
      // isn't affected — skips the broken path entirely for the common
      // case (permission already granted from a prior install).
      let { status, canAskAgain } = await withTimeout(
        Audio.getPermissionsAsync(),
        8000,
        'Audio.getPermissionsAsync timed out'
      );
      if (status !== 'granted') {
        ({ status, canAskAgain } = await withTimeout(
          Audio.requestPermissionsAsync(),
          8000,
          'Audio.requestPermissionsAsync timed out'
        ));
      }
      if (status !== 'granted') {
        if (canAskAgain === false) {
          Alert.alert(
            t('capture.micPermission.title', 'Permission needed'),
            t('capture.micPermission.blockedBody', 'Microphone access was previously denied, so your device won’t ask again here. Turn it on in Settings to continue.'),
            [
              { text: t('common.cancel', 'Cancel'), style: 'cancel' },
              { text: t('camera.openSettings', 'Open Settings'), onPress: () => Linking.openSettings() },
            ]
          );
        } else {
          Alert.alert(t('capture.micPermission.title', 'Permission needed'), t('capture.micPermission.body', 'Allow microphone access to record audio.'));
        }
        return;
      }
      // Defensive cleanup: if a previous attempt's recognizer session never
      // got torn down (e.g. it hung, or the sheet was killed mid-recording
      // before this fix existed), a lingering session can hold the mic and
      // block this new Audio.Recording.createAsync() from ever resolving.
      // abort() (not stop()) — no result is wanted, just release the mic.
      try { ExpoSpeechRecognitionModule.abort(); } catch { /* best-effort */ }
      await withTimeout(
        Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true }),
        8000,
        'Audio.setAudioModeAsync timed out'
      );
      const { recording: rec } = await withTimeout(
        Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY),
        8000,
        'Audio.Recording.createAsync timed out'
      );
      setRecording(rec);
      setRecordingDuration(0);
      timerRef.current = setInterval(() => setRecordingDuration((d) => d + 1), 1000);
      recordingStartedAtRef.current = Date.now();
      // Awaited (not fire-and-forget) so a very short recording can't stop
      // before this resolves — Battery.getPowerStateAsync() is fast, and
      // this whole call is already best-effort/never-throws.
      batteryBeforeRef.current = await snapshotBattery();
      startOnDeviceRecognition();
    } catch (e) {
      // Logged (not just alerted) specifically so a stall like the
      // 2026-09-13 "stuck on Requesting microphone access forever" report
      // is diagnosable from logcat/Metro next time — the three awaits above
      // are now all timeout-guarded, so this always fires within ~8s
      // instead of hanging indefinitely, and the message says which one.
      console.error('[CaptureSheet] startRecording failed:', e instanceof Error ? e.message : e);
      Alert.alert(t('capture.recordError.title', 'Recording failed'), t('capture.recordError.body', 'Could not start recording. Please try again.'));
    } finally {
      setRequestingMic(false);
    }
  };

  const stopRecording = async () => {
    if (!recording) return;
    if (timerRef.current) clearInterval(timerRef.current);
    try {
      // ORDER MATTERS (root-caused 2026-09-13 from a real hang on Android):
      // the recognizer must release the microphone BEFORE expo-av is asked
      // to finalize the recording. Doing it the other way around — as this
      // used to — left the recognizer still holding the mic while
      // stopAndUnloadAsync() waited for exclusive access it was never
      // going to get, hanging indefinitely. Because that hang happened
      // before this function's `finally` ever ran, `recording` state never
      // reset either, so the NEXT attempt inherited a mic still locked by
      // the zombie session — "records once, then every later attempt hangs
      // too" is exactly what a stuck finally block looks like.
      const transcript = await stopOnDeviceRecognitionAndCollect();
      // Belt-and-suspenders on top of the reordering: stopAndUnloadAsync()
      // talks to native code we don't control, so it gets a hard timeout
      // too — a future hang here (for whatever reason) surfaces as a clear
      // "Recording failed" instead of wedging the sheet forever again.
      const recordingStatus = await withTimeout(
        recording.stopAndUnloadAsync(),
        8000,
        'stopAndUnloadAsync timed out'
      );
      const uri = recording.getURI();
      recordCaptureDiagnostic(recordingStatus, uri, transcript).catch(() => {});
      if (uri) {
        await upload({ uri, name: 'recording.m4a', type: 'audio/m4a' }, 'audio', undefined, transcript);
      }
    } catch {
      Alert.alert(t('capture.recordError.title', 'Recording failed'), t('capture.recordError.body', 'Could not start recording. Please try again.'));
    } finally {
      setRecording(null);
      setRecordingDuration(0);
      // Leaving the shared session in recording mode (allowsRecordingIOS)
      // can mute/misroute other audio consumers (e.g. read-aloud TTS,
      // capture-preview playback) until the app restarts. Restore normal
      // playback mode now that recording has stopped.
      Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true }).catch(() => {});
    }
  };

  // Closing the sheet (✕ button, iOS swipe-to-dismiss, Android back) while a
  // recording is still in progress skips stopRecording() entirely -- onClose
  // is a bare callback with no idea a recording is active. That left the
  // shared iOS audio session stuck in allowsRecordingIOS: true for the rest
  // of the app session: the exact same silent-TTS bug the Aug 11 fix closed
  // for the normal stop-button path (see useSpeech.ts), just reached by
  // abandoning the sheet instead of tapping stop. Discard (don't upload --
  // the student never confirmed this recording) and restore the session
  // whenever the sheet closes with an active recording.
  React.useEffect(() => {
    if (visible || !recording) return;
    if (timerRef.current) clearInterval(timerRef.current);
    const rec = recording;
    setRecording(null);
    setRecordingDuration(0);
    // abort() (not stop()) — the recording is being discarded, so there's no
    // point waiting for a final transcript that will never be used.
    if (recognitionActiveRef.current) {
      recognitionActiveRef.current = false;
      try { ExpoSpeechRecognitionModule.abort(); } catch { /* best-effort */ }
    }
    rec.stopAndUnloadAsync()
      .catch(() => {})
      .finally(() => {
        Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true }).catch(() => {});
      });
  }, [visible, recording]);

  // ── Note ──────────────────────────────────────────────────────────────────
  const submitNote = async () => {
    if (!noteText.trim()) return;
    // Notes are uploaded as text files
    const text = noteText.trim();
    const uri = `data:text/plain;base64,${btoa(text)}`;
    await upload({ uri, name: 'note.txt', type: 'text/plain' }, 'text', text);
    setNoteText('');
  };

  // ── Draw ──────────────────────────────────────────────────────────────────
  // capture_type 'sketch' — a distinct backend enum value from 'text',
  // already supported by upload_capture() with no backend changes at all
  // (see MOBILE_CAPTURE_TOOLS_HANDOFF.md). SVG XML content is plain ASCII
  // (path commands, numbers, one hex color), so btoa() here is safe the
  // same way it is for submitNote()'s ASCII text case.
  const sketchRef = useRef<SketchCanvasHandle>(null);
  const [sketchStrokeCount, setSketchStrokeCount] = useState(0);
  // Color/thickness/shape-tool controls (2026-09-14). Lifted here rather
  // than into SketchCanvas itself: these are UI selections that drive what
  // the NEXT stroke looks like, and the toolbar rendering them lives in
  // this component, not the canvas. SketchCanvas bakes the current value
  // of each into every element as it's committed — changing color/
  // thickness afterward never repaints already-drawn strokes.
  const [sketchTool, setSketchTool] = useState<SketchTool>('pen');
  const [sketchColor, setSketchColor] = useState(SKETCH_COLORS[0]);
  const [sketchStrokeWidth, setSketchStrokeWidth] = useState(SKETCH_WIDTHS[1].value);

  // Reset the lifted stroke-count whenever leaving Draw mode by any path
  // (Back, Save, or closing the whole sheet) — SketchCanvas itself resets
  // for free by unmounting (it's only rendered while mode === 'sketch'),
  // but this component's own count doesn't follow that automatically.
  React.useEffect(() => {
    if (mode !== 'sketch') setSketchStrokeCount(0);
  }, [mode]);

  const submitSketch = async () => {
    const svg = sketchRef.current?.exportSvg();
    if (!svg) return;
    const uri = `data:image/svg+xml;base64,${btoa(svg)}`;
    await upload({ uri, name: 'sketch.svg', type: 'image/svg+xml' }, 'sketch');
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
      {/* RN's core <Modal> renders its content to a separate native
          surface (a new UIViewController on iOS, a new window on
          Android) outside the normal view hierarchy — the
          GestureHandlerRootView wrapping the rest of the app (app/_layout.tsx)
          doesn't reach in here, a well-documented gesture-handler+Modal
          gotcha. Needed for SketchCanvas's GestureDetector (Draw mode) to
          actually receive touches inside this sheet. */}
      <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardAvoidingView
        // BUG FIX (2026-09-14): see PeriChatSheet.tsx's matching comment —
        // same root cause, found via RN's own Android source
        // (ReactModalHostView.kt unconditionally sets
        // SOFT_INPUT_ADJUST_RESIZE on every Modal's own Dialog window, so
        // this Note mode's TextInput was getting double-shrunk: once by the
        // native window resize, again by this behavior="height". No JS-side
        // adjustment needed on Android inside a Modal.
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
      <View testID="capture-sheet" style={[styles.root, { backgroundColor: theme.bg }]}>
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <Text style={[styles.title, { fontFamily: theme.fontHead, color: theme.text }]} numberOfLines={1}>
            {t('capture.title', 'Add evidence')}
          </Text>
          <TouchableOpacity
            testID="capture-close"
            onPress={onClose}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t('common.close', 'Close')}
          >
            <Text style={[styles.closeBtn, { color: theme.textMuted }]}>✕</Text>
          </TouchableOpacity>
        </View>

        {justSaved ? (
          <View style={styles.center} testID="capture-saved-confirmation">
            <Text style={[styles.savedCheckmark, { color: theme.accent }]}>✓</Text>
            <Text style={[styles.uploadingText, { fontFamily: theme.fontBody, color: theme.text }]}>
              {t('capture.saved', 'Saved to your device')}
            </Text>
            <Text style={[styles.savedSubtext, { fontFamily: theme.fontBody, color: theme.textMuted }]}>
              {t('capture.savedSubtext', "It'll sync automatically, or when you turn in the activity.")}
            </Text>
          </View>
        ) : uploading ? (
          <View style={styles.center}>
            <ActivityIndicator color={theme.accent} size="large" />
            <Text style={[styles.uploadingText, { fontFamily: theme.fontBody, color: theme.textMuted }]}>
              {t('capture.savingLocally', 'Saving…')}
            </Text>
          </View>
        ) : mode === null ? (
          // Mode picker
          <View style={styles.modeGrid}>
            {MODES.map((m) => (
              <TouchableOpacity
                key={m.mode}
                testID={`capture-mode-${m.mode}`}
                onPress={() => setMode(m.mode)}
                style={[styles.modeBtn, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: theme.radius }]}
                accessibilityRole="button"
                accessibilityLabel={m.label}
              >
                <Text style={styles.modeEmoji}>{m.emoji}</Text>
                <Text style={[styles.modeLabel, { fontFamily: theme.fontBody, color: theme.text }]}>{m.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : mode === 'audio' ? (
          // Audio recorder
          <View style={styles.center}>
            <TouchableOpacity
              testID="capture-record-btn"
              onPress={recording ? stopRecording : startRecording}
              disabled={requestingMic}
              style={[styles.recordBtn, { backgroundColor: recording ? theme.warn : theme.accent, borderRadius: 999 }, requestingMic && { opacity: 0.7 }]}
              accessibilityRole="button"
              accessibilityLabel={recording ? t('capture.stopRecording', 'Stop recording') : t('capture.startRecording', 'Start recording')}
              accessibilityState={{ selected: !!recording, disabled: requestingMic, busy: requestingMic }}
            >
              {requestingMic
                ? <ActivityIndicator color={theme.accentText} size="small" />
                : <Text style={styles.recordIcon}>{recording ? '⏹' : '🎤'}</Text>
              }
            </TouchableOpacity>
            <Text testID="capture-record-status" style={[styles.durationText, { fontFamily: theme.fontMono, color: theme.textMuted }]}>
              {requestingMic
                ? t('capture.requestingMic', 'Requesting microphone access…')
                : recording
                ? t('capture.recordingStatus', 'Recording {{seconds}}s — tap to stop').replace('{{seconds}}', String(recordingDuration))
                : t('capture.tapToStart', 'Tap to start recording')}
            </Text>
            <Text style={[styles.privacyNote, { fontFamily: theme.fontBody, color: theme.textFaint }]}>
              {/* BUG FIX (2026-09-14): this text was stale from before the
                  on-device transcription switch — it said "on our own
                  servers", which stopped being true the day
                  services/asr_service.py was removed. Transcription now
                  happens entirely on the device, during recording; the
                  server never runs any transcription of its own. */}
              {t('capture.audioPrivacyNote', "Your recording is transcribed on this device — audio is never sent anywhere for transcription, and never to a third-party AI provider unless you're actively chatting with Peri.")}
            </Text>
            {sttModelMissing && (
              <Text testID="capture-stt-model-missing" style={[styles.privacyNote, { fontFamily: theme.fontBody, color: theme.warn }]}>
                {t(
                  'capture.sttModelMissing',
                  "This recording will save, but won't have a transcript — on-device transcription for your language needs a one-time setup. Enable it in Settings → Offline Transcription (best done on wifi)."
                )}
              </Text>
            )}
            {!recording && (
              <TouchableOpacity
                testID="capture-audio-back"
                onPress={() => setMode(null)}
                style={styles.backTouchTarget}
                accessibilityRole="button"
                accessibilityLabel={t('common.back', 'Back')}
              >
                <Text style={[styles.backArrow, { color: theme.textFaint }]}>{'←'}</Text>
                <Text style={[styles.backLink, { color: theme.textFaint, fontFamily: theme.fontBody }]}>{t('common.back', 'Back')}</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : mode === 'note' ? (
          // Text note
          <View style={[styles.noteContainer]}>
            <Text style={[styles.noteLabel, { fontFamily: theme.fontMono, color: theme.textFaint }]}>
              {t('capture.fieldNote', 'FIELD NOTE')}
            </Text>
            <TextInput
              testID="capture-note-input"
              style={[styles.noteInput, {
                backgroundColor: theme.surface,
                borderColor: theme.border,
                color: theme.text,
                fontFamily: theme.fontBody,
                borderRadius: theme.radiusSm,
              }]}
              value={noteText}
              onChangeText={setNoteText}
              placeholder={t('capture.notePlaceholder', 'Write what you observe…')}
              placeholderTextColor={theme.textFaint}
              multiline
              autoFocus
              textAlignVertical="top"
            />
            <TouchableOpacity
              testID="capture-note-save"
              onPress={submitNote}
              disabled={!noteText.trim()}
              style={[styles.submitBtn, {
                backgroundColor: noteText.trim() ? theme.accent : theme.border,
                borderRadius: theme.radiusSm,
              }]}
              accessibilityRole="button"
              accessibilityLabel={t('capture.saveNote', 'Save note')}
              accessibilityState={{ disabled: !noteText.trim() }}
            >
              <Text style={[styles.submitLabel, { color: theme.accentText, fontFamily: theme.fontBody }]}>
                {t('capture.saveNote', 'Save note')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="capture-note-back"
              onPress={() => setMode(null)}
              style={styles.backTouchTarget}
              accessibilityRole="button"
              accessibilityLabel={t('common.back', 'Back')}
            >
              <Text style={[styles.backArrow, { color: theme.textFaint }]}>{'←'}</Text>
              <Text style={[styles.backLink, { color: theme.textFaint, fontFamily: theme.fontBody }]}>{t('common.back', 'Back')}</Text>
            </TouchableOpacity>
          </View>
        ) : mode === 'sketch' ? (
          // Freehand drawing
          <View style={styles.sketchContainer}>
            <Text style={[styles.noteLabel, { fontFamily: theme.fontMono, color: theme.textFaint }]}>
              {t('capture.sketchLabel', 'DRAWING')}
            </Text>
            <SketchCanvas
              ref={sketchRef}
              tool={sketchTool}
              color={sketchColor}
              strokeWidth={sketchStrokeWidth}
              onStrokeCountChange={setSketchStrokeCount}
            />

            {/* Shape palette — pen (freehand) plus line/rectangle/circle,
                drag-to-size. Already-drawn elements keep whatever tool they
                were made with; this only picks what the NEXT one is. */}
            <View style={styles.sketchToolbar}>
              {SKETCH_TOOLS.map(({ tool: toolOption, emoji, labelKey, fallback }) => (
                <TouchableOpacity
                  key={toolOption}
                  testID={`capture-sketch-tool-${toolOption}`}
                  onPress={() => setSketchTool(toolOption)}
                  style={[
                    styles.sketchToolBtn,
                    {
                      borderColor: sketchTool === toolOption ? theme.accent : theme.border,
                      backgroundColor: sketchTool === toolOption ? theme.surfaceAlt : 'transparent',
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={t(labelKey, fallback)}
                  accessibilityState={{ selected: sketchTool === toolOption }}
                >
                  <Text style={styles.sketchToolEmoji}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Color + thickness — a fixed small palette (see SKETCH_COLORS/
                SKETCH_WIDTHS comment above), not a full picker/slider. */}
            <View style={styles.sketchPaletteRow}>
              <View style={styles.sketchColorRow}>
                {SKETCH_COLORS.map((c) => (
                  <TouchableOpacity
                    key={c}
                    testID={`capture-sketch-color-${c}`}
                    onPress={() => setSketchColor(c)}
                    style={[
                      styles.sketchColorSwatch,
                      { backgroundColor: c },
                      sketchColor === c && [styles.sketchColorSwatchSelected, { borderColor: theme.accent }],
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={t('capture.sketchColor', 'Drawing color')}
                    accessibilityState={{ selected: sketchColor === c }}
                  />
                ))}
              </View>
              <View style={styles.sketchWidthRow}>
                {SKETCH_WIDTHS.map(({ value, label }) => (
                  <TouchableOpacity
                    key={value}
                    testID={`capture-sketch-width-${value}`}
                    onPress={() => setSketchStrokeWidth(value)}
                    style={[
                      styles.sketchWidthBtn,
                      { borderColor: sketchStrokeWidth === value ? theme.accent : theme.border },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={t('capture.sketchThickness', 'Line thickness: {{size}}').replace('{{size}}', label)}
                    accessibilityState={{ selected: sketchStrokeWidth === value }}
                  >
                    <View style={[styles.sketchWidthDot, { width: value + 4, height: value + 4, borderRadius: (value + 4) / 2, backgroundColor: theme.text }]} />
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.sketchToolbar}>
              <TouchableOpacity
                testID="capture-sketch-undo"
                onPress={() => sketchRef.current?.undo()}
                disabled={sketchStrokeCount === 0}
                style={[styles.sketchToolBtn, { borderColor: theme.border, opacity: sketchStrokeCount === 0 ? 0.5 : 1 }]}
                accessibilityRole="button"
                accessibilityLabel={t('capture.sketchUndo', 'Undo')}
              >
                <Text style={[styles.sketchToolLabel, { color: theme.text, fontFamily: theme.fontBody }]}>
                  {t('capture.sketchUndo', 'Undo')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="capture-sketch-clear"
                onPress={() => sketchRef.current?.clear()}
                disabled={sketchStrokeCount === 0}
                style={[styles.sketchToolBtn, { borderColor: theme.border, opacity: sketchStrokeCount === 0 ? 0.5 : 1 }]}
                accessibilityRole="button"
                accessibilityLabel={t('capture.sketchClear', 'Clear')}
              >
                <Text style={[styles.sketchToolLabel, { color: theme.text, fontFamily: theme.fontBody }]}>
                  {t('capture.sketchClear', 'Clear')}
                </Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              testID="capture-sketch-save"
              onPress={submitSketch}
              disabled={sketchStrokeCount === 0}
              style={[styles.submitBtn, {
                backgroundColor: sketchStrokeCount > 0 ? theme.accent : theme.border,
                borderRadius: theme.radiusSm,
              }]}
              accessibilityRole="button"
              accessibilityLabel={t('capture.saveSketch', 'Save drawing')}
              accessibilityState={{ disabled: sketchStrokeCount === 0 }}
            >
              <Text style={[styles.submitLabel, { color: theme.accentText, fontFamily: theme.fontBody }]}>
                {t('capture.saveSketch', 'Save drawing')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="capture-sketch-back"
              onPress={() => setMode(null)}
              style={styles.backTouchTarget}
              accessibilityRole="button"
              accessibilityLabel={t('common.back', 'Back')}
            >
              <Text style={[styles.backArrow, { color: theme.textFaint }]}>{'←'}</Text>
              <Text style={[styles.backLink, { color: theme.textFaint, fontFamily: theme.fontBody }]}>{t('common.back', 'Back')}</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
      </KeyboardAvoidingView>

      <InAppCamera
        visible={mode === 'photo' || mode === 'video'}
        mode={mode === 'video' ? 'video' : 'photo'}
        onClose={() => setMode(null)}
        onCaptured={handleCameraCaptured}
        theme={theme}
      />
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root:          { flex: 1 },
  header:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1 },
  title:         { fontSize: 20, fontWeight: '700', flexShrink: 1 },
  closeBtn:      { fontSize: 18, padding: 4, flexShrink: 0 },
  center:        { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  modeGrid:      { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 16, padding: 32 },
  modeBtn:       { width: 90, height: 90, alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1 },
  modeEmoji:     { fontSize: 32 },
  modeLabel:     { fontSize: 13, fontWeight: '600' },
  recordBtn:     { width: 80, height: 80, alignItems: 'center', justifyContent: 'center' },
  recordIcon:    { fontSize: 32 },
  durationText:  { fontSize: 13, letterSpacing: 0.5 },
  privacyNote:   { fontSize: 11, fontStyle: 'italic', textAlign: 'center', marginTop: 10, paddingHorizontal: 24 },
  backTouchTarget: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 6, marginTop: 8 },
  backArrow:     { fontSize: 14 },
  backLink:      { fontSize: 14 },
  noteContainer: { flex: 1, padding: 16, gap: 12 },
  noteLabel:     { fontSize: 9, letterSpacing: 1.4, textTransform: 'uppercase' },
  noteInput:     { flex: 1, padding: 12, borderWidth: 1, fontSize: 15, lineHeight: 22, minHeight: 160 },
  sketchContainer: { flex: 1, padding: 16, gap: 12 },
  sketchToolbar:   { flexDirection: 'row', gap: 10 },
  sketchToolBtn:   { flex: 1, borderWidth: 1, padding: 10, alignItems: 'center', borderRadius: 8 },
  sketchToolLabel: { fontSize: 13, fontWeight: '600' },
  sketchToolEmoji: { fontSize: 18 },
  sketchPaletteRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  sketchColorRow:     { flexDirection: 'row', gap: 8 },
  sketchColorSwatch:  { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: 'transparent' },
  sketchColorSwatchSelected: { borderWidth: 3 },
  sketchWidthRow:     { flexDirection: 'row', gap: 8 },
  sketchWidthBtn:     { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  sketchWidthDot:     {},
  submitBtn:     { padding: 14, alignItems: 'center' },
  submitLabel:   { fontSize: 15, fontWeight: '600' },
  uploadingText: { fontSize: 14, textAlign: 'center' },
  savedCheckmark: { fontSize: 40, fontWeight: '700' },
  savedSubtext:  { fontSize: 12, textAlign: 'center', paddingHorizontal: 24 },
});
