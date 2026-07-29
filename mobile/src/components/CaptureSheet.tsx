// src/components/CaptureSheet.tsx
// Native capture tools: photo (image picker), audio (expo-av), text note
// M-6: wraps upload to POST /api/v1/student/captures/upload

import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  Alert, ActivityIndicator, Modal, KeyboardAvoidingView, Platform, Linking,
} from 'react-native';
import { Audio } from 'expo-av';
import { Theme } from '@/src/theme/tokens';
import { Capture } from '@/src/api/captures';
import { queueCapture, flushQueue } from '@/src/db/offlineQueue';
import InAppCamera, { CapturedFile } from '@/src/components/InAppCamera';
import { t } from '@/src/i18n/t';

type CaptureMode = null | 'photo' | 'audio' | 'note' | 'video';

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

const MODES = [
  { mode: 'photo' as CaptureMode, emoji: '📷', label: t('capture.mode.photo', 'Photo') },
  { mode: 'audio' as CaptureMode, emoji: '🎤', label: t('capture.mode.audio', 'Voice') },
  { mode: 'note'  as CaptureMode, emoji: '✏️', label: t('capture.mode.note', 'Note')  },
  { mode: 'video' as CaptureMode, emoji: '🎥', label: t('capture.mode.video', 'Video') },
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

  // By design, a capture always saves to the device first — it never blocks
  // on or depends on network state at the moment of capture (a field
  // activity can't assume signal). src/db/offlineQueue.ts's capture_queue is
  // the single source of truth; the queue then drains itself two ways: the
  // background poll in useConnectivity.ts (fires flushQueue() whenever
  // connectivity comes back), and an explicit flush the activity screen
  // triggers when the student turns the activity in (see handleSubmit in
  // app/activity/[id].tsx). Nothing here calls uploadCapture() directly.
  const upload = async (
    file: { uri: string; name: string; type: string },
    captureType: string,
    localText?: string
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
      });
      // Attached client-side only (never sent to / returned by the backend)
      // so the activity screen can show an instant review without an
      // authenticated re-fetch of the file once it's synced.
      onCaptured({
        id: queueId,
        capture_type: captureType,
        file_path: file.uri,
        created_at: new Date().toISOString(),
        transcript: null,
        local_uri: localText ? undefined : file.uri,
        local_text: localText,
      });

      // Brief in-sheet confirmation before closing — saving is instant and
      // always succeeds locally, so this never waits on a network call.
      setJustSaved({ mode });
      setTimeout(() => {
        setJustSaved(null);
        onClose();
      }, 900);

      // Best-effort opportunistic sync — if a connection happens to be up
      // right now, don't make the student wait for the 15s connectivity
      // poll to notice. Fire-and-forget: failure here just leaves the item
      // queued for the next poll or the turn-in flush, exactly as if this
      // call was never made.
      flushQueue().catch(() => {});
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
      const { status, canAskAgain } = await Audio.requestPermissionsAsync();
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
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording: rec } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(rec);
      setRecordingDuration(0);
      timerRef.current = setInterval(() => setRecordingDuration((d) => d + 1), 1000);
    } catch {
      Alert.alert(t('capture.recordError.title', 'Recording failed'), t('capture.recordError.body', 'Could not start recording. Please try again.'));
    } finally {
      setRequestingMic(false);
    }
  };

  const stopRecording = async () => {
    if (!recording) return;
    if (timerRef.current) clearInterval(timerRef.current);
    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      if (uri) {
        await upload({ uri, name: 'recording.m4a', type: 'audio/m4a' }, 'audio');
      }
    } catch {
      Alert.alert(t('capture.recordError.title', 'Recording failed'), t('capture.recordError.body', 'Could not start recording. Please try again.'));
    } finally {
      setRecording(null);
      setRecordingDuration(0);
    }
  };

  // ── Note ──────────────────────────────────────────────────────────────────
  const submitNote = async () => {
    if (!noteText.trim()) return;
    // Notes are uploaded as text files
    const text = noteText.trim();
    const uri = `data:text/plain;base64,${btoa(text)}`;
    await upload({ uri, name: 'note.txt', type: 'text/plain' }, 'text', text);
    setNoteText('');
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
      <View testID="capture-sheet" style={[styles.root, { backgroundColor: theme.bg }]}>
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <Text style={[styles.title, { fontFamily: theme.fontHead, color: theme.text }]}>
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
    </Modal>
  );
}

const styles = StyleSheet.create({
  root:          { flex: 1 },
  header:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1 },
  title:         { fontSize: 20, fontWeight: '700' },
  closeBtn:      { fontSize: 18, padding: 4 },
  center:        { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  modeGrid:      { flexDirection: 'row', justifyContent: 'center', gap: 16, padding: 32 },
  modeBtn:       { width: 90, height: 90, alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1 },
  modeEmoji:     { fontSize: 32 },
  modeLabel:     { fontSize: 13, fontWeight: '600' },
  recordBtn:     { width: 80, height: 80, alignItems: 'center', justifyContent: 'center' },
  recordIcon:    { fontSize: 32 },
  durationText:  { fontSize: 13, letterSpacing: 0.5 },
  backTouchTarget: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 6, marginTop: 8 },
  backArrow:     { fontSize: 14 },
  backLink:      { fontSize: 14 },
  noteContainer: { flex: 1, padding: 16, gap: 12 },
  noteLabel:     { fontSize: 9, letterSpacing: 1.4, textTransform: 'uppercase' },
  noteInput:     { flex: 1, padding: 12, borderWidth: 1, fontSize: 15, lineHeight: 22, minHeight: 160 },
  submitBtn:     { padding: 14, alignItems: 'center' },
  submitLabel:   { fontSize: 15, fontWeight: '600' },
  uploadingText: { fontSize: 14, textAlign: 'center' },
  savedCheckmark: { fontSize: 40, fontWeight: '700' },
  savedSubtext:  { fontSize: 12, textAlign: 'center', paddingHorizontal: 24 },
});
