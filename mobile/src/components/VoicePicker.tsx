// src/components/VoicePicker.tsx
// Settings' explicit TTS voice control — lists only voices actually
// installed on this device for the current app language (from
// Speech.getAvailableVoicesAsync(), via useSpeechVoice), plus an
// "Automatic" option that clears the override and falls back to
// useSpeech's language-hint matching. See SpeechVoiceContext.tsx's header
// comment for why an explicit picker exists at all: the language hint
// alone can silently resolve to the wrong (usually English) voice on a
// real device.

import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, FlatList, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Voice } from 'expo-speech';
import { Theme } from '@/src/theme/tokens';
import { useSpeechVoice } from '@/src/stores/SpeechVoiceContext';
import { useSpeech } from '@/src/hooks/useSpeech';

interface Props {
  theme: Theme;
}

export default function VoicePicker({ theme }: Props) {
  const { t } = useTranslation();
  const { voiceId, speechLocale, voicesForCurrentLanguage, voicesLoading, setVoiceForCurrentLanguage } = useSpeechVoice();
  const { speak } = useSpeech({ language: speechLocale });
  const [open, setOpen] = useState(false);

  const current = voicesForCurrentLanguage.find((v) => v.identifier === voiceId);
  const currentLabel = current?.name ?? t('settings.voice.automatic', 'Automatic');

  const handleSelect = (identifier: string | null) => {
    setVoiceForCurrentLanguage(identifier);
    setOpen(false);
  };

  const previewText = t('settings.voice.previewText', 'This is what this voice sounds like.');

  return (
    <>
      <TouchableOpacity
        testID="voice-picker-trigger"
        onPress={() => setOpen(true)}
        style={[styles.trigger, { borderColor: theme.border, borderRadius: theme.radiusSm, backgroundColor: theme.surfaceAlt }]}
        accessibilityRole="button"
        accessibilityLabel={t('settings.voice.current', 'Voice: {{voice}}', { voice: currentLabel })}
      >
        <Text style={styles.icon}>🔊</Text>
        <Text style={[styles.triggerLabel, { fontFamily: theme.fontBody, color: theme.text }]}>{currentLabel}</Text>
        <Text style={[styles.chevron, { color: theme.textFaint }]}>▾</Text>
      </TouchableOpacity>

      <Modal visible={open} animationType="fade" transparent onRequestClose={() => setOpen(false)}>
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={() => setOpen(false)}
          accessibilityRole="button"
          accessibilityLabel={t('common.close', 'Close')}
        >
          <TouchableOpacity activeOpacity={1} style={[styles.card, { backgroundColor: theme.bg, borderColor: theme.border }]}>
            <View style={styles.header}>
              <Text style={[styles.title, { fontFamily: theme.fontHead, color: theme.text }]}>
                {t('settings.voiceLabel', 'VOICE')}
              </Text>
              <TouchableOpacity
                testID="voice-picker-close"
                onPress={() => setOpen(false)}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel={t('common.close', 'Close')}
              >
                <Text style={[styles.closeBtn, { color: theme.textMuted }]}>✕</Text>
              </TouchableOpacity>
            </View>

            {voicesLoading ? (
              <ActivityIndicator color={theme.accent} style={{ paddingVertical: 20 }} />
            ) : (
              <FlatList
                data={[{ identifier: null, name: t('settings.voice.automatic', 'Automatic'), language: '', quality: 'Default' } as unknown as Voice, ...voicesForCurrentLanguage]}
                keyExtractor={(item, i) => item.identifier ?? `auto-${i}`}
                style={styles.list}
                ListEmptyComponent={
                  <Text style={[styles.emptyText, { fontFamily: theme.fontBody, color: theme.textMuted }]}>
                    {t('settings.voice.none', 'No installed voices found for this language.')}
                  </Text>
                }
                renderItem={({ item }) => {
                  const selected = item.identifier === voiceId || (item.identifier === null && !voiceId);
                  return (
                    <TouchableOpacity
                      testID={`voice-option-${item.identifier ?? 'automatic'}`}
                      onPress={() => handleSelect(item.identifier)}
                      style={[
                        styles.optionRow,
                        { borderColor: selected ? theme.accent : theme.border, borderRadius: theme.radiusSm, backgroundColor: selected ? theme.accentMuted : theme.surfaceAlt },
                      ]}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.optionLabel, { fontFamily: theme.fontBody, color: theme.text }]}>{item.name}</Text>
                        {!!item.identifier && (
                          <Text style={[styles.optionMeta, { fontFamily: theme.fontMono, color: theme.textFaint }]}>
                            {item.language} · {item.quality}
                          </Text>
                        )}
                      </View>
                      {item.identifier && (
                        <TouchableOpacity
                          testID={`voice-preview-${item.identifier}`}
                          onPress={() => speak(previewText)}
                          hitSlop={8}
                          style={styles.previewBtn}
                          accessibilityRole="button"
                          accessibilityLabel={t('perispeech.readAloud', 'Read aloud')}
                        >
                          <Text style={{ fontSize: 16 }}>▶</Text>
                        </TouchableOpacity>
                      )}
                      {selected && <Text style={[styles.checkmark, { color: theme.accent }]}>✓</Text>}
                    </TouchableOpacity>
                  );
                }}
              />
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger:     { flexDirection: 'row', alignItems: 'center', padding: 10, borderWidth: 1, gap: 10 },
  icon:        { fontSize: 18 },
  triggerLabel:{ flex: 1, fontSize: 14, fontWeight: '600' },
  chevron:     { fontSize: 14 },
  backdrop:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card:        { width: '100%', maxHeight: '75%', borderWidth: 1, borderRadius: 16, padding: 16, gap: 12 },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title:       { fontSize: 17, fontWeight: '700' },
  closeBtn:    { fontSize: 18, padding: 4 },
  list:        { flexGrow: 0 },
  emptyText:   { fontSize: 13, textAlign: 'center', paddingVertical: 16 },
  optionRow:   { flexDirection: 'row', alignItems: 'center', padding: 10, borderWidth: 1, gap: 8, marginBottom: 8 },
  optionLabel: { fontSize: 14, fontWeight: '600' },
  optionMeta:  { fontSize: 10, letterSpacing: 0.4, marginTop: 2 },
  previewBtn:  { padding: 6 },
  checkmark:   { fontSize: 16, fontWeight: '700' },
});
