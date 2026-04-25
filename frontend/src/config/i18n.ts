import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

// Import all translation files
import en_common from '@locales/en/common.json'
import en_teacher from '@locales/en/teacher.json'
import en_student from '@locales/en/student.json'
import en_curriculum from '@locales/en/curriculum.json'

import es_common from '@locales/es/common.json'
import es_teacher from '@locales/es/teacher.json'
import es_student from '@locales/es/student.json'
import es_curriculum from '@locales/es/curriculum.json'

import ar_common from '@locales/ar/common.json'
import ja_common from '@locales/ar/common.json' // TODO: Replace with actual Japanese

// Define supported languages and their properties
export const SUPPORTED_LANGUAGES = {
  en: { 
    name: 'English', 
    nativeName: 'English',
    dir: 'ltr' as const,
    flag: '🇺🇸'
  },
  es: { 
    name: 'Spanish', 
    nativeName: 'Español',
    dir: 'ltr' as const,
    flag: '🇪🇸'
  },
  ar: { 
    name: 'Arabic', 
    nativeName: 'العربية',
    dir: 'rtl' as const,
    flag: '🇸🇦'
  },
  ja: { 
    name: 'Japanese', 
    nativeName: '日本語',
    dir: 'ltr' as const,
    flag: '🇯🇵'
  },
}

// Translation resources
const resources = {
  en: {
    common: en_common,
    teacher: en_teacher,
    student: en_student,
    curriculum: en_curriculum,
  },
  es: {
    common: es_common,
    teacher: es_teacher,
    student: es_student,
    curriculum: es_curriculum,
  },
  ar: {
    common: ar_common,
    // TODO: Add Arabic teacher, student, curriculum
  },
  ja: {
    common: ja_common,
    // TODO: Add Japanese teacher, student, curriculum
  },
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    defaultNS: 'common',
    ns: ['common', 'teacher', 'student', 'curriculum'],
    interpolation: {
      escapeValue: false, // React already prevents XSS
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },
  })

// Set document direction based on language
i18n.on('languageChanged', (lng) => {
  const dir = SUPPORTED_LANGUAGES[lng as keyof typeof SUPPORTED_LANGUAGES]?.dir || 'ltr'
  document.documentElement.dir = dir
  document.documentElement.lang = lng
})

export default i18n
