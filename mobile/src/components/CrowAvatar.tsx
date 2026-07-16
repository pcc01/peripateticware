// ─────────────────────────────────────────────────────────────────
// CrowAvatar — Peri's guide character.
//   Bold perched corvid silhouette (formerly the "m712" age-band
//   variant — that system was removed; this was the default look
//   most users saw, so it's now the only look).
// ─────────────────────────────────────────────────────────────────
import React from 'react';
import Svg, { Circle, Path, Line } from 'react-native-svg';
import type { Theme } from '@/src/theme/tokens';

interface CrowAvatarProps {
  theme: Theme;
  size?: number;
}

export default function CrowAvatar({ theme, size = 44 }: CrowAvatarProps) {
  const accent = theme.accent;
  const bg = theme.accentMuted;

  return (
    <Svg width={size} height={size} viewBox="0 0 44 44">
      <Circle cx="22" cy="22" r="20" fill={bg} />
      {/* Perched corvid silhouette — side profile, wedge tail */}
      <Path
        d="M13,15 C13,10 17,8 21,9 C25,10 27,13 28,17 C29,21 30,24 33,29 C35,32 37,33 39,35 C35,35 32,33 30,32 C31,34 30,36 28,35 C26,34 25,32 24,31 C22,33 19,33 17,31 C15,29 15,25 16,22 C14,21 12,20 11,18 C12,16 12,16 13,15Z"
        fill={accent}
      />
      {/* Long dagger beak */}
      <Path d="M13,15 L5,16 L13,18Z" fill={accent} />
      <Path d="M13,18 L7,19 L13,19.5Z" fill={accent} />
      {/* Eye */}
      <Circle cx="17" cy="14" r="1.7" fill={bg} />
      <Circle cx="17.4" cy="13.6" r="0.5" fill={bg} opacity={0.6} />
      {/* Perch + feet */}
      <Line x1="12" y1="35" x2="34" y2="35" stroke={accent} strokeWidth="1.4" strokeLinecap="round" opacity={0.4} />
      <Path d="M19,32 L17,35 M19,32 L19,35 M19,32 L21,35" stroke={accent} strokeWidth="1.2" strokeLinecap="round" fill="none" />
      <Path d="M25,32 L23,35 M25,32 L25,35 M25,32 L27,35" stroke={accent} strokeWidth="1.2" strokeLinecap="round" fill="none" />
    </Svg>
  );
}
