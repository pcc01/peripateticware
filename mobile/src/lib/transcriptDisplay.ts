// src/lib/transcriptDisplay.ts
//
// Shared between CapturePreviewModal.tsx (post-capture review) and
// journal.tsx (the portfolio list) — both show an audio capture's
// transcript, or an explanatory placeholder when there isn't one yet.
//
// transcript_status distinguishes "still transcribing" from "won't have
// one" — before this field existed, a null transcript always rendered as
// "Transcript pending…", even for a capture that had already permanently
// failed, was never attempted (ASR disabled), or — since transcription
// moved on-device (2026-09-13) — simply had no on-device transcript to
// submit. See models/database.py TranscriptStatus (backend) and
// AUDIO_TRANSCRIPTION_ON_DEVICE_HANDOFF.md.
//
// The `t` parameter is intentionally named `t` (not e.g. `translate`) so
// i18next-parser's static extraction — which recognizes calls literally
// named `t(...)`, not scope-aware of what the identifier resolves to —
// actually picks up the keys used here. A differently-named parameter
// silently drops those keys from `npm run i18n:check` / `i18n:run-all`,
// which is exactly what happened before this file existed (see git
// history for CapturePreviewModal.tsx).

import { Capture } from '@/src/api/captures';

export function transcriptDisplayText(capture: Pick<Capture, 'transcript' | 'transcript_status'>, t: (key: string, fallback: string) => string): string {
  if (capture.transcript) return capture.transcript;
  switch (capture.transcript_status) {
    case 'failed':
    case 'disabled':
    case 'unavailable':
      return t('journal.transcriptUnavailable', 'Transcript unavailable');
    case 'pending':
    default:
      return t('journal.transcriptPending', 'Transcript pending…');
  }
}
