import { useTranslation } from 'react-i18next';
import React, { useCallback, useState } from 'react';
import styles from './OllamaLessonSuggestions.module.css';

export interface AcceptedSuggestion {
  title: string;
  description: string;
  learningObjectives: string[];
  bloomLevel?: number;
  marzanoLevel?: number;
  dokLevel?: number;
  soloLevel?: number;
}

interface OllamaLessonSuggestionsProps {
  // Read straight from the parent form — this panel doesn't re-collect
  // context the teacher already entered, it just reacts to it.
  subject?: string;
  gradeLevel?: number;
  taxonomyType?: string; // 'blooms' | 'dok' | 'marzano' | 'solo'
  locationName?: string;
  latitude?: number;
  longitude?: number;
  onSuggestionSelected: (suggestion: AcceptedSuggestion) => void;
  // 'horizontal' renders the suggestion cards as a scrollable row instead of
  // a stacked list — used when this panel sits in a full-width header
  // rather than a sidebar.
  layout?: 'vertical' | 'horizontal';
}

interface Suggestion {
  title: string;
  description: string;
  learningObjectives: string[];
  estimatedDurationMinutes: number;
  bloomLevel: number;
  marzanoLevel?: number;
  dokLevel?: number;
  soloLevel?: number;
  materialsNeeded: string[];
  locationContextSummary?: string;
}

const BLOOM_LABEL: Record<number, string> = {
  1: 'remember', 2: 'understand', 3: 'apply', 4: 'analyze', 5: 'evaluate', 6: 'create',
};
const LEVEL_COLORS: Record<string, string> = {
  remember: '#ef4444', understand: '#f97316', apply: '#eab308',
  analyze: '#22c55e', evaluate: '#06b6d4', create: '#8b5cf6',
};

export const OllamaLessonSuggestions = ({
  subject = '',
  gradeLevel,
  taxonomyType = 'blooms',
  locationName = '',
  latitude,
  longitude,
  onSuggestionSelected,
  layout = 'vertical',
}: OllamaLessonSuggestionsProps) => {
  const { t } = useTranslation('landing');

  const [focus, setFocus] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [generated, setGenerated] = useState(false);
  const canGenerate = subject.trim().length > 0 && !!gradeLevel;

  const mapSuggestions = (raw: any[]): Suggestion[] =>
    (raw || []).map((s: any) => ({
      title: s.title,
      description: s.description,
      learningObjectives: s.learning_objectives || [],
      estimatedDurationMinutes: s.estimated_duration_minutes,
      bloomLevel: s.bloom_level,
      marzanoLevel: s.marzano_level,
      dokLevel: s.dok_level,
      soloLevel: s.solo_level,
      materialsNeeded: s.materials_needed || [],
      locationContextSummary: s.location_context_summary,
    }));

  const fetchSuggestions = useCallback(async () => {
    if (!canGenerate) return;
    setIsLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch('/api/v1/activities/generate-suggestions/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          subject,
          grade_level: gradeLevel,
          location_name: locationName || undefined,
          location_latitude: latitude,
          location_longitude: longitude,
          taxonomy_framework: taxonomyType,
          // 3, not 4: _parse_suggestions() on the backend hard-limits to
          // suggestions[:3] regardless of how many come back — asking for
          // a 4th that's always thrown away was pure wasted generation
          // time on every single call, with zero visible effect (the 4th
          // card was never shown).
          activity_count: 3,
          additional_context: focus.trim() || undefined,
        }),
      });

      if (!response.ok || !response.body) {
        let detail = '';
        try { const e = await response.json(); detail = e.detail || JSON.stringify(e); } catch {}
        throw new Error(`${response.status}: ${detail || response.statusText}`);
      }

      // Manual SSE parsing (not EventSource — that's GET-only, and this is
      // a POST with a JSON body). Frames are separated by a blank line;
      // each complete frame's `data: ` line is one JSON event.
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let doneReceived = false;

      let streamDone = false;
      while (!streamDone) {
        const { value, done } = await reader.read();
        if (done) {
          streamDone = true;
          continue;
        }
        buffer += decoder.decode(value, { stream: true });

        let sepIndex: number;
        while ((sepIndex = buffer.indexOf('\n\n')) !== -1) {
          const frame = buffer.slice(0, sepIndex);
          buffer = buffer.slice(sepIndex + 2);
          const line = frame.split('\n').find(l => l.startsWith('data: '));
          if (!line) continue;
          const payload = JSON.parse(line.slice('data: '.length));

          if (payload.type === 'delta') {
            // Deliberately not surfaced: the model's raw output for this
            // prompt is bare JSON (no markdown, per the prompt's own
            // instructions), so streaming it to the screen just showed a
            // teacher unformatted JSON scrolling by. Still consumed here
            // (not skipped) so the response stream is drained correctly;
            // the actual UI update happens once on the terminal "done"
            // event below, same as it always did.
          } else if (payload.type === 'error') {
            throw new Error(payload.error);
          } else if (payload.type === 'done') {
            setSuggestions(mapSuggestions(payload.result?.suggestions));
            setGenerated(true);
            doneReceived = true;
          }
        }
      }

      if (!doneReceived) {
        // Connection dropped mid-stream (network blip, server restart) —
        // whatever text arrived was never parsed into real suggestions.
        throw new Error('Connection closed before Peri finished generating suggestions.');
      }
    } catch (err) {
      // No canned fallback content here — showing generic suggestions as if
      // they were AI output when generation actually failed would be its
      // own small dishonesty, the same class of problem as an unlabeled
      // AI-generated location synopsis. Show the error; the teacher can
      // retry or just write the activity manually.
      setError(err instanceof Error ? err.message : String(err));
      setSuggestions([]);
      setGenerated(true);
    } finally {
      setIsLoading(false);
    }
  }, [canGenerate, subject, gradeLevel, locationName, latitude, longitude, taxonomyType, focus]);

  const handleSelect = (s: Suggestion) => {
    const key = s.title;
    const next = new Set(selected);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
      onSuggestionSelected({
        title: s.title,
        description: s.description,
        learningObjectives: s.learningObjectives,
        bloomLevel: s.bloomLevel,
        marzanoLevel: s.marzanoLevel,
        dokLevel: s.dokLevel,
        soloLevel: s.soloLevel,
      });
    }
    setSelected(next);
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '6px 10px', borderRadius: 6, fontSize: '0.875rem',
    border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)',
    boxSizing: 'border-box' as const,
  };
  const labelStyle: React.CSSProperties = { fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 3, display: 'block' };

  return (
    <div className={styles.container}>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.6rem' }}>
        {canGenerate ? (
          <>{t('components_teacher_ollamalessonsuggestions.peri_intro', 'Peri will suggest activities for')} <strong style={{ color: 'var(--text)' }}>{subject}</strong>, {t('components_teacher_ollamalessonsuggestions.grade', 'grade')} <strong style={{ color: 'var(--text)' }}>{gradeLevel}</strong>{locationName ? <> {t('components_teacher_ollamalessonsuggestions.at', 'at')} <strong style={{ color: 'var(--text)' }}>{locationName}</strong></> : ''}.</>
        ) : (
          t('components_teacher_ollamalessonsuggestions.need_subject_grade', 'Add a subject and grade level above to get suggestions from Peri.')
        )}
      </p>

      <div style={{ marginBottom: '0.75rem' }}>
        <label style={labelStyle}>{t('components_teacher_ollamalessonsuggestions.special_focus_optional', 'Special focus (optional)')}</label>
        <input
          style={inputStyle}
          value={focus}
          onChange={e => setFocus(e.target.value)}
          placeholder={t('components_teacher_ollamalessonsuggestions.placeholder_eg_ell_students_stem', 'e.g. ELL students, STEM…')}
          aria-label={t('components_teacher_ollamalessonsuggestions.aria_label_special_focus_or_differentiation', 'Special focus or differentiation')}
        />
      </div>

      <button
        type="button"
        onClick={fetchSuggestions}
        disabled={isLoading || !canGenerate}
        style={{
          padding: '8px 20px', borderRadius: 8, fontWeight: 700, fontSize: '0.9rem',
          background: '#9333ea', color: '#fff', border: 'none', cursor: 'pointer',
          opacity: (isLoading || !canGenerate) ? 0.6 : 1,
        }}>
        {isLoading ? t('components_teacher_ollamalessonsuggestions.generating', 'Generating…') : t('components_teacher_ollamalessonsuggestions.ask_peri', '✨ Ask Peri')}
      </button>

      {isLoading && (
        <div className={styles.loading}>
          <div className={styles.spinner}></div>
          <p>{t('components_teacher_ollamalessonsuggestions.peri_is_thinking', 'Peri is thinking…')}</p>
        </div>
      )}

      {error && (
        <div className={styles.errorBanner} style={{ marginTop: '0.75rem' }}>
          <p style={{ fontWeight: 600 }}>⚠️ {error}</p>
        </div>
      )}

      {generated && suggestions.length > 0 && (
        <>
          <div className={`${styles.suggestionsList} ${layout === 'horizontal' ? styles.horizontal : ''}`} style={{ marginTop: '0.75rem' }}>
            {suggestions.map((s, i) => (
              <button
                key={i}
                type="button"
                className={`${styles.suggestionCard} ${selected.has(s.title) ? styles.selected : ''}`}
                onClick={() => handleSelect(s)}
                aria-pressed={selected.has(s.title)}
              >
                <div className={styles.suggestionHeader}>
                  <h4>{s.title}</h4>
                  <span className={styles.bloomBadge} style={{ background: LEVEL_COLORS[BLOOM_LABEL[s.bloomLevel]] ?? '#6b7280' }}>
                    {BLOOM_LABEL[s.bloomLevel] ?? `level ${s.bloomLevel}`}
                  </span>
                </div>
                {s.description && <p className={styles.description}>{s.description}</p>}
                <div className={styles.selectIndicator}>
                  {selected.has(s.title)
                    ? t('components_teacher_ollamalessonsuggestions.added', '✓ Added to activity')
                    : t('components_teacher_ollamalessonsuggestions.add_to_activity', '+ Add to activity')}
                </div>
              </button>
            ))}
          </div>
          <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={fetchSuggestions}
              disabled={isLoading}
              style={{ padding: '6px 14px', borderRadius: 6, fontSize: '0.82rem', background: '#9333ea', color: '#fff', border: 'none', cursor: 'pointer', opacity: isLoading ? 0.6 : 1 }}>
              {t('components_teacher_ollamalessonsuggestions.regenerate', '🔄 Regenerate')}
            </button>
          </div>
        </>
      )}

      <div className={styles.info} style={{ marginTop: '0.75rem' }}>
        <p style={{ fontSize: '0.78rem' }}>
          💡 <strong>{t('components_teacher_ollamalessonsuggestions.tip', 'Tip:')}</strong> {t('components_teacher_ollamalessonsuggestions.click_a_card_tip', 'Click a card to add it to your activity. Nothing is added until you click.')}
        </p>
      </div>
    </div>
  );
};
