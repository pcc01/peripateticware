// ─────────────────────────────────────────────────────────────────
// CrowAvatar — Age-adaptive guide character (Peri)
//   k6      Friendly cartoon crow
//   m712    Bold perched silhouette
//   college Minimal single-stroke in-flight glyph
// ─────────────────────────────────────────────────────────────────
import React from 'react';
import Svg, { Circle, Path, Ellipse, Line } from 'react-native-svg';
import type { AgeBand } from '@/src/bands/copy';
import type { Theme } from '@/src/theme/tokens';

interface CrowAvatarProps {
  band: AgeBand;
  theme: Theme;
  size?: number;
}

export default function CrowAvatar({ band, theme, size = 44 }: CrowAvatarProps) {
  const accent = theme.accent;
  const bg = theme.accentMuted;

  if (band === 'k6') {
    return (
      <Svg width={size} height={size} viewBox="0 0 44 44">
        <Circle cx="22" cy="22" r="20" fill={bg} />
        <Path d="M28,32 Q34,36 36,40 Q30,38 28,36 Q26,40 24,42 Q22,38 22,35Z" fill={accent} />
        <Ellipse cx="21" cy="27" rx="9" ry="7" fill={accent} />
        <Path d="M13,27 Q10,22 13,18 Q16,23 15,28Z" fill={accent} />
        <Path d="M14,26 Q11,23 13,19" stroke={bg} strokeWidth="0.8" fill="none" opacity={0.4} />
        <Path d="M14,18 Q14,10 22,9 Q30,10 30,17 Q30,22 22,22 Q14,22 14,18Z" fill={accent} />
        <Path d="M14,16 Q9,16 8,18 Q10,19 14,18Z" fill={accent} />
        <Path d="M9,18 Q10,20 14,19" stroke={bg} strokeWidth="0.6" fill="none" opacity={0.5} />
        <Circle cx="18" cy="15" r="3.2" fill="white" />
        <Circle cx="18" cy="15" r="2" fill="#111" />
        <Circle cx="18.7" cy="14.3" r="0.7" fill="white" />
        <Path d="M15,26 Q19,24 24,26" stroke={bg} strokeWidth="1" fill="none" opacity={0.35} />
        <Path d="M18,33 L15,38 M18,33 L18,38 M18,33 L21,38" stroke={accent} strokeWidth="1.5" strokeLinecap="round" />
        <Path d="M25,33 L22,38 M25,33 L25,38 M25,33 L28,38" stroke={accent} strokeWidth="1.5" strokeLinecap="round" />
      </Svg>
    );
  }

  if (band === 'm712') {
    return (
      <Svg width={size} height={size} viewBox="0 0 44 44">
        <Circle cx="22" cy="22" r="20" fill={bg} />
        <Path
          d="M22,8 C26,8 30,10 31,14 C32,17 30,19 31,21 C33,23 34,22 35,24 C32,25 30,23 29,25 C30,28 29,31 27,33 C25,35 23,34 22,34 C21,34 19,35 17,33 C15,31 14,28 15,25 C13,23 11,25 8,24 C9,22 10,23 12,21 C13,19 11,17 12,14 C13,10 18,8 22,8Z"
          fill={accent}
        />
        <Path d="M12,14 Q7,15 6,17 Q9,17 12,16Z" fill={accent} />
        <Circle cx="16" cy="14" r="2" fill="white" opacity={0.9} />
        <Circle cx="16" cy="14" r="1.1" fill={bg} />
        <Path d="M27,33 Q30,38 33,40" stroke={accent} strokeWidth="2" strokeLinecap="round" fill="none" />
        <Path d="M22,34 Q22,39 20,41" stroke={accent} strokeWidth="2" strokeLinecap="round" fill="none" />
        <Line x1="10" y1="36" x2="36" y2="36" stroke={accent} strokeWidth="1.5" strokeLinecap="round" opacity={0.4} />
        <Path d="M18,34 L16,36 M18,34 L18,36 M18,34 L20,36" stroke={accent} strokeWidth="1.2" strokeLinecap="round" />
        <Path d="M26,34 L24,36 M26,34 L26,36 M26,34 L28,36" stroke={accent} strokeWidth="1.2" strokeLinecap="round" />
      </Svg>
    );
  }

  // college — minimal in-flight glyph
  return (
    <Svg width={size} height={size} viewBox="0 0 44 44">
      <Circle cx="22" cy="22" r="19" fill="none" stroke={accent} strokeWidth="1" opacity={0.4} />
      <Path d="M8,20 Q14,14 20,18 Q22,19 24,18 Q30,14 36,20" stroke={accent} strokeWidth="1.8" fill="none" strokeLinecap="round" />
      <Ellipse cx="22" cy="20" rx="3" ry="2" fill={accent} opacity={0.9} />
      <Path d="M20,22 Q22,26 24,22" stroke={accent} strokeWidth="1.4" fill="none" strokeLinecap="round" />
      <Circle cx="19" cy="17" r="2" fill={accent} opacity={0.9} />
      <Path d="M17,17 Q14,17 13,18" stroke={accent} strokeWidth="1.2" strokeLinecap="round" />
    </Svg>
  );
}
