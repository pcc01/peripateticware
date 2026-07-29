// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import React from 'react'

interface CrowProps {
  size?: number
  className?: string
}

/**
 * Peripateticware Crow Mascot
 * Black corvid symbolizing outdoor exploration and learning.
 * Perched profile: long black dagger beak, sleek body, wedge tail,
 * black legs gripping a perch, an iridescent charcoal/navy/purple gloss
 * on the plumage, and a brass compass slung on a cord from its beak —
 * the "knowledgeable guide" mark.
 */
export const Crow: React.FC<CrowProps> = ({ size = 120, className = '' }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        {/* Iridescent near-black plumage — charcoal through navy to a subtle purple */}
        <linearGradient id="crowGloss" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#3a3550" />
          <stop offset="35%" stopColor="#1f2233" />
          <stop offset="70%" stopColor="#141225" />
          <stop offset="100%" stopColor="#0a0810" />
        </linearGradient>
      </defs>

      {/* Legs + grasping toes */}
      <g stroke="#0d0d0d" strokeWidth="2.6" strokeLinecap="round" fill="none">
        <path d="M50,86 L50,104" />
        <path d="M50,104 L44,108 M50,104 L50,109 M50,104 L56,108" />
        <path d="M62,88 L62,104" />
        <path d="M62,104 L56,108 M62,104 L62,109 M62,104 L68,108" />
      </g>

      {/* Perch */}
      <path d="M34,109 L86,109" stroke="#9a948a" strokeWidth="2.4" strokeLinecap="round" opacity="0.5" />

      {/* Body silhouette (facing left, perched) */}
      <path
        d="M8,47 L34,43 C38,39 42,28 50,26 C58,24 68,27 74,34 C82,42 86,52 90,64 C96,74 102,82 108,90 C98,88 88,82 82,78 C74,82 64,84 56,82 C48,80 42,76 40,68 C38,62 36,56 36,51 L8,49 Z"
        fill="url(#crowGloss)"
      />

      {/* Folded wing — primary feather tips toward the tail */}
      <path
        d="M46,50 C58,47 70,50 78,60 C83,67 83,75 79,80 C77,73 72,71 68,73 C71,67 65,65 61,67 C57,59 51,54 46,50 Z"
        fill="#000000"
        opacity="0.5"
      />
      <g stroke="#5a5a86" strokeWidth="1" fill="none" opacity="0.5" strokeLinecap="round">
        <path d="M52,54 C60,55 68,60 74,69" />
        <path d="M56,60 C62,62 68,66 72,74" />
      </g>

      {/* Beak — long black dagger, slightly hooked */}
      <path d="M34,43 L7,46 L34,49 Z" fill="#0a0a0a" />
      <path d="M34,49 L10,50 L34,52 Z" fill="#000000" opacity="0.85" />
      <path d="M7,46 Q5,47.5 8,49.5" stroke="#0a0a0a" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      <path d="M34,46 L26,46.5" stroke="#000000" strokeWidth="0.8" opacity="0.4" strokeLinecap="round" />

      {/* Compass — brass pendant slung from mid-beak, hanging free of the body */}
      <path d="M20,48 C17,57 16,65 16,71" stroke="#5c4a35" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <path d="M20,48 C22,57 26,65 27.5,71.2" stroke="#5c4a35" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <circle cx="22" cy="78" r="8.4" fill="#c9a35f" stroke="#7d5f34" strokeWidth="1" />
      <circle cx="22" cy="78" r="6.2" fill="#f3ead2" />
      <g stroke="#8a6a3a" strokeWidth="0.7">
        <line x1="22" y1="72.3" x2="22" y2="74" />
        <line x1="22" y1="82" x2="22" y2="83.7" />
        <line x1="16.3" y1="78" x2="18" y2="78" />
        <line x1="26" y1="78" x2="27.7" y2="78" />
      </g>
      <path d="M22,78 L20.4,74.6 L22,75.9 L23.6,74.6 Z" fill="#a03a2a" />
      <path d="M22,78 L20.7,81.4 L22,80.1 L23.3,81.4 Z" fill="#3a3550" />
      <circle cx="22" cy="78" r="0.9" fill="#3a2a15" />

      {/* Eye — defined pupil with a prominent white catchlight */}
      <circle cx="44" cy="38" r="3.6" fill="#3d3550" />
      <circle cx="44.3" cy="38.3" r="2.4" fill="#000000" />
      <circle cx="45.4" cy="36.9" r="1.05" fill="#ffffff" />
      <circle cx="43.2" cy="39.4" r="0.4" fill="#ffffff" opacity="0.55" />

      {/* Crown gloss sheen */}
      <path d="M46,29 C53,27 61,28 68,33" stroke="#6a628a" strokeWidth="2" fill="none" opacity="0.45" strokeLinecap="round" />
    </svg>
  )
}

export default Crow
