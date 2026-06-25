// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1

/**
 * AristotelianPrompt — Block 11.5
 *
 * Fetches an observation question from GET /api/v1/aristotelian-questions
 * and surfaces it to the student during the capture / inquiry flow.
 * These questions guide evidence-based answers through observation,
 * classification, causation, and comparison.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface Question {
  id: number;
  subject: string;
  grade_band: string;
  bloom_level: string;
  observation_type: string;
  question_text: string;
  follow_up: string | null;
}

interface AristotelianPromptProps {
  /** Optional filters — pass what you know from the activity context */
  subject?: string;
  gradeBand?: string;
  bloomLevel?: string;
  /** Called when student taps the question (e.g. to pre-fill inquiry box) */
  onUseQuestion?: (text: string) => void;
}

const OBSERVATION_TYPE_EMOJI: Record<string, string> = {
  observation:    '👁',
  classification: '🗂',
  causation:      '⚡',
  comparison:     '⚖',
  measurement:    '📏',
  pattern:        '🔁',
  evidence:       '🔬',
};

const AristotelianPrompt: React.FC<AristotelianPromptProps> = ({
  subject,
  gradeBand,
  bloomLevel,
  onUseQuestion,
}) => {
  const { t } = useTranslation('landing');
  const [question, setQuestion] = useState<Question | null>(null);
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchQuestion = useCallback(async () => {
    setLoading(true);
    setShowFollowUp(false);
    try {
      const params = new URLSearchParams({ limit: '1' });
      if (subject)    params.set('subject', subject);
      if (gradeBand)  params.set('grade', gradeBand);
      if (bloomLevel) params.set('bloom', bloomLevel);

      const token = localStorage.getItem('token') || localStorage.getItem('access_token') || '';
      const res = await fetch(`/api/v1/aristotelian-questions?${params}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.questions?.length > 0) {
        setQuestion(data.questions[0]);
      }
    } catch {
      // Silently fail — this is a helper, not a core feature
    } finally {
      setLoading(false);
    }
  }, [subject, gradeBand, bloomLevel]);

  useEffect(() => {
    fetchQuestion();
  }, [fetchQuestion]);

  if (!question && !loading) return null;

  const emoji = question
    ? (OBSERVATION_TYPE_EMOJI[question.observation_type] ?? '❓')
    : '❓';

  return (
    <div className="rounded-xl border border-color-primary bg-color-bg-secondary p-4 mb-4">
      <div className="flex items-start justify-between gap-2 mb-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-color-primary opacity-70">
          Observation prompt
        </span>
        <button
          onClick={fetchQuestion}
          disabled={loading}
          title="Get a different question"
          className="text-color-primary opacity-60 hover:opacity-100 text-sm transition-opacity"
        >
          {loading ? '…' : '↻'}
        </button>
      </div>

      {loading && !question && (
        <p className="text-sm text-color-text-secondary animate-pulse">{t('components_student_aristotelianprompt.loading_prompt', 'Loading prompt…')}</p>
      )}

      {question && (
        <>
          <p className="text-base font-medium leading-snug mb-2">
            {emoji} {question.question_text}
          </p>

          {question.follow_up && (
            <>
              {!showFollowUp ? (
                <button
                  onClick={() => setShowFollowUp(true)}
                  className="text-xs text-color-primary underline hover:no-underline"
                >
                  Show follow-up
                </button>
              ) : (
                <p className="text-sm text-color-text-secondary italic border-l-2 border-color-primary pl-2 mt-1">
                  {question.follow_up}
                </p>
              )}
            </>
          )}

          {onUseQuestion && (
            <button
              onClick={() => onUseQuestion(question.question_text)}
              className="mt-3 text-xs px-3 py-1 rounded-full bg-color-primary text-white hover:opacity-90 transition-opacity"
            >
              Use this question →
            </button>
          )}
        </>
      )}
    </div>
  );
};

export default AristotelianPrompt;
