/**
 * Badge Component - MERGED VERSION
 * Combines existing functionality with new design system tokens
 * 
 * Copyright (c) 2026 Paul Christopher Cerda
 * This source code is licensed under the Business Source License 1.1
 * found in the LICENSE.md file in the root directory of this source tree.
 */

import React from 'react'
import { clsx } from 'clsx'

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info'
  size?: 'sm' | 'md'
  children: React.ReactNode
}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ variant = 'primary', size = 'md', className, children, ...props }, ref) => {
    const baseStyles = clsx(
      'inline-flex items-center font-medium',
      'rounded-[var(--radius-full)]',
      'transition-colors duration-[var(--transition-fast)]'
    )

    // Variant styles using new design system colors
    const variantStyles = {
      primary: clsx(
        'bg-[var(--color-primary-100)]',
        'text-[var(--color-primary-700)]'
      ),
      secondary: clsx(
        'bg-[var(--color-secondary-100)]',
        'text-[var(--color-secondary-700)]'
      ),
      success: clsx(
        'bg-[var(--color-success-100)]',
        'text-[var(--color-success-700)]'
      ),
      warning: clsx(
        'bg-[var(--color-warning-100)]',
        'text-[var(--color-warning-700)]'
      ),
      error: clsx(
        'bg-[var(--color-error-100)]',
        'text-[var(--color-error-700)]'
      ),
      info: clsx(
        'bg-[var(--color-info-100)]',
        'text-[var(--color-info-700)]'
      ),
    }

    const sizeStyles = {
      sm: clsx(
        'px-2 py-0.5',
        'text-xs font-medium'
      ),
      md: clsx(
        'px-3 py-1',
        'text-sm font-medium'
      ),
    }

    return (
      <span
        ref={ref}
        className={clsx(
          baseStyles,
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        {...props}
      >
        {children}
      </span>
    )
  }
)

Badge.displayName = 'Badge'

export default Badge