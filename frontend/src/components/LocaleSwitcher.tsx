// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import React from 'react'
import { useTranslation } from 'react-i18next'

interface LocaleSwitcherProps {
  className?: string
  /** Called after the language changes — lets a parent (e.g. a settings page)
   *  mark itself dirty so its Save button activates. */
  onChanged?: (code: string) => void
}

/**
 * Language Switcher — single <select> dropdown.
 * Each option is labelled in the locale's own language (autonym).
 * Codes match the directories under /public/locales/.
 */
const LOCALES = [
  { code: 'en',    label: 'English' },
  { code: 'ar',    label: 'العربية' },
  { code: 'de',    label: 'Deutsch' },
  { code: 'es',    label: 'Español' },
  { code: 'fr',    label: 'Français' },
  { code: 'fr-CA', label: 'Français (Canada)' },
  { code: 'he',    label: 'עברית' },
  { code: 'it',    label: 'Italiano' },
  { code: 'ja',    label: '日本語' },
  { code: 'ko',    label: '한국어' },
  { code: 'pt-BR', label: 'Português (Brasil)' },
  { code: 'tr',    label: 'Türkçe' },
  { code: 'zh',    label: '中文' },
]

export const LocaleSwitcher: React.FC<LocaleSwitcherProps> = ({ className = '', onChanged }) => {
  const { t, i18n } = useTranslation()

  // Prefer exact match, then language-prefix match, then fall back to 'en'
  const activeCode =
    LOCALES.find((l) => l.code === i18n.language)?.code ??
    LOCALES.find((l) => l.code === (i18n.language?.split('-')[0] ?? ''))?.code ??
    'en'

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    i18n.changeLanguage(e.target.value)
    onChanged?.(e.target.value)
  }

  return (
    <select
      value={activeCode}
      onChange={handleChange}
      aria-label={t('components_localeswitcher.aria_label_select_language', 'Select language')}
      className={`rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-800 min-w-[8rem] max-w-[12rem] flex-shrink-0
        focus:outline-none focus:ring-2 focus:ring-green-500
        dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600
        ${className}`}
    >
      {LOCALES.map((locale) => (
        <option key={locale.code} value={locale.code}>
          {locale.label}
        </option>
      ))}
    </select>
  )
}

export default LocaleSwitcher
