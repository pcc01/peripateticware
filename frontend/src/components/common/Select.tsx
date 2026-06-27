import { useTranslation } from 'react-i18next';
/**
 * Select Component - MERGED VERSION
 * Combines existing functionality with new design system tokens
 * 
 * Copyright (c) 2026 Paul Christopher Cerda
 * This source code is licensed under the Business Source License 1.1
 * found in the LICENSE.md file in the root directory of this source tree.
 */

import React from 'react';
import { clsx } from 'clsx';

interface SelectOption {
  value: string | number;
  label: string;
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
  options: SelectOption[];
  required?: boolean;
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, hint, options, required, className, id, ...props }, ref) => {
    const { t } = useTranslation('landing');
    const selectId = id || `select-${Math.random().toString(36).substr(2, 9)}`;

    return (
      <div className="flex flex-col gap-2">
        {label &&
        <label
          htmlFor={selectId}
          className={clsx(
            'text-sm font-medium',
            'text-[var(--color-gray-900)]'
          )}>
          
            {label}
            {required &&
          <span className="text-[var(--color-error-500)] ml-1">*</span>
          }
          </label>
        }

        <select
          ref={ref}
          id={selectId}
          aria-required={required || undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${selectId}-error` : hint ? `${selectId}-hint` : undefined}
          className={clsx(
            // Base styles
            'px-4 py-2 border rounded-[var(--radius-lg)]',
            'bg-white text-[var(--color-gray-900)]',
            'border-[var(--color-gray-300)]',
            // Focus styles using new design system
            'focus:outline-2 focus:outline-offset-0',
            'focus:outline-[var(--color-primary-500)]',
            'focus:border-[var(--color-primary-500)]',
            // Disabled styles
            'disabled:bg-[var(--color-gray-100)]',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'disabled:text-[var(--color-gray-500)]',
            // Error styles
            error && clsx(
              'border-[var(--color-error-500)]',
              'focus:outline-[var(--color-error-500)]'
            ),
            // Transition
            'transition-colors duration-[var(--transition-fast)]',
            className
          )}
          {...props}>
          
          <option value="">{t("landing:select", "-- Select --")}</option>
          {options.map((option) =>
          <option key={option.value} value={option.value}>
              {option.label}
            </option>
          )}
        </select>

        {error &&
        <span id={`${selectId}-error`} role="alert" className="text-sm text-[var(--color-error-500)]">
            {error}
          </span>
        }
        {hint && !error &&
        <span id={`${selectId}-hint`} className="text-sm text-[var(--color-gray-500)]">
            {hint}
          </span>
        }
      </div>);

  }
);

Select.displayName = 'Select';

export default Select;