// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import type { Meta, StoryObj } from '@storybook/react'
import Button from '@components/common/Button'

const meta = {
  title: 'Common/Button',
  component: Button,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['primary', 'secondary', 'success', 'warning', 'error', 'ghost'],
    },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
    },
    isLoading: {
      control: 'boolean',
    },
    disabled: {
      control: 'boolean',
    },
  },
} satisfies Meta<typeof Button>

export default meta
type Story = StoryObj<typeof meta>

export const Primary: Story = {
  args: {
    children: 'Primary Button',
    variant: 'primary',
  },
}

export const Secondary: Story = {
  args: {
    children: 'Secondary Button',
    variant: 'secondary',
  },
}

export const Success: Story = {
  args: {
    children: 'Success Button',
    variant: 'success',
  },
}

export const Warning: Story = {
  args: {
    children: 'Warning Button',
    variant: 'warning',
  },
}

export const Error: Story = {
  args: {
    children: 'Error Button',
    variant: 'error',
  },
}

export const Ghost: Story = {
  args: {
    children: 'Ghost Button',
    variant: 'ghost',
  },
}

export const Small: Story = {
  args: {
    children: 'Small',
    size: 'sm',
    variant: 'primary',
  },
}

export const Large: Story = {
  args: {
    children: 'Large Button',
    size: 'lg',
    variant: 'primary',
  },
}

export const Loading: Story = {
  args: {
    children: 'Loading Button',
    isLoading: true,
    variant: 'primary',
  },
}

export const Disabled: Story = {
  args: {
    children: 'Disabled Button',
    disabled: true,
    variant: 'primary',
  },
}

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <Button variant="primary">Primary</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="success">Success</Button>
      <Button variant="warning">Warning</Button>
      <Button variant="error">Error</Button>
      <Button variant="ghost">Ghost</Button>
    </div>
  ),
}

export const AllSizes: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <Button size="sm" variant="primary">
        Small
      </Button>
      <Button size="md" variant="primary">
        Medium
      </Button>
      <Button size="lg" variant="primary">
        Large
      </Button>
    </div>
  ),
}
