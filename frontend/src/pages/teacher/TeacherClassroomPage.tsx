// Copyright (c) 2026 Paul Christopher Cerda
// Business Source License 1.1

/**
 * TeacherClassroomPage  —  /teacher/classrooms/:classroomId
 *
 * Shows:
 *  - Classroom name, grade, subject (editable inline)
 *  - Enrolled student list with capacity badge and remove button
 *  - Active invites list with revoke button
 *  - InviteStudentsPanel (open link / email / CSV)
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Users, Edit2, Check, X, AlertTriangle, Trash2 } from 'lucide-react';
import InviteStudentsPanel from '@/components/teacher/InviteStudentsPanel';
import apiClient from '@/config/api';
import { useTranslation } from 'react-i18next';
import UpgradeCTA from '@/components/UpgradeCTA';

interface Student {
  id:          string;
  email:       string;
  name:        string;
  enrolled_at: string | null;
}

interface Invite {
  id:               string;
  email:            string | null;
  token:            string;
  status:           string;
  join_url:         string;
  expires_at:       string | null;
  created_at:       string | null;
  accepted_by_name: string | null;
}

interface Classroom {
  id:                          string;
  name:                        string;
  grade_level:                 number | null;
  subject:                     string | null;
  is_active:                   boolean;
  org_id:                      string;
  teacher_id:                  string;
  student_count:               number;
  max_students_per_classroom:  number;
  students:                    Student[];
  created_at:                  string | null;
}

export default function TeacherClassroomPage() {
  const { t } = useTranslation('landing');
  const { classroomId } = useParams<{ classroomId: string }>();
  const navigate        = useNavigate();

  const [classroom,   setClassroom]   = useState<Classroom | null>(null);
  const [invites,     setInvites]     = useState<Invite[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');
  const [editing,     setEditing]     = useState(false);
  const [editName,    setEditName]    = useState('');
  const [editGrade,   setEditGrade]   = useState<number | ''>('');
  const [editSubject, setEditSubject] = useState('');
  const [savingEdit,  setSavingEdit]  = useState(false);
  const [removingId,  setRemovingId]  = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!classroomId) return;
    try {
      const [cResp, iResp] = await Promise.all([
        apiClient.get(`/classrooms/${classroomId}`),
        apiClient.get(`/classrooms/${classroomId}/invites`),
      ]);
      setClassroom(cResp.data);
      setInvites(iResp.data.filter((i: Invite) => i.status === 'pending'));
      setEditName(cResp.data.name);
      setEditGrade(cResp.data.grade_level ?? '');
      setEditSubject(cResp.data.subject ?? '');
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? 'Failed to load classroom.');
    } finally {
      setLoading(false);
    }
  }, [classroomId]);

  useEffect(() => { load(); }, [load]);

  const saveEdit = async () => {
    if (!classroomId) return;
    setSavingEdit(true);
    try {
      await apiClient.patch(`/classrooms/${classroomId}`, {
        name:        editName.trim() || undefined,
        grade_level: editGrade !== '' ? Number(editGrade) : null,
        subject:     editSubject.trim() || null,
      });
      setEditing(false);
      load();
    } catch {
      // keep editing open
    } finally {
      setSavingEdit(false);
    }
  };

  const removeStudent = async (studentId: string) => {
    if (!classroomId || !window.confirm('Remove this student from the classroom?')) return;
    setRemovingId(studentId);
    try {
      await apiClient.delete(`/classrooms/${classroomId}/students/${studentId}`);
      load();
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? 'Could not remove student.');
    } finally {
      setRemovingId(null);
    }
  };

  const revokeInvite = async (inviteId: string) => {
    if (!classroomId) return;
    try {
      await apiClient.delete(`/classrooms/${classroomId}/invites/${inviteId}`);
      setInvites(prev => prev.filter(i => i.id !== inviteId));
    } catch {}
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-green-700" />
      </div>
    );
  }

  if (error || !classroom) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-red-700">{error || 'Classroom not found.'}</p>
        </div>
      </div>
    );
  }

  const atCapacity = classroom.students.length >= classroom.max_students_per_classroom;
  const capacityPct = Math.round((classroom.students.length / classroom.max_students_per_classroom) * 100);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      {/* Back */}
      <button onClick={() => navigate('/teacher')}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
        <ArrowLeft className="w-4 h-4" /> Back to Dashboard
      </button>

      {/* Header */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        {editing ? (
          <div className="space-y-3">
            <input value={editName} onChange={e => setEditName(e.target.value)}
              placeholder={t('pages_teacher_teacherclassroompage.placeholder_classroom_name', 'Classroom name')}
              className="w-full border rounded-lg px-3 py-2 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-green-500" />
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-xs text-gray-500 block mb-1">{t('pages_teacher_teacherclassroompage.grade_level', 'Grade level')}</label>
                <input type="number" min={1} max={12} value={editGrade}
                  onChange={e => setEditGrade(e.target.value ? Number(e.target.value) : '')}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <div className="flex-1">
                <label className="text-xs text-gray-500 block mb-1">{t('pages_teacher_teacherclassroompage.subject', 'Subject')}</label>
                <input value={editSubject} onChange={e => setEditSubject(e.target.value)}
                  placeholder={t('pages_teacher_teacherclassroompage.placeholder_eg_science', 'e.g. Science')}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={saveEdit} disabled={savingEdit}
                className="flex items-center gap-1.5 px-4 py-2 bg-green-700 text-white rounded-lg text-sm font-medium hover:bg-green-800 disabled:opacity-50">
                <Check className="w-4 h-4" /> Save
              </button>
              <button onClick={() => setEditing(false)}
                className="flex items-center gap-1.5 px-4 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                <X className="w-4 h-4" /> Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{classroom.name}</h1>
              <p className="text-gray-500 text-sm mt-1">
                {[classroom.grade_level ? `Grade ${classroom.grade_level}` : null, classroom.subject]
                  .filter(Boolean).join(' · ') || 'No grade or subject set'}
              </p>
            </div>
            <button onClick={() => setEditing(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-sm text-gray-500 hover:bg-gray-50">
              <Edit2 className="w-3.5 h-3.5" /> Edit
            </button>
          </div>
        )}

        {/* Capacity bar */}
        <div className="mt-5">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-sm text-gray-600 flex items-center gap-1.5">
              <Users className="w-4 h-4" />
              {classroom.students.length} / {classroom.max_students_per_classroom} students
            </span>
            {atCapacity ? (
              <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full font-medium">{t('pages_teacher_teacherclassroompage.class_full_upgrade_to_add_more', 'Class full — upgrade to add more')}</span>
            ) : (
              <span className="text-xs text-gray-400">{classroom.max_students_per_classroom - classroom.students.length} spots left</span>
            )}
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${atCapacity ? 'bg-red-500' : capacityPct > 80 ? 'bg-amber-500' : 'bg-green-600'}`}
              style={{ width: `${Math.min(capacityPct, 100)}%` }}
            />
          </div>
          {atCapacity && (
            <div className="mt-3">
              <p className="text-xs text-gray-500 mb-2">{t('pages_teacher_teacherclassroompage.larger_classrooms_are_a_paid_feature_upg', 'Larger classrooms are a paid feature. Upgrade to enroll more students.')}</p>
              <UpgradeCTA
                featureName="Larger classrooms"
                requiredTier="starter"
                compact={false}
              />
            </div>
          )}
        </div>
      </div>

      {/* Students */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">{t('pages_teacher_teacherclassroompage.enrolled_students', 'Enrolled Students')}</h2>
        </div>
        {classroom.students.length === 0 ? (
          <div className="px-6 py-10 text-center text-gray-400 text-sm">{t('pages_teacher_teacherclassroompage.no_students_enrolled_yet_use_the_invite_', 'No students enrolled yet. Use the invite panel below to add them.')}</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {classroom.students.map(s => (
              <div key={s.id} className="px-6 py-3 flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900 text-sm">{s.name}</p>
                  <p className="text-xs text-gray-400">{s.email}</p>
                </div>
                <div className="flex items-center gap-3">
                  {s.enrolled_at && (
                    <span className="text-xs text-gray-400">
                      Enrolled {new Date(s.enrolled_at).toLocaleDateString()}
                    </span>
                  )}
                  <button
                    onClick={() => removeStudent(s.id)}
                    disabled={removingId === s.id}
                    className="text-gray-300 hover:text-red-500 transition disabled:opacity-40"
                    title={t('pages_teacher_teacherclassroompage.title_remove_from_classroom', 'Remove from classroom')}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Active invites */}
      {invites.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">
              Pending Invites
              <span className="ml-2 text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">{invites.length}</span>
            </h2>
          </div>
          <div className="divide-y divide-gray-100">
            {invites.map(inv => (
              <div key={inv.id} className="px-6 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-700">{inv.email ?? <em className="text-gray-400">Open link</em>}</p>
                  <p className="text-xs text-gray-400 font-mono truncate max-w-xs">
                    {window.location.origin}{inv.join_url}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {inv.expires_at && (
                    <span className="text-xs text-gray-400">
                      Expires {new Date(inv.expires_at).toLocaleDateString()}
                    </span>
                  )}
                  <button onClick={() => revokeInvite(inv.id)}
                    className="text-gray-300 hover:text-red-500 transition" title={t('pages_teacher_teacherclassroompage.title_revoke', 'Revoke')}>
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Invite panel */}
      <InviteStudentsPanel classroomId={classroom.id} onDone={load} />
    </div>
  );
}
