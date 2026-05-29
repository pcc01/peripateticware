import { useTranslation } from 'react-i18next';
// src/components/teacher/ActivityBuilder.tsx - STUB EXPORT
import React from 'react';

const ActivityBuilder: React.FC<any> = (props) => {
  const { t } = useTranslation('landing');
  return <div>{t("landing:activity_builder_stub", "Activity Builder Stub")}</div>;
};

export default ActivityBuilder;