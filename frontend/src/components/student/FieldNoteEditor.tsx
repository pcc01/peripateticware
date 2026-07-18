import { fmtDate, fmtDateTime, fmtTime } from '@/utils/date';
import { useTranslation } from 'react-i18next';
import { ExtendedWritingPanel } from './ExtendedWritingPanel';
// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

// frontend/src/components/student/FieldNoteEditor.tsx
// Full field note editing — title, description, GPS, captures, status actions.

import React, { useEffect, useRef, useState } from 'react';
import { Camera, FileText, Loader2, MapPin, Mic, Send, Share2, X } from 'lucide-react';
import { fieldNoteApi } from '../../services/phase7Api';
import { apiClient } from '../../config/api';
import { AudioCapture } from './AudioCapture';
import { parseDoc } from './ExtendedWritingPanel';
import { useSignedCaptureUrl } from '../../hooks/useSignedCaptureUrl';
import type { FieldNote, FieldNoteCreate, AudioCaptureResult } from '../../types/phase7';

/**
 * Renders a capture thumbnail (photo/video) using a short-lived signed media
 * URL instead of a JWT-in-query-string. Includes descriptive alt text (WCAG 1.1.1).
 */
const CaptureThumb: React.FC<{ captureId: string; kind: 'photo' | 'video' }> = ({ captureId, kind }) => {
  const { t } = useTranslation('landing');
  const src = useSignedCaptureUrl(captureId);
  if (!src) {
    return <div className="w-full h-24 bg-gray-100 animate-pulse" aria-hidden="true" />;
  }
  if (kind === 'photo') {
    return (
      <img
        src={src}
        alt={t('components_student_fieldnoteeditor.alt_field_note_photo_capture', 'Field note photo capture')}
        className="w-full h-24 object-cover"
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
      />
    );
  }
  return (
    <video
      src={src}
      className="w-full h-24 object-cover"
      controls={false}
      muted
      aria-label={t('components_student_fieldnoteeditor.aria_label_field_note_video_capture', 'Field note video capture')}
    />
  );
};

interface FieldNoteEditorProps {
  noteId?: string; // Existing note; undefined = creating new
  selfProjectId?: string; // Pre-link to a self-project
  onSave?: (note: FieldNote) => void;
  onDelete?: () => void;
  onClose?: () => void;
}

export const FieldNoteEditor: React.FC<FieldNoteEditorProps> = ({
  noteId,
  selfProjectId,
  onSave,
  onDelete,
  onClose
}) => {
  const { t } = useTranslation('landing');
  const [note, setNote] = useState<FieldNote | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [locationName, setLocationName] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!!noteId);
  const [showAudio, setShowAudio] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [promotionMessage, setPromotionMessage] = useState('');
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number } | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  // Auto-detect GPS on mount — stored and attached to every save
  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        setGpsCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      undefined,
      { timeout: 5000, maximumAge: 60_000 }
    );
  }, []);

  useEffect(() => {
    if (!noteId) return;
    setLoading(true);
    fieldNoteApi.get(noteId).
    then((n) => {
      setNote(n);
      setTitle(n.title);
      setDescription(n.description || '');
      setLocationName(n.location_name || '');
    }).
    catch(() => setError('Could not load field note')).
    finally(() => setLoading(false));
  }, [noteId]);

  const canEdit = !note || ['draft', 'shared', 'rejected'].includes(note.status);

  const handleSave = async () => {
    if (!title.trim()) {setError('Title is required');return;}
    setSaving(true);
    setError(null);
    try {
      const data: FieldNoteCreate = {
        title: title.trim(),
        description: description.trim() || undefined,
        location_name: locationName.trim() || undefined,
        self_project_id: selfProjectId,
        location_latitude: gpsCoords?.lat,
        location_longitude: gpsCoords?.lng,
      };
      const saved = noteId ?
      await fieldNoteApi.update(noteId, data) :
      await fieldNoteApi.create(data);
      setNote(saved);
      onSave?.(saved);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleShare = async () => {
    if (!note) return;
    try {
      await fieldNoteApi.share(note.id);
      setNote({ ...note, status: 'shared' });
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Share failed');
    }
  };

  const handleSubmitForPromotion = async () => {
    if (!note) return;
    setSubmitting(true);
    try {
      await fieldNoteApi.submitForPromotion(note.id, promotionMessage);
      setNote({ ...note, status: 'submitted' });
      setShowSubmitModal(false);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAudioCaptured = async (result: AudioCaptureResult) => {
    if (!note) return;
    try {
      await fieldNoteApi.addCapture(note.id, result.id);
      const updated = await fieldNoteApi.get(note.id);
      setNote(updated);
    } catch {
      setError('Could not link audio to this note');
    }
    setShowAudio(false);
  };

  const handleFileCapture = async (file: File, captureType: 'photo' | 'video') => {
    if (!note) return;
    setUploadingFile(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('capture_type', captureType);
      form.append('context_type', 'field_note');
      form.append('context_id', note.id);
      const res = await apiClient.post<{ id: string }>('/student/captures/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      await fieldNoteApi.addCapture(note.id, res.data.id);
      const updated = await fieldNoteApi.get(note.id);
      setNote(updated);
    } catch (err: any) {
      setError(err.response?.data?.detail || `Could not upload ${captureType}`);
    } finally {
      setUploadingFile(false);
    }
  };

  const handleDeleteCapture = async (captureId: string) => {
    if (!note) return;
    try {
      await fieldNoteApi.removeCapture(note.id, captureId);
      setNote({ ...note, captures: note.captures.filter((c) => c.id !== captureId) });
    } catch {
      setError('Could not remove capture');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
      </div>);

  }

  const statusColor: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-600',
    shared: 'bg-blue-100 text-blue-700',
    submitted: 'bg-yellow-100 text-yellow-700',
    promoted: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700'
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-800">
            {noteId ? 'Field Note' : 'New Field Note'}
          </h3>
          {note &&
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium
              ${statusColor[note.status] || 'bg-gray-100 text-gray-600'}`}>
              {note.status}
            </span>
          }
        </div>
        {onClose &&
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        }
      </div>

      <div className="p-4 space-y-4">
        {error &&
        <div className="text-sm text-red-600 bg-red-50 rounded-lg p-2 border border-red-200">
            {error}
          </div>
        }

        {/* Teacher feedback */}
        {note?.teacher_feedback &&
        <div className="text-sm bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="font-medium text-amber-800 mb-1">{t("landing:teacher_feedback", "Teacher Feedback")}</p>
            <p className="text-amber-700">{note.teacher_feedback}</p>
          </div>
        }

        {/* Title */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">{t("landing:fieldnoteeditor.title", "Title *")}</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={!canEdit}
            placeholder={t("landing:what_did_you_observe", "What did you observe?")}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                       focus:outline-none focus:ring-2 focus:ring-blue-300
                       disabled:bg-gray-50 disabled:text-gray-500" />


          
        </div>

        {/* Description \u2014 field notes captured in the field.
             If the description is already JSON (extended format), show the
             original field_note text read-only so we don't expose raw JSON. */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1 flex items-center gap-1.5">
            <FileText className="w-4 h-4 text-blue-500" />
            {t("landing:notes", "Write Your Notes")}
            <span className="ml-1 font-normal text-gray-400 text-xs">{t('components_student_fieldnoteeditor.type_what_you_observed', '(type what you observed)')}</span>
          </label>
          {(() => {
            let isJson = false;
            let fieldNoteText = description;
            try {
              const p = JSON.parse(description);
              if (p?.v === 2) { isJson = true; fieldNoteText = p.field_note || ''; }
            } catch {}
            return isJson ? (
              // Already has extended sections \u2014 show original field note read-only
              <div className="w-full border border-gray-100 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-600 min-h-[80px] whitespace-pre-wrap">
                {fieldNoteText || <span className="text-gray-400 italic">{t('components_student_fieldnoteeditor.no_field_notes_captured_yet', 'No field notes captured yet.')}</span>}
              </div>
            ) : (
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={!canEdit}
                rows={4}
                placeholder={t("landing:describe_what_you_observed_noticed_or_wo", "Describe what you observed, noticed, or wondered about\u2026")}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                           focus:outline-none focus:ring-2 focus:ring-blue-300
                           disabled:bg-gray-50 disabled:text-gray-500 resize-none" />
            );
          })()}
        </div>

        {/* Location */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">{t("landing:fieldnoteeditor.location", "Location")}</label>
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              value={locationName}
              onChange={(e) => setLocationName(e.target.value)}
              disabled={!canEdit}
              placeholder={t("landing:where_were_you", "Where were you?")}
              className="w-full border border-gray-200 rounded-lg pl-8 pr-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-blue-300
                         disabled:bg-gray-50" />


            
          </div>
        </div>

        {/* Captures list */}
        {note && note.captures.length > 0 &&
        <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">
              Attached Captures ({note.captures.length})
            </label>
            <div className="grid grid-cols-2 gap-2">
              {note.captures.map((cap) => (
                <div key={cap.id} className="relative bg-gray-50 rounded-lg overflow-hidden border border-gray-200">
                  {cap.capture_type === 'photo' ? (
                    <CaptureThumb captureId={cap.id} kind="photo" />
                  ) : cap.capture_type === 'video' ? (
                    <CaptureThumb captureId={cap.id} kind="video" />
                  ) : cap.capture_type === 'audio' ? (
                    <div className="flex flex-col items-center justify-center h-16 gap-1">
                      <Mic className="w-6 h-6 text-blue-500" />
                      <span className="text-xs text-gray-500">
                        {cap.duration_seconds ? `${cap.duration_seconds}s` : 'Audio'}
                      </span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-16 gap-1">
                      <Camera className="w-6 h-6 text-green-500" />
                      <span className="text-xs text-gray-500 capitalize">{cap.capture_type}</span>
                    </div>
                  )}
                  {canEdit && (
                    <button
                      onClick={() => handleDeleteCapture(cap.id)}
                      className="absolute top-1 right-1 bg-black/40 text-white rounded-full p-0.5 hover:bg-red-500">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        }

        {/* Hint when new note not yet saved */}
        {!note && canEdit && (
          <p className="text-xs text-gray-400 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">{t('components_student_fieldnoteeditor.save_your_note_first_to_attach_photos_au', '💡 Save your note first to attach photos, audio, and video captures.')}</p>
        )}

        {/* Hidden file inputs */}
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFileCapture(file, 'photo');
            e.target.value = '';
          }}
        />
        <input
          ref={videoInputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFileCapture(file, 'video');
            e.target.value = '';
          }}
        />

        {/* Audio capture */}
        {showAudio && note &&
        <AudioCapture
          contextType="field_note"
          contextId={note.id}
          onCaptured={handleAudioCaptured}
          onError={setError} />
        }

        {/* ── Capture Toolbar ─────────────────────────────────────────────── */}
        {note && canEdit && (
          <div className="border border-gray-200 rounded-xl p-3 bg-gray-50">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{t('components_student_fieldnoteeditor.capture_evidence', 'Capture Evidence')}</p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setShowAudio(!showAudio)}
                className={`flex flex-col items-center gap-1 px-4 py-3 rounded-xl border-2 text-xs font-medium transition
                  ${showAudio
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-blue-300 hover:bg-blue-50'}`}
              >
                <Mic className="w-6 h-6" />
                Audio
              </button>
              <button
                onClick={() => photoInputRef.current?.click()}
                disabled={uploadingFile}
                className="flex flex-col items-center gap-1 px-4 py-3 rounded-xl border-2
                           border-gray-200 bg-white text-gray-600 hover:border-green-300
                           hover:bg-green-50 text-xs font-medium transition disabled:opacity-50"
              >
                {uploadingFile ? <Loader2 className="w-6 h-6 animate-spin text-green-500" /> : <Camera className="w-6 h-6" />}
                Photo
              </button>
              <button
                onClick={() => videoInputRef.current?.click()}
                disabled={uploadingFile}
                className="flex flex-col items-center gap-1 px-4 py-3 rounded-xl border-2
                           border-gray-200 bg-white text-gray-600 hover:border-purple-300
                           hover:bg-purple-50 text-xs font-medium transition disabled:opacity-50"
              >
                {uploadingFile ? <Loader2 className="w-6 h-6 animate-spin text-purple-500" /> : (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M4 8h8a2 2 0 012 2v4a2 2 0 01-2 2H4a2 2 0 01-2-2v-4a2 2 0 012-2z" />
                  </svg>
                )}
                Video
              </button>
            </div>
            {uploadingFile && (
              <p className="text-xs text-blue-600 mt-2 flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" /> Uploading…
              </p>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
          {/* Save */}
          {canEdit &&
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white
                         rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}{t("landing:save", "Save")}
          </button>
          }

          {/* Share with teacher */}
          {note && note.status === 'draft' &&
          <button
            onClick={handleShare}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-700
                         rounded-lg hover:bg-gray-200 text-sm">
              <Share2 className="w-3.5 h-3.5" />{t("landing:share_with_teacher", "Share with Teacher")}
          </button>
          }

          {/* Submit for promotion */}
          {note && ['draft', 'shared', 'rejected'].includes(note.status) &&
          <button
            onClick={() => setShowSubmitModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-700
                         border border-amber-200 rounded-lg hover:bg-amber-100 text-sm">
              <Send className="w-3.5 h-3.5" />{t("landing:submit_for_promotion", "Submit for Promotion")}
          </button>
          }
        </div>

        {/* ── Extended Writing ───────────────────────────────────────────────
             Only shown once the note has been saved (has an id).
             The panel manages its own save cycle against the description field.   */}
        {note &&
          <ExtendedWritingPanel
            noteId={note.id}
            description={note.description}
            noteStatus={note.status}
            onDescriptionSaved={(newDesc) => setNote({ ...note, description: newDesc })}
          />
        }

        {/* Promotion submit modal (inline) */}
        {showSubmitModal &&
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
            <p className="text-sm font-medium text-amber-800">{t("landing:submit_to_teacher_for_activity_promotion", "Submit to teacher for Activity promotion")}

          </p>
            <p className="text-xs text-amber-600">{t("landing:your_teacher_will_review_this_note_and_m", "Your teacher will review this note and may turn it into a class Activity.")}

          </p>
            <textarea
            value={promotionMessage}
            onChange={(e) => setPromotionMessage(e.target.value)}
            rows={2}
            placeholder={t("landing:optional_message_to_your_teacher", "Optional message to your teacher\u2026")}
            className="w-full border border-amber-200 rounded px-2 py-1.5 text-sm
                         focus:outline-none focus:ring-2 focus:ring-amber-300" />

          
            <div className="flex gap-2">
              <button
              onClick={handleSubmitForPromotion}
              disabled={submitting}
              className="px-3 py-1.5 bg-amber-600 text-white rounded-lg text-sm
                           hover:bg-amber-700 disabled:opacity-50">

              
                {submitting ? 'Submitting…' : 'Submit'}
              </button>
              <button
              onClick={() => setShowSubmitModal(false)}
              className="px-3 py-1.5 bg-white border border-gray-200 text-gray-600
                           rounded-lg text-sm hover:bg-gray-50">{t("landing:cancel", "Cancel")}



            </button>
            </div>
          </div>
        }
      </div>
    </div>);

};

// ============================================================================
// FieldNoteList component
// frontend/src/components/student/FieldNoteList.tsx
// ============================================================================

import { useState as useListState, useEffect as useListEffect } from 'react';
import { BookOpen, ChevronRight, Plus, Search } from 'lucide-react';
import type { FieldNoteListItem, FieldNoteStatus } from '../../types/phase7';

interface FieldNoteListProps {
  selfProjectId?: string;
  onSelect?: (note: FieldNoteListItem) => void;
  onNew?: () => void;
}

const STATUS_LABELS: Record<FieldNoteStatus, string> = {
  draft: 'Draft',
  shared: 'Shared',
  submitted: 'Submitted',
  promoted: 'Promoted',
  rejected: 'Needs Revision'
};

const STATUS_COLORS: Record<FieldNoteStatus, string> = {
  draft: 'bg-gray-100 text-gray-600',
  shared: 'bg-blue-100 text-blue-700',
  submitted: 'bg-yellow-100 text-yellow-700',
  promoted: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700'
};

export const FieldNoteList: React.FC<FieldNoteListProps> = ({
  selfProjectId,
  onSelect,
  onNew
}) => {
  const { t } = useTranslation('landing');
  const [notes, setNotes] = useListState<FieldNoteListItem[]>([]);
  const [loading, setLoading] = useListState(false);
  const [total, setTotal] = useListState(0);
  const [page, setPage] = useListState(1);
  const [statusFilter, setStatusFilter] = useListState<string>('');
  const [search, setSearch] = useListState('');

  const fetchNotes = async () => {
    setLoading(true);
    try {
      const result = await fieldNoteApi.list({
        self_project_id: selfProjectId,
        status: statusFilter || undefined,
        page
      });
      setNotes(result.items);
      setTotal(result.total);
    } finally {
      setLoading(false);
    }
  };

  useListEffect(() => { fetchNotes(); }, [page, statusFilter, selfProjectId]);

  const filtered = search
    ? notes.filter((n) => n.title.toLowerCase().includes(search.toLowerCase()))
    : notes;

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("landing:search_notes", "Search notes\u2026")}
            className="w-full pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-sm
                       focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-gray-600
                     focus:outline-none focus:ring-2 focus:ring-blue-300"
        >
          <option value="">{t("landing:fieldnoteeditor.all_statuses", "All statuses")}</option>
          {Object.entries(STATUS_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        {onNew && (
          <button
            onClick={onNew}
            className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white
                       rounded-lg hover:bg-blue-700 text-sm font-medium"
          >
            <Plus className="w-3.5 h-3.5" />{t("landing:new", "New")}
          </button>
        )}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10 text-gray-400">
          <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">{t("landing:no_field_notes_yet", "No field notes yet.")}</p>
          {onNew && (
            <button onClick={onNew} className="mt-2 text-blue-600 text-sm hover:underline">
              {t("landing:create_your_first_one", "Create your first one")}
            </button>
          )}
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {filtered.map((note) => (
            <button
              key={note.id}
              onClick={() => onSelect?.(note)}
              className="w-full flex items-start gap-3 py-3 text-left hover:bg-gray-50 transition rounded-lg px-2"
            >
              <BookOpen className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-sm font-medium text-gray-800 truncate">{note.title}</p>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full flex-shrink-0
                    ${STATUS_COLORS[note.status] || 'bg-gray-100 text-gray-600'}`}>
                    {STATUS_LABELS[note.status] || note.status}
                  </span>
                </div>
                {parseDoc(note.description).field_note && (
                  <p className="text-xs text-gray-400 truncate">{parseDoc(note.description).field_note}</p>
                )}
                <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                  {note.location_name && (
                    <span className="flex items-center gap-0.5">
                      <MapPin className="w-2.5 h-2.5" />{note.location_name}
                    </span>
                  )}
                  <span>{note.capture_count} {t("landing:fieldnoteeditor.captures", "captures")}</span>
                  <span>{fmtDate(note.updated_at)}</span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0 mt-0.5" />
            </button>
          ))}
        </div>
      )}

      {/* Pagination */}
      {total > 20 && (
        <div className="flex justify-center gap-2 pt-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1 text-sm border rounded disabled:opacity-40"
          >
            {t("landing:fieldnoteeditor.previous", "Previous")}
          </button>
          <span className="px-2 py-1 text-sm text-gray-500">{t("landing:page", "Page")} {page}</span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={notes.length < 20}
            className="px-3 py-1 text-sm border rounded disabled:opacity-40"
          >
            {t("landing:fieldnoteeditor.next", "Next")}
          </button>
        </div>
      )}
    </div>
  );
};

export default FieldNoteList;