import { useTranslation } from 'react-i18next';
// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

// ============================================================================
// frontend/src/components/student/SelfProjectView.tsx
// ============================================================================

import React, { useEffect, useState } from 'react';
import { Archive, BookOpen, ChevronRight, Loader2, Plus, Share2 } from 'lucide-react';
import { selfProjectApi } from '../../services/phase7Api';
import { FieldNoteList } from './FieldNoteEditor';
import { FieldNoteEditor } from './FieldNoteEditor';
import type { SelfProject, FieldNoteListItem } from '../../types/phase7';

interface SelfProjectViewProps {
  classId?: string;
}

export const SelfProjectView: React.FC<SelfProjectViewProps> = ({ classId }) => {
  const { t } = useTranslation('landing');
  const [projects, setProjects] = useState<SelfProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<SelfProject | null>(null);
  const [selectedNote, setSelectedNote] = useState<FieldNoteListItem | null>(null);
  const [showNewNote, setShowNewNote] = useState(false);
  const [shareClassId, setShareClassId] = useState('');

  const load = () => {
    setLoading(true);
    selfProjectApi.list().
    then(setProjects).
    catch(() => setError('Could not load projects')).
    finally(() => setLoading(false));
  };

  useEffect(() => {load();}, []);

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    setError(null);
    try {
      const proj = await selfProjectApi.create({ title: newTitle.trim(), description: newDesc.trim() });
      setProjects((prev) => [proj, ...prev]);
      setCreating(false);
      setNewTitle('');
      setNewDesc('');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Could not create project');
    }
  };

  const handleArchive = async (proj: SelfProject) => {
    await selfProjectApi.archive(proj.id);
    load();
  };

  const handleShare = async (proj: SelfProject) => {
    if (!shareClassId.trim()) return;
    try {
      await selfProjectApi.requestClassmateShare(proj.id, { class_id: shareClassId });
      setShareClassId('');
      setError(null);
      alert('Sharing request sent to your teacher!');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Share request failed');
    }
  };

  const activeProjects = projects.filter((p) => p.status !== 'archived');
  const atQuota = activeProjects.length >= 2;

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-blue-500" /></div>;
  }

  // Detail view — a specific project with its field notes
  if (selectedProject) {
    if (showNewNote || selectedNote) {
      return (
        <div className="space-y-3">
          <button
            onClick={() => {setShowNewNote(false);setSelectedNote(null);}}
            className="text-sm text-blue-600 hover:underline">{t("landing:back_to", "\u2190 Back to")}

            {selectedProject.title}
          </button>
          <FieldNoteEditor
            noteId={selectedNote?.id}
            selfProjectId={selectedProject.id}
            onSave={() => {setShowNewNote(false);setSelectedNote(null);}}
            onClose={() => {setShowNewNote(false);setSelectedNote(null);}} />
          
        </div>);

    }
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSelectedProject(null)}
            className="text-sm text-blue-600 hover:underline">{t("landing:selfprojectview.my_projects", "\u2190 My Projects")}


          </button>
          <span className="text-gray-300">/</span>
          <h2 className="text-sm font-semibold text-gray-800">{selectedProject.title}</h2>
          <span className="text-xs text-gray-400 capitalize">{selectedProject.status}</span>
        </div>

        {selectedProject.description &&
        <p className="text-sm text-gray-600">{selectedProject.description}</p>
        }

        {/* Share to classmates (if class context given) */}
        {classId && selectedProject.status !== 'archived' &&
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
            <p className="font-medium text-blue-800 mb-2">{t("landing:share_this_project_with_your_classmates", "Share this project with your classmates?")}</p>
            <p className="text-xs text-blue-600 mb-2">{t("landing:your_teacher_will_review_it_first", "Your teacher will review it first.")}</p>
            <button
            onClick={() => handleShare({ ...selectedProject, class_id: classId } as any)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white
                         rounded-lg hover:bg-blue-700 text-xs font-medium">

            
              <Share2 className="w-3 h-3" />{t("landing:request_to_share", "Request to Share")}

          </button>
          </div>
        }

        <FieldNoteList
          selfProjectId={selectedProject.id}
          onSelect={setSelectedNote}
          onNew={() => setShowNewNote(true)} />
        
      </div>);

  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-800">{t("landing:selfprojectview.my_projects", "My Projects")}</h2>
          <p className="text-xs text-gray-400">{activeProjects.length}{t("landing:2_active", "/2 active")}</p>
        </div>
        {!atQuota && !creating &&
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white
                       rounded-lg hover:bg-blue-700 text-sm font-medium">

          
            <Plus className="w-3.5 h-3.5" />{t("landing:selfprojectview.new_project", "New Project")}

        </button>
        }
      </div>

      {error &&
      <div className="text-sm text-red-600 bg-red-50 rounded-lg p-2 border border-red-200">
          {error}
        </div>
      }

      {/* Create form */}
      {creating &&
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-medium text-blue-800">{t("landing:new_selfproject", "New Self-Project")}</h3>
          <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder={t("landing:selfprojectview.project_title", "Project title")}
          className="w-full border border-blue-200 rounded-lg px-3 py-2 text-sm
                       focus:outline-none focus:ring-2 focus:ring-blue-300" />

        
          <textarea
          value={newDesc}
          onChange={(e) => setNewDesc(e.target.value)}
          rows={2}
          placeholder={t("landing:what_are_you_investigating_optional", "What are you investigating? (optional)")}
          className="w-full border border-blue-200 rounded-lg px-3 py-2 text-sm resize-none
                       focus:outline-none focus:ring-2 focus:ring-blue-300" />

        
          <div className="flex gap-2">
            <button onClick={handleCreate}
          className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">{t("landing:create", "Create")}

          </button>
            <button onClick={() => setCreating(false)}
          className="px-3 py-1.5 bg-white border border-gray-200 text-gray-600
                               rounded-lg text-sm hover:bg-gray-50">{t("landing:cancel", "Cancel")}


          </button>
          </div>
        </div>
      }

      {/* Project cards */}
      <div className="space-y-3">
        {projects.length === 0 &&
        <div className="text-center py-10 text-gray-400">
            <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">{t("landing:no_projects_yet_create_one_to_start_coll", "No projects yet. Create one to start collecting field notes!")}</p>
          </div>
        }
        {projects.map((proj) =>
        <div key={proj.id}
        className={`bg-white rounded-xl border shadow-sm overflow-hidden
               ${proj.status === 'archived' ? 'opacity-60' : ''}`}>
            <button
            onClick={() => proj.status !== 'archived' && setSelectedProject(proj)}
            className="w-full flex items-start gap-3 p-4 text-left hover:bg-gray-50 transition">
            
              <BookOpen className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-gray-800">{proj.title}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full
                    ${proj.status === 'archived' ? 'bg-gray-100 text-gray-500' : 'bg-blue-50 text-blue-700'}`}>
                    {proj.status}
                  </span>
                </div>
                {proj.description &&
              <p className="text-xs text-gray-500 mt-0.5 truncate">{proj.description}</p>
              }
                <p className="text-xs text-gray-400 mt-1">{proj.field_note_count}{t("landing:selfprojectview.field_notes", "field notes")}</p>
              </div>
              {proj.status !== 'archived' &&
            <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0 mt-0.5" />
            }
            </button>
            {proj.status !== 'archived' &&
          <div className="border-t border-gray-100 px-4 py-2 flex justify-end">
                <button
              onClick={() => handleArchive(proj)}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600">
              
                  <Archive className="w-3 h-3" />{t("landing:archive", "Archive")}

            </button>
              </div>
          }
          </div>
        )}
      </div>

      {atQuota && !creating &&
      <p className="text-xs text-center text-amber-600 bg-amber-50 rounded-lg p-2 border border-amber-200">{t("landing:you_have_2_active_projects_archive_one_t", "You have 2 active projects \u2014 archive one to create a new one.")}

      </p>
      }
    </div>);

};


// ============================================================================
// frontend/src/components/student/PeerProjectBuilder.tsx
// ============================================================================

import { peerProjectApi } from '../../services/phase7Api';
import type { PeerProject, PeerProjectCreate, CaptureType } from '../../types/phase7';

interface PeerProjectBuilderProps {
  classId: string;
  existingId?: string;
  templateActivityId?: string;
  onPublished?: (project: PeerProject) => void;
  onClose?: () => void;
}

const ALL_CAPTURE_TYPES: {type: CaptureType;label: string;icon: string;}[] = [
{ type: 'photo', label: 'Photo', icon: '📷' },
{ type: 'audio', label: 'Audio', icon: '🎙️' },
{ type: 'video', label: 'Video', icon: '🎬' },
{ type: 'text', label: 'Text', icon: '✏️' },
{ type: 'sketch', label: 'Sketch', icon: '✏️' },
{ type: 'measurement', label: 'Measurement', icon: '📏' }];


export const PeerProjectBuilder: React.FC<PeerProjectBuilderProps> = ({
  classId, existingId, templateActivityId, onPublished, onClose
}) => {
  const { t } = useTranslation('landing');
  const [project, setProject] = useState<PeerProject | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [prompts, setPrompts] = useState([{ prompt: '', order: 0 }]);
  const [objectives, setObjectives] = useState([{ text: '', order: 0 }]);
  const [allowedTypes, setAllowedTypes] = useState<CaptureType[]>(['photo', 'text']);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(!!existingId);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'edit' | 'preview'>(existingId ? 'preview' : 'edit');

  useEffect(() => {
    if (!existingId) return;
    setLoading(true);
    peerProjectApi.get(existingId).then((p) => {
      setProject(p);
      setTitle(p.title);
      setDescription(p.description);
      setPrompts(p.guiding_prompts.length ? p.guiding_prompts : [{ prompt: '', order: 0 }]);
      setObjectives(p.learning_objectives_text.length ? p.learning_objectives_text : [{ text: '', order: 0 }]);
      setAllowedTypes(p.allowed_capture_types);
      setStep('edit');
    }).finally(() => setLoading(false));
  }, [existingId]);

  const toggleCaptureType = (type: CaptureType) => {
    setAllowedTypes((prev) =>
    prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const addPrompt = () => setPrompts((p) => [...p, { prompt: '', order: p.length }]);
  const updatePrompt = (i: number, val: string) =>
  setPrompts((p) => p.map((item, idx) => idx === i ? { ...item, prompt: val } : item));
  const removePrompt = (i: number) => setPrompts((p) => p.filter((_, idx) => idx !== i));

  const addObjective = () => setObjectives((o) => [...o, { text: '', order: o.length }]);
  const updateObjective = (i: number, val: string) =>
  setObjectives((o) => o.map((item, idx) => idx === i ? { ...item, text: val } : item));

  const handleSaveDraft = async () => {
    if (!title.trim() || !description.trim()) {
      setError('Title and description are required');
      return;
    }
    if (allowedTypes.length === 0) {
      setError('Select at least one capture type');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const data: PeerProjectCreate = {
        title: title.trim(),
        description: description.trim(),
        learning_objectives_text: objectives.filter((o) => o.text.trim()),
        guiding_prompts: prompts.filter((p) => p.prompt.trim()),
        allowed_capture_types: allowedTypes,
        audience: 'whole_class',
        template_activity_id: templateActivityId
      };
      const saved = existingId ?
      await peerProjectApi.update(existingId, data) :
      await peerProjectApi.create(classId, data);
      setProject(saved);
      setStep('preview');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    if (!project) return;
    setSubmitting(true);
    try {
      const result = await peerProjectApi.submit(project.id);
      setProject((prev) => prev ? { ...prev, status: result.status } : null);
      onPublished?.({ ...project, status: result.status });
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-blue-500" /></div>;
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">
            {existingId ? 'Edit Peer Project' : 'Create Peer Project'}
          </h3>
          {templateActivityId &&
          <p className="text-xs text-blue-600">{t("landing:adapting_from_teacher_activity", "Adapting from teacher activity")}</p>
          }
        </div>
        <div className="flex items-center gap-2">
          {project &&
          <span className={`text-xs px-2 py-0.5 rounded-full
              ${project.status === 'published' ? 'bg-green-100 text-green-700' :
          project.status === 'pending_approval' ? 'bg-yellow-100 text-yellow-700' :
          project.status === 'rejected' ? 'bg-red-100 text-red-700' :
          'bg-gray-100 text-gray-600'}`}>
              {project.status.replace('_', ' ')}
            </span>
          }
          {onClose &&
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <span className="text-lg">×</span>
            </button>
          }
        </div>
      </div>

      <div className="p-4 space-y-5">
        {error &&
        <div className="text-sm text-red-600 bg-red-50 rounded-lg p-2 border border-red-200">{error}</div>
        }

        {project?.teacher_feedback &&
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="text-xs font-semibold text-amber-800 mb-1">{t("landing:teacher_feedback", "Teacher Feedback")}</p>
            <p className="text-sm text-amber-700">{project.teacher_feedback}</p>
          </div>
        }

        {/* Title */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">{t("landing:selfprojectview.project_title", "Project Title *")}</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Project title"
          placeholder={t("landing:what_challenge_will_classmates_explore", "What challenge will classmates explore?")}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                            focus:outline-none focus:ring-2 focus:ring-blue-300" />
          
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">{t("landing:selfprojectview.description", "Description *")}</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)}
          rows={3} placeholder={t("landing:explain_what_you_want_classmates_to_obse", "Explain what you want classmates to observe or explore\u2026")}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none
                               focus:outline-none focus:ring-2 focus:ring-blue-300" />
          
        </div>

        {/* Learning objectives */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-medium text-gray-600">{t("landing:learning_objectives", "Learning Objectives")}</label>
            <button onClick={addObjective} className="text-xs text-blue-600 hover:underline">{t("landing:selfprojectview.add", "+ Add")}</button>
          </div>
          {objectives.map((obj, i) =>
          <input key={i} value={obj.text} aria-label={`Objective ${i + 1}`}
          onChange={(e) => updateObjective(i, e.target.value)}
          placeholder={`Objective ${i + 1}`}
          className="w-full border border-gray-100 rounded-lg px-3 py-1.5 text-sm mb-1.5
                              focus:outline-none focus:ring-2 focus:ring-blue-200" />

          )}
        </div>

        {/* Guiding prompts */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-medium text-gray-600">{t("landing:selfprojectview.guiding_prompts", "Guiding Prompts")}</label>
            <button onClick={addPrompt} className="text-xs text-blue-600 hover:underline">{t("landing:selfprojectview.add", "+ Add")}</button>
          </div>
          {prompts.map((p, i) =>
          <div key={i} className="flex gap-1.5 mb-1.5">
              <input value={p.prompt} aria-label="Prompt text"
            onChange={(e) => updatePrompt(i, e.target.value)}
            placeholder={`Question ${i + 1} — e.g. "What do you notice about…?"`}
            className="flex-1 border border-gray-100 rounded-lg px-3 py-1.5 text-sm
                                focus:outline-none focus:ring-2 focus:ring-blue-200" />
            
              {prompts.length > 1 &&
            <button onClick={() => removePrompt(i)}
            className="text-gray-300 hover:text-red-400 px-1">×</button>
            }
            </div>
          )}
        </div>

        {/* Allowed capture types */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-2">{t("landing:what_can_classmates_submit", "What can classmates submit? *")}

          </label>
          <div className="grid grid-cols-3 gap-2">
            {ALL_CAPTURE_TYPES.map((ct) =>
            <button
              key={ct.type}
              onClick={() => toggleCaptureType(ct.type)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm transition
                  ${allowedTypes.includes(ct.type) ?
              'border-blue-500 bg-blue-50 text-blue-700' :
              'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}>
              
                <span>{ct.icon}</span>
                {ct.label}
              </button>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-2 border-t border-gray-100">
          <button
            onClick={handleSaveDraft}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white
                       rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium">

            
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            {project ? 'Save Changes' : 'Save Draft'}
          </button>

          {project && ['draft', 'rejected'].includes(project.status) &&
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white
                         rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm font-medium">

            
              {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}{t("landing:submit_to_teacher", "Submit to Teacher")}

          </button>
          }
        </div>
      </div>
    </div>);

};


// ============================================================================
// frontend/src/components/student/PeerProjectResponseView.tsx
// ============================================================================

import { audioApi } from '../../services/phase7Api';
import { AudioPlayer } from './AudioCapture';
import type { PeerProject as PeerProjectModel, PeerProjectResponse as PRType } from '../../types/phase7';

interface PeerProjectResponseViewProps {
  project: PeerProject;
  onComplete?: () => void;
}

export const PeerProjectResponseView: React.FC<PeerProjectResponseViewProps> = ({
  project, onComplete
}) => {
  const { t } = useTranslation('landing');
  const [response, setResponse] = useState<PRType | null>(null);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAudio, setShowAudio] = useState(false);

  useEffect(() => {
    setLoading(true);
    peerProjectApi.getMyResponse(project.id).
    then(setResponse).
    catch(async () => {
      // Start response if none yet
      try {
        const r = await peerProjectApi.startResponse(project.id);
        setResponse(r);
      } catch (err: any) {
        setError(err.response?.data?.detail || 'Could not start response');
      }
    }).
    finally(() => setLoading(false));
  }, [project.id]);

  const handleAudioCaptured = async (result: any) => {
    if (!response) return;
    try {
      await peerProjectApi.addCaptureToResponse(project.id, result.id);
      const updated = await peerProjectApi.getMyResponse(project.id);
      setResponse(updated);
    } catch {
      setError('Could not add audio to response');
    }
    setShowAudio(false);
  };

  const handleComplete = async () => {
    if (!response) return;
    setCompleting(true);
    try {
      await peerProjectApi.completeResponse(project.id);
      setResponse((prev) => prev ? { ...prev, status: 'completed' } : null);
      onComplete?.();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Could not complete response');
    } finally {
      setCompleting(false);
    }
  };

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-blue-500" /></div>;

  return (
    <div className="space-y-4">
      {/* Project info */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-blue-900">{project.title}</h3>
        <p className="text-sm text-blue-700 mt-1">{project.description}</p>
      </div>

      {/* Guiding prompts */}
      {project.guiding_prompts.length > 0 &&
      <div className="space-y-2">
          <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{t("landing:selfprojectview.guiding_prompts", "Guiding Prompts")}

        </h4>
          {[...project.guiding_prompts].sort((a, b) => a.order - b.order).map((p, i) =>
        <div key={i} className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <p className="text-sm text-amber-800">{p.prompt}</p>
            </div>
        )}
        </div>
      }

      {/* Example captures */}
      {project.example_captures.length > 0 &&
      <div>
          <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">{t("landing:authors_examples", "Author's Examples")}

        </h4>
          <div className="space-y-2">
            {project.example_captures.map((ex) =>
          <div key={ex.id} className="bg-gray-50 rounded-lg p-2 text-sm text-gray-600">
                {ex.capture?.capture_type === 'audio' && ex.capture.id ?
            <AudioPlayer src={audioApi.streamUrl(ex.capture.id)}
            durationSeconds={ex.capture.duration_seconds}
            label={ex.caption || 'Example audio'} /> :

            <p>{ex.caption || `${ex.capture?.capture_type} example`}</p>
            }
              </div>
          )}
          </div>
        </div>
      }

      {error &&
      <div className="text-sm text-red-600 bg-red-50 rounded-lg p-2">{error}</div>
      }

      {/* My response */}
      {response &&
      <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{t("landing:your_response", "Your Response")}

          </h4>
            <span className={`text-xs px-2 py-0.5 rounded-full
              ${response.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
              {response.status === 'completed' ? '✓ Submitted' : 'In Progress'}
            </span>
          </div>

          <p className="text-xs text-gray-400 mb-2">{t("landing:allowed", "Allowed:")}
          {project.allowed_capture_types.join(', ')}
          </p>

          {/* Submitted captures */}
          {response.captures.length > 0 &&
        <div className="space-y-2 mb-3">
              {response.captures.map((cap) =>
          <div key={cap.id} className="bg-gray-50 rounded-lg p-2 text-sm text-gray-600">
                  {cap.capture_type === 'audio' ?
            <AudioPlayer src={audioApi.streamUrl(cap.id)}
            durationSeconds={cap.duration_seconds}
            label="Your audio" /> :

            <span className="capitalize">{cap.capture_type}{t("landing:capture", "capture")}</span>
            }
                </div>
          )}
            </div>
        }

          {response.status !== 'completed' &&
        <>
              {/* Audio capture */}
              {project.allowed_capture_types.includes('audio') && !showAudio &&
          <button
            onClick={() => setShowAudio(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-700
                             rounded-lg hover:bg-gray-200 text-sm mb-2">{t("landing:selfprojectview.add_audio", "\uD83C\uDF99\uFE0F Add Audio")}



          </button>
          }

              {showAudio &&
          <div className="mb-2">
                  {/* AudioCapture inline */}
                  <button onClick={() => setShowAudio(false)}
            className="text-xs text-gray-400 mb-1 hover:text-gray-600">{t("landing:cancel", "Cancel")}</button>
                  {/* AudioCapture component is imported at top of file */}
                </div>
          }

              <button
            onClick={handleComplete}
            disabled={completing || response.captures.length === 0}
            className="w-full py-2 bg-green-600 text-white rounded-lg hover:bg-green-700
                           disabled:opacity-50 text-sm font-medium mt-2">

            
                {completing ? 'Submitting…' : 'Submit Response'}
              </button>
              {response.captures.length === 0 &&
          <p className="text-xs text-gray-400 text-center mt-1">{t("landing:add_at_least_one_capture_before_submitti", "Add at least one capture before submitting")}

          </p>
          }
            </>
        }
        </div>
      }
    </div>);

};


// ============================================================================
// frontend/src/components/student/PeerProjectAuthorDashboard.tsx
// ============================================================================

interface PeerProjectAuthorDashboardProps {
  classId: string;
}

export const PeerProjectAuthorDashboard: React.FC<PeerProjectAuthorDashboardProps> = ({
  classId
}) => {
  const { t } = useTranslation('landing');
  const [projects, setProjects] = useState<PeerProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<PeerProject | null>(null);
  const [creating, setCreating] = useState(false);

  const load = () => {
    setLoading(true);
    peerProjectApi.listAuthored().then((r) => setProjects(r.items)).finally(() => setLoading(false));
  };

  useEffect(() => {load();}, []);

  if (creating) {
    return (
      <div className="space-y-3">
        <button onClick={() => setCreating(false)}
        className="text-sm text-blue-600 hover:underline">{t("landing:selfprojectview.back", "\u2190 Back")}</button>
        <PeerProjectBuilder
          classId={classId}
          onPublished={(proj) => {setCreating(false);load();}}
          onClose={() => setCreating(false)} />
        
      </div>);

  }

  if (selected) {
    return (
      <div className="space-y-3">
        <button onClick={() => {setSelected(null);load();}}
        className="text-sm text-blue-600 hover:underline">{t("landing:selfprojectview.my_projects", "\u2190 My Projects")}</button>
        <PeerProjectBuilder
          classId={classId}
          existingId={selected.id}
          onPublished={() => {setSelected(null);load();}}
          onClose={() => setSelected(null)} />
        
      </div>);

  }

  const statusOrder = ['draft', 'pending_approval', 'published', 'rejected', 'archived'];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-800">{t("landing:my_peer_projects", "My Peer Projects")}</h2>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white
                     rounded-lg hover:bg-blue-700 text-sm font-medium">

          
          <Plus className="w-3.5 h-3.5" />{t("landing:selfprojectview.new_project", "New Project")}

        </button>
      </div>

      {loading ?
      <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-blue-500" /></div> :
      projects.length === 0 ?
      <div className="text-center py-10 text-gray-400">
          <p className="text-sm">{t("landing:you_havent_created_any_peer_projects_yet", "You haven't created any peer projects yet.")}</p>
          <button onClick={() => setCreating(true)}
        className="mt-2 text-blue-600 text-sm hover:underline">{t("landing:create_your_first_one", "Create your first one")}</button>
        </div> :

      <div className="space-y-3">
          {[...projects].sort((a, b) =>
        statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status)
        ).map((proj) =>
        <div key={proj.id}
        className="bg-white rounded-xl border shadow-sm overflow-hidden hover:shadow-md transition">
              <button
            onClick={() => setSelected(proj)}
            className="w-full text-left p-4">
            
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{proj.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5 truncate">{proj.description}</p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                      <span>{proj.response_count}{t("landing:selfprojectview.responses", "responses")}</span>
                      <span>{proj.completed_response_count}{t("landing:completed", "completed")}</span>
                      <span>{proj.allowed_capture_types.join(', ')}</span>
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ml-2
                    ${proj.status === 'published' ? 'bg-green-100 text-green-700' :
              proj.status === 'pending_approval' ? 'bg-yellow-100 text-yellow-700' :
              proj.status === 'rejected' ? 'bg-red-100 text-red-700' :
              'bg-gray-100 text-gray-600'}`}>
                    {proj.status.replace('_', ' ')}
                  </span>
                </div>
                {proj.teacher_feedback &&
            <div className="mt-2 text-xs bg-amber-50 border border-amber-200 rounded p-2 text-amber-700">{t("landing:selfprojectview.teacher", "Teacher:")}
              {proj.teacher_feedback}
                  </div>
            }
              </button>
            </div>
        )}
        </div>
      }
    </div>);

};

export default PeerProjectAuthorDashboard;