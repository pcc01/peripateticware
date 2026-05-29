import { useTranslation } from 'react-i18next';
// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import React from 'react';
const LoadingSpinner = () => {
  const { t } = useTranslation('landing');
  return (<div>{t("landing:loading", "Loading...")}</div>);
};
export default LoadingSpinner;