import { fmtDate, fmtDateTime, fmtTime } from '@/utils/date';
import { useTranslation } from 'react-i18next';
// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

// ============================================================================
// frontend/src/components/teacher/FieldNoteReview.tsx
// ============================================================================
// Teacher reviews student-submitted field notes and approves/rejects promotion.

import React, { useEffect, useState } from 'react';
import {
  BookOpen, CheckCircle, ChevronRight, Loader2, MapPin,
  MessageSquare, XCircle } from
'lucide-react';
import { teacherFieldNoteApi } from '../../services/phase7Api';
import type { FieldNoteListItem, FieldNote } from '../../types/phase7';

interface FieldNoteReviewProps {
  classId: string;
}

export const FieldNoteReview: React.FC<FieldNoteReviewProps> = ({ classId }) => {
  const { t } = useTranslation('landing');
  const [notes, setNotes] = useState<FieldNoteListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<FieldNote | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [approveMode, setApproveMode] = useState(false);
  const [rejectMode, setRejectMode] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'shared' | 'submitted' | ''>('submitted');

  const loadNotes = () => {
    setLoading(true);
    teacherFieldNoteApi.list({
      class_id: classId || undefined,
      status: statusFilter || undefined
    }).
    then((r) => setNotes(r.items)).
    catch(() => setError('Could not load field notes')).
    finally(() => setLoading(false));
  };

  useEffect(() => {loadNotes();}, [classId, statusFilter]);

  const openNote = async (item: FieldNoteListItem) => {
    setDetailLoading(true);
    setApproveMode(false);
    setRejectMode(false);
    setFeedback('');
    // Full detail fetch isn't exposed in teacherFieldNoteApi for simplicity —
    // we use the list item directly (teacher sees summary; full content in future sprint)
    setSelected({ ...item } as any);
    setDetailLoading(false);
  };

  const handleApprove = async () => {
    if (!selected) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await teacherFieldNoteApi.approve(selected.id, {
        feedback: feedback || undefined,
        create_as: 'activity'
      });
      setNotes((prev) => prev.filter((n) => n.id !== selected.id));
      setSelected(null);
      setApproveMode(false);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Approval failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!selected || !feedback.trim()) {
      setError('Feedback is required when rejecting');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await teacherFieldNoteApi.reject(selected.id, feedback);
      setNotes((prev) => prev.filter((n) => n.id !== selected.id));
      setSelected(null);
      setRejectMode(false);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Rejection failed');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Detail panel ──────────────────────────────────────────────────────────
  if (selected) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => setSelected(null)}
          className="text-sm text-blue-600 hover:underline">{t("landing:back_to_queue", "\u2190 Back to queue")}


        </button>

        <div className="bg-white rounded-xl border shadow-sm p-4 space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-sm font-semibold text-gray-800">{selected.title}</h3>
              <p className="text-xs text-gray-400 mt-0.5">{t("landing:fieldnotereview.status", "Status:")}
                <span className="capitalize font-medium">{selected.status}</span>
              </p>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full
              ${selected.status === 'submitted' ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700'}`}>
              {selected.status}
            </span>
          </div>

          {(selected as any).description &&
          <p className="text-sm text-gray-600">{(selected as any).description}</p>
          }

          {(selected as any).location_name &&
          <div className="flex items-center gap-1 text-xs text-gray-400">
              <MapPin className="w-3 h-3" />
              {(selected as any).location_name}
            </div>
          }

          {(selected as any).submitted_with_message &&
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-xs font-medium text-blue-800 mb-1">{t("landing:students_message", "Student's message:")}</p>
              <p className="text-sm text-blue-700">{(selected as any).submitted_with_message}</p>
            </div>
          }

          <div className="text-xs text-gray-400">
            {selected.capture_count}{t("landing:captures_attached", "captures attached")}
          </div>

          {error &&
          <div className="text-sm text-red-600 bg-red-50 rounded p-2 border border-red-200">{error}</div>
          }

          {/* Action buttons */}
          {selected.status === 'submitted' && !approveMode && !rejectMode &&
          <div className="flex gap-2 pt-2 border-t">
              <button
              onClick={() => setApproveMode(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white
                           rounded-lg hover:bg-green-700 text-sm font-medium">

              
                <CheckCircle className="w-4 h-4" />{t("landing:approve_activity", "Approve \u2192 Activity")}

            </button>
              <button
              onClick={() => setRejectMode(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-red-50 text-red-700
                           border border-red-200 rounded-lg hover:bg-red-100 text-sm">

              
                <XCircle className="w-4 h-4" />{t("landing:return_to_student", "Return to Student")}

            </button>
            </div>
          }

          {/* Approve form */}
          {approveMode &&
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 space-y-2">
              <p className="text-sm font-medium text-green-800">{t("landing:approve_and_create_draft_activity", "Approve and create draft Activity")}

            </p>
              <p className="text-xs text-green-600">{t("landing:a_draft_activity_will_be_created_from_th", "A draft Activity will be created from this note. You can edit it before publishing.")}

            </p>
              <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows={2}
              placeholder={t("landing:feedback_for_the_student_optional_but_en", "Feedback for the student (optional but encouraged)\u2026")}
              className="w-full border border-green-200 rounded px-2 py-1.5 text-sm
                           focus:outline-none focus:ring-2 focus:ring-green-300" />

            
              <div className="flex gap-2">
                <button
                onClick={handleApprove}
                disabled={submitting}
                className="px-4 py-1.5 bg-green-600 text-white rounded-lg text-sm
                             hover:bg-green-700 disabled:opacity-50">

                
                  {submitting ? 'Approving…' : 'Approve'}
                </button>
                <button onClick={() => setApproveMode(false)}
              className="px-3 py-1.5 bg-white border border-gray-200 text-gray-600
                                   rounded-lg text-sm hover:bg-gray-50">{t("landing:cancel", "Cancel")}


              </button>
              </div>
            </div>
          }

          {/* Reject form */}
          {rejectMode &&
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-2">
              <p className="text-sm font-medium text-red-800">{t("landing:return_to_student_with_feedback", "Return to student with feedback")}</p>
              <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows={3}
              placeholder={t("landing:tell_the_student_what_to_develop_further", "Tell the student what to develop further\u2026")}
              className="w-full border border-red-200 rounded px-2 py-1.5 text-sm
                           focus:outline-none focus:ring-2 focus:ring-red-300" />

            
              <div className="flex gap-2">
                <button
                onClick={handleReject}
                disabled={submitting || !feedback.trim()}
                className="px-4 py-1.5 bg-red-600 text-white rounded-lg text-sm
                             hover:bg-red-700 disabled:opacity-50">

                
                  {submitting ? 'Returning…' : 'Return to Student'}
                </button>
                <button onClick={() => setRejectMode(false)}
              className="px-3 py-1.5 bg-white border border-gray-200 text-gray-600
                                   rounded-lg text-sm hover:bg-gray-50">{t("landing:cancel", "Cancel")}


              </button>
              </div>
            </div>
          }
        </div>
      </div>);

  }

  // ── List view ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-800">{t("landing:field_note_review", "Field Note Review")}</h2>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
          className="border border-gray-200 rounded-lg px-2 py-1 text-sm text-gray-600">
          
          <option value="submitted">{t("landing:submitted_for_promotion", "Submitted for Promotion")}</option>
          <option value="shared">{t("landing:shared_with_me", "Shared with Me")}</option>
          <option value="">{t("landing:all_visible", "All Visible")}</option>
        </select>
      </div>

      {loading ?
      <div className="flex justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
        </div> :
      notes.length === 0 ?
      <div className="text-center py-10 text-gray-400">
          <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">{t("landing:no_field_notes_to_review_right_now", "No field notes to review right now.")}</p>
        </div> :

      <div className="divide-y divide-gray-100">
          {notes.map((note) =>
        <button
          key={note.id}
          onClick={() => openNote(note)}
          className="w-full flex items-start gap-3 py-3 px-2 text-left hover:bg-gray-50 rounded-lg">
          
              <BookOpen className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{note.title}</p>
                {note.location_name &&
            <p className="text-xs text-gray-400 flex items-center gap-0.5">
                    <MapPin className="w-2.5 h-2.5" />{note.location_name}
                  </p>
            }
                <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400">
                  <span>{note.capture_count}{t("landing:fieldnotereview.captures", "captures")}</span>
                  <span>{fmtDate(note.updated_at)}</span>
                </div>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0
                ${note.status === 'submitted' ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700'}`}>
                {note.status}
              </span>
            </button>
        )}
        </div>
      }
    </div>);

};


// ============================================================================
// frontend/src/components/teacher/PeerProjectReview.tsx
// ============================================================================
// Teacher approves/rejects peer projects + grades responses with author feedback.

import { teacherPeerProjectApi } from '../../services/phase7Api';
import type { PeerProject, PeerProjectGradeCreate } from '../../types/phase7';

interface PeerProjectReviewProps {
  classId: string;
}

type ReviewTab = 'pending' | 'published' | 'grade';

export const PeerProjectReview: React.FC<PeerProjectReviewProps> = ({ classId }) => {
  const { t } = useTranslation('landing');
  const [tab, setTab] = useState<ReviewTab>('pending');
  const [projects, setProjects] = useState<PeerProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<PeerProject | null>(null);
  const [approveMode, setApproveMode] = useState(false);
  const [rejectMode, setRejectMode] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Grading state
  const [gradingResponseId, setGradingResponseId] = useState<string | null>(null);
  const [gradeData, setGradeData] = useState<PeerProjectGradeCreate>({
    feedback_to_student: '',
    score: undefined,
    feedback_to_author: '',
    competencies_evidenced: []
  });

  const loadProjects = () => {
    setLoading(true);
    const status = tab === 'pending' ? 'pending_approval' :
    tab === 'published' ? 'published' :
    undefined;
    teacherPeerProjectApi.list({ class_id: classId || undefined, status }).
    then((r) => setProjects(r.items)).
    catch(() => setError('Could not load peer projects')).
    finally(() => setLoading(false));
  };

  useEffect(() => {loadProjects();}, [classId, tab]);

  const handleApprove = async () => {
    if (!selected) return;
    setSubmitting(true);
    try {
      await teacherPeerProjectApi.approve(selected.id, {
        feedback: feedback || undefined,
        curriculum_objective_ids: []
      });
      setProjects((prev) => prev.filter((p) => p.id !== selected.id));
      setSelected(null);
      setApproveMode(false);
      setFeedback('');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Approval failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!selected || !feedback.trim()) {
      setError('Feedback is required when rejecting');
      return;
    }
    setSubmitting(true);
    try {
      await teacherPeerProjectApi.reject(selected.id, feedback);
      setProjects((prev) => prev.filter((p) => p.id !== selected.id));
      setSelected(null);
      setRejectMode(false);
      setFeedback('');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Rejection failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGrade = async () => {
    if (!gradingResponseId || !gradeData.feedback_to_student.trim()) {
      setError('Feedback to student is required');
      return;
    }
    setSubmitting(true);
    try {
      await teacherPeerProjectApi.gradeResponse(gradingResponseId, gradeData);
      setGradingResponseId(null);
      setGradeData({ feedback_to_student: '', score: undefined,
        feedback_to_author: '', competencies_evidenced: [] });
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Grading failed');
    } finally {
      setSubmitting(false);
    }
  };

  const TABS: {key: ReviewTab;label: string;}[] = [
  { key: 'pending', label: 'Pending Approval' },
  { key: 'published', label: 'Published' },
  { key: 'grade', label: 'Grade Responses' }];


  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {TABS.map((t) =>
        <button
          key={t.key}
          onClick={() => {setTab(t.key);setSelected(null);}}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition
              ${tab === t.key ?
          'border-blue-600 text-blue-600' :
          'border-transparent text-gray-500 hover:text-gray-700'}`}>
          
            {t.label}
          </button>
        )}
      </div>

      {error &&
      <div className="text-sm text-red-600 bg-red-50 rounded-lg p-2 border border-red-200">{error}</div>
      }

      {/* Grading panel */}
      {tab === 'grade' &&
      <div className="space-y-3">
          <p className="text-sm text-gray-600">{t("landing:select_a_completed_peer_project_response", "Select a completed peer project response to grade.\n            Feedback is a gift \u2014 your comments go to both the responding student and the project author.")}


        </p>
          {/* Grade form inline — response selection would come from a response list */}
          {gradingResponseId ?
        <div className="bg-white rounded-xl border shadow-sm p-4 space-y-3">
              <h3 className="text-sm font-semibold text-gray-800">{t("landing:grade_response", "Grade Response")}</h3>

              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">{t("landing:score_0100_optional", "Score (0\u2013100, optional)")}

            </label>
                <input
              type="number" min={0} max={100}
              value={gradeData.score ?? ''}
              onChange={(e) => setGradeData((d) => ({ ...d, score: e.target.value ? Number(e.target.value) : undefined }))}
              className="w-24 border border-gray-200 rounded-lg px-3 py-1.5 text-sm
                             focus:outline-none focus:ring-2 focus:ring-blue-300" />

            
              </div>

              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">{t("landing:feedback_to_responding_student", "Feedback to Responding Student *")}

            </label>
                <textarea
              value={gradeData.feedback_to_student}
              onChange={(e) => setGradeData((d) => ({ ...d, feedback_to_student: e.target.value }))}
              rows={3}
              placeholder={t("landing:what_did_this_student_do_well_what_could", "What did this student do well? What could they develop?")}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none
                             focus:outline-none focus:ring-2 focus:ring-blue-300" />

            
              </div>

              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">{t("landing:feedback_to_project_author", "Feedback to Project Author")}
              <span className="text-gray-400">{t("landing:feedback_is_a_gift", "(Feedback is a gift)")}</span>
                </label>
                <textarea
              value={gradeData.feedback_to_author || ''}
              onChange={(e) => setGradeData((d) => ({ ...d, feedback_to_author: e.target.value }))}
              rows={2}
              placeholder={t("landing:how_effective_were_the_authors_guiding_p", "How effective were the author's guiding prompts? What made their project strong?")}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none
                             focus:outline-none focus:ring-2 focus:ring-blue-300" />

            
                <p className="text-xs text-gray-400 mt-1">{t("landing:this_feedback_helps_the_studentauthor_gr", "This feedback helps the student-author grow as a project designer.")}

            </p>
              </div>

              <div className="flex gap-2">
                <button
              onClick={handleGrade}
              disabled={submitting || !gradeData.feedback_to_student.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700
                             disabled:opacity-50 text-sm font-medium">

              
                  {submitting ? 'Saving…' : 'Save Grade'}
                </button>
                <button onClick={() => setGradingResponseId(null)}
            className="px-3 py-2 bg-white border border-gray-200 text-gray-600
                                   rounded-lg text-sm hover:bg-gray-50">{t("landing:cancel", "Cancel")}


            </button>
              </div>
            </div> :

        <p className="text-xs text-gray-400 text-center py-4">{t("landing:select_a_response_from_the_published_tab", "Select a response from the Published tab to grade it.")}

        </p>
        }
        </div>
      }

      {/* Project list */}
      {tab !== 'grade' &&
      <>
          {selected ?
        // Detail view
        <div className="space-y-4">
              <button onClick={() => {setSelected(null);setApproveMode(false);setRejectMode(false);setFeedback('');}}
          className="text-sm text-blue-600 hover:underline">{t("landing:fieldnotereview.back", "\u2190 Back")}</button>
              <div className="bg-white rounded-xl border shadow-sm p-4 space-y-3">
                <h3 className="text-sm font-semibold text-gray-800">{selected.title}</h3>
                <p className="text-sm text-gray-600">{selected.description}</p>

                <div className="text-xs text-gray-400 space-y-1">
                  <p>{t("landing:allows", "Allows:")}{selected.allowed_capture_types.join(', ')}</p>
                  <p>{t("landing:fieldnotereview.responses", "Responses:")}{selected.response_count}{t("landing:total", "total,")}{selected.completed_response_count}{t("landing:completed", "completed")}</p>
                </div>

                {selected.guiding_prompts.length > 0 &&
            <div>
                    <p className="text-xs font-medium text-gray-600 mb-1">{t("landing:fieldnotereview.guiding_prompts", "Guiding Prompts:")}</p>
                    {selected.guiding_prompts.map((p, i) =>
              <p key={i} className="text-sm text-gray-600 bg-gray-50 rounded px-2 py-1 mb-1">
                        {p.prompt}
                      </p>
              )}
                  </div>
            }

                {error && <div className="text-sm text-red-600 bg-red-50 rounded p-2">{error}</div>}

                {selected.status === 'pending_approval' && !approveMode && !rejectMode &&
            <div className="flex gap-2 pt-2 border-t">
                    <button onClick={() => setApproveMode(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white
                                       rounded-lg hover:bg-green-700 text-sm font-medium">
                
                      <CheckCircle className="w-4 h-4" />{t("landing:approve_publish", "Approve & Publish")}
              </button>
                    <button onClick={() => setRejectMode(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-red-50 text-red-700
                                       border border-red-200 rounded-lg hover:bg-red-100 text-sm">
                
                      <XCircle className="w-4 h-4" />{t("landing:fieldnotereview.reject_with_feedback", "Reject with Feedback")}
              </button>
                  </div>
            }

                {approveMode &&
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 space-y-2">
                    <p className="text-sm font-medium text-green-800">{t("landing:approve_this_peer_project", "Approve this peer project?")}</p>
                    <textarea value={feedback} onChange={(e) => setFeedback(e.target.value)}
              rows={2} placeholder={t("landing:feedback_to_the_studentauthor_optional", "Feedback to the student-author (optional)\u2026")}
              className="w-full border border-green-200 rounded px-2 py-1.5 text-sm
                                         focus:outline-none focus:ring-2 focus:ring-green-300" />
              
                    <div className="flex gap-2">
                      <button onClick={handleApprove} disabled={submitting}
                className="px-4 py-1.5 bg-green-600 text-white rounded-lg text-sm
                                         hover:bg-green-700 disabled:opacity-50">
                  
                        {submitting ? 'Approving…' : 'Approve'}
                      </button>
                      <button onClick={() => setApproveMode(false)}
                className="px-3 py-1.5 bg-white border border-gray-200 text-gray-600 rounded-lg text-sm">{t("landing:cancel", "Cancel")}

                </button>
                    </div>
                  </div>
            }

                {rejectMode &&
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-2">
                    <p className="text-sm font-medium text-red-800">{t("landing:fieldnotereview.reject_with_feedback", "Reject with feedback")}</p>
                    <textarea value={feedback} onChange={(e) => setFeedback(e.target.value)}
              rows={3} placeholder={t("landing:what_should_the_student_improve_be_speci", "What should the student improve? Be specific\u2026")}
              className="w-full border border-red-200 rounded px-2 py-1.5 text-sm
                                         focus:outline-none focus:ring-2 focus:ring-red-300" />
              
                    <div className="flex gap-2">
                      <button onClick={handleReject} disabled={submitting || !feedback.trim()}
                className="px-4 py-1.5 bg-red-600 text-white rounded-lg text-sm
                                         hover:bg-red-700 disabled:opacity-50">
                  
                        {submitting ? 'Rejecting…' : 'Reject & Return'}
                      </button>
                      <button onClick={() => setRejectMode(false)}
                className="px-3 py-1.5 bg-white border border-gray-200 text-gray-600 rounded-lg text-sm">{t("landing:cancel", "Cancel")}

                </button>
                    </div>
                  </div>
            }
              </div>
            </div> :

        // List view
        loading ?
        <div className="flex justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
              </div> :
        projects.length === 0 ?
        <div className="text-center py-10 text-gray-400">
                <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">
                  {tab === 'pending' ? 'No peer projects awaiting approval.' : 'No published peer projects.'}
                </p>
              </div> :

        <div className="divide-y divide-gray-100">
                {projects.map((proj) =>
          <button
            key={proj.id}
            onClick={() => setSelected(proj)}
            className="w-full flex items-start gap-3 py-3 px-2 text-left
                               hover:bg-gray-50 rounded-lg transition">

            
                    <MessageSquare className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{proj.title}</p>
                      <p className="text-xs text-gray-500 truncate">{proj.description}</p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                        <span>{proj.response_count}{t("landing:fieldnotereview.responses", "responses")}</span>
                        <span>{proj.allowed_capture_types.join(', ')}</span>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
                  </button>
          )}
              </div>

        }
        </>
      }
    </div>);

};
export default PeerProjectReview;
