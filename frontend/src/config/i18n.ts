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
    fallbackLng: 'en',
    lng: 'en',
    defaultNS: 'landing',
    ns: ['landing'],
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