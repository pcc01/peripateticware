// Copyright (c) 2026 Paul Christopher Cerda
// Business Source License 1.1

/**
 * StudentActivityDetailPage  —  /student/activities/:id
 *
 * Implements the full student activity workflow:
 *   Orient → Inquiry (evidence) → Reflect → Submit
 *
 * Session lifecycle:
 *   1. On load: POST /student/activities/{id}/start  → get session_id
 *   2. Inquiry:  POST /student/sessions/{id}/evidence (multipart)
 *   3. Reflect:  POST /student/sessions/{id}/reflection (JSON)
 *   4. Done:     POST /student/activities/{id}/submit  { session_id }
 */

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MapPin, Clock, BookOpen, Camera, FileText, Mic, CheckCircle, ChevronRight, Loader2, AlertCircle, Upload, Volume2, Info, X } from 'lucide-react';
import { useStudent } from '@/services/api';
import type { Activity, EvidenceCapture } from '@/services/types';
import { fmtDate } from '@/utils/date';

// ── Types ─────────────────────────────────────────────────────────────────────

type Phase = 'orient' | 'inquiry' | 'reflect' | 'done';

interface SessionState {
  session_id: string;
  status: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const CAPTURE_TYPE_ICONS: Record<string, React.ReactNode> = {
  photo: <Camera className="w-4 h-4" />,
  video: <Camera className="w-4 h-4" />,
  audio: <Mic className="w-4 h-4" />,
  text:  <FileText className="w-4 h-4" />,
};

function captureTypeFromFile(file: File): string {
  if (file.type.startsWith('image/'))  return 'photo';
  if (file.type.startsWith('video/'))  return 'video';
  if (file.type.startsWith('audio/'))  return 'audio';
  return 'text';
}

// ── Component ─────────────────────────────────────────────────────────────────

const StudentActivityDetailPage: React.FC = () => {
  const { id: activityId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const {
    getActivityDetail,
    startSession,
    getSessionEvidence,
    addEvidence,
    addReflection,
    submitActivity,
    submitGpsConsent,
  } = useStudent();

  // ── State ──────────────────────────────────────────────────────────────────
  const [activity, setActivity]           = useState<Activity | null>(null);
  const [session, setSession]             = useState<SessionState | null>(null);
  const [phase, setPhase]                 = useState<Phase>('orient');
  const [evidence, setEvidence]           = useState<EvidenceCapture[]>([]);
  const [pageLoading, setPageLoading]     = useState(true);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [pageError, setPageError]         = useState<string | null>(null);
  const [feedback, setFeedback]           = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // GPS self-consent (13+ students on GPS-enabled activities) — prompted
  // once the field session actually starts, matching when the backend
  // fires the parent-notification background task.
  const [gpsConsentPending, setGpsConsentPending] = useState(false);

  // Background Info panel — rendered from `activity.location_wiki_data`,
  // which was already fetched as part of the initial getActivityDetail()
  // call above. Toggling this never triggers a network request, so it
  // keeps working even if the student has no signal at the field location.
  const [showBackgroundInfo, setShowBackgroundInfo] = useState(false);

  // TTS
  const [speaking, setSpeaking] = useState(false);
  const speakText = useCallback((text: string) => {
    if (!window.speechSynthesis) return;
    if (speaking) { window.speechSynthesis.cancel(); setSpeaking(false); return; }
    const utt = new SpeechSynthesisUtterance(text);
    utt.rate = 0.9;
    utt.onend = () => setSpeaking(false);
    utt.onerror = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(utt);
  }, [speaking]);

  // Evidence form
  const [captureType, setCaptureType] = useState<'text' | 'photo' | 'audio' | 'video'>('text');
  const [evidenceTitle, setEvidenceTitle] = useState('');
  const [evidenceDesc, setEvidenceDesc]   = useState('');
  const [evidenceFile, setEvidenceFile]   = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reflection form
  const [reflection, setReflection]         = useState('');
  const [reflectionTitle, setReflectionTitle] = useState('');

  // ── Load activity ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!activityId) return;
    getActivityDetail(activityId)
      .then(setActivity)
      .catch(() => setPageError('Could not load activity.'))
      .finally(() => setPageLoading(false));
  }, [activityId]);

  // ── Start / resume session ─────────────────────────────────────────────────
  const handleStartSession = async () => {
    if (!activityId || session) return;
    setSessionLoading(true);
    setFeedback(null);
    try {
      const s = await startSession(activityId);
      setSession({ session_id: s.session_id, status: s.status });
      setPhase('inquiry');
      loadEvidence(s.session_id);
      if (activity?.discovery_location_gps_capture_enabled) {
        setGpsConsentPending(true);
      }
    } catch {
      setFeedback({ type: 'error', msg: 'Could not start session. Please try again.' });
    } finally {
      setSessionLoading(false);
    }
  };

  // ── GPS self-consent (13+) ─────────────────────────────────────────────────
  const handleGpsConsent = async (allow: boolean) => {
    setGpsConsentPending(false);
    if (allow && activityId) {
      try {
        await submitGpsConsent(activityId, true);
      } catch {
        // best-effort — don't block the session on a consent-log failure
      }
    }
  };

  // ── Load evidence for current session ─────────────────────────────────────
  const loadEvidence = async (sid: string) => {
    try {
      const res = await getSessionEvidence(sid);
      setEvidence(res.captures || []);
    } catch {
      // non-fatal — empty list is fine
    }
  };

  // ── Submit evidence ────────────────────────────────────────────────────────
  const handleAddEvidence = async () => {
    if (!session) return;
    if (captureType === 'text' && !evidenceDesc.trim()) {
      setFeedback({ type: 'error', msg: 'Please enter a description for your text capture.' });
      return;
    }
    if (captureType !== 'text' && !evidenceFile) {
      setFeedback({ type: 'error', msg: 'Please select a file to upload.' });
      return;
    }

    setSubmitLoading(true);
    setFeedback(null);
    try {
      const fd = new FormData();
      fd.append('capture_type', captureType);
      if (evidenceTitle.trim()) fd.append('title', evidenceTitle.trim());
      if (evidenceDesc.trim())  fd.append('description', evidenceDesc.trim());
      fd.append('learning_objectives', '[]');
      fd.append('competencies', '[]');
      if (evidenceFile) fd.append('file', evidenceFile);

      await addEvidence(session.session_id, fd);
      setFeedback({ type: 'success', msg: 'Evidence saved!' });
      // Reset form
      setEvidenceTitle('');
      setEvidenceDesc('');
      setEvidenceFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      loadEvidence(session.session_id);
    } catch {
      setFeedback({ type: 'error', msg: 'Failed to save evidence. Please try again.' });
    } finally {
      setSubmitLoading(false);
    }
  };

  // ── Submit reflection ──────────────────────────────────────────────────────
  const handleAddReflection = async () => {
    if (!session) return;
    if (!reflection.trim()) {
      setFeedback({ type: 'error', msg: 'Please write your reflection before saving.' });
      return;
    }
    setSubmitLoading(true);
    setFeedback(null);
    try {
      await addReflection(session.session_id, {
        reflection_type: 'freeform',
        title:   reflectionTitle.trim() || undefined,
        content: reflection.trim(),
      });
      setFeedback({ type: 'success', msg: 'Reflection saved! You can now submit your activity.' });
    } catch {
      setFeedback({ type: 'error', msg: 'Failed to save reflection. Please try again.' });
    } finally {
      setSubmitLoading(false);
    }
  };

  // ── Submit completed activity ──────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!activityId || !session) return;
    if (!confirm('Submit this activity for review?')) return;
    setSubmitLoading(true);
    setFeedback(null);
    try {
      await submitActivity(activityId, session.session_id);
      setPhase('done');
      setFeedback({ type: 'success', msg: 'Activity submitted! Great work.' });
    } catch {
      setFeedback({ type: 'error', msg: 'Submission failed. Please try again.' });
    } finally {
      setSubmitLoading(false);
    }
  };

  // ── Render guards ──────────────────────────────────────────────────────────
  if (pageLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-10 h-10 animate-spin text-green-700" />
      </div>
    );
  }

  if (pageError || !activity) {
    return (
      <div className="flex-1 bg-gray-50 p-8">
        <div className="max-w-2xl mx-auto bg-red-50 border border-red-200 rounded-xl p-6">
          <div className="flex gap-3 items-start">
            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
            <div>
              <h2 className="font-bold text-red-900">{t('pages_studentactivitydetailpage.could_not_load_activity', 'Could not load activity')}</h2>
              <p className="text-red-700 mt-1 text-sm">{pageError ?? 'Activity not found.'}</p>
              <button
                onClick={() => navigate('/student')}
                className="mt-4 px-4 py-2 bg-red-700 text-white rounded-lg text-sm hover:bg-red-800"
              >
                ← Back to Dashboard
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Phase nav pills ────────────────────────────────────────────────────────
  const phases: { key: Phase; label: string }[] = [
    { key: 'orient',  label: 'Orient'  },
    { key: 'inquiry', label: 'Inquiry' },
    { key: 'reflect', label: 'Reflect' },
    { key: 'done',    label: 'Done'    },
  ];

  const phaseIndex = (p: Phase) => phases.findIndex((x) => x.key === p);

  return (
    <div className="flex-1 bg-gray-50 min-h-screen">

      {/* GPS consent modal — shown once when a GPS-enabled session starts */}
      {gpsConsentPending && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="max-w-sm w-full mx-4 rounded-2xl p-6 shadow-xl bg-white">
            <h2 className="text-lg font-bold mb-2 text-gray-900">Location Sharing</h2>
            <p className="text-sm mb-4 text-gray-600">
              Your teacher wants to see your location during this activity so they can track
              fieldwork progress. Your location is only shared while the session is active.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => handleGpsConsent(true)}
                className="flex-1 py-2 rounded-lg text-white font-medium bg-green-700 hover:bg-green-800"
              >
                Allow
              </button>
              <button
                onClick={() => handleGpsConsent(false)}
                className="flex-1 py-2 rounded-lg font-medium border border-gray-300 text-gray-900"
              >
                Decline
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Background Info panel — built from data already loaded on this page
          (no network call here), so it works with no signal in the field. */}
      {showBackgroundInfo && (() => {
        const wiki = (activity as any).location_wiki_data as Record<string, any> | null | undefined;
        const description = wiki?.description || (activity as any).location_info || '';
        return (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="max-w-md w-full max-h-[85vh] overflow-y-auto rounded-2xl p-6 shadow-xl bg-white">
              <div className="flex items-start justify-between gap-3 mb-3">
                <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <Info className="w-5 h-5 text-blue-600" />
                  {wiki?.name || (activity as any).location || 'Background Info'}
                </h2>
                <button onClick={() => setShowBackgroundInfo(false)} className="text-gray-400 hover:text-gray-700 flex-shrink-0">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {description && (
                <p className="text-sm text-gray-700 leading-relaxed mb-4">{description}</p>
              )}

              {wiki?.features?.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">Notable Features</p>
                  <div className="flex flex-wrap gap-1.5">
                    {wiki.features.map((f: string, i: number) => (
                      <span key={i} className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full">{f}</span>
                    ))}
                  </div>
                </div>
              )}

              {(wiki?.architectOrArtist || wiki?.constructionDate || wiki?.historicalSignificance) && (
                <div className="mb-4 space-y-1.5 text-sm">
                  {wiki?.architectOrArtist && (
                    <p><span className="font-semibold text-gray-600">Architect/Artist:</span> <span className="text-gray-800">{wiki.architectOrArtist}</span></p>
                  )}
                  {wiki?.constructionDate && (
                    <p><span className="font-semibold text-gray-600">Constructed:</span> <span className="text-gray-800">{wiki.constructionDate}</span></p>
                  )}
                  {wiki?.historicalSignificance && (
                    <p><span className="font-semibold text-gray-600">Historical Significance:</span> <span className="text-gray-800">{wiki.historicalSignificance}</span></p>
                  )}
                </div>
              )}

              {wiki?.keywords?.length > 0 && (
                <div className="mb-4">
                  <div className="flex flex-wrap gap-1.5">
                    {wiki.keywords.map((k: string, i: number) => (
                      <span key={i} className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-full">{k}</span>
                    ))}
                  </div>
                </div>
              )}

              {wiki?.learningOpportunities?.length > 0 && (
                <div className="mb-2 bg-green-50 border border-green-200 rounded-lg p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-green-700 mb-1.5">Learning Opportunities</p>
                  <ul className="space-y-1">
                    {wiki.learningOpportunities.map((lo: string, i: number) => (
                      <li key={i} className="text-sm text-green-800 flex gap-1.5"><span className="text-green-400">•</span>{lo}</li>
                    ))}
                  </ul>
                </div>
              )}

              {!description && !wiki?.features?.length && !wiki?.learningOpportunities?.length && (
                <p className="text-sm text-gray-500">No background info was saved for this location.</p>
              )}

              <button
                onClick={() => setShowBackgroundInfo(false)}
                className="mt-4 w-full py-2 rounded-lg font-medium border border-gray-300 text-gray-900"
              >
                Close
              </button>
            </div>
          </div>
        );
      })()}

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-5">
          <button
            onClick={() => navigate('/student')}
            className="text-green-700 hover:text-green-800 text-sm font-medium mb-3 flex items-center gap-1"
          >
            ← Dashboard
          </button>
          <h1 className="text-2xl font-bold text-gray-900">{(activity as any).title}</h1>
          <p className="text-gray-600 mt-1 text-sm">{(activity as any).description}</p>

          <div className="flex flex-wrap gap-5 mt-3 text-sm text-gray-600">
            {(activity as any).location && (
              <span className="flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-green-600" />
                {(activity as any).location}
              </span>
            )}
            {(activity as any).subject && (
              <span className="flex items-center gap-1.5">
                <BookOpen className="w-4 h-4 text-blue-600" />
                {(activity as any).subject}
              </span>
            )}
            {(activity as any).estimated_duration_minutes && (
              <span className="flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-purple-600" />
                {(activity as any).estimated_duration_minutes} min
              </span>
            )}
            {((activity as any).location_wiki_data || (activity as any).location_info) && (
              <button
                onClick={() => setShowBackgroundInfo(true)}
                className="flex items-center gap-1.5 text-blue-700 hover:text-blue-900 font-medium"
              >
                <Info className="w-4 h-4" />
                Background Info
              </button>
            )}
          </div>
        </div>

        {/* Phase stepper */}
        <div className="max-w-4xl mx-auto px-4 pb-0">
          <div className="flex border-b border-gray-200">
            {phases.filter(p => p.key !== 'done').map((p, i) => {
              const isActive    = phase === p.key;
              const isCompleted = phaseIndex(phase) > i;
              const isLocked    = !session && p.key !== 'orient';
              return (
                <button
                  key={p.key}
                  disabled={isLocked}
                  onClick={() => !isLocked && session && setPhase(p.key)}
                  className={[
                    'px-6 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5',
                    isActive    ? 'border-green-600 text-green-700'          : '',
                    isCompleted ? 'border-transparent text-gray-500'         : '',
                    !isActive && !isCompleted ? 'border-transparent text-gray-400' : '',
                    isLocked    ? 'cursor-not-allowed opacity-40'            : 'cursor-pointer',
                  ].join(' ')}
                >
                  {isCompleted && <CheckCircle className="w-3.5 h-3.5 text-green-500" />}
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Feedback banner ─────────────────────────────────────────────────── */}
      {feedback && (
        <div className={`max-w-4xl mx-auto px-4 mt-4`}>
          <div className={`rounded-lg px-4 py-3 text-sm flex items-center gap-2 ${
            feedback.type === 'success'
              ? 'bg-green-50 border border-green-200 text-green-800'
              : 'bg-red-50 border border-red-200 text-red-800'
          }`}>
            {feedback.type === 'success'
              ? <CheckCircle className="w-4 h-4 flex-shrink-0" />
              : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
            {feedback.msg}
            <button onClick={() => setFeedback(null)} className="ml-auto text-current opacity-60 hover:opacity-100">✕</button>
          </div>
        </div>
      )}

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">

        {/* ════════════════ ORIENT PHASE ════════════════════════════════════ */}
        {phase === 'orient' && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            <h2 className="text-lg font-bold text-gray-900">{t('pages_studentactivitydetailpage.before_you_begin', 'Before you begin')}</h2>

            {(activity as any).phases?.orient ? (
              <>
                <div className="flex items-start justify-between gap-3">
                  <p className="text-gray-700 whitespace-pre-wrap leading-relaxed flex-1">
                    {(activity as any).phases.orient.instructions}
                  </p>
                  {window.speechSynthesis && (
                    <button
                      onClick={() => speakText((activity as any).phases.orient.instructions)}
                      className={`flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded text-xs border transition ${speaking ? 'bg-blue-100 border-blue-400 text-blue-700' : 'border-gray-200 text-gray-500 hover:border-blue-300'}`}
                      title={speaking ? 'Stop reading' : 'Read aloud'}
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                      {speaking ? 'Stop' : 'Read'}
                    </button>
                  )}
                </div>
                {(activity as any).phases.orient.due_date && (
                  <p className="text-sm text-gray-500">Due: {fmtDate((activity as any).phases.orient.due_date)}</p>
                )}
              </>
            ) : (
              <div className="flex items-start justify-between gap-3">
                <p className="text-gray-700 flex-1">
                  {(activity as any).description || 'Read the activity description and prepare for your field work.'}
                </p>
                {window.speechSynthesis && (
                  <button
                    onClick={() => speakText((activity as any).description || '')}
                    className={`flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded text-xs border transition ${speaking ? 'bg-blue-100 border-blue-400 text-blue-700' : 'border-gray-200 text-gray-500 hover:border-blue-300'}`}
                    title={speaking ? 'Stop reading' : 'Read aloud'}
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    {speaking ? 'Stop' : 'Read'}
                  </button>
                )}
              </div>
            )}

            {(activity as any).learning_objectives?.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm font-semibold text-blue-800 mb-2">{t('pages_studentactivitydetailpage.learning_objectives', 'Learning objectives')}</p>
                <ul className="space-y-1">
                  {((activity as any).learning_objectives as string[]).map((obj, i) => (
                    <li key={i} className="text-sm text-blue-700 flex gap-2">
                      <span className="text-blue-400 mt-0.5">•</span>{obj}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {(activity as any).materials_needed?.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <p className="text-sm font-semibold text-amber-800 mb-2">{t('pages_studentactivitydetailpage.materials_needed', 'Materials needed')}</p>
                <ul className="space-y-1">
                  {((activity as any).materials_needed as string[]).map((m, i) => (
                    <li key={i} className="text-sm text-amber-700 flex gap-2">
                      <span className="text-amber-400 mt-0.5">•</span>{m}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <button
              onClick={handleStartSession}
              disabled={sessionLoading}
              className="mt-2 flex items-center gap-2 px-6 py-3 bg-green-700 text-white rounded-lg font-medium hover:bg-green-800 disabled:opacity-60 transition"
            >
              {sessionLoading
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Starting…</>
                : <><ChevronRight className="w-4 h-4" /> I'm ready — Start Activity</>}
            </button>
          </div>
        )}

        {/* ════════════════ INQUIRY PHASE ═══════════════════════════════════ */}
        {phase === 'inquiry' && session && (
          <>
            {/* Inquiry instructions */}
            {(activity as any).phases?.inquiry && (
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-lg font-bold text-gray-900 mb-2">{t('pages_studentactivitydetailpage.your_inquiry_task', 'Your inquiry task')}</h2>
                <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">
                  {(activity as any).phases.inquiry.instructions}
                </p>
              </div>
            )}

            {/* Evidence submission form */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
              <h3 className="font-bold text-gray-900">{t('pages_studentactivitydetailpage.add_evidence', 'Add Evidence')}</h3>

              {/* Capture type selector */}
              <div className="flex gap-2 flex-wrap">
                {(['text', 'photo', 'audio', 'video'] as const).map((ct) => (
                  <button
                    key={ct}
                    onClick={() => { setCaptureType(ct); setEvidenceFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition ${
                      captureType === ct
                        ? 'bg-green-700 text-white border-green-700'
                        : 'bg-white text-gray-700 border-gray-200 hover:border-green-400'
                    }`}
                  >
                    {CAPTURE_TYPE_ICONS[ct]}
                    {ct.charAt(0).toUpperCase() + ct.slice(1)}
                  </button>
                ))}
              </div>

              <input
                type="text"
                placeholder={t('pages_studentactivitydetailpage.placeholder_title_optional', 'Title (optional)')}
                value={evidenceTitle}
                onChange={(e) => setEvidenceTitle(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
              />

              <textarea
                placeholder={captureType === 'text' ? 'Describe what you observed or discovered…' : 'Description (optional)'}
                value={evidenceDesc}
                onChange={(e) => setEvidenceDesc(e.target.value)}
                rows={captureType === 'text' ? 5 : 3}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-400 resize-none"
              />

              {captureType !== 'text' && (
                <div
                  className="border-2 border-dashed border-green-300 rounded-lg p-5 text-center cursor-pointer hover:bg-green-50 transition"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="w-6 h-6 mx-auto text-green-500 mb-2" />
                  <p className="text-sm text-gray-600">
                    {evidenceFile ? evidenceFile.name : `Click to select a ${captureType} file`}
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={
                      captureType === 'photo' ? 'image/*' :
                      captureType === 'video' ? 'video/*' :
                      captureType === 'audio' ? 'audio/*' : '*'
                    }
                    className="hidden"
                    onChange={(e) => setEvidenceFile(e.target.files?.[0] ?? null)}
                  />
                </div>
              )}

              <button
                onClick={handleAddEvidence}
                disabled={submitLoading}
                className="flex items-center gap-2 px-5 py-2.5 bg-green-700 text-white rounded-lg text-sm font-medium hover:bg-green-800 disabled:opacity-60 transition"
              >
                {submitLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                Save Evidence
              </button>
            </div>

            {/* Evidence list */}
            {evidence.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h3 className="font-bold text-gray-900 mb-3">Saved Evidence ({evidence.length})</h3>
                <div className="space-y-2">
                  {evidence.map((cap) => (
                    <div key={cap.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
                      <span className="mt-0.5 text-green-600">{CAPTURE_TYPE_ICONS[cap.capture_type] ?? <FileText className="w-4 h-4" />}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{cap.title || cap.capture_type}</p>
                        {cap.description && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{cap.description}</p>}
                      </div>
                      <span className="text-xs text-gray-400 flex-shrink-0">{cap.capture_type}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Advance to Reflect */}
            <div className="flex justify-end">
              <button
                onClick={() => setPhase('reflect')}
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition"
              >
                Continue to Reflection <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </>
        )}

        {/* ════════════════ REFLECT PHASE ═══════════════════════════════════ */}
        {phase === 'reflect' && session && (
          <>
            {(activity as any).phases?.reflect && (
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-lg font-bold text-gray-900 mb-2">{t('pages_studentactivitydetailpage.reflection', 'Reflection')}</h2>
                <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">
                  {(activity as any).phases.reflect.instructions}
                </p>
              </div>
            )}

            <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
              <h3 className="font-bold text-gray-900">{t('pages_studentactivitydetailpage.write_your_reflection', 'Write your reflection')}</h3>
              <p className="text-sm text-gray-600">{t('pages_studentactivitydetailpage.what_did_you_observe_what_did_you_learn_', 'What did you observe? What did you learn? How does it connect to your prior knowledge?')}</p>

              <input
                type="text"
                placeholder={t('pages_studentactivitydetailpage.placeholder_reflection_title_optional', 'Reflection title (optional)')}
                value={reflectionTitle}
                onChange={(e) => setReflectionTitle(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />

              <textarea
                placeholder={t('pages_studentactivitydetailpage.placeholder_write_your_reflection_here', 'Write your reflection here…')}
                value={reflection}
                onChange={(e) => setReflection(e.target.value)}
                rows={8}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
              />

              <div className="flex gap-3 flex-wrap">
                <button
                  onClick={handleAddReflection}
                  disabled={submitLoading}
                  className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60 transition"
                >
                  {submitLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                  Save Reflection
                </button>

                <button
                  onClick={handleSubmit}
                  disabled={submitLoading}
                  className="flex items-center gap-2 px-5 py-2.5 bg-green-700 text-white rounded-lg text-sm font-medium hover:bg-green-800 disabled:opacity-60 transition"
                >
                  {submitLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                  Submit Activity
                </button>

                <button
                  onClick={() => setPhase('inquiry')}
                  className="px-4 py-2.5 text-sm text-gray-600 hover:text-gray-900 transition"
                >
                  ← Back to Inquiry
                </button>
              </div>
            </div>
          </>
        )}

        {/* ════════════════ DONE ════════════════════════════════════════════ */}
        {phase === 'done' && (
          <div className="bg-white rounded-xl border border-green-200 p-10 text-center">
            <CheckCircle className="w-16 h-16 mx-auto text-green-500 mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">{t('pages_studentactivitydetailpage.activity_submitted', 'Activity Submitted!')}</h2>
            <p className="text-gray-600 mb-6">{t('pages_studentactivitydetailpage.great_work_your_teacher_will_review_your', 'Great work. Your teacher will review your evidence and reflection.')}</p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => navigate('/student')}
                className="px-6 py-3 bg-green-700 text-white rounded-lg font-medium hover:bg-green-800 transition"
              >
                Back to Dashboard
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default StudentActivityDetailPage;
