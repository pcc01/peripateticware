/**
 * Button Component - MERGED VERSION
 * Combines existing functionality with new design system tokens
 * 
 * Copyright (c) 2026 Paul Christopher Cerda
 * This source code is licensed under the Business Source License 1.1
 * found in the LICENSE.md file in the root directory of this source tree.
 */

import React from 'react'
import { clsx } from 'clsx'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  isLoading?: boolean
  disabled?: boolean
  children: React.ReactNode
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', isLoading, disabled, className, children, ...props }, ref) => {
    // Base styles using new design system transitions
    const baseStyles = clsx(
      'inline-flex items-center justify-center font-medium rounded-lg',
      'transition-colors duration-[var(--transition-fast)]',
      'focus-visible:outline-2 focus-visible:outline-offset-2',
      'disabled:opacity-50 disabled:cursor-not-allowed'
    )

    // Variant styles using new design system color tokens
    const variantStyles = {
      primary: clsx(
        'bg-[var(--color-primary-500)] text-white',
        'hover:bg-[var(--color-primary-600)]',
        'focus-visible:outline-[var(--color-primary-500)]',
        'active:bg-[var(--color-primary-700)]'
      ),
      secondary: clsx(
        'bg-[var(--color-secondary-500)] text-white',
        'hover:bg-[var(--color-secondary-600)]',
        'focus-visible:outline-[var(--color-secondary-500)]',
        'active:bg-[var(--color-secondary-700)]'
      ),
      success: clsx(
        'bg-[var(--color-success-500)] text-white',
        'hover:brightness-110',
        'focus-visible:outline-[var(--color-success-500)]'
      ),
      warning: clsx(
        'bg-[var(--color-warning-500)] text-white',
        'hover:brightness-110',
        'focus-visible:outline-[var(--color-warning-500)]'
      ),
      error: clsx(
        'bg-[var(--color-error-500)] text-white',
        'hover:brightness-110',
        'focus-visible:outline-[var(--color-error-500)]'
      ),
      ghost: clsx(
        'bg-transparent text-[var(--color-primary-500)]',
        'hover:bg-[var(--color-primary-50)]',
        'focus-visible:outline-[var(--color-primary-500)]',
        'active:bg-[var(--color-primary-100)]'
      ),
    }

    // Size styles using new design system spacing
    const sizeStyles = {
      sm: clsx(
        'px-3 py-1 text-sm',
        'min-h-[var(--spacing-9)] min-w-[var(--spacing-9)]'
      ),
      md: clsx(
        'px-4 py-2 text-base',
        'min-h-[var(--spacing-10)] min-w-[var(--spacing-10)]'
      ),
      lg: clsx(
        'px-6 py-3 text-lg',
        'min-h-[var(--spacing-12)] min-w-[var(--spacing-12)]'
      ),
    }

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={clsx(
          baseStyles,
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        {...props}
      >
        {isLoading && (
          <span className="mr-2 animate-spin">⟳</span>
        )}
        {children}
      </button>
    )
  }
)

Button.displayName = 'Button'

export default Button