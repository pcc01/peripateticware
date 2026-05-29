import { useTranslation } from 'react-i18next';
// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import React from 'react';

interface LogoProps {
  size?: number;
  className?: string;
  showText?: boolean;
}

/**
 * Peripateticware Logo
 * Crow + text mark
 */
export const Logo: React.FC<LogoProps> = ({
  size = 40,
  className = '',
  showText = true
}) => {
  const { t } = useTranslation('landing');
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* Crow icon */}
      <svg
        width={size}
        height={size}
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg">
        
        {/* Simplified crow */}
        <circle cx="20" cy="18" r="8" fill="#1a1a1a" />
        <path d="M 14 12 Q 10 10 8 12 Q 10 14 14 14 Z" fill="#1a1a1a" />
        <path d="M 24 11 L 30 10 L 24 13 Z" fill="#ff9500" />
        <circle cx="23" cy="11" r="1.5" fill="#ffffff" />
        <line x1="18" y1="25" x2="18" y2="32" stroke="#ff9500" strokeWidth="1.5" />
        <line x1="22" y1="25" x2="22" y2="32" stroke="#ff9500" strokeWidth="1.5" />
      </svg>

      {showText &&
      <span
        style={{ fontFamily: 'var(--font-head)', fontWeight: 700 }}
        className="text-lg">{t("landing:peripateticware", "Peripateticware")}


      </span>
      }
    </div>);

};

export default Logo;