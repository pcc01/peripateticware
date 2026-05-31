import { fmtDate, fmtDateTime, fmtTime } from '@/utils/date';
// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle, XCircle, Clock, User, FileText } from 'lucide-react';
import { useApiData, useTeacher } from '@/services/api';
import { SubmissionQueryParams } from '@/services/api';

/**
 * TeacherSubmissionsPage
 * Route: /teacher/submissions
 * Accessible from: TeacherDashboard → Navigation → "Submissions" (with badge)
 * 
 * Uses: TeacherService.getSubmissions(), approveSubmission(), rejectSubmission()
 * Functions:
 * - Display student submissions pending review
 * - View submission details with evidence
 * - Approve with feedback and score
 * - Reject with feedback
 */

export const TeacherSubmissionsPage: React.FC = () => {
  const { t } = useTranslation();
  const { getSubmissions, approveSubmission, rejectSubmission } = useTeacher();

  // State
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending_review' | 'approved' | 'rejected'>('pending_review');
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [score, setScore] = useState(4);
  const [page, setPage] = useState(0);

  // Fetch submissions
  const params: SubmissionQueryParams = {
    skip: page * 10,
    limit: 10,
    status: statusFilter === 'all' ? undefined : statusFilter
  };

  const { data: submissionsData, loading, error, refetch } = useApiData(
    () => getSubmissions(params),
    [page, statusFilter]
  );

  const selectedSubmission = submissionsData?.items.find((s) => s.id === selectedSubmissionId);

  const handleApprove = async () => {
    if (!selectedSubmissionId) return;

    try {
      await approveSubmission(selectedSubmissionId, {
        feedback: feedbackText,
        score: score
      });
      setSelectedSubmissionId(null);
      setFeedbackText('');
      setScore(4);
      refetch();
    } catch (err) {
      console.error('Approval failed:', err);
    }
  };

  const handleReject = async () => {
    if (!selectedSubmissionId) return;

    try {
      await rejectSubmission(selectedSubmissionId, feedbackText);
      setSelectedSubmissionId(null);
      setFeedbackText('');
      refetch();
    } catch (err) {
      console.error('Rejection failed:', err);
    }
  };

  return (
    <div className="flex-1 bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <h1 className="text-3xl font-bold text-gray-900">
            {t('pages.teacher.submissions.title', 'Student Submissions')}
          </h1>
          <p className="text-gray-600 mt-2">
            {t('pages.teacher.submissions.subtitle', 'Review and grade student evidence')}
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Submissions List */}
          <div className="lg:col-span-2">
            {/* Filters */}
            <div className="mb-6 flex gap-2 flex-wrap">
              {[
              { value: 'pending_review', label: 'Pending Review' },
              { value: 'approved', label: 'Approved' },
              { value: 'rejected', label: 'Rejected' },
              { value: 'all', label: 'All' }].
              map((filter) =>
              <button
                key={filter.value}
                onClick={() => {
                  setStatusFilter(filter.value as any);
                  setPage(0);
                }}
                className={`px-4 py-2 rounded-lg font-medium transition ${
                statusFilter === filter.value ?
                'bg-green-700 text-white' :
                'bg-white border text-gray-700 hover:bg-gray-50'}`
                }>
                
                  {t(`filters.submission_status.${filter.value}`, filter.label)}
                </button>
              )}
            </div>

            {loading ?
            <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-700"></div>
              </div> :
            error ?
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-red-800">{error.message}</p>
              </div> :
            submissionsData?.items && submissionsData.items.length > 0 ?
            <div className="space-y-4">
                {submissionsData.items.map((submission) =>
              <div
                key={submission.id}
                onClick={() => setSelectedSubmissionId(submission.id)}
                className={`bg-white rounded-lg p-4 cursor-pointer border-l-4 transition ${
                selectedSubmissionId === submission.id ?
                'border-green-700 bg-green-50' :
                'border-gray-200 hover:shadow-lg'}`
                }>
                
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900">
                          {submission.student_name}
                        </h3>
                        <p className="text-sm text-gray-600 mt-1">
                          {submission.activity_title}
                        </p>
                        <p className="text-xs text-gray-500 mt-2">{t("landing:phase", "Phase:")}
                      <strong>{submission.phase.toUpperCase()}</strong>
                        </p>
                        <p className="text-xs text-gray-500">{t("landing:submitted", "Submitted:")}
                      {fmtDate(submission.submitted_at)}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        {submission.status === 'pending_review' &&
                    <Clock className="w-5 h-5 text-yellow-600" title={t("landing:pending_review", "Pending Review")} />
                    }
                        {submission.status === 'approved' &&
                    <CheckCircle className="w-5 h-5 text-green-600" title={t("landing:approved", "Approved")} />
                    }
                        {submission.status === 'rejected' &&
                    <XCircle className="w-5 h-5 text-red-600" title={t("landing:rejected", "Rejected")} />
                    }
                        <span className="text-sm font-medium text-gray-700 ml-2">
                          {submission.evidence.length} {t('common.items', 'items')}
                        </span>
                      </div>
                    </div>
                  </div>
              )}
              </div> :

            <div className="text-center py-12 bg-white rounded-lg">
                <p className="text-gray-600">
                  {t('pages.teacher.submissions.empty', 'No submissions to review')}
                </p>
              </div>
            }

            {/* Pagination */}
            {submissionsData && submissionsData.total > 10 &&
            <div className="flex justify-center items-center gap-4 mt-8">
                <button
                onClick={() => setPage(Math.max(0, page - 1))}
                disabled={page === 0}
                className="px-4 py-2 border rounded-lg disabled:opacity-50 hover:bg-gray-50">{t("landing:teachersubmissionspage.previous", "Previous")}


              </button>
                <span className="text-gray-600">{t("landing:page", "Page")}
                {page + 1}{t("landing:of", "of")}{Math.ceil(submissionsData.total / 10)}
                </span>
                <button
                onClick={() => setPage(page + 1)}
                disabled={(page + 1) * 10 >= submissionsData.total}
                className="px-4 py-2 border rounded-lg disabled:opacity-50 hover:bg-gray-50">{t("landing:teachersubmissionspage.next", "Next")}


              </button>
              </div>
            }
          </div>

          {/* Detail Panel */}
          {selectedSubmission &&
          <div className="lg:col-span-1">
              <div className="bg-white rounded-lg shadow sticky top-6 p-6">
                <h2 className="font-bold text-lg text-gray-900 mb-4">
                  {t('pages.teacher.submissions.details', 'Submission Details')}
                </h2>

                {/* Student Info */}
                <div className="mb-6 pb-6 border-b">
                  <div className="flex items-center gap-2 mb-2">
                    <User className="w-5 h-5 text-gray-400" />
                    <span className="text-sm font-medium text-gray-700">
                      {selectedSubmission.student_name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-gray-400" />
                    <span className="text-sm font-medium text-gray-700">
                      {selectedSubmission.activity_title}
                    </span>
                  </div>
                </div>

                {/* Evidence */}
                <div className="mb-6 pb-6 border-b">
                  <h3 className="font-medium text-gray-900 mb-3">
                    {t('common.evidence', 'Evidence')} ({selectedSubmission.evidence.length})
                  </h3>
                  <div className="space-y-2">
                    {selectedSubmission.evidence.map((e, i) =>
                  <div key={i} className="text-sm p-2 bg-gray-50 rounded">
                        <div className="font-medium text-gray-900">{e.title}</div>
                        <div className="text-xs text-gray-600">{e.type}</div>
                      </div>
                  )}
                  </div>
                </div>

                {/* Feedback Form */}
                {selectedSubmission.status === 'pending_review' &&
              <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        {t('forms.score', 'Score')}
                      </label>
                      <div className="flex gap-1">
                        {[1, 2, 3, 4, 5].map((s) =>
                    <button
                      key={s}
                      onClick={() => setScore(s)}
                      className={`w-10 h-10 rounded font-bold transition ${
                      score === s ?
                      'bg-green-700 text-white' :
                      'bg-gray-100 text-gray-700 hover:bg-gray-200'}`
                      }>
                      
                            {s}
                          </button>
                    )}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        {t('forms.feedback', 'Feedback')}
                      </label>
                      <textarea
                    value={feedbackText}
                    onChange={(e) => setFeedbackText(e.target.value)}
                    placeholder={t("landing:provide_constructive_feedback", "Provide constructive feedback...")}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                    rows={4} />
                  
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <button
                    onClick={handleApprove}
                    className="px-4 py-2 bg-green-700 hover:bg-green-800 text-white rounded-lg font-medium flex items-center justify-center gap-2">
                    
                        <CheckCircle className="w-4 h-4" />{t("landing:approve", "Approve")}

                  </button>
                      <button
                    onClick={handleReject}
                    className="px-4 py-2 bg-red-700 hover:bg-red-800 text-white rounded-lg font-medium flex items-center justify-center gap-2">
                    
                        <XCircle className="w-4 h-4" />{t("landing:reject", "Reject")}

                  </button>
                    </div>
                  </div>
              }

                {/* Already Reviewed */}
                {selectedSubmission.status !== 'pending_review' &&
              <div className={`p-4 rounded-lg text-center ${
              selectedSubmission.status === 'approved' ?
              'bg-green-50' :
              'bg-red-50'}`
              }>
                    <p className={selectedSubmission.status === 'approved' ? 'text-green-800' : 'text-red-800'}>
                      {selectedSubmission.status === 'approved' ? '✓ Approved' : '✗ Rejected'}
                    </p>
                  </div>
              }
              </div>
            </div>
          }
        </div>
      </div>
    </div>);

};

export default TeacherSubmissionsPage;