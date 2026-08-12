// src/hooks/useSpeech.ts
// On-device text-to-speech (expo-speech — wraps AVSpeechSynthesizer on iOS /
// TextToSpeech on Android). No network dependency, no backend involved.
//
// Used by PeriSpeech's speaker button (src/components/PeriSpeech.tsx) and
// SpeakerButton so every place Peri (or an activity's real instructions)
// "talks" gets read-aloud for free.
//
// Two ways to steer which voice reads the text, and they're deliberately
// independent:
//   - `language` (BCP-47, e.g. 'es', 'ko-KR') — a *hint*. iOS/Android pick
//     whatever installed voice best matches; if the exact language/region
//     has no installed voice, behavior is platform-defined (silent fallback
//     to the system voice on some devices, which is the bug this hook and
//     useVoicePreference.ts exist to work around).
//   - `voice` (an identifier from Speech.getAvailableVoicesAsync(), see
//     useVoicePreference.ts) — an explicit, *guaranteed-installed* voice.
//     Takes priority over `language` when both are given, since it names an
//     exact voice rather than asking the OS to guess one.
import { useCallback, useEffect, useRef, useState } from 'react';
import * as Speech from 'expo-speech';

interface UseSpeechOptions {
  language?: string; // BCP-47 tag, e.g. 'en-US', 'ko-KR'. Defaults to device locale.
  voice?: string;     // Voice identifier from Speech.getAvailableVoicesAsync(). Overrides `language` when set.
  rate?: number;      // 0.1–2.0, expo-speech default is 1.0
}

export function useSpeech(options: UseSpeechOptions = {}) {
  const { language, voice, rate = 0.95 } = options;
  const [speaking, setSpeaking] = useState(false);
  // Guards against a stop() that fires after a newer speak() already
  // started — without this, rapid taps could clear `speaking` for the
  // wrong utterance.
  const tokenRef = useRef(0);

  useEffect(() => {
    return () => { Speech.stop(); };
  }, []);

  const speak = useCallback((text: string) => {
    if (!text?.trim()) return;
    const token = ++tokenRef.current;
    Speech.stop();
    setSpeaking(true);
    Speech.speak(text, {
      language,
      voice,
      rate,
      // iOS: keep AVSpeechSynthesizer on its own private session instead of
      // riding the app's shared AVAudioSession. CaptureSheet configures that
      // shared session for mic recording (and it can be left in a
      // .playAndRecord/silenced-by-default state), which was silently
      // muting read-aloud playback with no error.
      useApplicationAudioSession: false,
      onDone: () => { if (tokenRef.current === token) setSpeaking(false); },
      onStopped: () => { if (tokenRef.current === token) setSpeaking(false); },
      onError: () => { if (tokenRef.current === token) setSpeaking(false); },
    });
  }, [language, voice, rate]);

  const stop = useCallback(() => {
    tokenRef.current++;
    Speech.stop();
    setSpeaking(false);
  }, []);

  const toggle = useCallback((text: string) => {
    if (speaking) stop(); else speak(text);
  }, [speaking, speak, stop]);

  return { speaking, speak, stop, toggle };
}
