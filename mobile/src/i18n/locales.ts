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
// Kept in parity with the full set of locales that have real translated
// content on the website (frontend/public/locales/ — 12 non-English
// locales), not just the 7 previously exposed in web's own picker
// (frontend/src/config/i18n.ts's SUPPORTED_LANGUAGES, updated alongside
// this file to match).
//
// mobile/scripts/translate_appstrings.py parses this array directly, so
// adding a locale here (plus running that script) is the whole
// add-a-locale workflow.
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
  { code: 'fr-CA', name: 'Français (Canada)',     flag: '🇨🇦' },
  { code: 'he',    name: 'עברית',                  flag: '🇮🇱' },
  { code: 'de',    name: 'Deutsch',                flag: '🇩🇪' },
  { code: 'it',    name: 'Italiano',               flag: '🇮🇹' },
  { code: 'tr',    name: 'Türkçe',                 flag: '🇹🇷' },
  { code: 'zh',    name: '中文',                    flag: '🇨🇳' },
];

export const DEFAULT_LOCALE = 'en';

// Matches the prior removed picker's AsyncStorage key (work_tracking.md) so
// any leftover logic/migrations expecting it still work.
export const LANGUAGE_STORAGE_KEY = '@ppw_language';
