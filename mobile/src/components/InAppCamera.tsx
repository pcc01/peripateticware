// src/components/InAppCamera.tsx
// In-app photo/video capture using expo-camera's CameraView — keeps both
// modes inside our own UI (real testIDs, no handoff to the OS system
// Camera app) so they're fully E2E-testable with Maestro.

import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Alert, ActivityIndicator, Linking, Platform, PermissionsAndroid } from 'react-native';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { Theme } from '@/src/theme/tokens';
import { t } from '@/src/i18n/t';

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
  const [cameraPermission, requestCameraPermission, getCameraPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission, getMicPermission] = useMicrophonePermissions();
  const [recording, setRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [ready, setReady] = useState(false);
  const [requesting, setRequesting] = useState(false);

  const needsMic = mode === 'video';
  const hasPermission = cameraPermission?.granted && (!needsMic || micPermission?.granted);

  const promptOpenSettings = () => {
    Alert.alert(
      t('camera.permissionBlocked.title', 'Permission needed'),
      t('camera.permissionBlocked.body', 'Access was previously denied, so your device won’t ask again here. Turn it on in Settings to continue.'),
      [
        { text: t('common.cancel', 'Cancel'), style: 'cancel' },
        { text: t('camera.openSettings', 'Open Settings'), onPress: () => Linking.openSettings() },
      ]
    );
  };

  // Requesting camera then mic as two separate back-to-back native calls
  // (the expo-camera hooks only expose one-at-a-time requests) can cause
  // Android to silently deny the second one before its dialog ever appears.
  // Batching both into a single PermissionsAndroid.requestMultiple call
  // shows one combined system dialog instead, avoiding that race.
  const requestAll = async () => {
    if (requesting) return;
    setRequesting(true);
    try {
      if (needsMic && Platform.OS === 'android') {
        const results = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.CAMERA,
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        ]);
        // Resync expo-camera's hook state to what the OS just decided.
        await Promise.all([getCameraPermission(), getMicPermission()]);
        const blocked = [
          results[PermissionsAndroid.PERMISSIONS.CAMERA],
          results[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO],
        ].some((r) => r === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN);
        if (blocked) promptOpenSettings();
      } else {
        const camResult = cameraPermission?.granted ? cameraPermission : await requestCameraPermission();
        const micResult = !needsMic
          ? null
          : micPermission?.granted ? micPermission : await requestMicPermission();
        const blocked = (!camResult?.granted && camResult?.canAskAgain === false)
          || (needsMic && !micResult?.granted && micResult?.canAskAgain === false);
        if (blocked) promptOpenSettings();
      }
    } catch {
      Alert.alert(t('camera.permissionError.title', 'Something went wrong'), t('camera.permissionError.body', 'Could not request camera access. Please try again.'));
    } finally {
      setRequesting(false);
    }
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
    // Optimistically flip to "recording" for instant UI feedback, but if
    // recordAsync() rejects (e.g. mic permission not yet synced natively),
    // reset it in the catch — otherwise the UI stays stuck showing
    // "recording" with a running timer and no way out.
    setRecording(true);
    setRecordingDuration(0);
    timerRef.current = setInterval(() => setRecordingDuration((d) => d + 1), 1000);
    try {
      const video = await cameraRef.current.recordAsync();
      if (video?.uri) {
        onCaptured({ uri: video.uri, name: 'video.mp4', type: 'video/mp4' });
      }
    } catch {
      Alert.alert(t('camera.recordError.title', 'Recording failed'), t('camera.recordError.body', 'Could not record video. Please try again.'));
    } finally {
      if (timerRef.current) clearInterval(timerRef.current);
      setRecording(false);
      setRecordingDuration(0);
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
                ? t('camera.permission.photo', 'Camera access is needed to take a photo.')
                : t('camera.permission.video', 'Camera and microphone access are needed to record video.')}
            </Text>
            <TouchableOpacity
              testID="camera-grant-permission"
              onPress={requestAll}
              disabled={requesting}
              style={[styles.permissionBtn, { backgroundColor: theme.accent, borderRadius: theme.radiusSm }, requesting && { opacity: 0.7 }]}
              accessibilityRole="button"
              accessibilityLabel={t('camera.allowAccess', 'Allow access')}
              accessibilityState={{ disabled: requesting, busy: requesting }}
            >
              {requesting
                ? <ActivityIndicator color={theme.accentText} size="small" />
                : <Text style={[styles.permissionBtnLabel, { color: theme.accentText }]}>{t('camera.allowAccess', 'Allow access')}</Text>
              }
            </TouchableOpacity>
            <TouchableOpacity
              testID="camera-close"
              onPress={onClose}
              hitSlop={12}
              style={styles.cancelTouchTarget}
              accessibilityRole="button"
              accessibilityLabel={t('common.cancel', 'Cancel')}
            >
              <Text style={styles.cancelLink}>{t('common.cancel', 'Cancel')}</Text>
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
              <TouchableOpacity
                testID="camera-close"
                onPress={onClose}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel={t('camera.closeCamera', 'Close camera')}
              >
                <Text style={styles.closeIcon}>✕</Text>
              </TouchableOpacity>
              {mode === 'video' && (
                <Text testID="camera-record-status" style={styles.recordStatus}>
                  {recording
                    ? t('capture.recordingStatus', 'Recording {{seconds}}s — tap to stop').replace('{{seconds}}', String(recordingDuration))
                    : t('capture.tapToStart', 'Tap to start recording')}
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
                <Text testID="camera-loading" style={styles.recordStatus}>{t('camera.starting', 'Starting camera…')}</Text>
              ) : mode === 'photo' ? (
                <TouchableOpacity
                  testID="camera-shutter"
                  onPress={takePhoto}
                  style={styles.shutterOuter}
                  accessibilityRole="button"
                  accessibilityLabel={t('camera.takePhoto', 'Take photo')}
                >
                  <View style={styles.shutterInner} />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  testID="camera-record"
                  onPress={recording ? stopRecording : startRecording}
                  style={[styles.shutterOuter, recording && { borderColor: theme.warn }]}
                  accessibilityRole="button"
                  accessibilityLabel={recording ? t('capture.stopRecording', 'Stop recording') : t('capture.startRecording', 'Start recording')}
                  accessibilityState={{ selected: recording }}
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
  cancelTouchTarget:     { paddingHorizontal: 8, paddingVertical: 4, marginTop: 8 },
  cancelLink:            { color: '#ccc', fontSize: 14 },
  topBar:                { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, paddingTop: 48 },
  closeIcon:             { color: 'white', fontSize: 22 },
  recordStatus:          { color: 'white', fontSize: 13 },
  bottomBar:             { position: 'absolute', bottom: 0, left: 0, right: 0, alignItems: 'center', paddingBottom: 40 },
  shutterOuter:          { width: 76, height: 76, borderRadius: 38, borderWidth: 4, borderColor: 'white', alignItems: 'center', justifyContent: 'center' },
  shutterInner:          { width: 60, height: 60, borderRadius: 30, backgroundColor: 'white' },
  shutterInnerRecording: { width: 28, height: 28, borderRadius: 6, backgroundColor: 'red' },
});
