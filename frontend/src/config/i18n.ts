import i18n from 'i18next'
import HttpBackend from 'i18next-http-backend'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

// ============================================================================
// ✅ FIXED: Correct path for Vite public folder serving
// ============================================================================
// In Vite, /public files are served at / (root of the domain)
// So /public/locales/en/landing.json is served at /locales/en/landing.json

export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
  { code: 'ar', name: 'العربية', flag: '🇸🇦' },
  { code: 'ja', name: '日本語', flag: '🇯🇵' },
  { code: 'ko', name: '한국어', flag: '🇰🇷' },
  { code: 'pt-BR', name: 'Português (Brasil)', flag: '🇧🇷' },
]

// ============================================================================
// ✅ CRITICAL FIX: Initialize synchronously, not async
// ============================================================================
// The async initializeI18n() function was causing timing issues:
// - React would mount and call useTranslation() before i18n finished loading
// - This caused "namespace was not yet loaded" errors
// 
// Solution: Call .init() directly on the chain. i18next handles async internally
// and will load namespaces as needed. React's useSuspense: false ensures it
// shows translated text as soon as files load, not broken keys.

i18n
  .use(HttpBackend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: {
      'pt-BR': ['pt', 'en'],
      'pt-PT': ['pt', 'en'],
      'zh-CN': ['zh', 'en'],
      'zh-TW': ['zh', 'en'],
      'en-GB': ['en'],
      'en-AU': ['en-GB', 'en'],
      'en-CA': ['en-GB', 'en'],
      // fr-CA (Quebec French): only the genuinely region-specific keys live
      // under public/locales/fr-CA/ — everything else resolves live from
      // 'fr' via this chain. translate_sync.py deliberately does NOT copy
      // fr's content into fr-CA's files (no duplication, always in sync
      // with fr's latest translations).
      'fr-CA': ['fr', 'en'],
      default:  ['en'],
    },
    nonExplicitSupportedLngs: true,
    // NOTE: deliberately NOT setting `lng` here. Per i18next's own docs, an
    // explicit `lng` "overrides language detection" — it would make the
    // LanguageDetector plugin above (order: ['localStorage', 'navigator'])
    // a no-op, so the app always boots in English regardless of a user's
    // saved selection or browser language. That was live here before this
    // fix: every full page reload / new session silently reset a user's
    // chosen language back to English. `fallbackLng.default: ['en']`
    // already covers "nothing detected" — that's the correct place for an
    // English default, not a hardcoded `lng`.
    defaultNS: 'landing',
    ns: ['landing', 'STUDENT', 'TEACHER', 'common', 'curriculum'],
    backend: {
      // CRITICAL FIX: Use /locales path (Vite serves /public at /)
      // NOT ./locales or /public/locales
      loadPath: '/locales/{{lng}}/{{ns}}.json',
      addPath: '/locales/add/{{lng}}/{{ns}}',
      crossDomain: false,
      withCredentials: false,
    },
    interpolation: {
      escapeValue: false, // React handles escaping
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },
    react: {
      useSuspense: false, // Don't use Suspense - show keys if loading fails
      bindI18n: 'languageChanged',
      bindI18nStore: 'added removed',
      transEmptyNodeValue: '',
      transSupportBasicHtmlNodes: true,
      transKeepBasicHtmlNodesFor: ['br', 'strong', 'i', 'p'],
    },
    // Enable debug in development to see what's happening
    debug: process.env.NODE_ENV === 'development',
  })

export default i18n