// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import React from 'react'
import { clsx } from 'clsx'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
  required?: boolean
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, required, className, id, ...props }, ref) => {
    const inputId = id || `input-${Math.random().toString(36).substr(2, 9)}`

    return (
      <div className="flex flex-col gap-2">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-color-text-primary">
            {label}
            {required && <span className="text-color-error ml-1">*</span>}
          </label>
        )}

        <input
          ref={ref}
          id={inputId}
          className={clsx(
            'px-4 py-2 border border-color-border rounded-lg bg-color-bg-primary text-color-text-primary',
            'focus:outline-2 focus:outline-offset-0 focus:outline-color-primary',
            'disabled:bg-color-bg-secondary disabled:cursor-not-allowed disabled:opacity-50',
            error && 'border-color-error focus:outline-color-error',
            className
          )}
          {...props}
        />

        {error && <span className="text-sm text-color-error">{error}</span>}
        {hint && <span className="text-sm text-color-text-secondary">{hint}</span>}
      </div>
    )
  }
)

Input.displayName = 'Input'

export default Input
