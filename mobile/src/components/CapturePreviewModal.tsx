// src/components/CapturePreviewModal.tsx
// Lets a student review a capture they just took during an activity —
// photo/video/audio playback or the note text — using the on-device file
// captured moments ago (Capture.local_uri / local_text from CaptureSheet.tsx)
// rather than re-fetching the uploaded copy from the server.

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { Video, ResizeMode, Audio } from 'expo-av';
import { SvgUri } from 'react-native-svg';
import { Theme } from '@/src/theme/tokens';
import { Capture, getMediaStreamUrl } from '@/src/api/captures';
import { t } from '@/src/i18n/t';
import { transcriptDisplayText } from '@/src/lib/transcriptDisplay';

interface Props {
  visible: boolean;
  onClose: () => void;
  capture: Capture | null;
  theme: Theme;
}

export default function CapturePreviewModal({ visible, onClose, capture, theme }: Props) {
  const [isPlaying, setIsPlaying] = useState(false);
  const soundRef = useRef<Audio.Sound | null>(null);

  // `local_uri` only exists for a capture reviewed moments after taking it
  // (CaptureSheet.tsx's optimistic client-only state — never sent by or
  // re-fetched from the backend). Opening an OLDER capture later (e.g. from
  // journal.tsx's portfolio list) has no local_uri at all, so fall back to
  // streaming it from the server via a short-lived signed media token —
  // same backend endpoints the web app already uses (see
  // getMediaStreamUrl's own comment). `resolvedUri` is whichever of the two
  // this capture actually has; everything below plays/renders from it
  // instead of `capture.local_uri` directly.
  const [resolvedUri, setResolvedUri] = useState<string | null>(null);
  const [resolvingUri, setResolvingUri] = useState(false);

  const isTextType = capture?.capture_type === 'note' || capture?.capture_type === 'text' || capture?.capture_type === 'peri_chat';

  // BUG FIX (2026-09-14): a text-shaped capture (note/text/peri_chat)
  // opened from anywhere OTHER than the moment it was captured (e.g. the
  // journal/portfolio list, or an older item in this same activity's
  // evidence strip after a remount) had no `local_text` and rendered
  // completely blank — this branch used to bail out of the streaming
  // fetch entirely for these types ("nothing to stream"), which was true
  // for media but wrong for text: there IS something to fetch, it's just
  // text instead of a media file. Needed to make a saved Peri conversation
  // (see PeriChatSheet.tsx) actually reviewable later, not just in the
  // same session it was captured — the same gap already existed for plain
  // notes, fixed here too rather than left as a known-bad case.
  const [resolvedText, setResolvedText] = useState<string | null>(null);
  const [resolvingText, setResolvingText] = useState(false);

  useEffect(() => {
    if (!capture) { setResolvedUri(null); return; }
    if (capture.local_uri) { setResolvedUri(capture.local_uri); return; }
    if (isTextType) return; // handled by the text-resolution effect below
    let cancelled = false;
    setResolvingUri(true);
    setResolvedUri(null);
    getMediaStreamUrl(capture.id)
      .then((uri) => { if (!cancelled) setResolvedUri(uri); })
      .catch(() => { if (!cancelled) setResolvedUri(null); })
      .finally(() => { if (!cancelled) setResolvingUri(false); });
    return () => { cancelled = true; };
    // Deliberately keyed on the two primitive fields that actually decide
    // the outcome, not the whole `capture` object — a new object reference
    // for the same underlying capture (a common re-render pattern from a
    // parent's list state) would otherwise re-fetch a stream URL we already
    // resolved.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capture?.id, capture?.local_uri, isTextType]);

  useEffect(() => {
    if (!capture || !isTextType) { setResolvedText(null); return; }
    if (capture.local_text) { setResolvedText(capture.local_text); return; }
    // Still-queued-locally case: the actual text is already on-device,
    // baked into the data: URI queueCapture() stored (see
    // CaptureSheet.tsx's submitNote / PeriChatSheet.tsx's saveTranscript) —
    // decode it directly rather than round-tripping to the server for
    // content that's sitting right here.
    const dataUriMatch = capture.local_uri?.match(/^data:text\/plain;base64,(.*)$/s);
    if (dataUriMatch) { setResolvedText(atob(dataUriMatch[1])); return; }
    // Already-synced case: no local copy at all — stream it from the
    // server the same way media does, then read the response as plain text
    // instead of just handing back a playable URL.
    let cancelled = false;
    setResolvingText(true);
    setResolvedText(null);
    getMediaStreamUrl(capture.id)
      .then((url) => fetch(url))
      .then((res) => res.text())
      .then((text) => { if (!cancelled) setResolvedText(text); })
      .catch(() => { if (!cancelled) setResolvedText(null); })
      .finally(() => { if (!cancelled) setResolvingText(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capture?.id, capture?.local_text, capture?.local_uri, isTextType]);

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
    if (!resolvedUri) return;
    if (isPlaying) {
      await soundRef.current?.pauseAsync();
      setIsPlaying(false);
      return;
    }
    if (!soundRef.current) {
      const { sound } = await Audio.Sound.createAsync(
        { uri: resolvedUri },
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
            <Text style={[styles.title, { fontFamily: theme.fontHead, color: theme.text }]} numberOfLines={1}>
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

          {/* Points at exactly why THIS item hasn't reached the teacher yet
              — the work is safe on-device, this is a status, not an error.
              See app/activity/[id].tsx's evidence-strip lock badge, which
              is what a student taps to land here. */}
          {capture.blocked_reason === 'consent_required' && (
            <View style={[styles.blockedBanner, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
              <Text style={[styles.bodyText, { fontFamily: theme.fontBody, color: theme.textMuted }]}>
                🔒 {t('capture.preview.consentBlocked', "Saved on your device — needs a parent's OK before it can be shared with your teacher.")}
              </Text>
            </View>
          )}

          {resolvingUri && (
            <View style={[styles.media, styles.mediaLoading]}>
              <ActivityIndicator color={theme.accent} />
            </View>
          )}

          {capture.capture_type === 'photo' && resolvedUri && (
            <Image source={{ uri: resolvedUri }} style={styles.media} contentFit="contain" />
          )}

          {capture.capture_type === 'video' && resolvedUri && (
            <Video
              source={{ uri: resolvedUri }}
              style={styles.media}
              useNativeControls
              resizeMode={ResizeMode.CONTAIN}
            />
          )}

          {capture.capture_type === 'sketch' && resolvedUri && (
            // SvgUri handles both a local data:image/svg+xml;base64 URI
            // (just drawn — see CaptureSheet.tsx's submitSketch) and an
            // http(s) stream URL (an older capture, via getMediaStreamUrl)
            // transparently — see react-native-svg's fetchText().
            <View style={[styles.media, styles.sketchMedia]}>
              <SvgUri uri={resolvedUri} width="100%" height="100%" />
            </View>
          )}

          {capture.capture_type === 'audio' && (
            <View style={styles.audioRow}>
              <TouchableOpacity
                testID="capture-preview-play"
                onPress={toggleAudio}
                disabled={!resolvedUri}
                style={[styles.playBtn, { backgroundColor: theme.accent, opacity: resolvedUri ? 1 : 0.5 }]}
                accessibilityRole="button"
                accessibilityLabel={isPlaying ? t('capture.preview.pause', 'Pause') : t('capture.preview.play', 'Play')}
              >
                <Text style={styles.playIcon}>{isPlaying ? '⏸' : '▶'}</Text>
              </TouchableOpacity>
              <Text style={[styles.bodyText, { fontFamily: theme.fontBody, color: theme.textMuted }]}>
                {transcriptDisplayText(capture, t)}
              </Text>
            </View>
          )}

          {isTextType && (
            resolvingText ? (
              <View style={[styles.media, styles.mediaLoading, { aspectRatio: undefined, height: 80, backgroundColor: 'transparent' }]}>
                <ActivityIndicator color={theme.accent} />
              </View>
            ) : (
              <ScrollView style={styles.noteScroll}>
                <Text style={[styles.bodyText, { fontFamily: theme.fontBody, color: theme.text }]}>
                  {resolvedText ?? t('capture.preview.textUnavailable', "Couldn't load this text.")}
                </Text>
              </ScrollView>
            )
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
  title:     { fontSize: 17, fontWeight: '700', flexShrink: 1 },
  closeBtn:  { fontSize: 18, padding: 4, flexShrink: 0 },
  media:     { width: '100%', aspectRatio: 1, borderRadius: 10, backgroundColor: '#000' },
  mediaLoading: { alignItems: 'center', justifyContent: 'center' },
  // Overrides media's black letterbox background — a sketch's own white
  // rect is baked into the SVG, but the drawing canvas it was made on
  // isn't square, so this square preview frame still shows the container
  // background in the letterboxed margin; black behind a white drawing
  // looked wrong, unlike photo/video where black is the expected letterbox.
  sketchMedia: { backgroundColor: '#ffffff' },
  audioRow:  { flexDirection: 'row', alignItems: 'center', gap: 12 },
  playBtn:   { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  playIcon:  { fontSize: 18, color: 'white' },
  bodyText:  { fontSize: 15, lineHeight: 22, flex: 1 },
  noteScroll: { maxHeight: 300 },
  blockedBanner: { borderWidth: 1, borderRadius: 8, padding: 10, marginBottom: 10 },
});
