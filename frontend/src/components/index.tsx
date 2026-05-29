/**
 * Peripateticware — Component Library
 * Reusable UI components styled with design tokens
 */

import React from 'react';
import type { Tokens } from './tokens';

interface ComponentProps {
  d: Tokens;
  [key: string]: any;
}

// ─────────────────────────────────────────────────────────────────
// BUTTON
// ─────────────────────────────────────────────────────────────────

export const Button: React.FC<
  ComponentProps & {
    variant?: 'primary' | 'secondary' | 'ghost';
    size?: 'sm' | 'md' | 'lg';
    onClick?: () => void;
    children: React.ReactNode;
  }
> = ({ d, variant = 'primary', size = 'md', onClick, children, ...rest }) => {
  const baseStyles = {
    fontFamily: d.fontBody,
    fontWeight: d.fontMedium,
    border: 'none',
    cursor: 'pointer',
    borderRadius: d.radius,
    transition: `all ${d.durFast} ${d.easeOut}`,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: d.space2,
    ...rest.style,
  };

  const sizeStyles =
    size === 'sm'
      ? { fontSize: d.textSm, padding: `${d.space2} ${d.space4}` }
      : size === 'lg'
        ? { fontSize: d.textMd, padding: `${d.space4} ${d.space6}` }
        : { fontSize: d.textBase, padding: `${d.space3} ${d.space5}` };

  const variantStyles =
    variant === 'primary'
      ? {
          background: d.accent,
          color: d.accentText,
          boxShadow: d.shadow,
          ':hover': { opacity: 0.9 },
        }
      : variant === 'secondary'
        ? {
            background: d.surface,
            color: d.text,
            border: `1px solid ${d.border}`,
            ':hover': { background: d.surfaceAlt },
          }
        : {
            background: 'transparent',
            color: d.accent,
            ':hover': { background: d.accentLight },
          };

  return (
    <button
      onClick={onClick}
      style={{ ...baseStyles, ...sizeStyles, ...variantStyles }}
      {...rest}
    >
      {children}
    </button>
  );
};

// ─────────────────────────────────────────────────────────────────
// CARD
// ─────────────────────────────────────────────────────────────────

export const Card: React.FC<
  ComponentProps & {
    children: React.ReactNode;
    onClick?: () => void;
  }
> = ({ d, children, onClick, ...rest }) => (
  <div
    onClick={onClick}
    style={{
      background: d.surface,
      border: `1px solid ${d.border}`,
      borderRadius: d.radiusLg,
      boxShadow: d.shadow,
      padding: d.space6,
      ...rest.style,
    }}
    {...rest}
  >
    {children}
  </div>
);

// ─────────────────────────────────────────────────────────────────
// STAT TILE
// ─────────────────────────────────────────────────────────────────

export const StatTile: React.FC<
  ComponentProps & {
    label: string;
    value: string | number;
    sub?: string;
    trend?: 'up' | 'down' | null;
  }
> = ({ d, label, value, sub, trend }) => (
  <Card d={d}>
    <div style={{ display: 'flex', flexDirection: 'column', gap: d.space1 }}>
      <div
        style={{
          fontFamily: d.fontBody,
          fontSize: d.textXs,
          fontWeight: 600,
          color: d.textMuted,
          textTransform: 'uppercase',
          letterSpacing: d.letterSpacing.caps,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: d.fontHead,
          fontSize: '26px',
          fontWeight: 700,
          color: d.text,
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      {sub && (
        <div
          style={{
            fontSize: d.textXs,
            color: d.textMuted,
            display: 'flex',
            alignItems: 'center',
            gap: d.space1,
          }}
        >
          {trend === 'up' && <span style={{ color: d.success, fontWeight: 600 }}>↑</span>}
          {trend === 'down' && <span style={{ color: d.danger, fontWeight: 600 }}>↓</span>}
          {sub}
        </div>
      )}
    </div>
  </Card>
);

// ─────────────────────────────────────────────────────────────────
// AVATAR
// ─────────────────────────────────────────────────────────────────

export const Avatar: React.FC<
  ComponentProps & {
    initials: string;
    size?: 'sm' | 'md' | 'lg' | 'xl';
    variant?: 'default' | 'success' | 'warn' | 'danger';
  }
> = ({ d, initials, size = 'md', variant = 'default', ...rest }) => {
  const sizeMap = { sm: 26, md: 32, lg: 48, xl: 88 };
  const dim = sizeMap[size];

  const bgColor =
    variant === 'success'
      ? d.success
      : variant === 'warn'
        ? d.warn
        : variant === 'danger'
          ? d.danger
          : d.accent;

  return (
    <div
      style={{
        width: dim,
        height: dim,
        borderRadius: '50%',
        background: bgColor,
        color: d.accentText,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 600,
        fontSize: Math.ceil(dim / 2.8),
        ...rest.style,
      }}
      {...rest}
    >
      {initials.toUpperCase()}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────
// PROGRESS BAR
// ─────────────────────────────────────────────────────────────────

export const ProgressBar: React.FC<
  ComponentProps & {
    value: number;
    max?: number;
    size?: 'sm' | 'md' | 'lg';
    label?: string;
  }
> = ({ d, value, max = 100, size = 'md', label, ...rest }) => {
  const heightMap = { sm: 4, md: 6, lg: 10 };
  const h = heightMap[size];
  const percent = Math.min(100, (value / max) * 100);

  return (
    <div style={{ ...rest.style }}>
      {label && (
        <div
          style={{
            fontSize: d.textSm,
            fontWeight: 500,
            color: d.text,
            marginBottom: d.space2,
          }}
        >
          {label}
        </div>
      )}
      <div
        style={{
          height: h,
          borderRadius: h / 2,
          background: d.surfaceAlt,
          border: `1px solid ${d.border}`,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            background: d.accent,
            borderRadius: 'inherit',
            width: `${percent}%`,
            transition: `width ${d.durSlow} ${d.easeOut}`,
          }}
        />
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────
// BADGE
// ─────────────────────────────────────────────────────────────────

export const Badge: React.FC<
  ComponentProps & {
    variant?: 'default' | 'success' | 'warn' | 'danger' | 'info';
    children: React.ReactNode;
  }
> = ({ d, variant = 'default', children, ...rest }) => {
  const variantMap = {
    default: { bg: d.accentLight, text: d.accent },
    success: { bg: d.successLight, text: d.success },
    warn: { bg: d.warnLight, text: d.warn },
    danger: { bg: d.dangerLight, text: d.danger },
    info: { bg: d.infoLight, text: d.info },
  };

  const colors = variantMap[variant];

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: d.space2,
        padding: `${d.space1} ${d.space3}`,
        background: colors.bg,
        color: colors.text,
        borderRadius: d.radiusPill,
        fontSize: d.textSm,
        fontWeight: 600,
        ...rest.style,
      }}
      {...rest}
    >
      {children}
    </span>
  );
};

// ─────────────────────────────────────────────────────────────────
// SIDEBAR LAYOUT
// ─────────────────────────────────────────────────────────────────

export const SidebarLayout: React.FC<
  ComponentProps & {
    brand: React.ReactNode;
    nav: React.ReactNode;
    footer?: React.ReactNode;
    children: React.ReactNode;
  }
> = ({ d, brand, nav, footer, children }) => (
  <div style={{ display: 'flex', height: '100vh', background: d.bg }}>
    <div
      style={{
        width: '220px',
        flexShrink: 0,
        background: d.sidebar,
        borderRight: `1px solid ${d.border}`,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}
    >
      <div style={{ padding: '18px 18px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
        {brand}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: `${d.space3} 10px` }}>{nav}</div>
      {footer && (
        <div
          style={{
            padding: `${d.space3} 14px`,
            borderTop: `1px solid ${d.border}`,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          {footer}
        </div>
      )}
    </div>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {children}
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────────
// SIDEBAR ITEM
// ─────────────────────────────────────────────────────────────────

export const SidebarItem: React.FC<
  ComponentProps & {
    icon?: React.ReactNode;
    label: string;
    active?: boolean;
    onClick?: () => void;
  }
> = ({ d, icon, label, active = false, onClick, ...rest }) => (
  <button
    onClick={onClick}
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: `7px 10px`,
      borderRadius: d.radiusSm,
      fontFamily: d.fontBody,
      fontSize: d.textSm,
      fontWeight: active ? 600 : 500,
      color: active ? d.accent : d.textMuted,
      cursor: 'pointer',
      marginBottom: 2,
      transition: `all ${d.durFast}`,
      background: active ? d.accentLight : 'transparent',
      border: 'none',
      width: '100%',
      textAlign: 'left',
      ':hover': { background: d.surfaceAlt, color: d.text },
      ...rest.style,
    }}
    {...rest}
  >
    {icon && <span style={{ display: 'flex' }}>{icon}</span>}
    <span>{label}</span>
  </button>
);

// ─────────────────────────────────────────────────────────────────
// TOPBAR
// ─────────────────────────────────────────────────────────────────

export const Topbar: React.FC<
  ComponentProps & {
    title: string;
    subtitle?: string;
    actions?: React.ReactNode;
  }
> = ({ d, title, subtitle, actions }) => (
  <div
    style={{
      height: 60,
      flexShrink: 0,
      background: d.surface,
      borderBottom: `1px solid ${d.border}`,
      display: 'flex',
      alignItems: 'center',
      padding: `0 ${d.space6}`,
      gap: d.space4,
    }}
  >
    <div style={{ flex: 1, minWidth: 0 }}>
      <h1
        style={{
          fontFamily: d.fontHead,
          fontSize: d.textLg,
          fontWeight: 700,
          lineHeight: 1.2,
          color: d.text,
          margin: 0,
        }}
      >
        {title}
      </h1>
      {subtitle && (
        <p
          style={{
            fontSize: d.textSm,
            color: d.textMuted,
            margin: 0,
          }}
        >
          {subtitle}
        </p>
      )}
    </div>
    {actions && <div style={{ display: 'flex', alignItems: 'center', gap: d.space3 }}>{actions}</div>}
  </div>
);

// ─────────────────────────────────────────────────────────────────
// MAIN CONTENT
// ─────────────────────────────────────────────────────────────────

export const MainContent: React.FC<
  ComponentProps & {
    children: React.ReactNode;
  }
> = ({ d, children }) => (
  <div style={{ flex: 1, overflowY: 'auto', padding: d.space6, background: d.bg }}>
    {children}
  </div>
);

// ─────────────────────────────────────────────────────────────────
// GRID LAYOUT
// ─────────────────────────────────────────────────────────────────

export const Grid: React.FC<
  ComponentProps & {
    cols?: number;
    gap?: string;
    children: React.ReactNode;
  }
> = ({ d, cols = 3, gap = d.space6, children, ...rest }) => (
  <div
    style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${cols}, 1fr)`,
      gap,
      ...rest.style,
    }}
    {...rest}
  >
    {children}
  </div>
);

export default {
  Button,
  Card,
  StatTile,
  Avatar,
  ProgressBar,
  Badge,
  SidebarLayout,
  SidebarItem,
  Topbar,
  MainContent,
  Grid,
};
