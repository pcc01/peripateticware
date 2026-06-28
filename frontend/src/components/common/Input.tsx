/**
 * Input Component - MERGED VERSION
 * Combines existing functionality with new design system tokens
 * 
 * Copyright (c) 2026 Paul Christopher Cerda
 * This source code is licensed under the Business Source License 1.1
 * found in the LICENSE.md file in the root directory of this source tree.
 */

import React from 'react'
import { clsx } from 'clsx'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
  required?: boolean
  multiline?: boolean
  rows?: number
}

const sharedClasses = (error: string | undefined, className: string | undefined) =>
  clsx(
    'px-4 py-2 border rounded-lg',
    'bg-white text-[var(--color-gray-900)]',
    'border-[var(--color-gray-300)]',
    'focus:outline-2 focus:outline-offset-0',
    'focus:outline-[var(--color-primary-500)]',
    'focus:border-[var(--color-primary-500)]',
    'disabled:bg-[var(--color-gray-100)]',
    'disabled:cursor-not-allowed disabled:opacity-50',
    'disabled:text-[var(--color-gray-500)]',
    error && clsx('border-[var(--color-error-500)]', 'focus:outline-[var(--color-error-500)]'),
    'placeholder:text-[var(--color-gray-400)]',
    'transition-colors duration-[var(--transition-fast)]',
    className
  )

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, required, multiline, rows, className, id, ...props }, ref) => {
    const inputId = id || `input-${Math.random().toString(36).substr(2, 9)}`

    return (
      <div className="flex flex-col gap-2">
        {label && (
          <label
            htmlFor={inputId}
            className={clsx(
              'text-sm font-medium',
              'text-[var(--color-gray-900)]'
            )}
          >
            {label}
            {required && (
              <span className="text-[var(--color-error-500)] ml-1">*</span>
            )}
          </label>
        )}

        {multiline ? (
          <textarea
            id={inputId}
            rows={rows ?? 3}
            aria-required={required || undefined}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
            className={clsx(sharedClasses(error, className), 'resize-y')}
            value={props.value as string | undefined}
            onChange={props.onChange as unknown as React.ChangeEventHandler<HTMLTextAreaElement> | undefined}
            placeholder={props.placeholder}
            disabled={props.disabled}
            name={props.name}
          />
        ) : (
          <input
            ref={ref}
            id={inputId}
            aria-required={required || undefined}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
            className={sharedClasses(error, className)}
            {...props}
          />
        )}

        {error && (
          <span id={`${inputId}-error`} role="alert" className="text-sm text-[var(--color-error-500)]">
            {error}
          </span>
        )}
        {hint && !error && (
          <span id={`${inputId}-hint`} className="text-sm text-[var(--color-gray-500)]">
            {hint}
          </span>
        )}
      </div>
    )
  }
)

Input.displayName = 'Input'

export default Input
