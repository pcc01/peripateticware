import { useTranslation } from 'react-i18next';
// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import React from 'react';
import { CrowByAgeBand } from '@/components/CrowByAgeBand';
import { LocaleSwitcher } from '@/components/LocaleSwitcher';
import { PRODUCT_NAME } from '../constants/brand';

interface HeaderProps {
  ageBand?: 'k-6' | '7-12' | 'college';
  showLogo?: boolean;
  showLocaleSwitch?: boolean;
  className?: string;
}

/**
 * Landing Page Header
 * Displays crow logo + "Peripateticware" text on left
 * Language switcher on right
 */
export const Header: React.FC<HeaderProps> = ({
  ageBand = 'k-6',
  showLogo = true,
  showLocaleSwitch = true,
  className = ''
}) => {
  const { t } = useTranslation('landing');
  return (
    <header className={`bg-white shadow-sm border-b border-slate-200 ${className}`}>
      <div className="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center">
        {/* Left: Crow logo + text */}
        {showLogo &&
        <div className="flex items-center gap-3">
            <CrowByAgeBand ageBand={ageBand} size={40} />
            <div>
              <h1 className="text-xl font-bold text-slate-900">{PRODUCT_NAME}</h1>
            </div>
          </div>
        }

        {/* Right: Language switcher */}
        {showLocaleSwitch && <LocaleSwitcher />}
      </div>
    </header>);

};

export default Header;