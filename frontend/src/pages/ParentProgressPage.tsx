import { fmtDate, fmtDateTime, fmtTime } from '@/utils/date';
// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TrendingUp, Clock, Zap, BookOpen, MessageSquare } from 'lucide-react';
import { useApiData, useParent } from '@/services/api';

/**
 * ParentProgressPage
 * Route: /parent/progress
 * Accessible from: ParentDashboard → Navigation → "Progress" or Tab selector
 * 
 * Uses: ParentService.getChildren(), getChildProgress(), getChildDigest(), getChildCompetencies()
 * Functions:
 * - Select child from dropdown
 * - View this week's metrics (activities, hours, engagement)
 * - View weekly digest from teacher
 * - View competency progress and target levels
 * - See concerns and highlights
 */

export const ParentProgressPage: React.FC = () => {
  const { t } = useTranslation();
  const { getChildren, getChildProgress, getChildDigest, getChildCompetencies } = useParent();

  // State
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'competencies' | 'digest'>('overview');

  // Fetch children
  const { data: childrenData, loading: childrenLoading } = useApiData(
    () => getChildren(),
    []
  );

  // Set first child as default
  React.useEffect(() => {
    if (!selectedChildId && childrenData && childrenData.length > 0) {
      setSelectedChildId(childrenData[0].id);
    }
  }, [childrenData, selectedChildId]);

  // Fetch progress for selected child
  const { data: progress, loading: progressLoading } = useApiData(
    () => selectedChildId ? getChildProgress(selectedChildId) : Promise.reject('No child'),
    [selectedChildId]
  );

  // Fetch digest for selected child
  const { data: digest, loading: digestLoading } = useApiData(
    () => selectedChildId ? getChildDigest(selectedChildId) : Promise.reject('No child'),
    [selectedChildId]
  );

  // Fetch competencies for selected child
  const { data: competencies, loading: competenciesLoading } = useApiData(
    () => selectedChildId ? getChildCompetencies(selectedChildId) : Promise.reject('No child'),
    [selectedChildId]
  );

  const loading = childrenLoading || progressLoading || digestLoading || competenciesLoading;

  return (
    <div className="flex-1 bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <h1 className="text-3xl font-bold text-gray-900">
            {t('pages.parent.progress.title', 'Progress Tracking')}
          </h1>
          <p className="text-gray-600 mt-2">
            {t('pages.parent.progress.subtitle', 'Monitor your child\'s learning journey')}
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Child Selector */}
        {childrenData && childrenData.length > 1 &&
        <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('forms.select_child', 'Select Child')}
            </label>
            <select
            value={selectedChildId || ''}
            onChange={(e) => setSelectedChildId(e.target.value)}
            className="px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 font-medium">
            
              {childrenData.map((child) =>
            <option key={child.id} value={child.id}>
                  {child.name} - {child.grade}
                </option>
            )}
            </select>
          </div>
        }

        {childrenLoading ? (
          <div className="flex justify-center items-center h-96">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-700"></div>
          </div>
        ) : !childrenData?.length ? (
          <div className="text-center py-20 bg-white rounded-xl border border-gray-200 mt-4">
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>👨‍👧</div>
            <h2 className="text-xl font-semibold text-gray-700 mb-2">{t('pages_parentprogresspage.no_children_linked_yet', 'No children linked yet')}</h2>
            <p className="text-gray-500 mb-4">{t('pages_parentprogresspage.link_your_childs_account_to_start_tracki', 'Link your child\'s account to start tracking their learning progress.')}</p>
            <a href="/parent/link-child" className="px-5 py-2 rounded-lg text-white font-medium" style={{ background: 'var(--primary)' }}>{t('pages_parentprogresspage.link_a_child', 'Link a child')}</a>
          </div>
        ) : loading ? (
          <div className="flex justify-center items-center h-96">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-700"></div>
          </div>
        ) : progress ?
        <div className="space-y-6">
            {/* This Week Overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Activities */}
              <div className="bg-white rounded-lg shadow p-6 border-l-4 border-blue-500">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-gray-600 text-sm font-medium">
                      {t('metrics.activities_this_week', 'Activities This Week')}
                    </p>
                    <p className="text-3xl font-bold text-gray-900 mt-2">
                      {progress.this_week.activities}
                    </p>
                  </div>
                  <BookOpen className="w-8 h-8 text-blue-500 opacity-50" />
                </div>
              </div>

              {/* Hours */}
              <div className="bg-white rounded-lg shadow p-6 border-l-4 border-green-500">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-gray-600 text-sm font-medium">
                      {t('metrics.hours_engaged', 'Hours Engaged')}
                    </p>
                    <p className="text-3xl font-bold text-gray-900 mt-2">
                      {progress.this_week.hours}
                    </p>
                  </div>
                  <Clock className="w-8 h-8 text-green-500 opacity-50" />
                </div>
              </div>

              {/* Engagement */}
              <div className="bg-white rounded-lg shadow p-6 border-l-4 border-purple-500">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-gray-600 text-sm font-medium">
                      {t('metrics.engagement_score', 'Engagement Score')}
                    </p>
                    <p className="text-3xl font-bold text-gray-900 mt-2">
                      {progress.this_week.engagement_score}%
                    </p>
                  </div>
                  <Zap className="w-8 h-8 text-purple-500 opacity-50" />
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="border-b bg-white rounded-t-lg">
              <div className="flex gap-4 px-6">
                {[
              { id: 'overview', label: 'Overview' },
              { id: 'competencies', label: 'Competencies' },
              { id: 'digest', label: 'Weekly Digest' }].
              map((tab) =>
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`py-4 font-medium border-b-2 transition ${
                activeTab === tab.id ?
                'border-purple-700 text-purple-700' :
                'border-transparent text-gray-600 hover:text-gray-900'}`
                }>
                
                    {tab.label}
                  </button>
              )}
              </div>
            </div>

            {/* Tab Content */}
            <div className="bg-white rounded-b-lg shadow p-6">
              {/* Overview Tab */}
              {activeTab === 'overview' &&
            <div className="space-y-6">
                  <div>
                    <h3 className="font-bold text-lg text-gray-900 mb-4">
                      {t('sections.child_info', 'Child Information')}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="p-4 bg-gray-50 rounded-lg">
                        <p className="text-sm text-gray-600">{t("landing:name", "Name")}</p>
                        <p className="text-lg font-medium text-gray-900">{progress.child_name}</p>
                      </div>
                      <div className="p-4 bg-gray-50 rounded-lg">
                        <p className="text-sm text-gray-600">{t("landing:parentprogresspage.grade", "Grade")}</p>
                        <p className="text-lg font-medium text-gray-900">{progress.grade}</p>
                      </div>
                      <div className="p-4 bg-gray-50 rounded-lg">
                        <p className="text-sm text-gray-600">{t("landing:school", "School")}</p>
                        <p className="text-lg font-medium text-gray-900">{progress.school}</p>
                      </div>
                    </div>
                  </div>

                  {/* Quick Stats */}
                  <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <h4 className="font-medium text-blue-900 mb-2">{t("landing:pro_tip", "\uD83D\uDCA1 Pro Tip")}</h4>
                    <p className="text-sm text-blue-800">{t("landing:regular_engagement_in_field_learning_act", "Regular engagement in field learning activities strengthens critical thinking and observational skills.")}

                </p>
                  </div>
                </div>
            }

              {/* Competencies Tab */}
              {activeTab === 'competencies' && competencies &&
            <div className="space-y-4">
                  {competencies.map((comp) =>
              <div key={comp.name} className="p-4 border rounded-lg">
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="font-medium text-gray-900">{comp.name}</h4>
                        <div className="text-right">
                          <p className="text-sm text-gray-600">{t("landing:level", "Level")}
                      {comp.level} / {comp.target_level}
                          </p>
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
                        <div
                    className="h-full bg-gradient-to-r from-purple-500 to-purple-700 transition-all"
                    style={{ width: `${comp.level / comp.target_level * 100}%` }}>
                  </div>
                      </div>

                      <p className="text-xs text-gray-500 mt-2">{t("landing:target_level", "Target: Level")}
                  {comp.target_level}
                      </p>
                    </div>
              )}
                </div>
            }

              {/* Digest Tab */}
              {activeTab === 'digest' && digest &&
            <div className="space-y-6">
                  {/* Summary */}
                  <div>
                    <h4 className="font-bold text-lg text-gray-900 mb-3">
                      {t('sections.weekly_summary', 'Weekly Summary')}
                    </h4>
                    <p className="text-gray-700 leading-relaxed">
                      {digest.summary}
                    </p>
                  </div>

                  {/* Highlights */}
                  {digest.highlights.length > 0 &&
              <div>
                      <h4 className="font-bold text-lg text-gray-900 mb-3">{t("landing:highlights", "\u2728 Highlights")}</h4>
                      <ul className="space-y-2">
                        {digest.highlights.map((h, i) =>
                  <li key={i} className="flex gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
                            <span className="text-green-600 font-bold">✓</span>
                            <span className="text-gray-800">{h}</span>
                          </li>
                  )}
                      </ul>
                    </div>
              }

                  {/* Concerns */}
                  {digest.concerns.length > 0 &&
              <div>
                      <h4 className="font-bold text-lg text-gray-900 mb-3">{t("landing:areas_for_support", "\u26A0\uFE0F Areas for Support")}</h4>
                      <ul className="space-y-2">
                        {digest.concerns.map((c, i) =>
                  <li key={i} className="flex gap-3 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                            <span className="text-yellow-600 font-bold">→</span>
                            <span className="text-gray-800">{c}</span>
                          </li>
                  )}
                      </ul>
                    </div>
              }

                  {/* Teacher Message */}
                  <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
                    <div className="flex items-start gap-3">
                      <MessageSquare className="w-5 h-5 text-purple-500 flex-shrink-0 mt-1" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">{t('pages_parentprogresspage.teacher_note', 'Teacher Note')}</p>
                        <p className="text-sm text-gray-700 mt-1">{digest?.teacher_message || 'No message this week.'}</p>
                      </div>
                    </div>
                  </div>
                </div>
              }
            </div>
          </div>
        : (
          <div className="text-center py-16 bg-white rounded-xl border border-gray-200 mt-4">
            <p className="text-gray-400">{t('pages_parentprogresspage.no_progress_data_yet_for_this_child', 'No progress data yet for this child.')}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ParentProgressPage;
