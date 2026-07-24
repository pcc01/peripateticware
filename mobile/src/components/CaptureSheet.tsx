// src/components/CaptureSheet.tsx
// Native capture tools: photo (image picker), audio (expo-av), text note
// M-6: wraps upload to POST /api/v1/student/captures/upload

import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  Alert, ActivityIndicator, Modal,
} from 'react-native';
import { Audio } from 'expo-av';
import { Theme } from '@/src/theme/tokens';
import { uploadCapture, Capture } from '@/src/api/captures';
import { queueCapture } from '@/src/db/offlineQueue';
import * as Network from 'expo-network';
import InAppCamera, { CapturedFile } from '@/src/components/InAppCamera';
import { t } from '@/src/i18n/t';

interface Props {
  visible: boolean;
  onClose: () => void;
  onCaptured: (capture: Capture) => void;
  theme: Theme;
  sessionId?: string;
  activityId?: string;
  latitude?: number;
  longitude?: number;
}

type CaptureMode = null | 'photo' | 'audio' | 'note' | 'video';

const MODES = [
  { mode: 'photo' as CaptureMode, emoji: '📷', label: t('capture.mode.photo', 'Photo') },
  { mode: 'audio' as CaptureMode, emoji: '🎤', label: t('capture.mode.audio', 'Voice') },
  { mode: 'note'  as CaptureMode, emoji: '✏️', label: t('capture.mode.note', 'Note')  },
  { mode: 'video' as CaptureMode, emoji: '🎥', label: t('capture.mode.video', 'Video') },
];

export default function CaptureSheet({
  visible, onClose, onCaptured, theme,
  sessionId, activityId, latitude, longitude,
}: Props) {
  const [mode, setMode] = useState<CaptureMode>(null);
  const [uploading, setUploading] = useState(false);
  const [noteText, setNoteText] = useState('');

  // Audio recording state
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const upload = async (file: { uri: string; name: string; type: string }, captureType: string) => {
    setUploading(true);
    try {
      const netState = await Network.getNetworkStateAsync();
      const online = !!(netState.isConnected && netState.isInternetReachable);

      if (online) {
        // Upload immediately
        const capture = await uploadCapture({ file, captureType, sessionId, latitude, longitude });
        onCaptured(capture);
      } else {
        // Queue for later — save locally, return a placeholder capture
        const queueId = await queueCapture({
          local_uri: file.uri,
          capture_type: captureType,
          session_id: sessionId,
          activity_id: activityId,
          latitude,
          longitude,
        });
        // Return a local placeholder so UI updates immediately
        onCaptured({
          id: queueId,
          capture_type: captureType,
          file_path: file.uri,
          created_at: new Date().toISOString(),
          transcript: null,
        });
        Alert.alert(
          t('capture.offline.title', '📵 Saved offline'),
          t('capture.offline.body', 'This capture is saved on your device and will upload when you reconnect.')
        );
      }
      onClose();
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
  const startRecording = async () => {
    const { status } = await Audio.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('capture.micPermission.title', 'Permission needed'), t('capture.micPermission.body', 'Allow microphone access to record audio.'));
      return;
    }
    await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
    const { recording: rec } = await Audio.Recording.createAsync(
      Audio.RecordingOptionsPresets.HIGH_QUALITY
    );
    setRecording(rec);
    setRecordingDuration(0);
    timerRef.current = setInterval(() => setRecordingDuration((d) => d + 1), 1000);
  };

  const stopRecording = async () => {
    if (!recording) return;
    if (timerRef.current) clearInterval(timerRef.current);
    await recording.stopAndUnloadAsync();
    const uri = recording.getURI();
    setRecording(null);
    setRecordingDuration(0);
    if (uri) {
      await upload({ uri, name: 'recording.m4a', type: 'audio/m4a' }, 'audio');
    }
  };

  // ── Note ──────────────────────────────────────────────────────────────────
  const submitNote = async () => {
    if (!noteText.trim()) return;
    // Notes are uploaded as text files
    const uri = `data:text/plain;base64,${btoa(noteText)}`;
    await upload({ uri, name: 'note.txt', type: 'text/plain' }, 'text');
    setNoteText('');
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
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

        {uploading ? (
          <View style={styles.center}>
            <ActivityIndicator color={theme.accent} size="large" />
            <Text style={[styles.uploadingText, { fontFamily: theme.fontBody, color: theme.textMuted }]}>
              {t('capture.uploading', 'Uploading…')}
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
              style={[styles.recordBtn, { backgroundColor: recording ? theme.warn : theme.accent, borderRadius: 999 }]}
              accessibilityRole="button"
              accessibilityLabel={recording ? t('capture.stopRecording', 'Stop recording') : t('capture.startRecording', 'Start recording')}
              accessibilityState={{ selected: !!recording }}
            >
              <Text style={styles.recordIcon}>{recording ? '⏹' : '🎤'}</Text>
            </TouchableOpacity>
            <Text testID="capture-record-status" style={[styles.durationText, { fontFamily: theme.fontMono, color: theme.textMuted }]}>
              {recording
                ? t('capture.recordingStatus', 'Recording {{seconds}}s — tap to stop').replace('{{seconds}}', String(recordingDuration))
                : t('capture.tapToStart', 'Tap to start recording')}
            </Text>
            {!recording && (
              <TouchableOpacity
                testID="capture-audio-back"
                onPress={() => setMode(null)}
                accessibilityRole="button"
                accessibilityLabel={t('common.back', 'Back')}
              >
                <Text style={[styles.backLink, { color: theme.textFaint, fontFamily: theme.fontBody }]}>← {t('common.back', 'Back')}</Text>
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
              accessibilityRole="button"
              accessibilityLabel={t('common.back', 'Back')}
            >
              <Text style={[styles.backLink, { color: theme.textFaint, fontFamily: theme.fontBody }]}>← {t('common.back', 'Back')}</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>

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
  backLink:      { fontSize: 14, marginTop: 8 },
  noteContainer: { flex: 1, padding: 16, gap: 12 },
  noteLabel:     { fontSize: 9, letterSpacing: 1.4, textTransform: 'uppercase' },
  noteInput:     { flex: 1, padding: 12, borderWidth: 1, fontSize: 15, lineHeight: 22, minHeight: 160 },
  submitBtn:     { padding: 14, alignItems: 'center' },
  submitLabel:   { fontSize: 15, fontWeight: '600' },
  uploadingText: { fontSize: 14 },
});
