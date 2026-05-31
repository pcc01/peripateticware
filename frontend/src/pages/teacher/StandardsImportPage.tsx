// Copyright (c) 2026 Paul Christopher Cerda
// Teacher: import discipline standards (Common Core, NGSS, state, custom)
// Scoped to the importing teacher (is_global: false).
// Used when mapping activities to learning standards.

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ExtractionWizard } from '@/components/shared/ExtractionWizard';

function authHeader() {
  const t = localStorage.getItem('auth_token');
  return t ? { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` } : { 'Content-Type': 'application/json' };
}

export const StandardsImportPage: React.FC = () => {
  const navigate = useNavigate();

  const handleSave = async (payload: any) => {
    const res = await fetch('/api/v1/standards', {
      method: 'POST',
      headers: authHeader(),
      body: JSON.stringify({
        ...payload,
        type: 'curriculum',
        is_global: false,   // scoped to this teacher only
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
      setType="curriculum"
      title="Import Learning Standards"
      description={
        'Upload a PDF or CSV of the learning standards for your discipline — ' +
        'Common Core, NGSS, state standards, or your own custom framework. ' +
        'Once saved, you can tag activities against these standards and track student coverage.'
      }
      onSave={handleSave}
      onComplete={() => navigate('/teacher/standards')}
      onCancel={() => navigate('/teacher')}
    />
  );
};

export default StandardsImportPage;
