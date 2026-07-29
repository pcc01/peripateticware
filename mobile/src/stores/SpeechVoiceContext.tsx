// src/stores/SpeechVoiceContext.tsx
// Explicit on-device TTS voice selection, independent of (but defaulting
// from) the app's UI language — see useSpeech.ts's header comment for why
// this exists: expo-speech's `language` option is only a hint, and on a
// device where the exact language/region has no installed voice, iOS/
// Android silently fall back to the system voice (English, on most test
// devices) with no error surfaced anywhere. `Speech.getAvailableVoicesAsync()`
// returns only voices that are ACTUALLY installed, so picking one from that
// list and passing its `identifier` (see useSpeech's `voice` option)
// sidesteps the guessing entirely.
//
// Preference is stored per app-language (`{ [languageCode]: voiceIdentifier }`)
// rather than as one global choice — switching the app from English to
// Spanish shouldn't keep reading Spanish text in a Korean voice just because
// that was the last explicit pick. No stored entry for the current language
// means "automatic": useSpeech falls back to its `language` hint, which is
// still correctly wired to match the app's current locale.

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Speech from 'expo-speech';
import { useTranslation } from 'react-i18next';
import { getSpeechLocale } from '@/src/i18n/locales';

const VOICE_PREFS_STORAGE_KEY = '@ppw_speech_voice_prefs';

interface SpeechVoiceContextValue {
  availableVoices: Speech.Voice[];
  voicesLoading: boolean;
  /** Explicit voice identifier saved for `language`, or undefined for "automatic". */
  getVoiceFor: (language: string) => string | undefined;
  setVoiceFor: (language: string, voiceIdentifier: string | null) => Promise<void>;
}

const SpeechVoiceContext = createContext<SpeechVoiceContextValue | null>(null);

export function SpeechVoiceProvider({ children }: { children: React.ReactNode }) {
  const [availableVoices, setAvailableVoices] = useState<Speech.Voice[]>([]);
  const [voicesLoading, setVoicesLoading] = useState(true);
  const [prefs, setPrefs] = useState<Record<string, string>>({});

  useEffect(() => {
    Speech.getAvailableVoicesAsync()
      .then(setAvailableVoices)
      .catch(() => setAvailableVoices([]))
      .finally(() => setVoicesLoading(false));

    AsyncStorage.getItem(VOICE_PREFS_STORAGE_KEY)
      .then((raw) => { if (raw) setPrefs(JSON.parse(raw)); })
      .catch(() => {});
  }, []);

  const getVoiceFor = useCallback((language: string) => prefs[language], [prefs]);

  const setVoiceFor = useCallback(async (language: string, voiceIdentifier: string | null) => {
    setPrefs((prev) => {
      const next = { ...prev };
      if (voiceIdentifier) next[language] = voiceIdentifier;
      else delete next[language];
      AsyncStorage.setItem(VOICE_PREFS_STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  return (
    <SpeechVoiceContext.Provider value={{ availableVoices, voicesLoading, getVoiceFor, setVoiceFor }}>
      {children}
    </SpeechVoiceContext.Provider>
  );
}

/** Resolves the voice identifier (if any) for the app's current language,
 * plus the language-filtered list of installed voices to offer a picker. */
export function useSpeechVoice() {
  const { i18n } = useTranslation();
  const ctx = useContext(SpeechVoiceContext);
  if (!ctx) throw new Error('useSpeechVoice must be used within a SpeechVoiceProvider');

  const speechLocale = getSpeechLocale(i18n.language);
  const langPrefix = i18n.language.split('-')[0].toLowerCase();
  const voicesForCurrentLanguage = ctx.availableVoices.filter((v) =>
    v.language?.toLowerCase().startsWith(langPrefix)
  );

  return {
    voiceId: ctx.getVoiceFor(i18n.language),
    speechLocale,
    voicesForCurrentLanguage,
    allVoices: ctx.availableVoices,
    voicesLoading: ctx.voicesLoading,
    setVoiceForCurrentLanguage: (voiceIdentifier: string | null) => ctx.setVoiceFor(i18n.language, voiceIdentifier),
  };
}
