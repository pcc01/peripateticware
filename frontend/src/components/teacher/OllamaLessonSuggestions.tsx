import { useTranslation } from 'react-i18next';
import React, { useState, useCallback, useEffect } from 'react';
import styles from './OllamaLessonSuggestions.module.css';

interface OllamaLessonSuggestionsProps {
  // Required context (pre-filled from parent form)
  title: string;
  taxonomyType?: string;
  taxonomyLevel?: string;
  // Optional context (pre-filled where available)
  description?: string;
  latitude?: number;
  longitude?: number;
  locationInfo?: string;
  subject?: string;
  gradeLevel?: number;
  durationMinutes?: number;
  onSuggestionSelected: (suggestion: string) => void;
}

interface Suggestion {
  title: string;
  description: string;
  cognitiveLevel: string;
}

const TAXONOMY_LABELS: Record<string, { name: string; levels: string[] }> = {
  blooms:  { name: "Bloom's Revised", levels: ['remember','understand','apply','analyze','evaluate','create'] },
  dok:     { name: "DOK (Webb's)",     levels: ['dok1','dok2','dok3','dok4'] },
  solo:    { name: 'SOLO',             levels: ['prestructural','unistructural','multistructural','relational','extended'] },
  marzano: { name: "Marzano's",        levels: ['retrieval','comprehension','analysis','knowledge_utilization'] },
};

const LEVEL_COLORS: Record<string, string> = {
  remember:'#ef4444', understand:'#f97316', apply:'#eab308',
  analyze:'#22c55e', evaluate:'#06b6d4', create:'#8b5cf6',
  dok1:'#3b82f6', dok2:'#22c55e', dok3:'#f97316', dok4:'#8b5cf6',
  prestructural:'#ef4444', unistructural:'#f97316', multistructural:'#eab308',
  relational:'#22c55e', extended:'#8b5cf6',
  retrieval:'#3b82f6', comprehension:'#22c55e', analysis:'#f97316',
  knowledge_utilization:'#8b5cf6',
};

export const OllamaLessonSuggestions = ({
  title,
  taxonomyType = 'blooms',
  taxonomyLevel = '',
  description = '',
  latitude,
  longitude,
  locationInfo = '',
  subject = '',
  gradeLevel,
  durationMinutes,
  onSuggestionSelected,
}: OllamaLessonSuggestionsProps) => {
  const { t } = useTranslation('landing');

  // Optional context fields — pre-filled from parent, editable here
  const [optSubject, setOptSubject]       = useState(subject);
  const [optGrade, setOptGrade]           = useState(gradeLevel?.toString() ?? '');
  const [optDuration, setOptDuration]     = useState(durationMinutes?.toString() ?? '');
  const [optSetting, setOptSetting]       = useState<'outdoor'|'indoor'|'field_trip'>('outdoor');
  const [optGroupSize, setOptGroupSize]   = useState('');
  const [optFocus, setOptFocus]           = useState('');

  const [suggestions, setSuggestions]     = useState<Suggestion[]>([]);
  const [isLoading, setIsLoading]         = useState(false);
  const [error, setError]                 = useState('');
  const [selected, setSelected]           = useState<Set<string>>(new Set());
  const [generated, setGenerated]         = useState(false);

  // Model selection
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel]     = useState('');
  const [modelsLoading, setModelsLoading]     = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/v1/inference/models');
        if (!r.ok) return;
        const d = await r.json();
        if (cancelled) return;
        const models: string[] = d.models ?? [];
        setAvailableModels(models);
        // Auto-select default (or first available)
        setSelectedModel(d.default ?? models[0] ?? '');
      } catch {
        // Ollama unreachable — silently proceed; fetchSuggestions will handle it
      } finally {
        if (!cancelled) setModelsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Reset to context form when the parent changes the title
  // (e.g. user types a title after opening the panel empty)
  React.useEffect(() => {
    if (title.trim() && generated && suggestions.length > 0 && 
        suggestions[0].title.includes('your activity')) {
      // Was showing generic fallbacks from an empty title — reset
      setGenerated(false);
      setSuggestions([]);
    }
  }, [title]);

  const txInfo = TAXONOMY_LABELS[taxonomyType] ?? TAXONOMY_LABELS.blooms;

  const checkHealth = async (): Promise<string> => {
    try {
      const r = await fetch('/api/v1/inference/health');
      if (!r.ok) return `Backend ${r.status}`;
      const d = await r.json();
      if (d.llm_status !== 'available') return `LLM unavailable (provider: ${d.llm_provider}, status: ${d.llm_status})`;
      return 'ok';
    } catch { return 'Backend unreachable'; }
  };

  const buildPrompt = () => {
    const locationLabel = locationInfo || (latitude && longitude ? `coordinates ${latitude?.toFixed(4)}, ${longitude?.toFixed(4)}` : 'this location');
    const parts = [
      `You are an expert outdoor and place-based education curriculum designer. You design activities that are authentic and location-specific, treating the environment as the primary text rather than a backdrop.`,
      `Generate 4 specific, varied lesson activity suggestions based on the following context.`,
      '',
      `ACTIVITY TITLE: ${title}`,
      optSubject   ? `SUBJECT: ${optSubject}` : '',
      optGrade     ? `GRADE LEVEL: Grade ${optGrade}` : '',
      optDuration  ? `DURATION: ${optDuration} minutes` : '',
      `SETTING: ${optSetting === 'field_trip' ? 'Field trip' : optSetting === 'indoor' ? 'Indoor' : 'Outdoor'}`,
      optGroupSize ? `GROUP SIZE: ${optGroupSize}` : '',
      locationInfo ? `LOCATION: ${locationInfo}` : (latitude && longitude ? `COORDINATES: ${latitude?.toFixed(4)}, ${longitude?.toFixed(4)}` : ''),
      description  ? `ACTIVITY DESCRIPTION: ${description}` : '',
      optFocus     ? `SPECIAL FOCUS: ${optFocus}` : '',
      '',
      `COGNITIVE FRAMEWORK: ${txInfo.name}`,
      taxonomyLevel ? `TARGET LEVEL: ${taxonomyLevel}` : `TARGET LEVELS: vary across ${txInfo.levels.slice(0,3).join(', ')}`,
      '',
      `For each suggestion, leverage what is UNIQUE and OBSERVABLE at ${locationLabel} — not a generic activity that could happen anywhere. Provide:`,
      `1. A concise title (6-10 words)`,
      `2. ${txInfo.name} level (use one of: ${txInfo.levels.join(', ')})`,
      `3. One sentence describing what the student concretely does, naming a specific observable feature, evidence, or measurement they will collect — written with active verbs, first person where natural ("You will…"). Avoid vague language like "explore" or "investigate broadly".`,
      '',
      `Format each as:`,
      `1. [Title] (level: X) — [description]`,
      ``,
      `Be concrete and specific to the location and subject. Vary the cognitive levels across the 4 suggestions.`,
    ].filter(Boolean).join('\n');
    return parts;
  };

  const fetchSuggestions = useCallback(async () => {
    // No title yet — stay on context form, warning already shown there
    if (!title.trim()) return;
    setIsLoading(true);
    setError('');
    try {
      // Run health check in background for diagnostics only — don't block inference
      checkHealth().then(h => {
        if (h !== 'ok') console.warn('Ollama health:', h);
      });

      const token = localStorage.getItem('auth_token');
      const response = await fetch('/api/v1/inference/inquiry', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          session_id: 'activity-builder',
          input_type: 'text',
          input_text: buildPrompt(),
          location_name: locationInfo || optSubject || 'outdoor setting',
          latitude: latitude ?? 0,
          longitude: longitude ?? 0,
          ...(selectedModel ? { model: selectedModel } : {}),
        }),
      });

      if (!response.ok) {
        let detail = '';
        try { const e = await response.json(); detail = e.detail || JSON.stringify(e); } catch {}
        throw new Error(`${response.status}: ${detail || response.statusText}`);
      }

      const data = await response.json();
      const text = data.response || data.next_question || data.content || data.text || '';
      const parsed = parseSuggestions(text);
      setSuggestions(parsed.length > 0 ? parsed : getFallbackSuggestions());
      setGenerated(true);
    } catch (err) {
      setError(`AI unavailable (${err instanceof Error ? err.message : String(err)}). Showing curated fallbacks.`);
      setSuggestions(getFallbackSuggestions());
      setGenerated(true);
    } finally {
      setIsLoading(false);
    }
  }, [title, taxonomyType, taxonomyLevel, optSubject, optGrade, optDuration, optSetting, optGroupSize, optFocus, locationInfo, latitude, longitude, selectedModel]);

  const parseSuggestions = (text: string): Suggestion[] => {
    if (!text?.trim()) return [];
    const results: Suggestion[] = [];
    const lines = text.split('\n').filter(l => l.trim());

    // Known taxonomy level words for detection
    const allLevels = [
      'remember','understand','apply','analyze','analyse','evaluate','create',
      'dok1','dok2','dok3','dok4',
      'prestructural','unistructural','multistructural','relational','extended',
      'retrieval','comprehension','analysis','knowledge_utilization','knowledge utilization',
    ];

    for (const line of lines) {
      // Skip lines that are just headers or blank
      if (line.length < 5 || /^(here are|the following|suggestions|activity|note:|for each)/i.test(line)) continue;

      // Format: "1. Title (level: X) — Description"
      let m = line.match(/^\d+[\.\)]\s*(.+?)\s*[\(\[]level[:\s]+([^\)\]]+)[\)\]]\s*[—–\-–]\s*(.+)/i);
      if (m) {
        results.push({ title: m[1].trim(), cognitiveLevel: m[2].trim().toLowerCase().replace(/\s+/g,'_'), description: m[3].trim() });
        continue;
      }
      // Format: "1. **Title** — Description (Bloom's: apply)"
      m = line.match(/^\d+[\.\)]\s*\*{0,2}(.+?)\*{0,2}\s*[—–\-–]\s*(.+)/);
      if (m) {
        const descPart = m[2];
        const lvlMatch = descPart.match(new RegExp('\\b(' + allLevels.join('|') + ')\\b', 'i'));
        results.push({
          title: m[1].trim(),
          cognitiveLevel: lvlMatch?.[1]?.toLowerCase().replace(/\s+/g,'_') ?? 'apply',
          description: descPart.replace(/[\(\[][^\)\]]*[\)\]]/g, '').trim(),
        });
        continue;
      }
      // Format: "1. Title" on one line, description may follow
      m = line.match(/^\d+[\.\)]\s*(.{10,})/);
      if (m) {
        const content = m[1];
        const lvlMatch = content.match(new RegExp('\\b(' + allLevels.join('|') + ')\\b', 'i'));
        const cleaned = content.replace(/[\(\[][^\)\]]*[\)\]]/g,'').replace(/[—–\-–].*/,'').trim();
        if (cleaned.length > 3) {
          results.push({
            title: cleaned,
            cognitiveLevel: lvlMatch?.[1]?.toLowerCase().replace(/\s+/g,'_') ?? 'apply',
            description: content.includes('—') || content.includes('–')
              ? content.split(/[—–\-–]/).slice(1).join(' ').trim() : '',
          });
        }
      }
    }
    return results.slice(0, 5);
  };

  const getFallbackSuggestions = (): Suggestion[] => [
    { title: `Observe and Document: ${title || 'Field Study'}`, cognitiveLevel: txInfo.levels[0] ?? 'remember', description: 'Students record detailed observations using sketches, notes, and photos.' },
    { title: `Compare and Classify Findings`, cognitiveLevel: txInfo.levels[1] ?? 'understand', description: 'Students sort observations into categories and identify patterns.' },
    { title: `Apply Concepts to Real Evidence`, cognitiveLevel: txInfo.levels[2] ?? 'apply', description: 'Students connect classroom concepts to what they observe at this location.' },
    { title: `Design an Investigation`, cognitiveLevel: txInfo.levels[Math.min(3, txInfo.levels.length-1)] ?? 'analyze', description: 'Students pose a question and plan a method to answer it using this location.' },
  ];

  const handleSelect = (s: Suggestion) => {
    const key = s.title;
    const next = new Set(selected);
    if (next.has(key)) { next.delete(key); } else {
      next.add(key);
      onSuggestionSelected(`${s.title}${s.description ? ` — ${s.description}` : ''}`);
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

      {/* ── Context form ──────────────────────────────────────── */}
      {!generated && (
        <div style={{ marginBottom: '1rem' }}>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
            Peri will generate suggestions for <strong style={{ color: 'var(--text)' }}>{title || '(untitled activity)'}</strong> using <strong style={{ color: 'var(--text)' }}>{txInfo.name}</strong>{taxonomyLevel ? ` at level: ${taxonomyLevel}` : ''}.
          </p>

          {/* Required — read-only summary */}
          {!title.trim() && (
            <div style={{ padding: '8px 12px', background: 'var(--surface-alt)', borderRadius: 6, marginBottom: '0.75rem', fontSize: '0.83rem', color: 'var(--text-muted)' }}>{t('components_teacher_ollamalessonsuggestions.add_an_activity_title_above_for_better_s', '⚠️ Add an activity title above for better suggestions.')}</div>
          )}

          {/* Optional fields grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', marginBottom: '0.75rem' }}>
            <div>
              <label style={labelStyle}>{t('components_teacher_ollamalessonsuggestions.subject', 'Subject')}</label>
              <input style={inputStyle} value={optSubject} onChange={e => setOptSubject(e.target.value)} placeholder={t('components_teacher_ollamalessonsuggestions.placeholder_eg_science_history', 'e.g. Science, History…')} aria-label={t('components_teacher_ollamalessonsuggestions.aria_label_subject', 'Subject')} />
            </div>
            <div>
              <label style={labelStyle}>{t('components_teacher_ollamalessonsuggestions.grade_level', 'Grade level')}</label>
              <input style={inputStyle} type="number" min={3} max={12} value={optGrade} onChange={e => setOptGrade(e.target.value)} placeholder={t('components_teacher_ollamalessonsuggestions.placeholder_eg_5', 'e.g. 5')} aria-label={t('components_teacher_ollamalessonsuggestions.aria_label_grade_level', 'Grade level')} />
            </div>
            <div>
              <label style={labelStyle}>{t('components_teacher_ollamalessonsuggestions.duration_minutes', 'Duration (minutes)')}</label>
              <input style={inputStyle} type="number" min={10} max={300} value={optDuration} onChange={e => setOptDuration(e.target.value)} placeholder={t('components_teacher_ollamalessonsuggestions.placeholder_eg_45', 'e.g. 45')} aria-label={t('components_teacher_ollamalessonsuggestions.aria_label_duration_in_minutes', 'Duration in minutes')} />
            </div>
            <div>
              <label style={labelStyle}>{t('components_teacher_ollamalessonsuggestions.group_size', 'Group size')}</label>
              <input style={inputStyle} value={optGroupSize} onChange={e => setOptGroupSize(e.target.value)} placeholder={t('components_teacher_ollamalessonsuggestions.placeholder_eg_24_students_pairs', 'e.g. 24 students, pairs…')} aria-label={t('components_teacher_ollamalessonsuggestions.aria_label_group_size', 'Group size')} />
            </div>
            <div>
              <label style={labelStyle}>{t('components_teacher_ollamalessonsuggestions.setting', 'Setting')}</label>
              <select style={inputStyle} value={optSetting} onChange={e => setOptSetting(e.target.value as any)}>
                <option value="outdoor">{t('components_teacher_ollamalessonsuggestions.outdoor', 'Outdoor')}</option>
                <option value="indoor">{t('components_teacher_ollamalessonsuggestions.indoor', 'Indoor')}</option>
                <option value="field_trip">{t('components_teacher_ollamalessonsuggestions.field_trip', 'Field trip')}</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>{t('components_teacher_ollamalessonsuggestions.special_focus_optional', 'Special focus (optional)')}</label>
              <input style={inputStyle} value={optFocus} onChange={e => setOptFocus(e.target.value)} placeholder={t('components_teacher_ollamalessonsuggestions.placeholder_eg_ell_students_stem', 'e.g. ELL students, STEM…')} aria-label={t('components_teacher_ollamalessonsuggestions.aria_label_special_focus_or_differentiation', 'Special focus or differentiation')} />
            </div>
          </div>

          {/* Model picker — shown when Ollama has models */}
          {!modelsLoading && availableModels.length > 0 && (
            <div style={{ marginBottom: '0.75rem' }}>
              <label style={labelStyle}>
                {availableModels.length === 1 ? 'AI Model' : 'AI Model'}
              </label>
              {availableModels.length === 1 ? (
                <div style={{ ...inputStyle, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)' }}>
                  <span style={{ fontSize: '0.8rem' }}>🤖</span>
                  <span>{availableModels[0]}</span>
                </div>
              ) : (
                <select
                  style={inputStyle}
                  value={selectedModel}
                  onChange={e => setSelectedModel(e.target.value)}
                >
                  {availableModels.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              )}
            </div>
          )}
          {!modelsLoading && availableModels.length === 0 && (
            <div style={{ marginBottom: '0.75rem', padding: '6px 10px', background: 'var(--surface-alt)', borderRadius: 6, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              ⚠️ No Ollama models found. Run <code>ollama pull &lt;model&gt;</code> to add one.
            </div>
          )}

          <button
            onClick={fetchSuggestions}
            disabled={isLoading || (availableModels.length === 0 && !modelsLoading)}
            style={{
              padding: '8px 20px', borderRadius: 8, fontWeight: 700, fontSize: '0.9rem',
              background: 'var(--primary)', color: '#fff', border: 'none', cursor: 'pointer',
              opacity: (isLoading || (availableModels.length === 0 && !modelsLoading)) ? 0.6 : 1,
            }}>
            {isLoading ? 'Generating…' : '✨ Generate Suggestions'}
          </button>
        </div>
      )}

      {/* ── Loading ────────────────────────────────────────────── */}
      {isLoading && (
        <div className={styles.loading}>
          <div className={styles.spinner}></div>
          <p>{t('components_teacher_ollamalessonsuggestions.peri_is_thinking', 'Peri is thinking…')}</p>
        </div>
      )}

      {/* Error banner — model-aware Peri */}
      {error && (
        <div className={styles.errorBanner} style={{ marginBottom: '0.75rem' }}>
          <p style={{ fontWeight: 600 }}>⚠️ {error}</p>
        </div>
      )}

      {/* Suggestion cards */}
      {generated && suggestions.length > 0 && (
        <>
          <div className={styles.suggestionsList}>
            {suggestions.map((s, i) => (
              <div
                key={i}
                className={`${styles.suggestionCard} ${selected.has(s.title) ? styles.selected : ''}`}
                onClick={() => handleSelect(s)}
              >
                <div className={styles.suggestionHeader}>
                  <h4>{s.title}</h4>
                  <span className={styles.bloomBadge} style={{ background: LEVEL_COLORS[s.cognitiveLevel] ?? '#6b7280' }}>
                    {s.cognitiveLevel}
                  </span>
                </div>
                {s.description && <p className={styles.description}>{s.description}</p>}
                <div className={styles.selectIndicator}>
                  {selected.has(s.title) ? '✓ Added to description' : '+ Add to activity'}
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={() => { setGenerated(false); setSuggestions([]); setError(''); setSelected(new Set()); }}
              style={{ padding: '6px 14px', borderRadius: 6, fontSize: '0.82rem', background: 'var(--surface-alt)', color: 'var(--text)', border: '1px solid var(--border)', cursor: 'pointer' }}>
              ← Adjust context
            </button>
            <button
              onClick={fetchSuggestions}
              disabled={isLoading}
              style={{ padding: '6px 14px', borderRadius: 6, fontSize: '0.82rem', background: 'var(--primary)', color: '#fff', border: 'none', cursor: 'pointer', opacity: isLoading ? 0.6 : 1 }}>{t('components_teacher_ollamalessonsuggestions.regenerate', '🔄 Regenerate')}</button>
          </div>
        </>
      )}

      <div className={styles.info} style={{ marginTop: '0.75rem' }}>
        <p style={{ fontSize: '0.78rem' }}>
          💡 <strong>Tip:</strong> Click a card to add it to the activity description. Use "Adjust context" to change inputs and regenerate.
        </p>
      </div>
    </div>
  );
};
