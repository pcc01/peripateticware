// Copyright (c) 2026 Paul Christopher Cerda
// Teacher: import a rubric from PDF or CSV
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ExtractionWizard } from '@/components/shared/ExtractionWizard';

function authHeader() {
  const t = localStorage.getItem('auth_token');
  return t ? { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` } : { 'Content-Type': 'application/json' };
}

export const RubricImportPage: React.FC = () => {
  const navigate = useNavigate();

  const handleSave = async (payload: any) => {
    const res = await fetch('/api/v1/standards', {
      method: 'POST',
      headers: authHeader(),
      body: JSON.stringify({ ...payload, type: 'rubric' }),
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
      title="Import Rubric"
      description="Upload a PDF or CSV containing your rubric criteria. The AI will extract each criterion, which you can review and edit before saving."
      onSave={handleSave}
      onComplete={() => navigate('/teacher/rubrics')}
      onCancel={() => navigate('/teacher/rubrics')}
    />
  );
};

export default RubricImportPage;
