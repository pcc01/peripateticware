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
          'bg-color-bg-primary border border-color-border rounded-lg shadow-md overflow-hidden',
          className
        )}
        {...props}
      >
        {(title || subtitle) && (
          <div className="px-6 py-4 border-b border-color-border">
            {title && <h2 className="text-xl font-semibold">{title}</h2>}
            {subtitle && <p className="text-sm text-color-text-secondary mt-1">{subtitle}</p>}
          </div>
        )}

        <div className={clsx(!noPadding && 'px-6 py-4')}>{children}</div>

        {footer && (
          <div className="px-6 py-4 border-t border-color-border bg-color-bg-secondary">
            {footer}
          </div>
        )}
      </div>
    )
  }
)

Card.displayName = 'Card'

export default Card
