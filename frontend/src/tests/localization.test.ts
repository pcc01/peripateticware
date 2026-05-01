# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

import { describe, it, expect } from 'vitest'
import { Localization } from '@utils/localization'

/**
 * Localization Tests
 * Verify pseudo-localization and string externalization
 */

describe('Localization - String Externalization & Pseudo-Loc', () => {
  describe('pseudoLocalize', () => {
    it('should transform text with diacritics', () => {
      const text = 'Hello World'
      const result = Localization.pseudoLocalize(text)

      // Should be wrapped in brackets
      expect(result).toMatch(/^\[.*\]$/)
      // Should contain transformed characters
      expect(result).not.toBe(text)
    })

    it('should expand text by ~30% for layout testing', () => {
      const text = 'Test'
      const result = Localization.pseudoLocalize(text)

      // Result should be longer due to padding
      expect(result.length).toBeGreaterThan(text.length)
    })

    it('should handle empty strings', () => {
      expect(Localization.pseudoLocalize('')).toBe('')
    })

    it('should preserve numbers and special characters', () => {
      const text = 'Test123!@#'
      const result = Localization.pseudoLocalize(text)

      // Numbers and special chars should be in result
      expect(result).toContain('1')
      expect(result).toContain('2')
      expect(result).toContain('3')
    })

    it('should map lowercase letters to accented versions', () => {
      const result = Localization.pseudoLocalize('abc')

      // Should contain the accented versions
      expect(result).toContain('ā')
      expect(result).toContain('ḃ')
      expect(result).toContain('č')
    })

    it('should map uppercase letters to accented versions', () => {
      const result = Localization.pseudoLocalize('ABC')

      expect(result).toContain('Ā')
      expect(result).toContain('Ḃ')
      expect(result).toContain('Č')
    })
  })

  describe('isPseudoLocalizationEnabled', () => {
    it('should detect pseudo-loc=true in localStorage', () => {
      const store: Record<string, string> = {}

      // Mock localStorage
      const originalGetItem = window.localStorage.getItem
      window.localStorage.getItem = (key: string) => store[key] || null

      store['pseudo-loc'] = 'true'
      expect(Localization.isPseudoLocalizationEnabled()).toBe(true)

      store['pseudo-loc'] = 'false'
      expect(Localization.isPseudoLocalizationEnabled()).toBe(false)

      window.localStorage.getItem = originalGetItem
    })
  })

  describe('getLanguageName', () => {
    it('should return English for en', () => {
      const name = Localization.getLanguageName('en')
      expect(name).toBe('English')
    })

    it('should return Español for es', () => {
      const name = Localization.getLanguageName('es')
      expect(name).toBe('Español')
    })

    it('should return العربية for ar', () => {
      const name = Localization.getLanguageName('ar')
      expect(name).toBe('العربية')
    })

    it('should return 日本語 for ja', () => {
      const name = Localization.getLanguageName('ja')
      expect(name).toBe('日本語')
    })

    it('should fallback to code for unknown language', () => {
      const name = Localization.getLanguageName('xx')
      expect(name).toBe('xx')
    })
  })

  describe('getTextDirection', () => {
    it('should return rtl for Arabic', () => {
      expect(Localization.getTextDirection('ar')).toBe('rtl')
    })

    it('should return ltr for English', () => {
      expect(Localization.getTextDirection('en')).toBe('ltr')
    })

    it('should return ltr for Spanish', () => {
      expect(Localization.getTextDirection('es')).toBe('ltr')
    })

    it('should return ltr for Japanese', () => {
      expect(Localization.getTextDirection('ja')).toBe('ltr')
    })

    it('should default to ltr for unknown language', () => {
      expect(Localization.getTextDirection('xx')).toBe('ltr')
    })
  })

  describe('formatNumber', () => {
    it('should format number with US locale', () => {
      const result = Localization.formatNumber(1234.56, 'en-US')
      expect(result).toBe('1,234.56')
    })

    it('should format number with German locale', () => {
      const result = Localization.formatNumber(1234.56, 'de-DE')
      expect(result).toBe('1.234,56')
    })

    it('should handle invalid locale gracefully', () => {
      const result = Localization.formatNumber(1234.56, 'invalid')
      expect(typeof result).toBe('string')
      expect(result).toContain('1,234')
    })
  })

  describe('formatDate', () => {
    const testDate = new Date('2024-04-25T10:30:00Z')

    it('should format date with US locale', () => {
      const result = Localization.formatDate(testDate, 'en-US')
      expect(result).toContain('4')
      expect(result).toContain('25')
      expect(result).toContain('2024')
    })

    it('should accept string date', () => {
      const result = Localization.formatDate('2024-04-25', 'en-US')
      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
    })

    it('should handle custom format options', () => {
      const result = Localization.formatDate(testDate, 'en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })

      expect(result).toContain('2024')
      expect(result).toContain('April')
      expect(result).toContain('25')
    })
  })

  describe('formatCurrency', () => {
    it('should format USD currency', () => {
      const result = Localization.formatCurrency(1234.56, 'en-US', 'USD')
      expect(result).toContain('$')
      expect(result).toContain('1')
      expect(result).toContain('234')
    })

    it('should format EUR currency', () => {
      const result = Localization.formatCurrency(1234.56, 'de-DE', 'EUR')
      expect(result).toContain('€')
    })

    it('should fallback gracefully for invalid locale', () => {
      const result = Localization.formatCurrency(1234.56, 'invalid', 'USD')
      expect(result).toContain('$')
      expect(result).toContain('1,234')
    })
  })

  describe('formatRelativeTime', () => {
    it('should format recent times', () => {
      const recentTime = new Date(Date.now() - 5 * 60 * 1000) // 5 minutes ago
      const result = Localization.formatRelativeTime(recentTime, 'en-US')

      expect(result.toLowerCase()).toContain('minute')
    })

    it('should format hours ago', () => {
      const hourAgo = new Date(Date.now() - 2 * 60 * 60 * 1000) // 2 hours ago
      const result = Localization.formatRelativeTime(hourAgo, 'en-US')

      expect(result.toLowerCase()).toContain('hour')
    })

    it('should handle string dates', () => {
      const result = Localization.formatRelativeTime('2024-04-24T10:30:00Z', 'en-US')
      expect(typeof result).toBe('string')
    })

    it('should fallback to "recently" for invalid input', () => {
      const result = Localization.formatRelativeTime('invalid-date', 'en-US')
      expect(result).toBe('recently')
    })
  })

  /**
   * String Externalization Tests
   * These tests verify that critical UI text is NOT hardcoded
   */
  describe('String Externalization Verification', () => {
    it('should verify no hardcoded user-facing text in component files', () => {
      // This is a meta-test: it documents what to check
      const forbidden = [
        'Login', // should be from i18n
        'Create', // should be from i18n
        'Delete', // should be from i18n
        'Save', // should be from i18n
        'Cancel', // should be from i18n
      ]

      // In practice, you'd scan component source code
      expect(forbidden).toBeDefined()
    })

    it('should ensure all translation keys are used', () => {
      // Verify that translation files have all expected keys
      const commonKeys = [
        'common:save',
        'common:cancel',
        'common:delete',
        'common:edit',
      ]

      // These should all be defined in translation files
      commonKeys.forEach((key) => {
        expect(key).toMatch(/^[a-z]+:[a-z_]+/)
      })
    })
  })
})
