// Copyright (c) 2026 Paul Christopher Cerda
// Shared wizard: Upload PDF/CSV → Parse → Review criteria → Save
// Used by: teacher (rubrics), admin (curriculum), homeschool (state requirements)

import React, { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

// ── Types ─────────────────────────────────────────────────────────────────

export interface Criterion {
  id: string;
  name: string;
  description: string;
  category: string;
  required: boolean;
  weight: number;
}

export interface ExtractionWizardProps {
  /** 'rubric' | 'curriculum' | 'state_reporting' */
  setType: string;
  /** Page title shown at the top */
  title: string;
  /** Short description shown on the upload step */
  description: string;
  /** Called when the user confirms the save. Return the new set ID or throw. */
  onSave: (payload: { name: string; description: string; type: string; criteria: Criterion[] }) => Promise<string>;
  /** Called after a successful save with the new set ID */
  onComplete: (id: string) => void;
  /** Called when the user cancels */
  onCancel: () => void;
}

type Step = 'upload' | 'parsing' | 'review' | 'saving' | 'done';

function authHeader(): Record<string, string> {
  const t = localStorage.getItem('auth_token');
  return t ? { Authorization: `Bearer ${t}` } : {};
}

// ── Sub-components ────────────────────────────────────────────────────────

const StepIndicator: React.FC<{ current: Step }> = ({ current }) => {
  const steps: { key: Step; label: string }[] = [
    { key: 'upload',  label: 'Upload' },
    { key: 'parsing', label: 'Parse'  },
    { key: 'review',  label: 'Review' },
    { key: 'saving',  label: 'Save'   },
  ];
  const idx = steps.findIndex(s => s.key === current);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 36 }}>
      {steps.map((s, i) => (
        <React.Fragment key={s.key}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 700, fontSize: '0.85rem',
              background: i < idx ? 'var(--primary)' : i === idx ? 'var(--primary)' : 'var(--surface-alt)',
              color: i <= idx ? 'white' : 'var(--text-muted)',
              border: i === idx ? '2px solid var(--primary)' : '2px solid transparent',
              boxShadow: i === idx ? '0 0 0 3px var(--accent-muted)' : 'none',
            }}>
              {i < idx ? '✓' : i + 1}
            </div>
            <span style={{ fontSize: '0.72rem', marginTop: 4, color: i <= idx ? 'var(--text)' : 'var(--text-muted)', fontWeight: i === idx ? 600 : 400 }}>
              {s.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div style={{ flex: 2, height: 2, background: i < idx ? 'var(--primary)' : 'var(--border)', marginBottom: 20 }} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
};

// ── Main Wizard ───────────────────────────────────────────────────────────

export const ExtractionWizard: React.FC<ExtractionWizardProps> = ({
  setType, title, description, onSave, onComplete, onCancel,
}) => {
  const { t } = useTranslation('landing');
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [parseResult, setParseResult] = useState<{ criteria: Criterion[]; warnings: string[]; method: string; page_count?: number } | null>(null);
  const [criteria, setCriteria] = useState<Criterion[]>([]);
  const [setName, setSetName] = useState('');
  const [setDesc, setSetDesc] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── File selection ──────────────────────────────────────────────────
  const handleFile = (f: File) => {
    setFile(f);
    setSetName(f.name.replace(/\.[^.]+$/, ''));
    setError(null);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, []);

  // ── Parse ───────────────────────────────────────────────────────────
  const handleParse = async () => {
    if (!file) return;
    setStep('parsing');
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('set_type', setType);
      form.append('name', setName);

      const res = await fetch('/api/v1/standards/upload', {
        method: 'POST',
        headers: authHeader(),
        body: form,
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail || `Upload failed (${res.status})`);
      }
      const data = await res.json();
      setParseResult(data);
      setCriteria(data.criteria || []);
      setStep('review');
    } catch (e: any) {
      setError(e.message || 'Parsing failed');
      setStep('upload');
    }
  };

  // ── Criterion editing ───────────────────────────────────────────────
  const updateCriterion = (idx: number, field: keyof Criterion, value: any) => {
    setCriteria(prev => prev.map((c, i) => i === idx ? { ...c, [field]: value } : c));
  };

  const removeCriterion = (idx: number) => {
    setCriteria(prev => prev.filter((_, i) => i !== idx));
  };

  const addCriterion = () => {
    setCriteria(prev => [...prev, {
      id: `custom-${Date.now()}`,
      name: 'New Criterion',
      description: '',
      category: 'General',
      required: true,
      weight: 1.0,
    }]);
  };

  // ── Save ────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!setName.trim()) { setError('Please enter a name for this set.'); return; }
    if (criteria.length === 0) { setError('Add at least one criterion before saving.'); return; }
    setStep('saving');
    setError(null);
    try {
      const id = await onSave({ name: setName, description: setDesc, type: setType, criteria });
      setSavedId(id);
      setStep('done');
    } catch (e: any) {
      setError(e.message || 'Save failed');
      setStep('review');
    }
  };

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: 'var(--font-body)', maxWidth: 780, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <button onClick={onCancel} style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontWeight: 500 }}>← Back</button>
        <h1 style={{ fontFamily: 'var(--font-head)', margin: 0, flex: 1 }}>{title}</h1>
      </div>

      <StepIndicator current={step} />

      {error && (
        <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: 10, padding: '12px 16px', marginBottom: 20, color: '#be123c', fontSize: '0.9rem', display: 'flex', justifyContent: 'space-between' }}>
          {error}
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#be123c', fontWeight: 700 }}>✕</button>
        </div>
      )}

      {/* ── Step: Upload ─────────────────────────────────────────────── */}
      {step === 'upload' && (
        <div>
          <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>{description}</p>

          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            style={{
              border: `2px dashed ${dragging ? 'var(--primary)' : 'var(--border)'}`,
              borderRadius: 14, padding: '48px 24px', textAlign: 'center', cursor: 'pointer',
              background: dragging ? 'var(--accent-muted)' : 'var(--surface)',
              transition: 'all 0.15s',
              marginBottom: 24,
            }}
          >
            <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📄</div>
            {file ? (
              <>
                <div style={{ fontWeight: 600, color: 'var(--text)' }}>{file.name}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: 4 }}>
                  {(file.size / 1024).toFixed(0)} KB · Click to change
                </div>
              </>
            ) : (
              <>
                <div style={{ fontWeight: 600, color: 'var(--text)' }}>Drop a file here or click to browse</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: 4 }}>PDF or CSV · Max 10 MB</div>
              </>
            )}
          </div>
          <input ref={fileRef} type="file" accept=".pdf,.csv,.xlsx" aria-label="Upload file (PDF, CSV, or Excel)" style={{ display: 'none' }} onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />

          {file && (
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>{t('components_shared_extractionwizard.set_name', 'Set name')}</label>
              <input value={setName} onChange={e => setSetName(e.target.value)}
              aria-label="Criteria set name"
                style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', fontSize: '0.95rem', boxSizing: 'border-box' }} />
            </div>
          )}

          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button onClick={onCancel} style={{ padding: '10px 24px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontWeight: 500 }}>Cancel</button>
            <button onClick={handleParse} disabled={!file}
              style={{ padding: '10px 28px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: 'white', fontWeight: 600, cursor: file ? 'pointer' : 'not-allowed', opacity: file ? 1 : 0.5 }}>
              Parse Document →
            </button>
          </div>
        </div>
      )}

      {/* ── Step: Parsing ────────────────────────────────────────────── */}
      {step === 'parsing' && (
        <div style={{ textAlign: 'center', padding: '64px 0' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 16 }}>🔍</div>
          <h2 style={{ fontFamily: 'var(--font-head)', marginBottom: 8 }}>{t('components_shared_extractionwizard.analysing_document', 'Analysing document…')}</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: 32 }}>{t('components_shared_extractionwizard.the_ai_is_extracting_criteria_from_your_', 'The AI is extracting criteria from your file. This may take 10–30 seconds.')}</p>
          <div style={{ width: 48, height: 48, border: '4px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
        </div>
      )}

      {/* ── Step: Review ─────────────────────────────────────────────── */}
      {step === 'review' && (
        <div>
          {parseResult && (
            <div style={{ background: 'var(--surface-alt)', borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: '0.82rem', color: 'var(--text-muted)', display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              <span>Method: <strong>{parseResult.method}</strong></span>
              {parseResult.page_count && <span>Pages: <strong>{parseResult.page_count}</strong></span>}
              <span>Criteria found: <strong>{criteria.length}</strong></span>
              {parseResult.warnings?.map((w, i) => <span key={i} style={{ color: '#b45309' }}>⚠ {w}</span>)}
            </div>
          )}

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>Set name <span style={{ color: 'var(--error, red)' }}>*</span></label>
            <input value={setName} onChange={e => setSetName(e.target.value)}
              aria-label="Criteria set name"
              style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', fontSize: '0.95rem', boxSizing: 'border-box', marginBottom: 12 }} />
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>{t('components_shared_extractionwizard.description', 'Description')}</label>
            <textarea value={setDesc} onChange={e => setSetDesc(e.target.value)} rows={2}
              style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', fontSize: '0.9rem', boxSizing: 'border-box', resize: 'vertical' }} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0 }}>Criteria ({criteria.length})</h3>
            <button onClick={addCriterion} style={{ padding: '6px 16px', borderRadius: 8, border: '1px solid var(--primary)', color: 'var(--primary)', background: 'transparent', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}>+ Add</button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
            {criteria.length === 0 && (
              <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)', background: 'var(--surface-alt)', borderRadius: 10 }}>
                No criteria extracted. Try a different file or add them manually.
              </div>
            )}
            {criteria.map((c, i) => (
              <div key={c.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                  <div>
                    <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('components_shared_extractionwizard.name', 'Name')}</label>
                    <input value={c.name} onChange={e => updateCriterion(i, 'name', e.target.value)} aria-label={`Criterion ${i + 1} name`}
                      style={{ display: 'block', width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: '0.88rem', boxSizing: 'border-box', marginTop: 3 }} />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('components_shared_extractionwizard.category', 'Category')}</label>
                    <input value={c.category} onChange={e => updateCriterion(i, 'category', e.target.value)} aria-label={`Criterion ${i + 1} category`}
                      style={{ display: 'block', width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: '0.88rem', boxSizing: 'border-box', marginTop: 3 }} />
                  </div>
                </div>
                <div style={{ marginBottom: 10 }}>
                  <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('components_shared_extractionwizard.description', 'Description')}</label>
                  <textarea value={c.description} onChange={e => updateCriterion(i, 'description', e.target.value)} rows={2}
                    style={{ display: 'block', width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: '0.85rem', boxSizing: 'border-box', marginTop: 3, resize: 'vertical' }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={c.required} onChange={e => updateCriterion(i, 'required', e.target.checked)} aria-label={`Criterion ${i + 1} is required`} />
                    Required
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem' }}>
                    Weight:
                    <input type="number" value={c.weight} min={0.1} max={10} step={0.1} onChange={e => updateCriterion(i, 'weight', parseFloat(e.target.value))} aria-label={`Criterion ${i + 1} weight`}
                      style={{ width: 60, padding: '4px 6px', borderRadius: 6, border: '1px solid var(--border)', fontSize: '0.82rem' }} />
                  </label>
                  <button onClick={() => removeCriterion(i)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#be123c', cursor: 'pointer', fontSize: '0.8rem' }}>Remove</button>
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button onClick={() => setStep('upload')} style={{ padding: '10px 24px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontWeight: 500 }}>← Re-upload</button>
            <button onClick={handleSave} disabled={criteria.length === 0}
              style={{ padding: '10px 28px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: 'white', fontWeight: 600, cursor: criteria.length > 0 ? 'pointer' : 'not-allowed', opacity: criteria.length > 0 ? 1 : 0.5 }}>
              Save {criteria.length} Criteria →
            </button>
          </div>
        </div>
      )}

      {/* ── Step: Saving ─────────────────────────────────────────────── */}
      {step === 'saving' && (
        <div style={{ textAlign: 'center', padding: '64px 0' }}>
          <div style={{ width: 48, height: 48, border: '4px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 24px' }} />
          <p style={{ color: 'var(--text-muted)' }}>{t('components_shared_extractionwizard.saving_your_criteria_set', 'Saving your criteria set…')}</p>
        </div>
      )}

      {/* ── Step: Done ───────────────────────────────────────────────── */}
      {step === 'done' && (
        <div style={{ textAlign: 'center', padding: '48px 24px' }}>
          <div style={{ fontSize: '3rem', marginBottom: 16 }}>✅</div>
          <h2 style={{ fontFamily: 'var(--font-head)', marginBottom: 8 }}>"{setName}" saved</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: 32 }}>
            {criteria.length} criteria saved successfully.
          </p>
          <button onClick={() => savedId && onComplete(savedId)}
            style={{ padding: '12px 32px', borderRadius: 10, border: 'none', background: 'var(--primary)', color: 'white', fontWeight: 600, fontSize: '1rem', cursor: 'pointer' }}>
            Done
          </button>
        </div>
      )}
    </div>
  );
};

export default ExtractionWizard;
