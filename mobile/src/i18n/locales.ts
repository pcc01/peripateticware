// src/i18n/locales.ts
// ─────────────────────────────────────────────────────────────────
// Scope decision (mobile/FEATURE_PLAN.md section 3.1): the language
// picker's chip list, decided so far. This is DATA ONLY — there is no
// picker UI wired to it yet (mobile has no i18n library installed and
// no translated strings; see the "smaller first step" option in
// FEATURE_PLAN.md). Building the actual chip UI + AsyncStorage
// persistence + translation layer is still step 4 of that doc's
// suggested build order.
//
// Locale set mirrors frontend/src/config/i18n.ts's SUPPORTED_LANGUAGES
// for web/mobile parity, per FEATURE_PLAN.md's note that this was
// "likely intended." The pre-removal mobile picker reportedly had 8
// chips (work_tracking.md / BUG_REPORT_TRIAGE.md); the exact original
// 8th language isn't recoverable from those docs, so this list is 7,
// matching web exactly. Add an 8th here (and to web's
// SUPPORTED_LANGUAGES, to keep parity) if/when that's decided.
// ─────────────────────────────────────────────────────────────────

export interface SupportedLocale {
  code: string; // BCP-47 tag — also what expo-speech's `language` option expects (see useSpeech.ts)
  name: string;
  flag: string;
}

export const SUPPORTED_LOCALES: SupportedLocale[] = [
  { code: 'en',    name: 'English',              flag: '🇬🇧' },
  { code: 'es',    name: 'Español',               flag: '🇪🇸' },
  { code: 'fr',    name: 'Français',              flag: '🇫🇷' },
  { code: 'ar',    name: 'العربية',                flag: '🇸🇦' },
  { code: 'ja',    name: '日本語',                  flag: '🇯🇵' },
  { code: 'ko',    name: '한국어',                  flag: '🇰🇷' },
  { code: 'pt-BR', name: 'Português (Brasil)',    flag: '🇧🇷' },
];

export const DEFAULT_LOCALE = 'en';

// Matches the prior removed picker's AsyncStorage key (work_tracking.md) so
// any leftover logic/migrations expecting it still work.
export const LANGUAGE_STORAGE_KEY = '@ppw_language';
