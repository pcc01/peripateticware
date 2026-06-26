// Copyright (c) 2026 Paul Christopher Cerda
// Business Source License 1.1

/**
 * PendingReflectionQueue
 *
 * Shows the student's queue of Field + Reflection activities where
 * field work is done but the reflection hasn't been submitted yet.
 *
 * Used on the Student Dashboard and Student Activities pages.
 * Clicking an item opens the ReflectionEditor.
 */

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PenLine, Lock, Clock, MessageSquare, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useStudent } from '@/services/api';
import type { PendingReflectionItem } from '@/services/types';

function phaseLabel(item: PendingReflectionItem, t: (key: string) => string): { label: string; color: string; icon: React.ReactNode } {
  if (item.awaiting_approval) {
    return {
      label: t('pendingReflectionQueue.awaiting_approval'),
      color: 'text-amber-700 bg-amber-50 border-amber-200',
      icon: <Lock className="w-3.5 h-3.5" />,
    };
  }
  if (item.field_phase_feedback) {
    return {
      label: t('pendingReflectionQueue.teacher_commented'),
      color: 'text-green-700 bg-green-50 border-green-200',
      icon: <MessageSquare className="w-3.5 h-3.5" />,
    };
  }
  if (item.reflection_status === 'in_progress') {
    return {
      label: t('pendingReflectionQueue.reflection_in_progress'),
      color: 'text-blue-700 bg-blue-50 border-blue-200',
      icon: <PenLine className="w-3.5 h-3.5" />,
    };
  }
  return {
    label: t('pendingReflectionQueue.ready_to_reflect'),
    color: 'text-blue-700 bg-blue-50 border-blue-200',
    icon: <PenLine className="w-3.5 h-3.5" />,
  };
}

interface Props {
  compact?: boolean;  // true = show at most 3 items with a "See all" link
}

export const PendingReflectionQueue: React.FC<Props> = ({ compact = false }) => {
  const { t } = useTranslation('landing');
  const navigate = useNavigate();
  const { getPendingReflections } = useStudent();
  const [items, setItems] = useState<PendingReflectionItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getPendingReflections()
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (items.length === 0) return null;

  const displayed = compact ? items.slice(0, 3) : items;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
          <PenLine className="w-4 h-4 text-blue-600" />
          {t('pendingReflectionQueue.section_title')}
          <span className="ml-1 px-2 py-0.5 text-xs font-bold bg-blue-600 text-white rounded-full">
            {items.length}
          </span>
        </h3>
        {compact && items.length > 3 && (
          <button
            onClick={() => navigate('/student/pending-reflection')}
            className="text-xs text-blue-600 hover:underline"
          >
            {t('pendingReflectionQueue.see_all', { count: items.length })}
          </button>
        )}
      </div>

      <div className="space-y-2">
        {displayed.map((item) => {
          const phase = phaseLabel(item, t);
          return (
            <button
              key={item.submission_id}
              onClick={() => {
                if (!item.awaiting_approval) {
                  navigate(`/student/reflection/${item.submission_id}`);
                }
              }}
              disabled={item.awaiting_approval}
              className={`w-full text-left rounded-xl border p-4 transition ${
                item.awaiting_approval
                  ? 'border-gray-200 bg-gray-50 cursor-not-allowed opacity-70'
                  : 'border-blue-200 bg-white hover:bg-blue-50 hover:border-blue-300 cursor-pointer'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 text-sm truncate">
                    {item.activity_title}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {item.subject}
                    {item.started_at && (
                      <span> · {t('pendingReflectionQueue.field_work_date', { date: new Date(item.started_at).toLocaleDateString() })}</span>
                    )}
                  </p>

                  {/* Field phase feedback preview */}
                  {item.field_phase_feedback && (
                    <div className="mt-2 text-xs text-gray-600 bg-green-50 border border-green-200 rounded-lg p-2 line-clamp-2">
                      <span className="font-medium text-green-700">{t('pendingReflectionQueue.teacher_label')}</span>
                      {item.field_phase_feedback}
                    </div>
                  )}

                  {/* Status badge */}
                  <div className={`inline-flex items-center gap-1 mt-2 px-2 py-0.5 rounded-full border text-xs font-medium ${phase.color}`}>
                    {phase.icon}
                    {phase.label}
                  </div>
                </div>

                {!item.awaiting_approval && (
                  <ChevronRight className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default PendingReflectionQueue;
