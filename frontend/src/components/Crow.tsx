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
 * Black crow symbolizing outdoor exploration and learning
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
      {/* Body */}
      <ellipse cx="60" cy="65" rx="28" ry="32" fill="#1a1a1a" />

      {/* Head */}
      <circle cx="60" cy="35" r="22" fill="#1a1a1a" />

      {/* Eye */}
      <circle cx="68" cy="32" r="5" fill="#ffffff" />
      <circle cx="68" cy="32" r="3" fill="#1a1a1a" />

      {/* Beak */}
      <path d="M 75 35 L 88 33 L 75 38 Z" fill="#ff9500" />

      {/* Wing */}
      <path
        d="M 50 55 Q 40 60 38 75 Q 40 70 50 68 Z"
        fill="#000000"
        opacity="0.7"
      />

      {/* Wing detail */}
      <path
        d="M 50 55 Q 42 62 40 75"
        stroke="#666666"
        strokeWidth="1.5"
        fill="none"
      />

      {/* Tail feathers */}
      <path
        d="M 35 80 Q 25 85 20 95 Q 22 90 30 85 Z"
        fill="#1a1a1a"
      />
      <path
        d="M 40 82 Q 32 90 28 102 Q 32 95 42 88 Z"
        fill="#1a1a1a"
      />

      {/* Leg left */}
      <line x1="55" y1="95" x2="55" y2="108" stroke="#ff9500" strokeWidth="2" />
      <path d="M 52 108 L 58 108" stroke="#ff9500" strokeWidth="2" />

      {/* Leg right */}
      <line x1="65" y1="95" x2="65" y2="108" stroke="#ff9500" strokeWidth="2" />
      <path d="M 62 108 L 68 108" stroke="#ff9500" strokeWidth="2" />

      {/* Highlight on head (suggests 3D) */}
      <ellipse cx="65" cy="28" rx="8" ry="6" fill="#333333" opacity="0.5" />
    </svg>
  )
}

export default Crow