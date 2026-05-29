import { useTranslation } from 'react-i18next';
// src/components/teacher/ActivityPreview.tsx - STUB EXPORT
import React from 'react';

interface ActivityPreviewProps {
  activity?: any;
}

const ActivityPreview: React.FC<ActivityPreviewProps> = ({ activity }) => {
  const { t } = useTranslation('landing');
  return <div>{t("landing:activity_preview_stub", "Activity Preview Stub")}</div>;
};

export default ActivityPreview;