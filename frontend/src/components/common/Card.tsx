/**
 * Card Component - MERGED VERSION
 * Combines existing functionality with new design system tokens
 * 
 * Copyright (c) 2026 Paul Christopher Cerda
 * This source code is licensed under the Business Source License 1.1
 * found in the LICENSE.md file in the root directory of this source tree.
 */

import React from 'react'
import { clsx } from 'clsx'

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string
  subtitle?: string
  footer?: React.ReactNode
  noPadding?: boolean
  children: React.ReactNode
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ title, subtitle, footer, noPadding, className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={clsx(
          'bg-white border rounded-[var(--radius-lg)]',
          'border-[var(--color-gray-200)]',
          'shadow-[var(--shadow-base)]',
          'overflow-hidden',
          'transition-shadow duration-[var(--transition-fast)]',
          'hover:shadow-[var(--shadow-md)]',
          className
        )}
        {...props}
      >
        {(title || subtitle) && (
          <div className={clsx(
            'px-[var(--spacing-6)] py-[var(--spacing-4)]',
            'border-b border-[var(--color-gray-200)]',
            'bg-white'
          )}>
            {title && (
              <h2 className={clsx(
                'text-lg font-semibold',
                'text-[var(--color-gray-900)]'
              )}>
                {title}
              </h2>
            )}
            {subtitle && (
              <p className={clsx(
                'text-sm mt-1',
                'text-[var(--color-gray-600)]'
              )}>
                {subtitle}
              </p>
            )}
          </div>
        )}

        <div className={clsx(
          !noPadding && 'px-[var(--spacing-6)] py-[var(--spacing-4)]'
        )}>
          {children}
        </div>

        {footer && (
          <div className={clsx(
            'px-[var(--spacing-6)] py-[var(--spacing-4)]',
            'border-t border-[var(--color-gray-200)]',
            'bg-[var(--color-gray-50)]'
          )}>
            {footer}
          </div>
        )}
      </div>
    )
  }
)

Card.displayName = 'Card'

export default Card