// src/components/InAppCamera.tsx
// In-app photo/video capture using expo-camera's CameraView — keeps both
// modes inside our own UI (real testIDs, no handoff to the OS system
// Camera app) so they're fully E2E-testable with Maestro.

import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { Theme } from '@/src/theme/tokens';

export interface CapturedFile {
  uri: string;
  name: string;
  type: string;
}

interface Props {
  visible: boolean;
  mode: 'photo' | 'video';
  onClose: () => void;
  onCaptured: (file: CapturedFile) => void;
  theme: Theme;
}

export default function InAppCamera({ visible, mode, onClose, onCaptured, theme }: Props) {
  const cameraRef = useRef<CameraView>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();
  const [recording, setRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [ready, setReady] = useState(false);

  const needsMic = mode === 'video';
  const hasPermission = cameraPermission?.granted && (!needsMic || micPermission?.granted);

  const requestAll = async () => {
    if (!cameraPermission?.granted) await requestCameraPermission();
    if (needsMic && !micPermission?.granted) await requestMicPermission();
  };

  const takePhoto = async () => {
    if (!cameraRef.current || !ready) return;
    const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
    if (photo?.uri) {
      onCaptured({ uri: photo.uri, name: 'photo.jpg', type: 'image/jpeg' });
    }
  };

  const startRecording = async () => {
    if (!cameraRef.current || !ready) return;
    setRecording(true);
    setRecordingDuration(0);
    timerRef.current = setInterval(() => setRecordingDuration((d) => d + 1), 1000);
    const video = await cameraRef.current.recordAsync();
    if (timerRef.current) clearInterval(timerRef.current);
    setRecording(false);
    setRecordingDuration(0);
    if (video?.uri) {
      onCaptured({ uri: video.uri, name: 'video.mp4', type: 'video/mp4' });
    }
  };

  const stopRecording = () => {
    cameraRef.current?.stopRecording();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View testID="in-app-camera" style={[styles.root, { backgroundColor: '#000' }]}>
        {!hasPermission ? (
          <View style={styles.permissionCenter}>
            <Text style={styles.permissionText}>
              {mode === 'photo'
                ? 'Camera access is needed to take a photo.'
                : 'Camera and microphone access are needed to record video.'}
            </Text>
            <TouchableOpacity
              testID="camera-grant-permission"
              onPress={requestAll}
              style={[styles.permissionBtn, { backgroundColor: theme.accent, borderRadius: theme.radiusSm }]}
            >
              <Text style={[styles.permissionBtnLabel, { color: theme.accentText }]}>Allow access</Text>
            </TouchableOpacity>
            <TouchableOpacity testID="camera-close" onPress={onClose} hitSlop={12}>
              <Text style={styles.cancelLink}>Cancel</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <CameraView
              ref={cameraRef}
              testID="camera-view"
              style={styles.camera}
              facing="back"
              mode={mode === 'video' ? 'video' : 'picture'}
              onCameraReady={() => setReady(true)}
            />
            <View style={styles.topBar}>
              <TouchableOpacity testID="camera-close" onPress={onClose} hitSlop={12}>
                <Text style={styles.closeIcon}>✕</Text>
              </TouchableOpacity>
              {mode === 'video' && (
                <Text testID="camera-record-status" style={styles.recordStatus}>
                  {recording ? `Recording ${recordingDuration}s — tap to stop` : 'Tap to start recording'}
                </Text>
              )}
            </View>
            <View style={styles.bottomBar}>
              {!ready ? (
                // Gated on onCameraReady rather than rendered immediately —
                // takePhoto/startRecording silently no-op until the native
                // camera has initialized, so showing the button before then
                // is a dead tap for both real users and Maestro (which has
                // no way to wait on this internal JS state otherwise; it can
                // only wait for the button to exist).
                <Text testID="camera-loading" style={styles.recordStatus}>Starting camera…</Text>
              ) : mode === 'photo' ? (
                <TouchableOpacity testID="camera-shutter" onPress={takePhoto} style={styles.shutterOuter}>
                  <View style={styles.shutterInner} />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  testID="camera-record"
                  onPress={recording ? stopRecording : startRecording}
                  style={[styles.shutterOuter, recording && { borderColor: theme.warn }]}
                >
                  <View style={[styles.shutterInner, recording ? styles.shutterInnerRecording : { backgroundColor: theme.warn }]} />
                </TouchableOpacity>
              )}
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root:                 { flex: 1 },
  camera:                { flex: 1 },
  permissionCenter:      { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 },
  permissionText:        { color: 'white', fontSize: 15, textAlign: 'center' },
  permissionBtn:         { paddingHorizontal: 24, paddingVertical: 12 },
  permissionBtnLabel:    { fontSize: 15, fontWeight: '600' },
  cancelLink:            { color: '#ccc', fontSize: 14, marginTop: 8 },
  topBar:                { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, paddingTop: 48 },
  closeIcon:       