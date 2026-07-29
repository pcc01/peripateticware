// src/components/CapturePreviewModal.tsx
// Lets a student review a capture they just took during an activity —
// photo/video/audio playback or the note text — using the on-device file
// captured moments ago (Capture.local_uri / local_text from CaptureSheet.tsx)
// rather than re-fetching the uploaded copy from the server.

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { Video, ResizeMode, Audio } from 'expo-av';
import { Theme } from '@/src/theme/tokens';
import { Capture } from '@/src/api/captures';
import { t } from '@/src/i18n/t';

interface Props {
  visible: boolean;
  onClose: () => void;
  capture: Capture | null;
  theme: Theme;
}

export default function CapturePreviewModal({ visible, onClose, capture, theme }: Props) {
  const [isPlaying, setIsPlaying] = useState(false);
  const soundRef = useRef<Audio.Sound | null>(null);

  // Stop/unload audio playback whenever the sheet closes or a different
  // capture is opened — otherwise a recording could keep playing silently
  // in the background after the student navigates away.
  useEffect(() => {
    return () => {
      soundRef.current?.unloadAsync();
      soundRef.current = null;
    };
  }, [visible, capture?.id]);

  const toggleAudio = async () => {
    if (!capture?.local_uri) return;
    if (isPlaying) {
      await soundRef.current?.pauseAsync();
      setIsPlaying(false);
      return;
    }
    if (!soundRef.current) {
      const { sound } = await Audio.Sound.createAsync(
        { uri: capture.local_uri },
        { shouldPlay: true },
        (status) => {
          if (status.isLoaded && status.didJustFinish) setIsPlaying(false);
        }
      );
      soundRef.current = sound;
    } else {
      await soundRef.current.playAsync();
    }
    setIsPlaying(true);
  };

  if (!capture) return null;

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: theme.bg, borderColor: theme.border }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { fontFamily: theme.fontHead, color: theme.text }]}>
              {t('capture.preview.title', 'Your evidence')}
            </Text>
            <TouchableOpacity
              testID="capture-preview-close"
              onPress={onClose}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={t('common.close', 'Close')}
            >
              <Text style={[styles.closeBtn, { color: theme.textMuted }]}>✕</Text>
            </TouchableOpacity>
          </View>

          {capture.capture_type === 'photo' && capture.local_uri && (
            <Image source={{ uri: capture.local_uri }} style={styles.media} contentFit="contain" />
          )}

          {capture.capture_type === 'video' && capture.local_uri && (
            <Video
              source={{ uri: capture.local_uri }}
              style={styles.media}
              useNativeControls
              resizeMode={ResizeMode.CONTAIN}
            />
          )}

          {capture.capture_type === 'audio' && capture.local_uri && (
            <View style={styles.audioRow}>
              <TouchableOpacity
                testID="capture-preview-play"
                onPress={toggleAudio}
                style={[styles.playBtn, { backgroundColor: theme.accent }]}
                accessibilityRole="button"
                accessibilityLabel={isPlaying ? t('capture.preview.pause', 'Pause') : t('capture.preview.play', 'Play')}
              >
                <Text style={styles.playIcon}>{isPlaying ? '⏸' : '▶'}</Text>
              </TouchableOpacity>
              <Text style={[styles.bodyText, { fontFamily: theme.fontBody, color: theme.textMuted }]}>
                {capture.transcript ?? t('journal.transcriptPending', 'Transcript pending…')}
              </Text>
            </View>
          )}

          {(capture.capture_type === 'note' || capture.capture_type === 'text') && (
            <ScrollView style={styles.noteScroll}>
              <Text style={[styles.bodyText, { fontFamily: theme.fontBody, color: theme.text }]}>
                {capture.local_text}
              </Text>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card:      { width: '100%', maxHeight: '80%', borderWidth: 1, borderRadius: 16, padding: 16, gap: 14 },
  header:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title:     { fontSize: 17, fontWeight: '700' },
  closeBtn:  { fontSize: 18, padding: 4 },
  media:     { width: '100%', aspectRatio: 1, borderRadius: 10, backgroundColor: '#000' },
  audioRow:  { flexDirection: 'row', alignItems: 'center', gap: 12 },
  playBtn:   { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  playIcon:  { fontSize: 18, color: 'white' },
  bodyText:  { fontSize: 15, lineHeight: 22, flex: 1 },
  noteScroll: { maxHeight: 300 },
});
