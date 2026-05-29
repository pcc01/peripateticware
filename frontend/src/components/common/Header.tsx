// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import React from 'react';
import { useTranslation } from 'react-i18next';

const Header = ({ user }: any) => {
  const { t } = useTranslation('landing');
  return (
    <header>
      <h1>{t('landing:peripateticware', 'Peripateticware')}</h1>
      {user && <p>{t('landing:welcome', 'Welcome')}</p>}
    </header>
  );
};

export default Header;
