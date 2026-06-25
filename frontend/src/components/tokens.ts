// Design tokens — intentionally minimal stub.
// Real values are in design-system.css via CSS custom properties.
export const tokens = {
  color: {
    primary:    'var(--primary)',
    surface:    'var(--surface)',
    text:       'var(--text)',
    border:     'var(--border)',
  },
  spacing: {
    xs: '4px',
    sm: '8px',
    md: '16px',
    lg: '24px',
    xl: '32px',
  },
  radius: {
    sm: '4px',
    md: '8px',
    lg: '16px',
  },
} as const
