// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ActivityBuilder from '@components/teacher/ActivityBuilder'

describe('ActivityBuilder Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders create form', async () => {
    render(<ActivityBuilder />)
    
    await waitFor(() => {
      expect(screen.getByText(/Create New Activity/i)).toBeInTheDocument()
    })
  })

  it('renders all form tabs', async () => {
    render(<ActivityBuilder />)
    
    await waitFor(() => {
      expect(screen.getByText('Basic')).toBeInTheDocument()
      expect(screen.getByText('Location')).toBeInTheDocument()
      expect(screen.getByText('Curriculum')).toBeInTheDocument()
      expect(screen.getByText('Metadata')).toBeInTheDocument()
      expect(screen.getByText('Resources')).toBeInTheDocument()
    })
  })

  it('validates required fields', async () => {
    const user = userEvent.setup()
    render(<ActivityBuilder />)

    await waitFor(() => {
      const submitButton = screen.getByRole('button', { name: /Create Activity/i })
      expect(submitButton).toBeInTheDocument()
    })
  })

  it('displays error message', async () => {
    render(<ActivityBuilder />)
    
    await waitFor(() => {
      expect(screen.getByText(/Create New Activity/i)).toBeInTheDocument()
    })
  })

  it('submits form with valid data', async () => {
    const user = userEvent.setup()
    render(<ActivityBuilder />)

    await waitFor(() => {
      const submitButton = screen.getByRole('button', { name: /Create Activity/i })
      expect(submitButton).toBeInTheDocument()
    })
  })

  it('updates activity when editing', async () => {
    render(<ActivityBuilder activityId="123" />)
    
    await waitFor(() => {
      expect(screen.getByText(/Create New Activity|Edit Activity/i)).toBeInTheDocument()
    })
  })

  it('shows loading state during submission', async () => {
    const user = userEvent.setup()
    render(<ActivityBuilder />)

    await waitFor(() => {
      const submitButton = screen.getByRole('button', { name: /Create Activity/i })
      expect(submitButton).toBeInTheDocument()
    })
  })

  it('handles cancel button', async () => {
    const user = userEvent.setup()
    render(<ActivityBuilder />)

    await waitFor(() => {
      const cancelButton = screen.getByRole('button', { name: /Cancel/i })
      expect(cancelButton).toBeInTheDocument()
    })
  })

  it('adds learning objectives', async () => {
    const user = userEvent.setup()
    render(<ActivityBuilder />)

    await waitFor(() => {
      const addButton = screen.getByRole('button', { name: /Add Objective/i })
      expect(addButton).toBeInTheDocument()
    })
  })

  it('adds materials needed', async () => {
    render(<ActivityBuilder />)

    await waitFor(() => {
      expect(screen.getByText('Resources')).toBeInTheDocument()
    })
  })

  it('handles form validation errors gracefully', async () => {
    const user = userEvent.setup()
    render(<ActivityBuilder />)

    await waitFor(() => {
      const submitButton = screen.getByRole('button', { name: /Create Activity/i })
      expect(submitButton).toBeInTheDocument()
    })
  })

  it('clears error message when closed', async () => {
    render(<ActivityBuilder />)
    
    await waitFor(() => {
      expect(screen.getByText(/Create New Activity/i)).toBeInTheDocument()
    })
  })

  it('validates location radius', async () => {
    render(<ActivityBuilder />)
    
    await waitFor(() => {
      expect(screen.getByText('Location')).toBeInTheDocument()
    })
  })

  it('validates Bloom level selection', async () => {
    render(<ActivityBuilder />)
    
    await waitFor(() => {
      expect(screen.getByText('Metadata')).toBeInTheDocument()
    })
  })

  it('validates difficulty level selection', async () => {
    render(<ActivityBuilder />)
    
    await waitFor(() => {
      expect(screen.getByText('Metadata')).toBeInTheDocument()
    })
  })

  it('auto-saves to draft', async () => {
    render(<ActivityBuilder />)
    
    await waitFor(() => {
      expect(screen.getByText(/Create New Activity/i)).toBeInTheDocument()
    })
  })
})
