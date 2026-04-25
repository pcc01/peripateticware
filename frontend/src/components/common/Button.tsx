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
    const baseStyles = 'inline-flex items-center justify-center font-medium rounded-lg transition-colors duration-fast focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed'

    const variantStyles = {
      primary: 'bg-color-primary text-white hover:bg-color-primary-dark focus-visible:outline-color-primary',
      secondary: 'bg-color-bg-tertiary text-color-text-primary hover:bg-color-border focus-visible:outline-color-primary',
      success: 'bg-color-success text-white hover:brightness-110 focus-visible:outline-color-success',
      warning: 'bg-color-warning text-white hover:brightness-110 focus-visible:outline-color-warning',
      error: 'bg-color-error text-white hover:brightness-110 focus-visible:outline-color-error',
      ghost: 'bg-transparent text-color-primary hover:bg-color-primary-light focus-visible:outline-color-primary',
    }

    const sizeStyles = {
      sm: 'px-3 py-1 text-sm min-h-9 min-w-9',
      md: 'px-4 py-2 text-base min-h-10 min-w-10',
      lg: 'px-6 py-3 text-lg min-h-12 min-w-12',
    }

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={clsx(baseStyles, variantStyles[variant], sizeStyles[size], className)}
        {...props}
      >
        {isLoading && <span className="mr-2 animate-spin">⟳</span>}
        {children}
      </button>
    )
  }
)

Button.displayName = 'Button'

export default Button
