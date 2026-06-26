// Copyright (c) 2026 Paul Christopher Cerda
// Admin: import curriculum standards from PDF or CSV
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ExtractionWizard } from '@/components/shared/ExtractionWizard';

function authHeader() {
  const t = localStorage.getItem('auth_token');
  return t ? { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` } : { 'Content-Type': 'application/json' };
}

export const CurriculumImportPage: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation('landing');

  const handleSave = async (payload: any) => {
    const res = await fetch('/api/v1/standards', {
      method: 'POST',
      headers: authHeader(),
      body: JSON.stringify({ ...payload, type: 'state_standards', is_global: true }),
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
      setType="state_standards"
      title={t('curriculumImportPage.title', 'Import State Academic Standards')}
      description={t('curriculumImportPage.description', 'Upload a PDF or CSV of official state academic standards (TEKS, NGSS, Common Core, etc.). Ollama extracts each standard for review. Once saved as a global set, all teachers and homeschool parents can map their activities against these standards. Re-uploading the same file skips processing (checksum cache).')}
      onSave={handleSave}
      onComplete={() => navigate('/admin/standards')}
      onCancel={() => navigate('/admin/standards')}
    />
  );
};
export default CurriculumImportPage;
