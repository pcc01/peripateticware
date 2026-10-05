// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './ActivityWizard.module.css';
import { LibraryOutcome, useOutcomeLibrary } from './useOutcomeLibrary';
import { PaneHeader } from './Chapter';

interface OutcomesStepProps {
  /** The activity's outcomes — activities.learning_objectives, plain text. */
  objectives: string[];
  onChange: (next: string[]) => void;
  subject: string;
  grade: number;
  /** Standards Peri matched to these outcomes (shown in the coverage strip). */
  standardsMatched: number;
}

interface Row {
  key: number;
  text: string;
  level: string;
  evidence: string;
  saved: boolean;
}

export const THINKING_LEVELS = ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create'] as const;
export const EVIDENCE_TYPES = ['field_notes', 'photo', 'data_sheet', 'discussion', 'reflection'] as const;

const EVIDENCE_LABEL: Record<string, string> = {
  field_notes: 'Field notes', photo: 'Photo evidence', data_sheet: 'Data sheet', discussion: 'Discussion', reflection: 'Reflection',
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

let rowKey = 1;
const newRow = (text = '', level = 'apply', evidence = 'field_notes', saved = false): Row => ({ key: rowKey++, text, level, evidence, saved });
const sameTexts = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Outcomes step. Each outcome is written as text on the activity
 * (learning_objectives). The library holds the teacher's saved outcomes; adding
 * one COPIES its text, so editing it on an activity never changes the library.
 */
export const OutcomesStep: React.FC<OutcomesStepProps> = ({ objectives, onChange, subject, grade, standardsMatched }) => {
  const { t } = useTranslation('landing');
  const library = useOutcomeLibrary();
  const [rows, setRows] = useState<Row[]>(() => (objectives.length ? objectives.map(o => newRow(o)) : [newRow()]));
  const [onlyMatching, setOnlyMatching] = useState(true);
  const [message, setMessage] = useState('');
  const lastEmitted = useRef<string[]>(objectives);
  const lastInput = useRef<HTMLInputElement | null>(null);

  // The parent's list changes underneath us when an existing activity finishes
  // loading (or a Peri suggestion adds objectives): rebuild rows from it, but
  // never in response to our own emit.
  useEffect(() => {
    if (sameTexts(objectives, lastEmitted.current)) return;
    lastEmitted.current = objectives;
    setRows(objectives.length ? objectives.map(o => newRow(o)) : [newRow()]);
  }, [objectives]);

  const emit = (next: Row[]) => {
    const texts = next.map(r => r.text.trim()).filter(Boolean);
    lastEmitted.current = texts;
    onChange(texts);
  };
  const update = (key: number, patch: Partial<Row>) => {
    const next = rows.map(r => (r.key === key ? { ...r, ...patch } : r));
    setRows(next);
    if ('text' in patch) emit(next);
  };

  const addFromLibrary = (item: LibraryOutcome) => {
    const filled = rows.filter(r => r.text.trim());
    const next = [...filled, newRow(item.text, item.taxonomy_level ?? 'apply', item.evidence_type ?? 'field_notes', true)];
    setRows(next.length ? next : [newRow()]);
    emit(next);
    setMessage(t('components_teacher_activitywizard.outcome_added', 'Outcome added from your library.'));
  };
  const writeNew = () => {
    const next = [...rows, newRow()];
    setRows(next);
    setTimeout(() => lastInput.current?.focus(), 0);
  };
  const removeRow = (key: number) => {
    const next = rows.filter(r => r.key !== key);
    setRows(next.length ? next : [newRow()]);
    emit(next);
  };
  const saveToLibrary = async (row: Row) => {
    try {
      await library.save({
        text: row.text.trim(), subject, grade_min: grade, grade_max: grade,
        taxonomy_level: row.level, evidence_type: row.evidence,
      });
      update(row.key, { saved: true });
      setMessage(t('components_teacher_activitywizard.outcome_saved', 'Outcome saved to your library for reuse.'));
    } catch (e) {
      setMessage((e as Error).message);
    }
  };

  const usedTexts = new Set(rows.map(r => r.text.trim()));
  const visible = library.items.filter(o => {
    if (!onlyMatching) return true;
    const subjectOk = !o.subject || o.subject === subject;
    const gradeOk = (o.grade_min == null || grade >= o.grade_min) && (o.grade_max == null || grade <= o.grade_max);
    return subjectOk && gradeOk;
  });
  const written = rows.filter(r => r.text.trim());

  return (
    <>
      <PaneHeader
        stepKey="outcomes"
        title={t('components_teacher_activitywizard.outcomes_title', 'What should students be able to do?')}
        lede={t('components_teacher_activitywizard.outcomes_lede', 'Write each outcome as something observable, or reuse one from your library. Outcomes feed standards matching and the rubric.')}
      />

      <details className={styles.chapter} open>
        <summary className={styles.chapterSummary}>
          <span className={styles.chevron} aria-hidden="true">▶</span>
          <h3 className={styles.chapterTitle}>{t('components_teacher_activitywizard.library', 'Outcome library')}</h3>
          <span className={styles.badge}>{library.items.length} {t('components_teacher_activitywizard.saved', 'saved')}</span>
        </summary>
        <div className={styles.chapterBody}>
          {!library.available && (
            <p className={styles.hint}>{t('components_teacher_activitywizard.library_unavailable', 'Your outcome library could not be loaded. You can still write outcomes below.')}</p>
          )}
          <label style={{ display: 'flex', gap: 10, alignItems: 'center', minHeight: 44, marginBottom: 8 }}>
            <input type="checkbox" checked={onlyMatching} onChange={e => setOnlyMatching(e.target.checked)} style={{ width: 20, height: 20 }} />
            <span style={{ fontSize: '0.875rem' }}>
              {t('components_teacher_activitywizard.only_matching', 'Only show grade {{grade}} {{subject}}', { grade, subject })}
            </span>
          </label>
          {library.loading && <p className={styles.hint}>{t('components_teacher_activitywizard.loading', 'Loading…')}</p>}
          {!library.loading && visible.length === 0 && (
            <p className={styles.hint}>{t('components_teacher_activitywizard.library_empty', 'No saved outcomes match yet. Write one below and choose "Save to my library".')}</p>
          )}
          {visible.map(item => {
            const used = usedTexts.has(item.text);
            return (
              <div key={item.id} className={styles.libItem}>
                <div className={styles.libText}>
                  <div>{item.text}</div>
                  <div className={styles.libMeta}>
                    {[item.subject, item.grade_min != null ? `grades ${item.grade_min}-${item.grade_max ?? item.grade_min}` : null, item.taxonomy_level && cap(item.taxonomy_level)].filter(Boolean).join(', ')}
                  </div>
                </div>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnGhost} ${styles.btnSm}`}
                  disabled={used}
                  aria-label={`${used ? 'Added' : 'Add outcome'}: ${item.text}`}
                  onClick={() => addFromLibrary(item)}
                >
                  {used ? t('components_teacher_activitywizard.added', 'Added') : t('components_teacher_activitywizard.add', 'Add')}
                </button>
              </div>
            );
          })}
        </div>
      </details>

      <details className={styles.chapter} open>
        <summary className={styles.chapterSummary}>
          <span className={styles.chevron} aria-hidden="true">▶</span>
          <h3 className={styles.chapterTitle}>{t('components_teacher_activitywizard.this_activity_outcomes', "This activity's outcomes")}</h3>
          <span className={styles.badge}>{written.length} {t('components_teacher_activitywizard.written', 'written')}</span>
        </summary>
        <div className={styles.chapterBody}>
          {rows.map((row, i) => (
            <div key={row.key} className={styles.outcome}>
              <div className={styles.line}>
                <span className={styles.badge}>{i + 1}</span>
                <label className={styles.srOnly} htmlFor={`outcome-${row.key}`}>{`Outcome ${i + 1}`}</label>
                <input
                  id={`outcome-${row.key}`}
                  ref={i === rows.length - 1 ? lastInput : undefined}
                  type="text"
                  value={row.text}
                  maxLength={1000}
                  onChange={e => update(row.key, { text: e.target.value, saved: false })}
                  onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }}
                  placeholder={t('components_teacher_activitywizard.outcome_placeholder', 'Students will be able to… e.g. classify three plant species by leaf shape')}
                  className="flex-1 min-w-[200px] px-3 py-2 border rounded-lg"
                />
              </div>
              <div className={styles.line}>
                <label className={styles.hint} style={{ margin: 0 }}>
                  {t('components_teacher_activitywizard.thinking_level', 'Thinking level')}{' '}
                  <select value={row.level} onChange={e => update(row.key, { level: e.target.value })} className="px-2 py-2 border rounded-lg" style={{ minHeight: 44 }}>
                    {THINKING_LEVELS.map(l => <option key={l} value={l}>{cap(l)}</option>)}
                  </select>
                </label>
                <label className={styles.hint} style={{ margin: 0 }}>
                  {t('components_teacher_activitywizard.evidence', 'Evidence')}{' '}
                  <select value={row.evidence} onChange={e => update(row.key, { evidence: e.target.value })} className="px-2 py-2 border rounded-lg" style={{ minHeight: 44 }}>
                    {EVIDENCE_TYPES.map(v => <option key={v} value={v}>{EVIDENCE_LABEL[v]}</option>)}
                  </select>
                </label>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnGhost} ${styles.btnSm}`}
                  disabled={row.saved || !row.text.trim() || !library.available}
                  onClick={() => saveToLibrary(row)}
                >
                  {row.saved ? '✓ ' + t('components_teacher_activitywizard.in_library', 'In my library') : t('components_teacher_activitywizard.save_to_library', 'Save to my library')}
                </button>
                <button type="button" className={styles.link} onClick={() => removeRow(row.key)}>
                  {t('components_teacher_activitywizard.remove', 'Remove')}
                </button>
              </div>
            </div>
          ))}
          <button type="button" className={`${styles.btn} ${styles.btnGhost} ${styles.btnSm}`} onClick={writeNew}>
            + {t('components_teacher_activitywizard.write_new', 'Write a new outcome')}
          </button>
        </div>
      </details>

      <div className={styles.coverage} aria-live="polite">
        <div><b>{written.length}</b>{t('components_teacher_activitywizard.cov_outcomes', 'Outcomes')}</div>
        <div><b>{new Set(written.map(r => r.level)).size}</b>{t('components_teacher_activitywizard.cov_levels', 'Thinking levels')}</div>
        <div><b>{standardsMatched}</b>{t('components_teacher_activitywizard.cov_standards', 'Standards matched')}</div>
      </div>
      <div className={styles.srOnly} role="status" aria-live="polite">{message}</div>
    </>
  );
};

export default OutcomesStep;
