// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

// Email validation
export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Password validation
export const isValidPassword = (password: string): boolean => {
  return password.length >= 8;
};

// Password strength calculation
export const getPasswordStrength = (password: string): number => {
  if (!password) return 0;

  let strength = 0;

  // Length check
  if (password.length >= 8) strength++;
  if (password.length >= 12) strength++;

  // Character variety checks
  if (/[a-z]/.test(password)) strength++;
  if (/[A-Z]/.test(password)) strength++;
  if (/[0-9]/.test(password)) strength++;
  if (/[^A-Za-z0-9]/.test(password)) strength++;

  // Return 0-4 scale
  return Math.min(Math.ceil(strength / 1.5), 4);
};

// Phone number validation
export const isValidPhoneNumber = (phone: string): boolean => {
  const phoneRegex = /^[\d\s\-\+\(\)]+$/;
  return phoneRegex.test(phone) && phone.replace(/\D/g, '').length >= 10;
};

// Form errors type
export interface ValidationErrors {
  [key: string]: string | undefined;
}

// Validate email
export const validateEmail = (email: string): string | undefined => {
  if (!email) {
    return 'Email is required';
  }
  if (!isValidEmail(email)) {
    return 'Please enter a valid email address';
  }
  return undefined;
};

// Validate password
export const validatePassword = (password: string): string | undefined => {
  if (!password) {
    return 'Password is required';
  }
  if (!isValidPassword(password)) {
    return 'Password must be at least 8 characters';
  }
  return undefined;
};

// Validate password confirmation
export const validatePasswordConfirmation = (
  password: string,
  confirmPassword: string
): string | undefined => {
  if (!confirmPassword) {
    return 'Please confirm your password';
  }
  if (password !== confirmPassword) {
    return 'Passwords do not match';
  }
  return undefined;
};

// Validate required field
export const validateRequired = (
  value: string,
  fieldName: string
): string | undefined => {
  if (!value || !value.trim()) {
    return `${fieldName} is required`;
  }
  return undefined;
};

// Validate form
export const validateForm = (
  values: Record<string, any>,
  validators: Record<string, (value: any) => string | undefined>
): ValidationErrors => {
  const errors: ValidationErrors = {};

  Object.keys(validators).forEach((key) => {
    const error = validators[key](values[key]);
    if (error) {
      errors[key] = error;
    }
  });

  return errors;
};

// Check if form has errors
export const hasErrors = (errors: ValidationErrors): boolean => {
  return Object.values(errors).some((error) => error !== undefined);
};

