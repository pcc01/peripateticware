// Copyright (c) 2026 Paul Christopher Cerda
// Teacher: import a rubric from PDF or CSV
import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ExtractionWizard } from '@/components/shared/ExtractionWizard';

function authHeader() {
  const t = localStorage.getItem('auth_token');
  return t ? { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` } : { 'Content-Type': 'application/json' };
}

export const RubricImportPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const rubricsBase = location.pathname.startsWith('/homeschool') ? '/homeschool/rubrics' : '/teacher/rubrics';
  const { t } = useTranslation('landing');

  const handleSave = async (payload: any) => {
    const res = await fetch('/api/v1/rubrics', {
      method: 'POST',
      headers: authHeader(),
      body: JSON.stringify({
        title: payload.name,
        description: payload.description || '',
        criteria: payload.criteria,
        total_points: payload.criteria?.reduce((sum: number, c: any) =>
          sum + Math.max(...(c.levels || []).map((l: any) => l.score || 0), 0), 0) || 100,
      }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.detail || 'Save failed');
    }
    const data = await res.json();
    return data.id;
  };

  return (
    <ExtractionWizard
      setType="rubric"
      title={t('rubricImportPage.title', 'Import Rubric')}
      description={t('rubricImportPage.description', 'Upload a PDF or CSV containing your rubric criteria. The AI will extract each criterion, which you can review and edit before saving.')}
      onSave={handleSave}
      onComplete={() => navigate(rubricsBase)}
      onCancel={() => navigate(rubricsBase)}
    />
  );
};

export default RubricImportPage;
