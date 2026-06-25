import { fmtDate, fmtDateTime, fmtTime } from '@/utils/date';
// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle, XCircle, Clock, User, FileText, PenLine, Eye } from 'lucide-react';
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
  const { getSubmissions, approveSubmission, rejectSubmission, reviewFieldPhase, getSubmissionDetail } = useTeacher();

  // State
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending_review' | 'approved' | 'rejected'>('pending_review');
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [score, setScore] = useState(4);
  const [page, setPage] = useState(0);
  // Field review state
  const [fieldReviewMode, setFieldReviewMode] = useState(false);
  const [fieldFeedback, setFieldFeedback] = useState('');
  const [fieldActionPending, setFieldActionPending] = useState(false);

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

  // API returns TeacherSubmission[] directly; guard against paginated shape if backend changes
  const submissions: any[] = Array.isArray((submissionsData as any)?.items)
    ? (submissionsData as any).items
    : Array.isArray(submissionsData)
    ? (submissionsData as any[])
    : [];
  const selectedSubmission = submissions.find((s: any) => s.id === selectedSubmissionId);

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

  const handleFieldReview = async (approve?: boolean, reject?: boolean) => {
    if (!selectedSubmissionId) return;
    setFieldActionPending(true);
    try {
      await reviewFieldPhase(selectedSubmissionId, {
        feedback: fieldFeedback,
        approve,
        reject,
      });
      setFieldReviewMode(false);
      setFieldFeedback('');
      refetch();
    } catch (err) {
      console.error('Field review failed:', err);
    } finally {
      setFieldActionPending(false);
    }
  };

  // Helper: phase badge for submission list items
  const PhaseBadge = ({ s }: { s: any }) => {
    if (!s.completion_mode || s.completion_mode === 'field_only') return null;
    if (s.completion_phase === 'field_work' && s.field_phase_status === 'submitted') {
      return (
        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
          🏕️ Field Work Ready
        </span>
      );
    }
    if (s.completion_phase === 'reflection') {
      return (
        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">
          <PenLine className="w-3 h-3" /> Reflection Phase
        </span>
      );
    }
    return null;
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
                <p className="text-red-800">{error}</p>
              </div> :
            submissions.length > 0 ?
            <div className="space-y-4">
                {submissions.map((submission: any) =>
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
                      <strong>{submission.phase?.toUpperCase?.() ?? '—'}</strong>
                        </p>
                        <div className="mt-1"><PhaseBadge s={submission} /></div>
                        <p className="text-xs text-gray-500">{t("landing:submitted", "Submitted:")}
                      {fmtDate(submission.submitted_at)}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        {submission.status === 'pending_review' &&
                    <Clock className="w-5 h-5 text-yellow-600" aria-label={t("landing:pending_review", "Pending Review")} />
                    }
                        {submission.status === 'approved' &&
                    <CheckCircle className="w-5 h-5 text-green-600" aria-label={t("landing:approved", "Approved")} />
                    }
                        {submission.status === 'rejected' &&
                    <XCircle className="w-5 h-5 text-red-600" aria-label={t("landing:rejected", "Rejected")} />
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
            {submissionsData && (submissionsData?.total ?? submissions.length) > 10 &&
            <div className="flex justify-center items-center gap-4 mt-8">
                <button
                onClick={() => setPage(Math.max(0, page - 1))}
                disabled={page === 0}
                className="px-4 py-2 border rounded-lg disabled:opacity-50 hover:bg-gray-50">{t("landing:teachersubmissionspage.previous", "Previous")}


              </button>
                <span className="text-gray-600">{t("landing:page", "Page")}
                {page + 1}{t("landing:of", "of")}{Math.ceil((submissionsData?.total ?? submissions.length) / 10)}
                </span>
                <button
                onClick={() => setPage(page + 1)}
                disabled={(page + 1) * 10 >= (submissionsData?.total ?? submissions.length)}
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

                {/* Field Work Review Panel — shown for Field + Reflection activities */}
                {selectedSubmission.completion_mode === 'field_and_reflection' &&
                 selectedSubmission.completion_phase === 'field_work' && (
                  <div className="mb-6 pb-6 border-b">
                    <h3 className="font-medium text-gray-900 mb-2 flex items-center gap-2">
                      🏕️ Field Work Review
                      {selectedSubmission.field_phase_status === 'reviewed' && (
                        <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">✓ Reviewed</span>
                      )}
                      {selectedSubmission.field_phase_status === 'approved' && (
                        <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">✓ Approved</span>
                      )}
                    </h3>
                    <p className="text-xs text-gray-500 mb-3">
                      The student has completed their field work. Leave feedback and optionally
                      {selectedSubmission.require_field_approval
                        ? ' approve to unlock the reflection phase.'
                        : ' the student can already start reflecting.'}
                    </p>
                    {!fieldReviewMode ? (
                      <button
                        onClick={() => { setFieldReviewMode(true); setFieldFeedback(selectedSubmission.field_phase_feedback || ''); }}
                        className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium flex items-center gap-2"
                      >
                        🏕️ Review Field Work
                      </button>
                    ) : (
                      <div className="space-y-3">
                        <textarea
                          value={fieldFeedback}
                          onChange={(e) => setFieldFeedback(e.target.value)}
                          placeholder="Comment on the field observations, evidence quality, or what to focus on in the reflection..."
                          className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                          rows={3}
                        />
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => handleFieldReview(false, false)}
                            disabled={fieldActionPending}
                            className="px-3 py-1.5 bg-gray-600 hover:bg-gray-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                          >
                            💬 Send Feedback
                          </button>
                          {selectedSubmission.require_field_approval && (
                            <button
                              onClick={() => handleFieldReview(true, false)}
                              disabled={fieldActionPending}
                              className="px-3 py-1.5 bg-green-700 hover:bg-green-800 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                            >
                              ✓ Approve + Unlock Reflection
                            </button>
                          )}
                          <button
                            onClick={() => handleFieldReview(false, true)}
                            disabled={fieldActionPending}
                            className="px-3 py-1.5 bg-red-700 hover:bg-red-800 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                          >
                            ✗ Send Back
                          </button>
                          <button
                            onClick={() => setFieldReviewMode(false)}
                            className="px-3 py-1.5 border rounded-lg text-sm text-gray-600 hover:bg-gray-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                    {selectedSubmission.field_phase_feedback && !fieldReviewMode && (
                      <div className="mt-3 text-xs text-gray-600 bg-amber-50 border border-amber-200 rounded-lg p-2">
                        <span className="font-medium">Your feedback: </span>{selectedSubmission.field_phase_feedback}
                      </div>
                    )}
                  </div>
                )}

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