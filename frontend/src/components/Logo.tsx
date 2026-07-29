import { useTranslation } from 'react-i18next';
// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import React from 'react';
import { PRODUCT_NAME } from '../constants/brand';
import { Crow } from './Crow';

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
      <Crow size={size} />

      {showText &&
      <span
        style={{ fontFamily: 'var(--font-head)', fontWeight: 700 }}
        className="text-lg">{PRODUCT_NAME}


      </span>
      }
    </div>);

};

export default Logo;