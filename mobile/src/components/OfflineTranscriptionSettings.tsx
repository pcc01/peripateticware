// src/components/OfflineTranscriptionSettings.tsx
// Android-only settings row: lets a student explicitly download the
// on-device speech-recognition model for their current app language, so
// CaptureSheet.tsx's requiresOnDeviceRecognition:true transcription (see
// AUDIO_TRANSCRIPTION_ON_DEVICE_HANDOFF.md, Task B) actually has a model to
// use instead of silently degrading to "no transcript" the first time a
// student records audio in a language that isn't the device's own.
//
// iOS is deliberately excluded: SFSpeechRecognizer downloads its on-device
// model transparently the first time it's requested, with no public API to
// pre-trigger or inspect it — there's nothing for a settings toggle to do
// there. This is purely an Android gap (a separate on-device model per
// locale, with an explicit download API) that iOS doesn't have.
//
// Deliberately a visible, opt-in control rather than a silent background
// pre-fetch: this app is offline-first because students often have no
// signal during the actual field activity, and the model download itself
// needs connectivity — a silent fetch that failed would leave a student
// wondering why transcription "isn't working" with no way to find out why.
// This surfaces the download explicitly, ideally done at school/home on
// wifi before a trip, not during one.

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import { Theme } from '@/src/theme/tokens';
import { getSttLocale, SUPPORTED_LOCALES } from '@/src/i18n/locales';

type Status = 'checking' | 'not-supported' | 'idle' | 'downloading' | 'installed' | 'failed';

export default function OfflineTranscriptionSettings({ theme }: { theme: Theme }) {
  const { t, i18n } = useTranslation();
  const [status, setStatus] = useState<Status>('checking');

  const sttLocale = getSttLocale(i18n.language);
  const languageName = SUPPORTED_LOCALES.find((l) => l.code === i18n.language)?.name ?? i18n.language;

  const checkInstalled = useCallback(async (): Promise<boolean> => {
    const { locales, installedLocales } = await ExpoSpeechRecognitionModule.getSupportedLocales({});
    // An empty `locales` array means this device has no on-device speech
    // recognition service at all (e.g. no Android System Intelligence),
    // not just "nothing downloaded yet" — nothing to offer here either way.
    if (locales.length === 0) throw new Error('no-recognition-service');
    return installedLocales.includes(sttLocale);
  }, [sttLocale]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    let cancelled = false;
    setStatus('checking');
    checkInstalled()
      .then((installed) => { if (!cancelled) setStatus(installed ? 'installed' : 'idle'); })
      .catch(() => { if (!cancelled) setStatus('not-supported'); });
    return () => { cancelled = true; };
  }, [checkInstalled]);

  if (Platform.OS !== 'android') return null;

  const handleDownload = async () => {
    setStatus('downloading');
    try {
      const result = await ExpoSpeechRecognitionModule.androidTriggerOfflineModelDownload({ locale: sttLocale });
      if (result.status === 'download_success') {
        setStatus('installed');
      } else if (result.status === 'opened_dialog') {
        // Android 13 path: a system dialog was shown, but whether the
        // student actually completes the download in it is unknown from
        // here — give them a few seconds to interact with it, then re-check
        // rather than claim success we haven't confirmed.
        setTimeout(() => {
          checkInstalled()
            .then((installed) => setStatus(installed ? 'installed' : 'idle'))
            .catch(() => setStatus('idle'));
        }, 4000);
      } else {
        // download_canceled
        setStatus('idle');
      }
    } catch {
      setStatus('failed');
    }
  };

  return (
    <View style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: theme.radius }]}>
      <Text style={[styles.sectionLabel, { fontFamily: theme.fontMono, color: theme.textFaint }]}>
        {t('settings.offlineTranscription.label', 'OFFLINE TRANSCRIPTION')}
      </Text>
      <Text style={[styles.desc, { fontFamily: theme.fontBody, color: theme.textMuted }]}>
        {t(
          'settings.offlineTranscription.desc',
          'Lets voice recordings be transcribed on this device, in {{language}} — nothing is sent to a server for this. Best done now, on wifi, before you need it in the field.',
          { language: languageName }
        )}
      </Text>

      {status === 'checking' && <ActivityIndicator color={theme.accent} testID="offline-stt-checking" />}

      {status === 'not-supported' && (
        <Text style={[styles.statusText, { fontFamily: theme.fontBody, color: theme.textFaint }]} testID="offline-stt-not-supported">
          {t('settings.offlineTranscription.notSupported', "This device doesn't support offline transcription.")}
        </Text>
      )}

      {status === 'installed' && (
        <View style={styles.statusRow}>
          <Text style={[styles.checkmark, { color: theme.accent }]}>✓</Text>
          <Text style={[styles.statusText, { fontFamily: theme.fontBody, color: theme.text }]} testID="offline-stt-installed">
            {t('settings.offlineTranscription.ready', 'Ready for {{language}}', { language: languageName })}
          </Text>
        </View>
      )}

      {(status === 'idle' || status === 'failed') && (
        <>
          {status === 'failed' && (
            <Text style={[styles.statusText, { fontFamily: theme.fontBody, color: theme.warn }]} testID="offline-stt-failed">
              {t('settings.offlineTranscription.failed', "Couldn't download. Check your connection and try again.")}
            </Text>
          )}
          <TouchableOpacity
            testID="offline-stt-download-btn"
            onPress={handleDownload}
            style={[styles.button, { borderColor: theme.accent, borderRadius: theme.radiusSm }]}
            accessibilityRole="button"
            accessibilityLabel={t('settings.offlineTranscription.enable', 'Enable offline transcription for {{language}}', { language: languageName })}
          >
            <Text style={[styles.buttonLabel, { color: theme.accent, fontFamily: theme.fontBody }]}>
              {t('settings.offlineTranscription.enable', 'Enable offline transcription for {{language}}', { language: languageName })}
            </Text>
          </TouchableOpacity>
        </>
      )}

      {status === 'downloading' && (
        <View style={styles.statusRow} testID="offline-stt-downloading">
          <ActivityIndicator color={theme.accent} />
          <Text style={[styles.statusText, { fontFamily: theme.fontBody, color: theme.textMuted }]}>
            {t('settings.offlineTranscription.downloading', 'Downloading…')}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section:     { padding: 14, borderWidth: 1, gap: 10 },
  sectionLabel:{ fontSize: 9, letterSpacing: 1.4, textTransform: 'uppercase' },
  desc:        { fontSize: 12, lineHeight: 18 },
  statusRow:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusText:  { fontSize: 13 },
  checkmark:   { fontSize: 16, fontWeight: '700' },
  button:      { borderWidth: 1, padding: 12, alignItems: 'center' },
  buttonLabel: { fontSize: 14, fontWeight: '600' },
});
