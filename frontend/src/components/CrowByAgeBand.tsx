// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

/**
 * Peripateticware Crow — Age-Adaptive Guide Character
 * 
 * Based on Hi-Fi design system:
 * - K-6: Friendly cartoon crow (bold beak, angular wings, expressive)
 * - 7-12: Bold perched silhouette (confident, profile)
 * - College: Minimal single-stroke glyph (elegant, flight)
 * 
 * The crow adapts its appearance to match the visual direction
 * (Field Guide, Terrain, or Atmosphere)
 */

import React from 'react'

type AgeBand = 'k-6' | '7-12' | 'college'
type Direction = 'fieldguide' | 'terrain' | 'atmosphere'
type LocationSkin = 'field' | 'city'

interface CrowProps {
  ageBand: AgeBand
  direction?: Direction
  skin?: LocationSkin
  size?: number
  className?: string
}

// Color palettes from Hi-Fi design system
const DIRECTIONS = {
  fieldguide: {
    accent: '#4a7c59',
    accentMuted: '#eaf2ec',
  },
  terrain: {
    accent: '#d45a28',
    accentMuted: '#faeee6',
  },
  atmosphere: {
    accent: '#5bc4a0',
    accentMuted: '#1e3530',
  },
}

const CITY_OVERRIDES = {
  fieldguide: { accent: '#1a56a0', accentMuted: '#e6eef8' },
  terrain: { accent: '#c49a20', accentMuted: '#f5efd4' },
  atmosphere: { accent: '#4a9ef0', accentMuted: '#1a2535' },
}

export const CrowByAgeBand: React.FC<CrowProps> = ({
  ageBand,
  direction = 'fieldguide',
  skin = 'field',
  size = 120,
  className = '',
}) => {
  // Get colors based on direction and location skin
  const colors = skin === 'city' ? CITY_OVERRIDES[direction] : DIRECTIONS[direction]

  switch (ageBand) {
    case 'k-6':
      return <CrowK6 size={size} className={className} colors={colors} />
    case '7-12':
      return <Crow712 size={size} className={className} colors={colors} />
    case 'college':
      return <CrowCollege size={size} className={className} colors={colors} />
  }
}

/**
 * K-6 Crow: Friendly cartoon crow
 * Distinctive crow features: bold beak, angular wings, expressive eye, fan tail
 */
const CrowK6: React.FC<{
  size: number
  className: string
  colors: { accent: string; accentMuted: string }
}> = ({ size, className, colors }) => {
  const { accent, accentMuted } = colors

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 44 44"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Background circle */}
      <circle cx="22" cy="22" r="20" fill={accentMuted} />

      {/* Tail — distinctive crow fan tail */}
      <path
        d="M28,32 Q34,36 36,40 Q30,38 28,36 Q26,40 24,42 Q22,38 22,35Z"
        fill={accent}
      />

      {/* Body — sleek, not round */}
      <ellipse cx="21" cy="27" rx="9" ry="7" fill={accent} />

      {/* Wing detail */}
      <path d="M13,27 Q10,22 13,18 Q16,23 15,28Z" fill={accent} />
      <path
        d="M14,26 Q11,23 13,19"
        stroke={accentMuted}
        strokeWidth="0.8"
        fill="none"
        opacity="0.4"
      />

      {/* Head — slightly angular */}
      <path
        d="M14,18 Q14,10 22,9 Q30,10 30,17 Q30,22 22,22 Q14,22 14,18Z"
        fill={accent}
      />

      {/* Distinctive crow beak — long, hooked */}
      <path d="M14,16 Q9,16 8,18 Q10,19 14,18Z" fill={accent} />
      <path
        d="M9,18 Q10,20 14,19"
        stroke={accentMuted}
        strokeWidth="0.6"
        fill="none"
        opacity="0.5"
      />

      {/* Eye — white ring, sharp */}
      <circle cx="18" cy="15" r="3.2" fill="white" />
      <circle cx="18" cy="15" r="2" fill="#111" />
      <circle cx="18.7" cy="14.3" r="0.7" fill="white" />

      {/* Wing bar highlight */}
      <path
        d="M15,26 Q19,24 24,26"
        stroke={accentMuted}
        strokeWidth="1"
        fill="none"
        opacity="0.35"
      />

      {/* Feet */}
      <path
        d="M18,33 L15,38 M18,33 L18,38 M18,33 L21,38"
        stroke={accent}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M25,33 L22,38 M25,33 L25,38 M25,33 L28,38"
        stroke={accent}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

/**
 * 7-12 Crow: Bold perched silhouette
 * Pure silhouette form with confident stance, side profile view
 */
const Crow712: React.FC<{
  size: number
  className: string
  colors: { accent: string; accentMuted: string }
}> = ({ size, className, colors }) => {
  const { accent, accentMuted } = colors

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 44 44"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Background circle */}
      <circle cx="22" cy="22" r="20" fill={accentMuted} />

      {/* Perched crow silhouette — side profile */}
      <path
        d="M22,8
          C26,8 30,10 31,14
          C32,17 30,19 31,21
          C33,23 34,22 35,24
          C32,25 30,23 29,25
          C30,28 29,31 27,33
          C25,35 23,34 22,34
          C21,34 19,35 17,33
          C15,31 14,28 15,25
          C13,23 11,25 8,24
          C9,22 10,23 12,21
          C13,19 11,17 12,14
          C13,10 18,8 22,8Z"
        fill={accent}
      />

      {/* Beak */}
      <path d="M12,14 Q7,15 6,17 Q9,17 12,16Z" fill={accent} />

      {/* Eye */}
      <circle cx="16" cy="14" r="2" fill="white" opacity="0.9" />
      <circle cx="16" cy="14" r="1.1" fill={accentMuted} />

      {/* Tail fork */}
      <path
        d="M27,33 Q30,38 33,40"
        stroke={accent}
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M22,34 Q22,39 20,41"
        stroke={accent}
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />

      {/* Feet on perch */}
      <line
        x1="10"
        y1="36"
        x2="36"
        y2="36"
        stroke={accent}
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.4"
      />
      <path
        d="M18,34 L16,36 M18,34 L18,36 M18,34 L20,36"
        stroke={accent}
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path
        d="M26,34 L24,36 M26,34 L26,36 M26,34 L28,36"
        stroke={accent}
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  )
}

/**
 * College Crow: Minimal single-stroke glyph
 * Elegant line art — crow in flight with minimal strokes
 */
const CrowCollege: React.FC<{
  size: number
  className: string
  colors: { accent: string; accentMuted: string }
}> = ({ size, className, colors }) => {
  const { accent } = colors

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 44 44"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Subtle border circle */}
      <circle cx="22" cy="22" r="19" fill="none" stroke={accent} strokeWidth="1" opacity="0.4" />

      {/* Minimal crow in flight — two wing strokes + body */}
      <path
        d="M8,20 Q14,14 20,18 Q22,19 24,18 Q30,14 36,20"
        stroke={accent}
        strokeWidth="1.8"
        fill="none"
        strokeLinecap="round"
      />

      {/* Body */}
      <ellipse cx="22" cy="20" rx="3" ry="2" fill={accent} opacity="0.9" />

      {/* Tail */}
      <path
        d="M20,22 Q22,26 24,22"
        stroke={accent}
        strokeWidth="1.4"
        fill="none"
        strokeLinecap="round"
      />

      {/* Head + beak */}
      <circle cx="19" cy="17" r="2" fill={accent} opacity="0.9" />
      <path d="M17,17 Q14,17 13,18" stroke={accent} strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

export default CrowByAgeBand