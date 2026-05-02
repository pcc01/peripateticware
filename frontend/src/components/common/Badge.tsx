// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import React from 'react'
import { clsx } from 'clsx'

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info'
  size?: 'sm' | 'md'
  children: React.ReactNode
}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ variant = 'primary', size = 'md', className, children, ...props }, ref) => {
    const baseStyles = 'inline-flex items-center font-medium rounded-full'

    const variantStyles = {
      primary: 'bg-color-primary-light text-color-primary',
      secondary: 'bg-color-bg-tertiary text-color-text-secondary',
      success: 'bg-color-success/10 text-color-success',
      warning: 'bg-color-warning/10 text-color-warning',
      error: 'bg-color-error/10 text-color-error',
      info: 'bg-color-info/10 text-color-info',
    }

    const sizeStyles = {
      sm: 'px-2 py-0.5 text-xs',
      md: 'px-3 py-1 text-sm',
    }

    return (
      <span
        ref={ref}
        className={clsx(baseStyles, variantStyles[variant], sizeStyles[size], className)}
        {...props}
      >
        {children}
      </span>
    )
  }
)

Badge.displayName = 'Badge'

export default Badge
