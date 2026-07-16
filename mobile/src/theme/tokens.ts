// ─────────────────────────────────────────────────────────────────
// Peripateticware — Design tokens (ported from Hi-Fi Design v1.0)
// Three themes: fieldGuide (default) · terrain · atmosphere
// ─────────────────────────────────────────────────────────────────

export type ThemeName = 'fieldGuide' | 'terrain' | 'atmosphere';

export interface Theme {
  name: string;
  bg: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  textFaint: string;
  accent: string;
  accentText: string;
  accentMuted: string;
  warn: string;
  warnLight: string;
  info: string;
  infoLight: string;
  mapBase: string;
  mapInk: string;
  mapAccent: string;
  fontHead: string;
  fontBody: string;
  fontMono: string;
  radiusSm: number;
  radius: number;
  radiusLg: number;
  radiusFull: number;
  shadowColor: string;
  shadowElevation: number;
  notchBg: string;
  homeBar: string;
}

export const themes: Record<ThemeName, Theme> = {
  fieldGuide: {
    name: 'Field Guide',
    bg: '#faf7f2',
    surface: '#ffffff',
    surfaceAlt: '#f5f0e6',
    border: '#e0d8cb',
    borderStrong: '#c8bfae',
    text: '#1e1a14',
    // WCAG AA fix: was #7a6f5e (4.34:1 on surfaceAlt, below the 4.5:1
    // minimum) — matches the fix already applied on web
    // (frontend/src/design-system.css); ported here per FEATURE_PLAN.md
    // section 2. Now 5.36:1 on surfaceAlt.
    textMuted: '#6b6150',
    textFaint: '#b0a898',
    accent: '#4a7c59',
    accentText: '#ffffff',
    accentMuted: '#eaf2ec',
    warn: '#c87941',
    warnLight: '#fdf0e6',
    info: '#2563a8',
    infoLight: '#e8f0fb',
    mapBase: '#e2ddd0',
    mapInk: '#b5ad9a',
    mapAccent: '#4a7c59',
    fontHead: 'Lora_700Bold',
    fontBody: 'DMSans_400Regular',
    fontMono: 'DMMono_400Regular',
    radiusSm: 8,
    radius: 12,
    radiusLg: 16,
    radiusFull: 9999,
    shadowColor: '#000',
    shadowElevation: 3,
    notchBg: '#1e1a14',
    homeBar: '#e0d8cb',
  },

  terrain: {
    name: 'Terrain',
    bg: '#f5f0e6',
    surface: '#ffffff',
    surfaceAlt: '#ede7d8',
    border: '#d8cebc',
    borderStrong: '#c0b49e',
    text: '#1a1410',
    // WCAG AA fix: was #7a6a54 (4.24:1 on surfaceAlt, below 4.5:1) — same
    // pattern as fieldGuide, found while auditing this theme too. Now
    // 5.02:1 on surfaceAlt.
    textMuted: '#6d5f4b',
    textFaint: '#a8988a',
    accent: '#d45a28',
    accentText: '#ffffff',
    accentMuted: '#faeee6',
    warn: '#c8a030',
    warnLight: '#fdf5e0',
    info: '#1a56a0',
    infoLight: '#e6eef8',
    mapBase: '#f0ebe0',
    mapInk: '#c4b89a',
    mapAccent: '#d45a28',
    fontHead: 'ZillaSlab_700Bold',
    fontBody: 'DMSans_400Regular',
    fontMono: 'DMMono_400Regular',
    radiusSm: 2,
    radius: 4,
    radiusLg: 6,
    radiusFull: 4,
    shadowColor: '#d8cebc',
    shadowElevation: 0,
    notchBg: '#1a1410',
    homeBar: '#d8cebc',
  },

  atmosphere: {
    name: 'Atmosphere',
    bg: '#141c17',
    surface: '#1e2820',
    surfaceAlt: '#243028',
    border: '#2e4035',
    borderStrong: '#3a5045',
    text: '#f0ead8',
    // WCAG AA fix: was #7a9080 (4.01:1 on surfaceAlt, below 4.5:1) — same
    // pattern as fieldGuide, found while auditing this theme too. Now
    // 4.96:1 on surfaceAlt.
    textMuted: '#8da093',
    textFaint: '#4a6058',
    accent: '#5bc4a0',
    accentText: '#141c17',
    accentMuted: '#1e3530',
    warn: '#e8b84a',
    warnLight: '#2a2010',
    info: '#4a9ef0',
    infoLight: '#1a2535',
    mapBase: '#1e2820',
    mapInk: '#2e4035',
    mapAccent: '#5bc4a0',
    fontHead: 'Spectral_600SemiBold',
    fontBody: 'DMSans_400Regular',
    fontMono: 'DMMono_400Regular',
    radiusSm: 10,
    radius: 20,
    radiusLg: 24,
    radiusFull: 9999,
    shadowColor: '#000',
    shadowElevation: 8,
    notchBg: '#0a0f0c',
    homeBar: '#2e4035',
  },
};

export type LocationSkin = 'field' | 'city';

const citySkinOverrides: Record<ThemeName, Partial<Theme>> = {
  fieldGuide: { accent: '#1a56a0', accentMuted: '#e6eef8', mapBase: '#eceae4', mapInk: '#9a9488', mapAccent: '#1a56a0' },
  terrain:    { accent: '#c49a20', accentMuted: '#f5efd4', mapBase: '#e8e4dc', mapInk: '#a8a090', mapAccent: '#c49a20' },
  atmosphere: { accent: '#4a9ef0', accentMuted: '#1a2535', mapBase: '#12151a', mapInk: '#1e2530', mapAccent: '#4a9ef0' },
};

export function resolveTheme(name: ThemeName, skin: LocationSkin = 'field'): Theme {
  const base = themes[name];
  if (skin === 'field') return base;
  return { ...base, ...citySkinOverrides[name] };
}
