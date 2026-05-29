/**
 * Peripateticware — Design Tokens System
 * v1.0 · May 2026
 *
 * Three-layer system:
 * 1. Direction (visual personality): fieldguide | terrain | atmosphere
 * 2. Role (accent hue): student | teacher | parent | admin
 * 3. Tokens (color, type, spacing, motion)
 */

// ─────────────────────────────────────────────────────────────────
// TYPOGRAPHY
// ─────────────────────────────────────────────────────────────────

export const typography = {
  fontHead: "'Lora', Georgia, serif",
  fontBody: "'DM Sans', system-ui, -apple-system, sans-serif",
  fontMono: "'DM Mono', ui-monospace, 'SF Mono', Menlo, monospace",

  textXs: '11px',
  textSm: '12px',
  textBase: '14px',
  textMd: '15px',
  textLg: '18px',
  textXl: '22px',
  text2xl: '28px',
  text3xl: '36px',
  text4xl: '48px',

  weightRegular: 400,
  weightMedium: 500,
  weightSemibold: 600,
  weightBold: 700,

  lineHeight: {
    tight: 1.2,
    snug: 1.35,
    base: 1.5,
    loose: 1.65,
  },

  letterSpacing: {
    tight: '-0.01em',
    base: '0',
    mono: '0.06em',
    caps: '0.1em',
  },
};

// ─────────────────────────────────────────────────────────────────
// SPACING SCALE (4px base)
// ─────────────────────────────────────────────────────────────────

export const spacing = {
  1: '4px',
  2: '8px',
  3: '12px',
  4: '16px',
  5: '20px',
  6: '24px',
  8: '32px',
  10: '40px',
  12: '48px',
  16: '64px',
};

// ─────────────────────────────────────────────────────────────────
// RADIUS SCALE
// ─────────────────────────────────────────────────────────────────

export const radius = {
  xs: '4px',
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '20px',
  pill: '9999px',
};

// ─────────────────────────────────────────────────────────────────
// SEMANTIC COLORS (Direction-independent)
// ─────────────────────────────────────────────────────────────────

export const semanticColors = {
  success: '#4a7c59',
  successLight: '#eaf2ec',
  warn: '#c87941',
  warnLight: '#fdf0e6',
  info: '#2563a8',
  infoLight: '#e8f0fb',
  danger: '#b04020',
  dangerLight: '#fbeae3',
};

// ─────────────────────────────────────────────────────────────────
// DIRECTIONS (Visual Personalities)
// ─────────────────────────────────────────────────────────────────

export type Direction = 'fieldguide' | 'terrain' | 'atmosphere';

const fieldGuideColors = {
  fontHead: typography.fontHead,
  bg: '#faf7f2',
  sidebar: '#f0ece3',
  surface: '#ffffff',
  surfaceAlt: '#f5f0e6',
  border: '#e0d8cb',
  borderStrong: '#c8bfae',
  text: '#1e1a14',
  textMuted: '#7a6f5e',
  textFaint: '#b0a898',
  textInvert: '#ffffff',
  overlay: 'rgba(30,26,20,0.55)',
  shadow: '0 1px 3px rgba(58,40,20,0.04), 0 2px 12px rgba(58,40,20,0.06)',
  shadowLg: '0 8px 32px rgba(58,40,20,0.1)',
  shadowXl: '0 16px 48px rgba(58,40,20,0.15)',
  radiusXs: '4px',
  radiusSm: '8px',
  radius: '12px',
  radiusLg: '16px',
  radiusXl: '20px',
};

const terrainColors = {
  fontHead: "'Zilla Slab', Georgia, serif",
  bg: '#f5f0e6',
  sidebar: '#ede7d8',
  surface: '#ffffff',
  surfaceAlt: '#ede7d8',
  border: '#d8cebc',
  borderStrong: '#c0b49e',
  text: '#1a1410',
  textMuted: '#7a6a54',
  textFaint: '#b0a08a',
  textInvert: '#ffffff',
  overlay: 'rgba(30,26,20,0.55)',
  shadow: '3px 3px 0 #e0d6c2',
  shadowLg: '6px 6px 0 #d0c4ad',
  shadowXl: '6px 6px 0 #d0c4ad',
  warn: '#c8a030',
  warnLight: '#fdf5e0',
  radiusXs: '2px',
  radiusSm: '2px',
  radius: '4px',
  radiusLg: '6px',
  radiusXl: '8px',
};

const atmosphereColors = {
  fontHead: "'Spectral', Georgia, serif",
  bg: '#141c17',
  sidebar: '#0e1510',
  surface: '#1e2820',
  surfaceAlt: '#243028',
  border: '#2e4035',
  borderStrong: '#3e5548',
  text: '#f0ead8',
  textMuted: '#7a9080',
  textFaint: '#4a6055',
  textInvert: '#ffffff',
  overlay: 'rgba(0,0,0,0.7)',
  shadow: '0 1px 0 rgba(255,255,255,0.04), 0 4px 24px rgba(0,0,0,0.35)',
  shadowLg: '0 16px 48px rgba(0,0,0,0.5)',
  shadowXl: '0 16px 48px rgba(0,0,0,0.5)',
  success: '#5bc4a0',
  successLight: '#1e3530',
  warn: '#e8b84a',
  warnLight: '#2a2010',
  info: '#4a9ef0',
  infoLight: '#1a2535',
  danger: '#e87060',
  dangerLight: '#2a1410',
  radiusXs: '6px',
  radiusSm: '10px',
  radius: '16px',
  radiusLg: '20px',
  radiusXl: '24px',
};

// ─────────────────────────────────────────────────────────────────
// ROLE ACCENTS (Per-role colorization)
// ─────────────────────────────────────────────────────────────────

export type Role = 'student' | 'teacher' | 'parent' | 'admin';

const roleAccents: Record<Direction, Record<Role, { accent: string; light: string; text: string }>> = {
  fieldguide: {
    student: { accent: '#4a7c59', light: '#eaf2ec', text: '#ffffff' },
    teacher: { accent: '#8b6f47', light: '#f5f0e5', text: '#ffffff' },
    parent: { accent: '#6b5b95', light: '#f0ebf7', text: '#ffffff' },
    admin: { accent: '#2563a8', light: '#e8f0fb', text: '#ffffff' },
  },
  terrain: {
    student: { accent: '#4a7c59', light: '#eaf2ec', text: '#ffffff' },
    teacher: { accent: '#8b6f47', light: '#f5f0e5', text: '#ffffff' },
    parent: { accent: '#6b5b95', light: '#f0ebf7', text: '#ffffff' },
    admin: { accent: '#2563a8', light: '#e8f0fb', text: '#ffffff' },
  },
  atmosphere: {
    student: { accent: '#5bc4a0', light: '#1e3530', text: '#ffffff' },
    teacher: { accent: '#d4a574', light: '#2a2010', text: '#ffffff' },
    parent: { accent: '#a89dd5', light: '#1e1a2a', text: '#ffffff' },
    admin: { accent: '#4a9ef0', light: '#1a2535', text: '#ffffff' },
  },
};

// ─────────────────────────────────────────────────────────────────
// MOTION
// ─────────────────────────────────────────────────────────────────

export const motion = {
  easeOut: 'cubic-bezier(0.16, 1, 0.3, 1)',
  easeInOut: 'cubic-bezier(0.65, 0, 0.35, 1)',
  fast: '150ms',
  base: '220ms',
  slow: '400ms',
};

// ─────────────────────────────────────────────────────────────────
// Z-INDEX SCALE
// ─────────────────────────────────────────────────────────────────

export const zIndex = {
  base: 1,
  sticky: 100,
  dropdown: 200,
  modal: 400,
  toast: 600,
};

// ─────────────────────────────────────────────────────────────────
// COMPREHENSIVE TOKEN GETTER
// ─────────────────────────────────────────────────────────────────

export interface Tokens {
  // Typography
  fontHead: string;
  fontBody: string;
  fontMono: string;
  textXs: string;
  textSm: string;
  textBase: string;
  textMd: string;
  textLg: string;
  textXl: string;
  text2xl: string;
  text3xl: string;
  text4xl: string;

  // Colors - Surfaces
  bg: string;
  sidebar: string;
  surface: string;
  surfaceAlt: string;
  overlay: string;

  // Colors - Borders
  border: string;
  borderStrong: string;

  // Colors - Text
  text: string;
  textMuted: string;
  textFaint: string;
  textInvert: string;

  // Colors - Status (semantic)
  success: string;
  successLight: string;
  warn: string;
  warnLight: string;
  info: string;
  infoLight: string;
  danger: string;
  dangerLight: string;

  // Colors - Role accent
  accent: string;
  accentLight: string;
  accentText: string;

  // Radius
  radiusXs: string;
  radiusSm: string;
  radius: string;
  radiusLg: string;
  radiusXl: string;

  // Spacing
  space1: string;
  space2: string;
  space3: string;
  space4: string;
  space5: string;
  space6: string;
  space8: string;
  space10: string;
  space12: string;
  space16: string;

  // Shadows
  shadow: string;
  shadowLg: string;
  shadowXl: string;
  shadowFocus: string;

  // Motion
  easeOut: string;
  easeInOut: string;
  durFast: string;
  durBase: string;
  durSlow: string;

  // Z-index
  zBase: number;
  zSticky: number;
  zDropdown: number;
  zModal: number;
  zToast: number;

  // Utilities
  lineHeight: Record<string, number>;
  letterSpacing: Record<string, string>;
}

export function getTokens(direction: Direction, role: Role): Tokens {
  const dirColors =
    direction === 'terrain'
      ? terrainColors
      : direction === 'atmosphere'
        ? atmosphereColors
        : fieldGuideColors;

  const accentColors = roleAccents[direction][role];

  return {
    // Typography
    fontHead: dirColors.fontHead,
    fontBody: typography.fontBody,
    fontMono: typography.fontMono,
    textXs: typography.textXs,
    textSm: typography.textSm,
    textBase: typography.textBase,
    textMd: typography.textMd,
    textLg: typography.textLg,
    textXl: typography.textXl,
    text2xl: typography.text2xl,
    text3xl: typography.text3xl,
    text4xl: typography.text4xl,

    // Colors - Surfaces
    bg: dirColors.bg,
    sidebar: dirColors.sidebar,
    surface: dirColors.surface,
    surfaceAlt: dirColors.surfaceAlt,
    overlay: dirColors.overlay,

    // Colors - Borders
    border: dirColors.border,
    borderStrong: dirColors.borderStrong,

    // Colors - Text
    text: dirColors.text,
    textMuted: dirColors.textMuted,
    textFaint: dirColors.textFaint,
    textInvert: dirColors.textInvert,

    // Colors - Status
    success: direction === 'atmosphere' ? atmosphereColors.success : semanticColors.success,
    successLight:
      direction === 'atmosphere' ? atmosphereColors.successLight : semanticColors.successLight,
    warn: (dirColors as Record<string, string>).warn || semanticColors.warn,
    warnLight:
      (dirColors as Record<string, string>).warnLight || semanticColors.warnLight,
    info: direction === 'atmosphere' ? atmosphereColors.info : semanticColors.info,
    infoLight:
      direction === 'atmosphere' ? atmosphereColors.infoLight : semanticColors.infoLight,
    danger: direction === 'atmosphere' ? atmosphereColors.danger : semanticColors.danger,
    dangerLight:
      direction === 'atmosphere' ? atmosphereColors.dangerLight : semanticColors.dangerLight,

    // Colors - Role Accent
    accent: accentColors.accent,
    accentLight: accentColors.light,
    accentText: accentColors.text,

    // Radius
    radiusXs: dirColors.radiusXs,
    radiusSm: dirColors.radiusSm,
    radius: dirColors.radius,
    radiusLg: dirColors.radiusLg,
    radiusXl: dirColors.radiusXl,

    // Spacing
    space1: spacing[1],
    space2: spacing[2],
    space3: spacing[3],
    space4: spacing[4],
    space5: spacing[5],
    space6: spacing[6],
    space8: spacing[8],
    space10: spacing[10],
    space12: spacing[12],
    space16: spacing[16],

    // Shadows
    shadow: dirColors.shadow,
    shadowLg: dirColors.shadowLg,
    shadowXl: dirColors.shadowXl,
    shadowFocus: `0 0 0 4px ${accentColors.light}`,

    // Motion
    easeOut: motion.easeOut,
    easeInOut: motion.easeInOut,
    durFast: motion.fast,
    durBase: motion.base,
    durSlow: motion.slow,

    // Z-index
    zBase: zIndex.base,
    zSticky: zIndex.sticky,
    zDropdown: zIndex.dropdown,
    zModal: zIndex.modal,
    zToast: zIndex.toast,

    // Utilities
    lineHeight: typography.lineHeight,
    letterSpacing: typography.letterSpacing,
  };
}

export default getTokens;
