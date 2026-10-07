// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { inferenceService } from '@/services/inferenceService';
import type { RagDocument } from '@/types/api';
import styles from './ActivityWizard.module.css';

export interface PickedStandard { code: string; text: string }
export type PickedStandards = Record<string, PickedStandard>;

interface Suggestion {
  id: string;            // standards_items id (what seed_standard_ids takes)
  code: string;
  text: string;
  outcomeHits: number[]; // 1-based indexes of outcomes whose wording overlaps
  jurisdictionCode: string | null; // e.g. "WI" -- the state this standard actually belongs to
  jurisdictionName: string | null; // e.g. "Wisconsin", or an org name like "WIDA"
}

interface SuggestedStandardsProps {
  /** Fetch only while an assessment-related step is showing. */
  active: boolean;
  subject: string;
  grade: number;
  /** Two-letter state, from the teacher's profile (may be empty). */
  stateCode: string;
  stateLocked: boolean;
  onStateChange: (code: string) => void;
  outcomes: string[];
  title: string;
  picked: PickedStandards;
  onPickedChange: (next: PickedStandards) => void;
  /** Reports how many suggestions matched an outcome's wording. */
  onMatchCount: (n: number) => void;
}

const STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];

const STOP = new Set(['students', 'student', 'will', 'able', 'with', 'that', 'this', 'from', 'about', 'their', 'using', 'use', 'and', 'the', 'for']);
const tokens = (s: string) => (s.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter(w => !STOP.has(w));

function toSuggestion(doc: RagDocument, outcomes: string[]): Suggestion | null {
  if (doc.node_type !== 'standards_item' || !doc.node_id) return null;
  const meta = (doc.metadata ?? {}) as Record<string, unknown>;
  const code = String(meta.human_coding_scheme ?? meta.criterion_id ?? '');
  const text = (doc.content ?? '').trim();
  const body = new Set(tokens(text));
  const outcomeHits: number[] = [];
  outcomes.forEach((o, i) => { if (tokens(o).some(w => body.has(w))) outcomeHits.push(i + 1); });
  return {
    id: doc.node_id, code, text, outcomeHits,
    jurisdictionCode: (meta.jurisdiction_code as string) || null,
    jurisdictionName: (meta.jurisdiction_name as string) || null,
  };
}

/** Small pill showing which state/org a standard actually belongs to --
 * highlighted when it matches the teacher's own state, muted otherwise, so
 * two same-looking results aren't silently from different states. */
function JurisdictionBadge({ s, myState }: { s: Suggestion; myState: string }) {
  if (!s.jurisdictionName) return null;
  const mine = !!myState && s.jurisdictionCode === myState;
  return (
    <span
      title={mine ? 'Matches your state' : undefined}
      style={{
        fontSize: '0.68rem', fontWeight: 700, padding: '1px 7px', borderRadius: 20,
        background: mine ? '#dcfce7' : '#f1f5f9',
        color: mine ? '#15803d' : '#64748b',
        whiteSpace: 'nowrap',
      }}
    >
      {mine ? '✓ ' : ''}{s.jurisdictionCode || s.jurisdictionName}
    </span>
  );
}

/**
 * Standards suggested from grade, state, subject and the activity's outcomes
 * (via the same /inference/rag-retrieve standards search the "+ Add a standard"
 * box uses). Strong matches are pre-selected; the teacher can uncheck any.
 * Picks are held by the parent and sent as seed_standard_ids when the
 * activity is created, which approves them as alignments.
 */
export const SuggestedStandards: React.FC<SuggestedStandardsProps> = ({
  active, subject, grade, stateCode, stateLocked, onStateChange, outcomes, title, picked, onPickedChange, onMatchCount,
}) => {
  const { t } = useTranslation('landing');
  const [items, setItems] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // True when a state filter came back thin and this list fell back to an
  // unfiltered (all-states) search instead -- shown so "why do I see other
  // states" has a visible answer instead of looking like the filter didn't work.
  const [broadenedSearch, setBroadenedSearch] = useState(false);
  const touched = useRef(false);
  const pickedRef = useRef(picked);
  pickedRef.current = picked;
  const outcomesKey = outcomes.join('\n');

  // Search for a specific standard directly, independent of subject/grade --
  // this is what makes "start from a standard" (StartPicker's 'assessment'
  // card) actually true rather than just showing the subject/grade-driven
  // list below with nothing in it yet. Same /inference/rag-retrieve search
  // AppliedStandardsPanel's "+ Add a standard" box already uses.
  const [manualQuery, setManualQuery] = useState('');
  const [manualResults, setManualResults] = useState<Suggestion[] | null>(null);
  const [manualSearching, setManualSearching] = useState(false);
  const [manualError, setManualError] = useState('');
  const [manualBroadened, setManualBroadened] = useState(false);

  const runManualSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!manualQuery.trim()) return;
    setManualSearching(true);
    setManualError('');
    setManualBroadened(false);
    try {
      let res = await inferenceService.ragRetrieve(manualQuery, { topK: 8, sourceType: 'standards', stateCode });
      let broadened = false;
      if (stateCode && (res.documents?.length ?? 0) < 3) {
        res = await inferenceService.ragRetrieve(manualQuery, { topK: 8, sourceType: 'standards' });
        broadened = true;
      }
      const seen = new Set<string>();
      setManualResults(
        (res.documents ?? [])
          .map(d => toSuggestion(d, outcomes))
          .filter((s): s is Suggestion => !!s && !seen.has(s.id) && !!seen.add(s.id)),
      );
      setManualBroadened(broadened);
    } catch {
      setManualError(t('components_teacher_activitywizard.standards_error', 'Could not load standard suggestions. You can add standards after saving.'));
      setManualResults([]);
    } finally {
      setManualSearching(false);
    }
  };

  const query = useMemo(() => {
    const parts = [subject, `grade ${grade}`, stateCode, 'standards'];
    const body = outcomes.length ? outcomes.join('; ') : title;
    return `${parts.filter(Boolean).join(' ')}: ${body}`.slice(0, 500);
    // eslint-disable-next-line
  }, [subject, grade, stateCode, outcomesKey, title]);

  // A new grade/state/subject is a new question: forget earlier unchecking.
  useEffect(() => { touched.current = false; }, [subject, grade, stateCode]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError('');
      setBroadenedSearch(false);
      try {
        // Filter to the teacher's own state when one is set -- not just a
        // badge: this is what keeps a handful of real matches from your
        // state getting buried under a longer list of same-looking results
        // from elsewhere. But a strict filter can legitimately come back
        // thin (or empty) for a state/topic combo with shallow coverage --
        // confirmed happens in practice -- so a weak filtered result falls
        // back to an unfiltered search rather than showing an almost-empty
        // list and leaving the teacher to guess why.
        let res = await inferenceService.ragRetrieve(query, { topK: 8, sourceType: 'standards', stateCode });
        let broadened = false;
        if (stateCode && (res.documents?.length ?? 0) < 3) {
          res = await inferenceService.ragRetrieve(query, { topK: 8, sourceType: 'standards' });
          broadened = true;
        }
        if (cancelled) return;
        const seen = new Set<string>();
        const list = (res.documents ?? [])
          .map(d => toSuggestion(d, outcomes))
          .filter((s): s is Suggestion => !!s && !seen.has(s.id) && !!seen.add(s.id));
        setItems(list);
        setBroadenedSearch(broadened);
        onMatchCount(list.filter(s => s.outcomeHits.length > 0).length);
        if (!touched.current) {
          const next: PickedStandards = {};
          list.forEach((s, i) => { if (s.outcomeHits.length > 0 || i < 2) next[s.id] = { code: s.code, text: s.text }; });
          onPickedChange(next);
        }
      } catch {
        if (!cancelled) setError(t('components_teacher_activitywizard.standards_error', 'Could not load standard suggestions. You can add standards after saving.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 600);
    return () => { cancelled = true; clearTimeout(timer); };
    // onPickedChange/onMatchCount are stable setState wrappers in the parent.
    // eslint-disable-next-line
  }, [active, query]);

  const toggle = (s: Suggestion, on: boolean) => {
    touched.current = true;
    const next = { ...pickedRef.current };
    if (on) next[s.id] = { code: s.code, text: s.text }; else delete next[s.id];
    onPickedChange(next);
  };

  const why = (s: Suggestion) => [
    `Grade ${grade} ${subject}${stateCode ? `, ${stateCode}` : ''}`,
    s.outcomeHits.length ? `Matches outcome ${s.outcomeHits.join(', ')}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <div>
      <div className="mb-3">
        <label htmlFor="wizard-state" className="block text-sm font-semibold mb-1">{t('components_teacher_activitywizard.state', 'State')}</label>
        {stateCode && (
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted, #64748b)', marginBottom: 4 }}>
            📍 {t('components_teacher_activitywizard.state_context', "Standards below are filtered to {{state}}. If {{state}} doesn't have enough matches for a search, we'll show other states too and say so.", { state: stateCode })}
          </p>
        )}
        {stateLocked ? (
          <p className="text-sm">{stateCode || t('components_teacher_activitywizard.state_not_set', 'Not set by your administrator')}</p>
        ) : (
          <select id="wizard-state" value={stateCode} onChange={e => onStateChange(e.target.value)} className="px-3 py-2 border rounded-lg" style={{ minHeight: 44 }}>
            <option value="">{t('components_teacher_activitywizard.any_state', 'Any state')}</option>
            {STATES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
      </div>

      <div style={{ marginBottom: 16, border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
        <label htmlFor="wizard-standard-search" className="block text-sm font-semibold mb-1">
          {t('components_teacher_activitywizard.search_standards', 'Search for a standard')}
        </label>
        {/* A plain div, not <form> -- this whole wizard is already one
            outer <form> (ActivityManager.tsx's handleSubmit); nesting a
            second <form> here is invalid HTML and the browser routes its
            submit button's click to the OUTER form instead, firing
            handleSubmit early. type="button" + Enter-key handling gets the
            same UX without that. */}
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            id="wizard-standard-search"
            value={manualQuery}
            onChange={e => setManualQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); runManualSearch(); } }}
            placeholder={t('components_teacher_activitywizard.search_standards_placeholder', 'e.g. "fraction equivalence" or a standard code…')}
            style={{ flex: 1, minWidth: 0, padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: '0.875rem' }}
          />
          <button type="button" onClick={() => runManualSearch()} disabled={manualSearching || !manualQuery.trim()}
            style={{ padding: '8px 16px', borderRadius: 6, background: 'var(--primary)', color: 'white', border: 'none', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', opacity: manualSearching ? 0.6 : 1 }}>
            {manualSearching ? '…' : t('components_teacher_activitywizard.search', 'Search')}
          </button>
        </div>
        {manualError && <p className={styles.fieldError} role="alert">{manualError}</p>}
        {manualResults && manualResults.length === 0 && !manualSearching && (
          <p className={styles.hint}>{t('components_teacher_activitywizard.no_results', 'No matches.')}</p>
        )}
        {manualBroadened && manualResults && manualResults.length > 0 && (
          <p className={styles.hint}>
            {t('components_teacher_activitywizard.broadened_search', "{{state}} didn't have enough matches for this search — showing other states too.", { state: stateCode })}
          </p>
        )}
        {manualResults && manualResults.length > 0 && (
          <div role="group" aria-label={t('components_teacher_activitywizard.search_results', 'Search results')} style={{ marginTop: 8 }}>
            {manualResults.map(s => {
              const on = !!picked[s.id];
              return (
                <label key={s.id} className={`${styles.std} ${on ? styles.stdOn : ''}`}>
                  <input type="checkbox" checked={on} onChange={e => toggle(s, e.target.checked)} />
                  <span>
                    {s.code && <span className={styles.stdCode}>{s.code}</span>}
                    <JurisdictionBadge s={s} myState={stateCode} />
                    <span style={{ display: 'block', fontSize: '0.875rem' }}>{s.text.slice(0, 220)}</span>
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </div>

      <div className={styles.periPanel} style={{ marginBottom: 12 }}>
        <p style={{ margin: 0, fontSize: '0.875rem' }} aria-live="polite">
          {loading
            ? t('components_teacher_activitywizard.standards_loading', 'Peri is matching standards…')
            : t('components_teacher_activitywizard.standards_why', 'Peri matched standards for grade {{grade}} {{subject}}{{state}}{{outcomes}}.', {
                grade, subject,
                state: stateCode ? ` in ${stateCode}` : '',
                outcomes: outcomes.length ? ` and your ${outcomes.length} outcome${outcomes.length > 1 ? 's' : ''}` : '',
              })}
          {!outcomes.length && !loading && ' ' + t('components_teacher_activitywizard.standards_add_outcomes', 'Add outcomes to sharpen these matches.')}
          {broadenedSearch && !loading && ' ' + t('components_teacher_activitywizard.broadened_search', "{{state}} didn't have enough matches for this search — showing other states too.", { state: stateCode })}
        </p>
      </div>

      {error && <p className={styles.fieldError} role="alert">{error}</p>}
      <div role="group" aria-label={t('components_teacher_activitywizard.suggested_standards', 'Suggested standards')}>
        {items.map(s => {
          const on = !!picked[s.id];
          return (
            <label key={s.id} className={`${styles.std} ${on ? styles.stdOn : ''}`}>
              <input type="checkbox" checked={on} onChange={e => toggle(s, e.target.checked)} />
              <span>
                {s.code && <span className={styles.stdCode}>{s.code}</span>}
                <span className={`${styles.tag} ${styles.tagPeri}`}>{t('components_teacher_activitywizard.suggested', 'Suggested')}</span>
                <JurisdictionBadge s={s} myState={stateCode} />
                <span style={{ display: 'block', fontSize: '0.875rem' }}>{s.text.slice(0, 220)}</span>
                <span className={styles.stdWhy}>{why(s)}</span>
              </span>
            </label>
          );
        })}
      </div>
      {!loading && !error && items.length === 0 && (
        <p className={styles.hint}>{t('components_teacher_activitywizard.standards_none', 'No matches yet. Add outcomes or change the grade and subject.')}</p>
      )}
      <p className={styles.hint}>{t('components_teacher_activitywizard.standards_hint', 'Peri pre-selects the strongest matches. Uncheck any that do not fit. Selected standards are applied when you create the activity.')}</p>
    </div>
  );
};

export default SuggestedStandards;
