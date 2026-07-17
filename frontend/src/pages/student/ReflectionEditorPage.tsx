// Copyright (c) 2026 Paul Christopher Cerda
// Business Source License 1.1

/**
 * ReflectionEditorPage  —  /student/reflection/:submissionId
 *
 * Student writes their extended reflection for a Field + Reflection activity.
 * The reflection is linked to (but separate from) the field note captured
 * during the activity.
 *
 * Sections match the ExtendedWritingPanel pattern:
 *   Extended Analysis 🔬 | Personal Reflection 💭 | Connections 🔗 | Questions ❓
 *
 * Auto-saves on blur. Submit button sends for teacher review.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Save, Send, ArrowLeft, BookOpen, MessageSquare, ChevronDown, ChevronUp } from 'lucide-react';
import { useStudent } from '@/services/api';
import type { PendingReflectionItem } from '@/services/types';
import { axiosInstance } from '@/services/api';
import { useTranslation } from 'react-i18next';
import { getErrorMessage } from '@/utils/errorMessage';

// ── Section definitions ────────────────────────────────────────────────────────

const SECTION_TEMPLATES = [
  { key: 'analysis',    label: 'Extended Analysis',    emoji: '🔬', placeholder: 'Describe what you observed, measured, or discovered. What patterns did you notice? What surprised you?' },
  { key: 'reflection',  label: 'Personal Reflection',  emoji: '💭', placeholder: 'What does this mean to you? How has your thinking changed? What do you now understand that you didn\'t before?' },
  { key: 'connections', label: 'Connections',           emoji: '🔗', placeholder: 'How does this connect to other things you\'ve learned? What does it remind you of in the world outside school?' },
  { key: 'questions',   label: 'Questions',             emoji: '❓', placeholder: 'What questions does this raise for you? What would you investigate next if you could?' },
];

interface Section {
  key:     string;
  label:   string;
  emoji:   string;
  content: string;
  open:    boolean;
}

function initSections(saved?: Record<string, any> | null): Section[] {
  const sections = saved?.sections as Array<any> | undefined;
  return SECTION_TEMPLATES.map((t) => {
    const existing = sections?.find((s: any) => s.key === t.key);
    return {
      ...t,
      content: existing?.content ?? '',
      open:    existing ? (existing.content?.length > 0) : false,
    };
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ReflectionEditorPage() {
  const { t } = useTranslation('landing');
  const { submissionId } = useParams<{ submissionId: string }>();
  const navigate = useNavigate();
  const { getPendingReflections, saveReflection } = useStudent();

  const [item, setItem]       = useState<PendingReflectionItem | null>(null);
  const [sections, setSections] = useState<Section[]>(initSections());
  const [saving, setSaving]   = useState(false);
  const [submitting, setSub]  = useState(false);
  const [saved, setSaved]     = useState(false);
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(true);

  // Load submission info + existing reflection content
  useEffect(() => {
    if (!submissionId) return;
    Promise.all([
      getPendingReflections(),
      axiosInstance.get(`/activities/teacher/submissions/${submissionId}/detail`).catch(() => null),
    ]).then(([pending, detail]) => {
      const found = pending.find((p) => p.submission_id === submissionId);
      if (found) setItem(found);

      // Pre-populate sections from saved reflection_content if any
      const content = (detail as any)?.data?.reflection_content;
      if (content) {
        setSections(initSections(content));
      } else {
        // Open the first section by default
        setSections((prev) => prev.map((s, i) => ({ ...s, open: i === 0 })));
      }
    }).finally(() => setLoading(false));
  }, [submissionId]);

  const toPayload = useCallback((sects: Section[]) => ({
    v: 1,
    sections: sects.map((s) => ({ key: s.key, label: s.label, content: s.content })),
  }), []);

  const wordCount = sections.reduce((n, s) => n + (s.content.trim().split(/\s+/).filter(Boolean).length), 0);

  const handleSave = async (sects = sections) => {
    if (!submissionId) return;
    setSaving(true);
    try {
      await saveReflection(submissionId, {
        reflection_content: toPayload(sects),
        linked_field_note_id: item?.linked_field_note_id ?? undefined,
        submit: false,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError('Auto-save failed — check your connection.');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    if (!submissionId) return;
    if (wordCount < 50) {
      setError('Please write at least 50 words before submitting.');
      return;
    }
    setSub(true);
    setError('');
    try {
      await saveReflection(submissionId, {
        reflection_content: toPayload(sections),
        linked_field_note_id: item?.linked_field_note_id ?? undefined,
        submit: true,
      });
      navigate('/student', { state: { toast: 'Reflection submitted! Your teacher will review it.' } });
    } catch (e: any) {
      // e.response.data.detail can be a structured object/array, not just a
      // string — rendering it directly as a React child throws "Minified
      // React error #31" and unmounts the app. Always coerce.
      setError(getErrorMessage(e, 'Submission failed — please try again.'));
      setSub(false);
    }
  };

  const updateSection = (key: string, content: string) => {
    setSections((prev) => prev.map((s) => s.key === key ? { ...s, content } : s));
  };

  const toggleSection = (key: string) => {
    setSections((prev) => prev.map((s) => s.key === key ? { ...s, open: !s.open } : s));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Back */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-6"
      >
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full font-medium">{t('pages_student_reflectioneditorpage.field_reflection', '📝 Field + Reflection')}</span>
          {item?.reflection_status === 'in_progress' && (
            <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-medium">{t('pages_student_reflectioneditorpage.draft', 'Draft')}</span>
          )}
        </div>
        <h1 className="text-2xl font-bold text-gray-900">
          {item?.activity_title ?? 'Reflection'}
        </h1>
        {item?.subject && (
          <p className="text-gray-500 text-sm mt-1">{item.subject}</p>
        )}
      </div>

      {/* Teacher field feedback banner */}
      {item?.field_phase_feedback && (
        <div className="mb-6 bg-green-50 border border-green-200 rounded-xl p-4">
          <div className="flex items-start gap-2">
            <MessageSquare className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-green-800 mb-1">{t('pages_student_reflectioneditorpage.your_teacher_reviewed_your_field_work', 'Your teacher reviewed your field work:')}</p>
              <p className="text-sm text-green-700">{item.field_phase_feedback}</p>
            </div>
          </div>
        </div>
      )}

      {/* Instruction */}
      <div className="mb-6 bg-blue-50 border border-blue-200 rounded-xl p-4">
        <div className="flex items-start gap-2">
          <BookOpen className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-blue-800">{t('pages_student_reflectioneditorpage.use_what_you_observed_captured_and_exper', 'Use what you observed, captured, and experienced in the field. Your reflection should show your thinking — not just what happened, but what it means and what questions it opens up.')}</p>
        </div>
      </div>

      {/* Sections */}
      <div className="space-y-3 mb-8">
        {sections.map((section) => (
          <div
            key={section.key}
            className={`rounded-xl border transition-all ${
              section.open ? 'border-blue-300 shadow-sm' : 'border-gray-200'
            }`}
          >
            <button
              type="button"
              onClick={() => toggleSection(section.key)}
              className="w-full flex items-center justify-between px-4 py-3 text-left"
            >
              <span className="flex items-center gap-2 font-medium text-gray-800 text-sm">
                <span>{section.emoji}</span>
                {section.label}
                {section.content.trim().length > 0 && (
                  <span className="ml-1 text-xs text-gray-400">
                    ({section.content.trim().split(/\s+/).filter(Boolean).length} words)
                  </span>
                )}
              </span>
              {section.open
                ? <ChevronUp className="w-4 h-4 text-gray-400" />
                : <ChevronDown className="w-4 h-4 text-gray-400" />}
            </button>

            {section.open && (
              <div className="px-4 pb-4">
                <textarea
                  value={section.content}
                  onChange={(e) => updateSection(section.key, e.target.value)}
                  onBlur={() => handleSave()}
                  placeholder={(section as any).placeholder ?? ""}
                  rows={6}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-y"
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Footer actions */}
      <div className="flex items-center justify-between gap-4 bg-white border-t border-gray-200 pt-6">
        <div className="text-xs text-gray-400">
          {wordCount} words total
          {saved && <span className="ml-2 text-green-600 font-medium">{t('pages_student_reflectioneditorpage.saved', '✓ Saved')}</span>}
          {saving && <span className="ml-2 text-gray-400">{t('pages_student_reflectioneditorpage.saving', 'Saving…')}</span>}
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => handleSave()}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            Save Draft
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || wordCount < 50}
            className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
            {submitting ? 'Submitting…' : 'Submit Reflection'}
          </button>
        </div>
      </div>
      {wordCount < 50 && (
        <p className="text-xs text-gray-400 text-right mt-1">
          {50 - wordCount} more words needed to submit
        </p>
      )}
    </div>
  );
}
