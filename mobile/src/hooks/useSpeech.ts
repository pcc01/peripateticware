// src/hooks/useSpeech.ts
// On-device text-to-speech (expo-speech — wraps AVSpeechSynthesizer on iOS /
// TextToSpeech on Android). No network dependency, no backend involved.
//
// Used by PeriSpeech's speaker button (src/components/PeriSpeech.tsx) so
// every place Peri "talks" gets read-aloud for free. If/when the language
// picker (mobile/FEATURE_PLAN.md section 3.1) ships, pass its selected
// BCP-47 locale as `language` here — expo-speech's `language` option takes
// that format directly, so voice follows the chosen language with no
// further wiring.

import { useCallback, useEffect, useRef, useState } from 'react';
import * as Speech from 'expo-speech';

interface UseSpeechOptions {
  language?: string; // BCP-47 tag, e.g. 'en-US', 'ko-KR'. Defaults to device locale.
  rate?: number;      // 0.1–2.0, expo-speech default is 1.0
}

export function useSpeech(options: UseSpeechOptions = {}) {
  const { language, rate = 0.95 } = options;
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
  }, [language, rate]);

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
