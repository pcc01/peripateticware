// Peripateticware design tokens -- ported exactly from hi-fi handoff v1.0
// Colors match: --color-* CSS variables from Phase_6 handoff HTML

export const Colors = {
  bg:           '#faf7f2',
  sidebar:      '#f0ece3',
  surface:      '#ffffff',
  surfaceAlt:   '#f5f0e6',
  border:       '#e0d8cb',
  borderStrong: '#c8bfae',
  text:         '#1e1a14',
  textMuted:    '#7a6f5e',
  textFaint:    '#b0a898',
  accent:       '#4a7c59',
  accentLight:  '#eaf2ec',
  accentText:   '#ffffff',
  warn:         '#c87941',
  warnLight:    '#fdf0e6',
  info:         '#2563a8',
  infoLight:    '#e8f0fb',
  mapBase:      '#e2ddd0',
  mapInk:       '#b5ad9a',
  mapAccent:    '#4a7c59',
};

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  full: 999,
};

export const Shadow = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
    elevation: 2,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.10,
    shadowRadius: 16,
    elevation: 8,
  },
};

// Bloom taxonomy levels for CompetencyMeter coloring
export const BloomColors: Record<string, string> = {
  remember:    Colors.textFaint,
  understand:  Colors.textMuted,
  apply:       Colors.accent,
  analyze:     Colors.accent,
  evaluate:    Colors.warn,
  create:      Colors.warn,
};

export const BloomLabels: Record<string, string> = {
  remember:   'Remember',
  understand: 'Understand',
  apply:      'Apply',
  analyze:    'Analyze',
  evaluate:   'Evaluate',
  create:     'Create',
};
