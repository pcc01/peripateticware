// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LearningSession } from '@/types/session';
import SessionMonitor from '@/components/teacher/SessionMonitor';
import sessionService from '@/services/sessionService';

/**
 * TeacherSessionMonitorPage
 * Route: /teacher/sessions/:id/monitor
 *
 * Wraps the SessionMonitor component with data-fetching. Fetches the
 * LearningSession by ID from the backend, then delegates all rendering
 * to SessionMonitor (live map, geofence alerts, inquiry feed, controls).
 */
const TeacherSessionMonitorPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation(['TEACHER', 'common']);

  const [session, setSession] = useState<LearningSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    loadSession();
  }, [id]);

  const loadSession = async () => {
    if (!id) return;
    try {
      setIsLoading(true);
      const data = await sessionService.getSession(id);
      setSession(data);
    } catch (err: any) {
      console.error('[TeacherSessionMonitorPage] Failed to load session:', err);
      setError(err?.message || 'Failed to load session');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin mr-3" />
        <span className="text-gray-600">{t('common:loading')}</span>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="container mx-auto py-8 px-4">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">
          {error || 'Session not found'}
        </div>
        <button
          onClick={() => navigate('/teacher/activities')}
          className="text-green-700 hover:text-green-800 font-medium flex items-center gap-2"
        >
          ← Back to Activities
        </button>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 px-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <button
            onClick={() => navigate(-1)}
            className="text-gray-500 hover:text-gray-700 text-sm flex items-center gap-1 mb-1"
          >
            ← Back
          </button>
          <h1 className="text-2xl font-bold text-gray-900">
            {t('teacher:monitoring.title', 'Live Session Monitor')}
          </h1>
          <p className="text-gray-500 text-sm mt-1">{session.location?.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700">
            ● {t('teacher:monitoring.live', 'Live')}
          </span>
        </div>
      </div>

      <SessionMonitor session={session} />
    </div>
  );
};

export default TeacherSessionMonitorPage;
