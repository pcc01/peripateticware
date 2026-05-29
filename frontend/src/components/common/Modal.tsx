/**
 * Modal Component - MERGED VERSION
 * Combines existing functionality with new design system tokens
 * 
 * Copyright (c) 2026 Paul Christopher Cerda
 * This source code is licensed under the Business Source License 1.1
 * found in the LICENSE.md file in the root directory of this source tree.
 */

import React, { useEffect } from 'react'
import { clsx } from 'clsx'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  footer?: React.ReactNode
  size?: 'sm' | 'md' | 'lg'
  closeOnBackdropClick?: boolean
}

const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  closeOnBackdropClick = true,
}) => {
  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
      document.body.style.overflow = 'hidden'
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = 'unset'
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  const sizeStyles = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
  }

  return (
    <div className={clsx(
      'fixed inset-0 z-[var(--z-modal)] bg-black/50',
      'flex items-center justify-center p-4',
      'transition-opacity duration-[var(--transition-fast)]'
    )}>
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        onClick={() => closeOnBackdropClick && onClose()}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        className={clsx(
          'relative z-[var(--z-modal)]',
          'bg-white rounded-[var(--radius-xl)]',
          'shadow-[var(--shadow-xl)] w-full',
          'border border-[var(--color-gray-200)]',
          sizeStyles[size],
          'max-h-[90vh] overflow-y-auto'
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'modal-title' : undefined}
      >
        {/* Header */}
        {title && (
          <div className={clsx(
            'flex items-center justify-between',
            'px-6 py-4',
            'border-b border-[var(--color-gray-200)]'
          )}>
            <h2 
              id="modal-title" 
              className="text-lg font-semibold text-[var(--color-gray-900)]"
            >
              {title}
            </h2>
            <button
              onClick={onClose}
              className={clsx(
                'p-2 rounded-lg',
                'hover:bg-[var(--color-gray-100)]',
                'transition-colors duration-[var(--transition-fast)]',
                'text-[var(--color-gray-500)]',
                'hover:text-[var(--color-gray-700)]'
              )}
              aria-label="Close modal"
            >
              ✕
            </button>
          </div>
        )}

        {/* Content */}
        <div className="px-6 py-4">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className={clsx(
            'px-6 py-4',
            'border-t border-[var(--color-gray-200)]',
            'bg-[var(--color-gray-50)]',
            'flex justify-end gap-3'
          )}>
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

Modal.displayName = 'Modal'

export default Modal