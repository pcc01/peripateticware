// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

/**
 * Peripateticware Crow — Age-Adaptive Guide Character
 *
 * Based on Hi-Fi design system:
 * - K-6: Friendly cartoon crow (bold dagger beak, sleek body, expressive eye)
 * - 7-12: Bold perched silhouette (confident corvid profile)
 * - College: Minimal single-stroke glyph (crow in flight)
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
 * Sleek teardrop body, long dagger beak, wedge tail, expressive eye.
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

      {/* Wedge tail — distinctive corvid */}
      <path d="M27,29 L38,37 L31,37 L30,40 L26,35 Z" fill={accent} />

      {/* Body — sleek, not round */}
      <path d="M11,24 C11,19 16,16 22,17 C28,18 31,22 30,28 C29,33 24,35 19,33 C14,31 11,28 11,24 Z" fill={accent} />

      {/* Wing */}
      <path d="M16,22 C20,20 25,21 28,25 C30,28 29,32 26,33 C27,29 24,28 22,30 C23,26 20,25 18,26 C17,24 16,23 16,22 Z" fill={accentMuted} opacity="0.32" />

      {/* Head */}
      <path d="M11,18 C11,12 16,9 21,10 C26,11 28,15 26,19 C24,22 18,22 14,21 C12,20 11,19 11,18 Z" fill={accent} />

      {/* Long dagger beak */}
      <path d="M12,16 L4,17 L12,18 Z" fill={accent} />
      <path d="M12,18 L6,19 L12,19.5 Z" fill={accent} opacity="0.85" />

      {/* Eye — white ring, sharp */}
      <circle cx="18" cy="15" r="3" fill="white" />
      <circle cx="18.3" cy="15" r="1.8" fill="#111" />
      <circle cx="19" cy="14.4" r="0.6" fill="white" />

      {/* Feet */}
      <g stroke={accent} strokeWidth="1.5" strokeLinecap="round" fill="none">
        <path d="M18,33 L16,38 M18,33 L18,38 M18,33 L20,38" />
        <path d="M24,34 L22,38 M24,34 L24,38 M24,34 L26,38" />
      </g>
    </svg>
  )
}

/**
 * 7-12 Crow: Bold perched silhouette
 * Pure corvid form with confident stance, side profile view.
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

      {/* Perched corvid silhouette — side profile, wedge tail */}
      <path
        d="M13,15 C13,10 17,8 21,9 C25,10 27,13 28,17 C29,21 30,24 33,29 C35,32 37,33 39,35 C35,35 32,33 30,32 C31,34 30,36 28,35 C26,34 25,32 24,31 C22,33 19,33 17,31 C15,29 15,25 16,22 C14,21 12,20 11,18 C12,16 12,16 13,15 Z"
        fill={accent}
      />

      {/* Long dagger beak */}
      <path d="M13,15 L5,16 L13,18 Z" fill={accent} />
      <path d="M13,18 L7,19 L13,19.5 Z" fill={accent} />

      {/* Eye */}
      <circle cx="17" cy="14" r="1.7" fill={accentMuted} />
      <circle cx="17.4" cy="13.6" r="0.5" fill={accentMuted} opacity="0.6" />

      {/* Feet on perch */}
      <line x1="12" y1="35" x2="34" y2="35" stroke={accent} strokeWidth="1.4" strokeLinecap="round" opacity="0.4" />
      <g stroke={accent} strokeWidth="1.2" strokeLinecap="round" fill="none">
        <path d="M19,32 L17,35 M19,32 L19,35 M19,32 L21,35" />
        <path d="M25,32 L23,35 M25,32 L25,35 M25,32 L27,35" />
      </g>
    </svg>
  )
}

/**
 * College Crow: Minimal single-stroke glyph
 * Elegant line art — crow in flight with minimal strokes.
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
      <circle cx="22" cy="22" r="19" fill="none" stroke={accent} strokeWidth="1" opacity="0.35" />

      {/* Wings in flight */}
      <path d="M7,21 C13,15 18,18 21,21 C22,22 23,22 24,21 C27,18 32,15 38,21" stroke={accent} strokeWidth="1.8" fill="none" strokeLinecap="round" />

      {/* Head + dagger beak (left) */}
      <path d="M21,21 C19,20 18,21 17,22" stroke={accent} strokeWidth="1.8" fill="none" strokeLinecap="round" />
      <path d="M17,22 L13,22.5" stroke={accent} strokeWidth="1.4" strokeLinecap="round" />

      {/* Wedge tail (right/down) */}
      <path d="M23,22 C24,26 25,28 27,30 M23,22 C23,26 23,28 24,31" stroke={accent} strokeWidth="1.4" fill="none" strokeLinecap="round" />
    </svg>
  )
}

export default CrowByAgeBand
