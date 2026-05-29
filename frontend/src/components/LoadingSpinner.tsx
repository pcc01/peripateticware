import { useTranslation } from 'react-i18next';
// src/components/common/LoadingSpinner.tsx - STUB EXPORT
import React from 'react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ size = 'md' }) => {
  const { t } = useTranslation('landing');
  return <div>{t("landing:loading", "Loading...")}</div>;
};

export default LoadingSpinner;