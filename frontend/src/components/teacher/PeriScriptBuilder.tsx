import { useTranslation } from 'react-i18next';
import React, { useCallback, useEffect, useState } from 'react';
import styles from './OllamaLessonSuggestions.module.css';

// PERI_OFFLINE_SPEC_v2.md section B.4 — the teacher-facing half of the
// offline-first Peri redesign. Generates/edits/approves the place-grounded
// dialogue script that ships in the student's offline cache and is walked
// by mobile/src/lib/peri/engine.ts with no network call in the field.

const STAGE_ORDER = ['orient', 'observe', 'classify', 'explain', 'connect', 'reflect'] as const;
type PeriStage = typeof STAGE_ORDER[number];

interface PeriQuestion {
  id: string;
  q: string;
  on?: string[];
  crit?: string;
}

interface PeriScript {
  v: number;
  framework?: string;
  level?: number | string | null;
  rubric?: { id: string | null; criteria?: string[] } | null;
  place?: string;
  focus?: string[];
  stages: Partial<Record<PeriStage, PeriQuestion[]>>;
  probes?: string[];
  generated_at?: string;
  source_hash?: string;
  approved?: boolean;
  level_fallback_from_bloom?: boolean;
  place_ai_generated?: boolean;
}

interface ValidationIssue {
  stage?: string | null;
  question_id?: string | null;
  code: string;
  message: string;
}

interface PeriScriptApiResponse {
  script: PeriScript | Record<string, never>;
  validation_issues: ValidationIssue[];
  is_stale: boolean;
}

interface Props {
  // Peri questions are generated server-side for a saved activity (its
  // location/subject/grade/framework/rubric already in the DB) — there's
  // nothing to generate against before the activity itself has been saved.
  activityId?: string;
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('auth_token');
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

async function readErrorDetail(res: Response): Promise<string> {
  try {
    const e = await res.json();
    return e.detail || JSON.stringify(e);
  } catch {
    return res.statusText;
  }
}

export default function PeriScriptBuilder({ activityId }: Props) {
  const { t } = useTranslation('landing');
  const K = 'components_teacher_periscriptbuilder';

  const [script, setScript] = useState<PeriScript | null>(null);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [isStale, setIsStale] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadScript = useCallback(async () => {
    if (!activityId) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/v1/activities/${activityId}/peri-script`, { headers: authHeaders() });
      if (!res.ok) throw new Error(await readErrorDetail(res));
      const data: PeriScriptApiResponse = await res.json();
      setScript(data.script && Object.keys(data.script).length > 0 ? (data.script as PeriScript) : null);
      setIssues(data.validation_issues || []);
      setIsStale(!!data.is_stale);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [activityId]);

  useEffect(() => {
    loadScript();
  }, [loadScript]);

  const generate = async () => {
    if (!activityId) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/v1/activities/${activityId}/peri-script/generate`, {
        method: 'POST',
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(await readErrorDetail(res));
      const data: PeriScriptApiResponse = await res.json();
      setScript(data.script as PeriScript);
      setIssues(data.validation_issues || []);
      setIsStale(!!data.is_stale);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const save = async (approve: boolean) => {
    if (!activityId || !script) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/v1/activities/${activityId}/peri-script`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ script: { ...script, approved: approve } }),
      });
      if (!res.ok) throw new Error(await readErrorDetail(res));
      const data: PeriScriptApiResponse = await res.json();
      setScript(data.script as PeriScript);
      setIssues(data.validation_issues || []);
      setIsStale(!!data.is_stale);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const updateQuestionText = (stage: PeriStage, index: number, text: string) => {
    if (!script) return;
    const stageQuestions = (script.stages[stage] || []).map((q, i) => (i === index ? { ...q, q: text } : q));
    // An edit un-approves the in-memory draft until the teacher explicitly
    // saves/approves again — editing an already-approved script shouldn't
    // silently keep shipping the OLD (pre-edit) wording to students between
    // keystrokes and the next save.
    setScript({ ...script, stages: { ...script.stages, [stage]: stageQuestions }, approved: false });
  };

  const issuesFor = (stage: string, id: string) =>
    issues.filter((i) => i.stage === stage && i.question_id === id);

  if (!activityId) {
    return (
      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
        {t(`${K}.save_first`, 'Save the activity first — Peri questions are generated for a saved activity.')}
      </p>
    );
  }

  const blockingIssueCount = issues.length;
  const coveredCriteria = new Set(
    Object.values(script?.stages || {}).flatMap((qs) => (qs || []).map((q) => q.crit).filter(Boolean) as string[])
  );

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3>{t(`${K}.title`, 'Offline Peri questions')}</h3>
        <p className={styles.subtitle}>
          {t(
            `${K}.subtitle`,
            'Place-grounded questions a student sees with no network call in the field. You review and approve them before any student can see them.'
          )}
        </p>
      </div>

      {error && (
        <div className={styles.errorBanner}>
          <p style={{ fontWeight: 600 }}>⚠️ {error}</p>
        </div>
      )}

      {script?.place_ai_generated && (
        <div className={styles.errorBanner} style={{ background: '#fffbeb', borderColor: '#fde68a', color: '#92610e' }}>
          🤖 {t(
            `${K}.ai_generated_place`,
            "This place's background came from the AI's general knowledge, not a verified Wikipedia/Wikidata match — review these questions for factual accuracy more carefully than usual."
          )}
        </div>
      )}

      {script?.level_fallback_from_bloom && (
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          {t(
            `${K}.level_fallback`,
            "No level was set for this activity's chosen framework, so these questions were generated from its Bloom level instead."
          )}
        </p>
      )}

      {isStale && (
        <div className={styles.errorBanner} style={{ background: '#fffbeb', borderColor: '#fde68a', color: '#92610e' }}>
          ⚠️ {t(
            `${K}.stale`,
            'This activity changed (location, subject, grade, framework, level, or rubric) since these questions were generated — regenerate to keep them in sync.'
          )}
        </div>
      )}

      <button
        type="button"
        onClick={generate}
        disabled={loading}
        style={{
          padding: '8px 20px', borderRadius: 8, fontWeight: 700, fontSize: '0.9rem',
          background: '#9333ea', color: '#fff', border: 'none', cursor: 'pointer',
          opacity: loading ? 0.6 : 1,
        }}
      >
        {loading
          ? t(`${K}.generating`, 'Generating…')
          : script
            ? t(`${K}.regenerate`, '🔄 Regenerate Peri questions')
            : t(`${K}.generate`, '✨ Generate Peri questions')}
      </button>

      {loading && (
        <div className={styles.loading}>
          <div className={styles.spinner}></div>
          <p>{t(`${K}.thinking`, 'Peri is writing questions for this place…')}</p>
        </div>
      )}

      {script && !loading && (
        <>
          <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {STAGE_ORDER.map((stage) => {
              const questions = script.stages[stage] || [];
              return (
                <div key={stage} style={{ borderTop: '1px solid var(--border)', paddingTop: '0.6rem' }}>
                  <p style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '0 0 0.4rem 0' }}>
                    {t(`${K}.stage_${stage}`, stage)}
                  </p>
                  {questions.length === 0 && (
                    <p style={{ fontSize: '0.8rem', color: '#991b1b' }}>
                      {t(`${K}.empty_stage`, 'No questions in this stage — the on-device dialogue will skip it.')}
                    </p>
                  )}
                  {questions.map((q, i) => (
                    <div key={q.id} style={{ marginBottom: '0.5rem' }}>
                      <textarea
                        value={q.q}
                        onChange={(e) => updateQuestionText(stage, i, e.target.value)}
                        rows={2}
                        style={{
                          width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderRadius: 6,
                          fontSize: '0.875rem', border: '1px solid var(--border)', background: 'var(--surface)',
                          color: 'var(--text)', fontFamily: 'inherit', resize: 'vertical',
                        }}
                      />
                      {q.crit && (
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-faint)' }}>
                          {t(`${K}.draws_evidence_for`, 'Draws evidence for: {{crit}}', { crit: q.crit })}
                        </span>
                      )}
                      {issuesFor(stage, q.id).map((issue, idx) => (
                        <p key={idx} style={{ fontSize: '0.78rem', color: '#dc2626', margin: '2px 0 0 0' }}>
                          ⚠️ {issue.message}
                        </p>
                      ))}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>

          {script.rubric?.criteria && script.rubric.criteria.length > 0 && (
            <div style={{ marginTop: '1rem' }}>
              <p style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                {t(`${K}.rubric_coverage`, 'Rubric criteria covered')}
              </p>
              <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.8rem' }}>
                {script.rubric.criteria.map((cid) => (
                  <li key={cid}>
                    {coveredCriteria.has(cid) ? '✅' : '⬜'} {cid}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
            <button
              type="button"
              onClick={() => save(false)}
              disabled={saving}
              style={{ padding: '6px 14px', borderRadius: 6, fontSize: '0.82rem', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}
            >
              {t(`${K}.save_draft`, 'Save draft')}
            </button>
            <button
              type="button"
              onClick={() => save(true)}
              disabled={saving || blockingIssueCount > 0}
              title={blockingIssueCount > 0 ? t(`${K}.fix_issues_first`, 'Fix the flagged questions before approving') : ''}
              style={{
                padding: '6px 14px', borderRadius: 6, fontSize: '0.82rem', fontWeight: 600, border: 'none', cursor: 'pointer',
                background: script.approved ? '#16a34a' : '#9333ea', color: '#fff',
                opacity: (saving || blockingIssueCount > 0) ? 0.6 : 1,
              }}
            >
              {script.approved ? t(`${K}.approved`, '✓ Approved for students') : t(`${K}.approve`, 'Approve for students')}
            </button>
          </div>

          <div className={styles.info} style={{ marginTop: '0.75rem' }}>
            <p style={{ fontSize: '0.78rem' }}>
              💡 {t(
                `${K}.tip`,
                'Only an approved script reaches students — a draft stays private to you until you approve it.'
              )}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
