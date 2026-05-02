// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import {
  isValidEmail,
  isValidPassword,
  getPasswordStrength,
  isValidPhoneNumber,
  validateForm,
  hasErrors,
} from '../../utils/validation';

describe('Validation Utils', () => {
  describe('isValidEmail', () => {
    it('should validate correct email addresses', () => {
      expect(isValidEmail('user@example.com')).toBe(true);
      expect(isValidEmail('test.user@example.co.uk')).toBe(true);
      expect(isValidEmail('user+tag@example.com')).toBe(true);
    });

    it('should reject invalid email addresses', () => {
      expect(isValidEmail('invalid-email')).toBe(false);
      expect(isValidEmail('user@')).toBe(false);
      expect(isValidEmail('@example.com')).toBe(false);
      expect(isValidEmail('')).toBe(false);
    });
  });

  describe('isValidPassword', () => {
    it('should validate strong passwords', () => {
      expect(isValidPassword('SecurePassword123!')).toBe(true);
      expect(isValidPassword('MyP@ssw0rd')).toBe(true);
    });

    it('should reject weak passwords', () => {
      expect(isValidPassword('abc')).toBe(false);
      expect(isValidPassword('password')).toBe(false);
      expect(isValidPassword('123456')).toBe(false);
      expect(isValidPassword('')).toBe(false);
    });
  });

  describe('getPasswordStrength', () => {
    it('should rate password strength correctly', () => {
      expect(getPasswordStrength('weak')).toBe(0);
      expect(getPasswordStrength('Medium1')).toBeGreaterThan(0);
      expect(getPasswordStrength('SecureP@ss123')).toBe(4);
    });
  });

  describe('isValidPhoneNumber', () => {
    it('should validate phone numbers', () => {
      expect(isValidPhoneNumber('+1234567890')).toBe(true);
      expect(isValidPhoneNumber('(123) 456-7890')).toBe(true);
      expect(isValidPhoneNumber('123-456-7890')).toBe(true);
    });

    it('should reject invalid phone numbers', () => {
      expect(isValidPhoneNumber('123')).toBe(false);
      expect(isValidPhoneNumber('abc')).toBe(false);
      expect(isValidPhoneNumber('')).toBe(false);
    });
  });

  describe('validateForm', () => {
    it('should validate a form with required fields', () => {
      const errors = validateForm(
        { name: '', email: 'test@example.com' },
        { name: (v) => !v ? 'Name required' : null }
      );

      expect(hasErrors(errors)).toBe(true);
      expect(errors.name).toBe('Name required');
    });

    it('should return empty errors for valid form', () => {
      const errors = validateForm(
        { name: 'John', email: 'john@example.com' },
        {
          name: (v) => !v ? 'Name required' : null,
          email: (v) => !isValidEmail(v) ? 'Invalid email' : null,
        }
      );

      expect(hasErrors(errors)).toBe(false);
    });
  });
});

