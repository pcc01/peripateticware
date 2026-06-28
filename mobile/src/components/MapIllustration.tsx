import React from 'react';
import Svg, { Rect, Path, Circle, Ellipse, Line } from 'react-native-svg';
import type { Theme, ThemeName } from '@/src/theme/tokens';

interface MapIllustrationProps {
  theme: Theme;
  themeName: ThemeName;
  width: number;
  height: number;
}

export default function MapIllustration({ theme, themeName, width, height }: MapIllustrationProps) {
  const { mapBase: b, mapInk: ink, mapAccent: acc } = theme;
  const w = width;
  const h = height;

  if (themeName === 'atmosphere') {
    return (
      <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        <Rect width={w} height={h} fill={b} />
        {[0.25, 0.5, 0.75].map((f, i) => (
          <Line key={`h${i}`} x1={0} y1={h * f} x2={w} y2={h * f} stroke={ink} strokeWidth="0.8" opacity={0.5} />
        ))}
        {[0.25, 0.5, 0.75].map((f, i) => (
          <Line key={`v${i}`} x1={w * f} y1={0} x2={w * f} y2={h} stroke={ink} strokeWidth="0.8" opacity={0.5} />
        ))}
        <Ellipse cx={w * 0.3} cy={h * 0.45} rx={w * 0.18} ry={h * 0.12} fill={ink} opacity={0.15} />
        <Path d={`M${w*.1},${h*.45} Q${w*.2},${h*.38} ${w*.3},${h*.36} Q${w*.4},${h*.34} ${w*.42},${h*.45} Q${w*.4},${h*.54} ${w*.27},${h*.52} Q${w*.12},${h*.5} ${w*.1},${h*.45}Z`} fill={acc} opacity={0.2} />
        <Circle cx={w * 0.3} cy={h * 0.44} r={7} fill={acc} opacity={0.9} />
        <Circle cx={w * 0.3} cy={h * 0.44} r={3.5} fill={b} opacity={0.8} />
        <Circle cx={w * 0.3} cy={h * 0.44} r={16} fill={acc} opacity={0.1} />
      </Svg>
    );
  }

  if (themeName === 'terrain') {
    return (
      <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        <Rect width={w} height={h} fill={b} />
        {[0.25, 0.35, 0.45].map((f, i) => (
          <Path key={i}
            d={`M${w*.05},${h*f} Q${w*.25},${h*(f-.06)} ${w*.55},${h*f} Q${w*.8},${h*(f+.04)} ${w*.98},${h*f}`}
            stroke={ink} strokeWidth={1.2 - i * 0.2} fill="none" opacity={0.9 - i * 0.2} />
        ))}
        <Line x1={0} y1={h * 0.6} x2={w} y2={h * 0.6} stroke={ink} strokeWidth="3" opacity={0.5} />
        <Line x1={w * 0.35} y1={h * 0.5} x2={w * 0.35} y2={h} stroke={ink} strokeWidth="3" opacity={0.5} />
        <Rect x={w*.02} y={h*.62} width={w*.3} height={h*.22} fill={acc} opacity={0.15} rx="2" />
        <Rect x={w*.14} y={h*.68} width={w*.06} height={w*.06} fill={acc} rx="2" />
        <Circle cx={w * 0.35} cy={h * 0.6} r={6} fill={acc} opacity={0.9} />
        <Circle cx={w * 0.35} cy={h * 0.6} r={3} fill={b} opacity={0.8} />
      </Svg>
    );
  }

  // Field Guide — hand-drawn naturalist
  return (
    <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <Rect width={w} height={h} fill={b} />
      {Array.from({ length: 30 }, (_, i) => (
        <Circle key={i} cx={(i * 47 + 13) % w} cy={(i * 63 + 20) % h} r="0.8" fill={ink} opacity={0.3} />
      ))}
      <Path d={`M0,${h*.55} Q${w*.15},${h*.54} ${w*.35},${h*.56} Q${w*.55},${h*.58} ${w*.7},${h*.55} Q${w*.85},${h*.52} ${w},${h*.53}`} stroke={ink} strokeWidth="3.5" fill="none" strokeLinecap="round" />
      <Path d={`M0,${h*.65} Q${w*.2},${h*.64} ${w*.5},${h*.66} Q${w*.75},${h*.67} ${w},${h*.65}`} stroke={ink} strokeWidth="1.8" fill="none" strokeLinecap="round" />
      <Path d={`M${w*.05},${h*.5} Q${w*.08},${h*.46} ${w*.15},${h*.44} Q${w*.24},${h*.43} ${w*.28},${h*.48} Q${w*.3},${h*.52} ${w*.25},${h*.55} Q${w*.15},${h*.57} ${w*.07},${h*.55} Q${w*.03},${h*.53} ${w*.05},${h*.5}Z`} fill={acc} opacity={0.18} />
      {[[0.1,0.48],[0.16,0.5],[0.2,0.47],[0.13,0.52],[0.18,0.53]].map(([fx,fy],i) => (
        <Circle key={i} cx={w*fx} cy={h*fy} r="4" fill={acc} opacity={0.35} />
      ))}
      <Path d={`M${w*.16},${h*.48} Q${w*.13},${h*.43} ${w*.13},${h*.4} Q${w*.13},${h*.36} ${w*.17},${h*.36} Q${w*.21},${h*.36} ${w*.21},${h*.4} Q${w*.21},${h*.43} ${w*.16},${h*.48}Z`} fill={acc} opacity={0.9} />
      <Circle cx={w*.165} cy={h*.39} r={3.5} fill={b} opacity={0.8} />
      <Circle cx={w*.165} cy={h*.44} r={14} fill={acc} opacity={0.1} />
    </Svg>
  );
}
