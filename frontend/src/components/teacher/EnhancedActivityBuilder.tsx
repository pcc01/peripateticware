// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import { useTranslation } from 'react-i18next';
import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation, Link } from 'react-router-dom';
import { useTeacherStore } from '@/stores';
import { useAuthStore } from '@/stores/auth';
import { LocationPicker } from './LocationPicker';
import { OllamaLessonSuggestions } from './OllamaLessonSuggestions';
import { WikiLocationInfo } from './WikiLocationInfo';
import { CurriculumMapper } from './CurriculumMapper';
import styles from './ActivityBuilder.module.css';

// Map Bloom's taxonomy string labels to integer levels (1–6)
const BLOOM_LEVEL_MAP: Record<string, number> = {
  remember: 1, understand: 2, apply: 3, analyze: 4, evaluate: 5, create: 6,
};

const MARZANO_LABELS: Record<number, string> = {
  1: 'Retrieval', 2: 'Comprehension', 3: 'Analysis', 4: 'Knowledge Utilization',
};
const DOK_LABELS: Record<number, string> = {
  1: 'Recall & Reproduction', 2: 'Skills & Concepts', 3: 'Strategic Thinking', 4: 'Extended Thinking',
};
const SOLO_LABELS: Record<number, string> = {
  1: 'Pre-structural', 2: 'Uni-structural', 3: 'Multi-structural', 4: 'Relational', 5: 'Extended Abstract',
};

// Map frontend activity_type values to backend enum values
const ACTIVITY_TYPE_MAP: Record<string, string> = {
  'field-observation': 'field_observation',
  'field_observation': 'field_observation',
  'inquiry': 'inquiry',
  'hands-on': 'hands_on',
  'hands_on': 'hands_on',
  'project': 'inquiry',
  'discussion': 'discussion',
  'experiment': 'inquiry',
  'discovery': 'inquiry',
};

async function apiPost(path: string, body: object, token: string | null) {
  const res = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Request failed (${res.status})`);
  }
  return res.json();
}

async function apiPut(path: string, body: object, token: string | null) {
  const res = await fetch(path, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Request failed (${res.status})`);
  }
  return res.json();
}

interface ActivityLocation {
  latitude: number | null;
  longitude: number | null;
  address?: string;
  wikiId?: string;
}

interface ActivityData {
  title: string;
  description: string;
  subject: string;
  grade_level: number;
  activity_type: string;
  difficulty_level: number;
  estimated_duration_minutes: number;
  location: ActivityLocation;
  learning_objectives: string[];
  bloom_level: string;
  marzano_level: number | null;
  dok_level: number | null;
  solo_level: number | null;
  rubric_id: string | null;
  assessment_type: string;
  materials_needed: string[];
  resources: string[];
  location_info?: string;
  suggested_lessons?: string[];
  curriculum_units?: string[];
  // Phase content — what students actually read on the mobile app
  orient_phase: string;
  inquiry_phase: string;
  reflect_phase: string;
}

export const ActivityBuilder = () => {
  const { t } = useTranslation('landing');
  const navigate = useNavigate();
  const { id } = useParams();
  const location = useLocation();
  const rubricsBase = location.pathname.startsWith('/homeschool') ? '/homeschool/rubrics' : '/teacher/rubrics';
  const token = useAuthStore((s) => s.token);
  const currentUser = useAuthStore((s) => s.user);

  const [formData, setFormData] = useState<ActivityData>({
    title: '',
    description: '',
    subject: 'Science',
    grade_level: 6,
    activity_type: 'field-observation',
    difficulty_level: 3,
    estimated_duration_minutes: 60,
    location: { latitude: null, longitude: null },
    learning_objectives: [],
    bloom_level: 'apply',
    marzano_level: null,
    dok_level: null,
    solo_level: null,
    rubric_id: null,
    assessment_type: 'formative',
    materials_needed: [],
    resources: [],
    location_info: '',
    suggested_lessons: [],
    curriculum_units: [],
    orient_phase: '',
    inquiry_phase: '',
    reflect_phase: '',
  });

  const [rubrics, setRubrics] = useState<{ id: string; title: string }[]>([]);

  // Load existing activity when editing (id present in URL)
  useEffect(() => {
    if (!id || !token) return;
    fetch(`/api/v1/activities/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!data) return;
        setFormData((prev) => ({
          ...prev,
          title: data.title ?? '',
          description: data.description ?? '',
          subject: data.subject ?? 'Science',
          grade_level: data.grade_level ?? 6,
          activity_type: data.activity_type ?? 'field-observation',
          difficulty_level: data.difficulty_level ?? 3,
          estimated_duration_minutes: data.estimated_duration_minutes ?? 60,
          location: {
            latitude: data.location_latitude ?? null,
            longitude: data.location_longitude ?? null,
            address: data.location_name ?? '',
          },
          learning_objectives: data.learning_objectives ?? [],
          bloom_level: data.bloom_level ? String(data.bloom_level) : 'apply',
          assessment_type: data.assessment_type ?? 'formative',
          materials_needed: data.materials_needed ?? [],
          resources: data.resources ?? [],
          location_info: data.location_info ?? '',
          orient_phase: data.orient_phase ?? '',
          inquiry_phase: data.inquiry_phase ?? '',
          reflect_phase: data.reflect_phase ?? '',
          curriculum_units: data.curriculum_units ?? [],
        }));
      })
      .catch(() => {});
  }, [id, token]);

  useEffect(() => {
    fetch('/api/v1/rubrics', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => r.ok ? r.json() : [])
      .then((data) => setRubrics(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [token]);

  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [gpsEnabled, setGpsEnabled] = useState(false);
  const [homeschoolGpsConsent, setHomeschoolGpsConsent] = useState(false);
  const [showOllamaSuggestions, setShowOllamaSuggestions] = useState(false);
  const [showWikiInfo, setShowWikiInfo] = useState(false);
  const [showCurriculum, setShowCurriculum] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('basic');
  const [taxonomyType, setTaxonomyType] = useState<string>('blooms');
  const [phaseGenerating, setPhaseGenerating] = useState<{ orient: boolean; inquiry: boolean; reflect: boolean }>({
    orient: false, inquiry: false, reflect: false,
  });

  /** Call the inference endpoint and return the raw text response */
  const callInference = async (prompt: string): Promise<string> => {
    const res = await fetch('/api/v1/inference/inquiry', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        session_id: 'activity-builder-phase',
        input_type: 'text',
        input_text: prompt,
        location_name: formData.location_info || formData.location.address || 'outdoor setting',
        latitude: formData.location.latitude ?? 0,
        longitude: formData.location.longitude ?? 0,
      }),
    });
    if (!res.ok) throw new Error(`${res.status}`);
    const data = await res.json();
    return data.response || data.next_question || data.content || data.text || '';
  };

  /** Generate content for a specific phase using the activity's metadata */
  const generatePhaseContent = async (phase: 'orient' | 'inquiry' | 'reflect') => {
    setPhaseGenerating((p) => ({ ...p, [phase]: true }));
    try {
      const meta = [
        `ACTIVITY TITLE: ${formData.title || '(untitled)'}`,
        formData.subject ? `SUBJECT: ${formData.subject}` : '',
        `GRADE LEVEL: Grade ${formData.grade_level}`,
        formData.estimated_duration_minutes ? `DURATION: ${formData.estimated_duration_minutes} minutes` : '',
        formData.location.address ? `LOCATION: ${formData.location.address}` : '',
        formData.description ? `DESCRIPTION: ${formData.description}` : '',
        formData.learning_objectives.filter(Boolean).length > 0
          ? `LEARNING OBJECTIVES:\n${formData.learning_objectives.filter(Boolean).map((o) => `- ${o}`).join('\n')}`
          : '',
      ].filter(Boolean).join('\n');

      let prompt = '';
      if (phase === 'orient') {
        prompt = `You are an expert outdoor and place-based educator.\n\nWrite a short Orient phase instruction (3–5 sentences) for students arriving at this field activity. It should prompt them to use all their senses, slow down, and notice their surroundings before the investigation begins. Be specific to the location and subject if provided. Write as direct student-facing instructions.\n\n${meta}\n\nRespond with ONLY the orient instructions text, no titles or labels.`;
      } else if (phase === 'inquiry') {
        prompt = `You are an expert outdoor and place-based educator.\n\nWrite an Inquiry phase instruction set for students doing this field activity. Include 2–3 specific investigation prompts or questions students should pursue. Reference the 4 available capture tools (photo, video, audio recording, written notes) where appropriate. Write as direct student-facing instructions.\n\n${meta}\n\nRespond with ONLY the inquiry instructions text, no titles or labels.`;
      } else {
        prompt = `You are an expert outdoor and place-based educator.\n\nWrite a Reflect phase prompt (2–4 sentences) for students who have just completed this field activity. It should ask them to connect evidence they collected to a broader concept, or articulate what the place taught them. Write as a direct student-facing question or prompt.\n\n${meta}\n\nRespond with ONLY the reflection prompt text, no titles or labels.`;
      }

      const text = await callInference(prompt);
      if (text.trim()) {
        setFormData((p) => ({ ...p, [`${phase}_phase`]: text.trim() }));
      } else {
        alert('AI returned an empty response. Check your Ollama/LLM configuration.');
      }
    } catch (err) {
      alert(`AI generation failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setPhaseGenerating((p) => ({ ...p, [phase]: false }));
    }
  };

  const TAXONOMIES: Record<string, { label: string; levels: Array<{value: string; label: string}> }> = {
    blooms:  { label: "Bloom's Revised", levels: [
      { value: 'remember',   label: 'Remember — recall facts and basic concepts' },
      { value: 'understand', label: 'Understand — explain ideas or concepts' },
      { value: 'apply',      label: 'Apply — use information in new situations' },
      { value: 'analyze',    label: 'Analyze — draw connections, break down information' },
      { value: 'evaluate',   label: 'Evaluate — justify a decision or course of action' },
      { value: 'create',     label: 'Create — produce new or original work' },
    ]},
    dok: { label: "DOK (Webb's)", levels: [
      { value: 'dok1', label: 'Level 1 — Recall & Reproduction' },
      { value: 'dok2', label: 'Level 2 — Skills & Concepts' },
      { value: 'dok3', label: 'Level 3 — Strategic Thinking' },
      { value: 'dok4', label: 'Level 4 — Extended Thinking' },
    ]},
    solo: { label: 'SOLO Taxonomy', levels: [
      { value: 'prestructural',   label: 'Pre-structural — no understanding yet' },
      { value: 'unistructural',   label: 'Uni-structural — one relevant aspect' },
      { value: 'multistructural', label: 'Multi-structural — several independent aspects' },
      { value: 'relational',      label: 'Relational — integrated understanding' },
      { value: 'extended',        label: 'Extended Abstract — generalise beyond context' },
    ]},
    marzano: { label: "Marzano's", levels: [
      { value: 'retrieval',             label: 'Retrieval — recall / execute' },
      { value: 'comprehension',         label: 'Comprehension — identify / symbolise' },
      { value: 'analysis',              label: 'Analysis — match / classify / error analysis' },
      { value: 'knowledge_utilization', label: 'Knowledge Utilization — decision / investigation / experiment' },
    ]},
  };

  // Navigation links for teacher section
  const teacherNavLinks = [
  { label: 'Activities', path: '/teacher/activities' },
  { label: 'Submissions', path: '/teacher/submissions' },
  { label: 'Students', path: '/teacher/students' },
  { label: 'Curriculum', path: '/teacher/curriculum' },
  { label: 'Field Notes', path: '/teacher/field-notes' },
  { label: 'Analytics', path: '/teacher/analytics' },
  { label: 'Settings', path: '/teacher/settings' }];


  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, title: e.target.value }));
  };

  const handleDescriptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setFormData((prev) => ({ ...prev, description: e.target.value }));
  };

  const handleSubjectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFormData((prev) => ({ ...prev, subject: e.target.value }));
  };

  const handleGradeLevelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFormData((prev) => ({ ...prev, grade_level: parseInt(e.target.value) }));
  };

  const handleActivityTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFormData((prev) => ({ ...prev, activity_type: e.target.value }));
  };

  const handleDifficultyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, difficulty_level: parseInt(e.target.value) }));
  };

  const handleDurationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, estimated_duration_minutes: parseInt(e.target.value) }));
  };

  const handleLocationSelected = (location: ActivityLocation) => {
    setFormData((prev) => ({ ...prev, location }));
    setShowLocationPicker(false);
    if (location.latitude && location.longitude) {
      setShowWikiInfo(true);
    }
  };

  const handleBloomLevelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFormData((prev) => ({ ...prev, bloom_level: e.target.value }));
  };

  const handleAssessmentTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFormData((prev) => ({ ...prev, assessment_type: e.target.value }));
  };

  const handleAddObjective = () => {
    setFormData((prev) => ({
      ...prev,
      learning_objectives: [...prev.learning_objectives, '']
    }));
  };

  const handleObjectiveChange = (index: number, value: string) => {
    setFormData((prev) => ({
      ...prev,
      learning_objectives: prev.learning_objectives.map((obj, i) => i === index ? value : obj)
    }));
  };

  const handleRemoveObjective = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      learning_objectives: prev.learning_objectives.filter((_, i) => i !== index)
    }));
  };

  const handleAddMaterial = () => {
    setFormData((prev) => ({
      ...prev,
      materials_needed: [...prev.materials_needed, '']
    }));
  };

  const handleMaterialChange = (index: number, value: string) => {
    setFormData((prev) => ({
      ...prev,
      materials_needed: prev.materials_needed.map((m, i) => i === index ? value : m)
    }));
  };

  const handleRemoveMaterial = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      materials_needed: prev.materials_needed.filter((_, i) => i !== index)
    }));
  };

  const handleAddSuggestedLesson = (lesson: string) => {
    setFormData((prev) => ({
      ...prev,
      suggested_lessons: [...(prev.suggested_lessons || []), lesson]
    }));
  };

  const handleRemoveSuggestedLesson = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      suggested_lessons: (prev.suggested_lessons || []).filter((_, i) => i !== index)
    }));
  };

  const handleCurriculumChange = (unitIds: string[]) => {
    setFormData((prev) => ({
      ...prev,
      curriculum_units: unitIds
    }));
  };

  /** Build the API payload from formData, mapping types to backend expectations */
  const buildPayload = (status: 'draft' | 'published') => {
    const bloomInt = BLOOM_LEVEL_MAP[formData.bloom_level] ?? 3;
    const activityType = ACTIVITY_TYPE_MAP[formData.activity_type] ?? 'inquiry';
    const objectives = formData.learning_objectives.length > 0
      ? formData.learning_objectives
      : ['Students will explore and document findings from this activity.'];
    return {
      title: formData.title.trim(),
      description: formData.description.trim() || 'Outdoor learning activity.',
      location_latitude: formData.location.latitude ?? 0,
      location_longitude: formData.location.longitude ?? 0,
      location_name: formData.location.address || 'Selected location',
      location_radius_meters: 100,
      grade_level: formData.grade_level,
      subject: formData.subject,
      difficulty_level: formData.difficulty_level,
      estimated_duration_minutes: formData.estimated_duration_minutes,
      materials_needed: formData.materials_needed,
      resources: [],
      learning_objectives: objectives,
      bloom_level: bloomInt,
      marzano_level: formData.marzano_level ?? undefined,
      dok_level: formData.dok_level ?? undefined,
      solo_level: formData.solo_level ?? undefined,
      rubric_id: formData.rubric_id ?? undefined,
      activity_type: activityType,
      is_shareable: false,
      status,
      orient_phase: formData.orient_phase.trim() || undefined,
      inquiry_phase: formData.inquiry_phase.trim() || undefined,
      reflect_phase: formData.reflect_phase.trim() || undefined,
    };
  };

  const handleSaveChanges = async () => {
    if (!formData.title.trim()) {
      setSaveStatus('error');
      return;
    }
    setIsSaving(true);
    setSaveStatus('saving');
    try {
      const payload = buildPayload('draft');
      let savedId = id;
      if (id) {
        await apiPut(`/api/v1/activities/${id}`, payload, token);
      } else {
        const created = await apiPost('/api/v1/activities', payload, token) as any;
        savedId = created?.id ?? created?.activity_id;
      }
      // Homeschool self-consent: parent IS the user — record consent immediately on save
      if (homeschoolGpsConsent && gpsEnabled && savedId && currentUser?.role?.toLowerCase() === 'homeschool') {
        try {
          await apiPost('/api/v1/parent/consent/gps', {
            student_id: currentUser.id,
            activity_id: savedId,
            consent_given: true,
          }, token);
        } catch { /* best-effort */ }
      }
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (error: any) {
      console.error('Error saving activity:', error);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 4000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAndPublish = async () => {
    if (!formData.title.trim()) {
      setSaveStatus('error');
      return;
    }
    setIsSaving(true);
    setSaveStatus('saving');
    try {
      const payload = buildPayload('published');
      if (id) {
        await apiPut(`/api/v1/activities/${id}`, payload, token);
        await apiPost(`/api/v1/activities/${id}/publish`, {}, token);
      } else {
        const created = await apiPost('/api/v1/activities', payload, token);
        if (created?.id) {
          await apiPost(`/api/v1/activities/${created.id}/publish`, {}, token);
        }
      }
      setSaveStatus('success');
      setTimeout(() => navigate('/teacher/activities'), 1500);
    } catch (error: any) {
      console.error('Error publishing activity:', error);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 4000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    navigate('/teacher/activities');
  };

  return (
    <div className={styles.container}>
      {/* Header with Navigation */}
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <h1>{t("landing:enhancedactivitybuilder.create_activity", "Create Activity")}</h1>
          <nav className={styles.navLinks}>
            {teacherNavLinks.map((link) =>
            <button
              key={link.path}
              onClick={() => navigate(link.path)}
              className={styles.navLink}>
              
                {link.label}
              </button>
            )}
          </nav>
        </div>
        <button onClick={handleCancel} className={styles.cancelBtn}>{t("landing:enhancedactivitybuilder.back", "\u2190 Back")}

        </button>
      </header>

      {/* Tab Navigation */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === 'basic' ? styles.active : ''}`}
          onClick={() => setActiveTab('basic')}>{t("landing:basic_info", "Basic Info")}


        </button>
        <button
          className={`${styles.tab} ${activeTab === 'location' ? styles.active : ''}`}
          onClick={() => setActiveTab('location')}>{t("landing:enhancedactivitybuilder.location", "\uD83D\uDCCD Location")}


        </button>
        <button
          className={`${styles.tab} ${activeTab === 'learning' ? styles.active : ''}`}
          onClick={() => setActiveTab('learning')}>{t("landing:learning", "\uD83D\uDCDA Learning")}


        </button>
        <button
          className={`${styles.tab} ${activeTab === 'curriculum' ? styles.active : ''}`}
          onClick={() => setActiveTab('curriculum')}>{t("landing:enhancedactivitybuilder.curriculum", "\uD83D\uDDC2\uFE0F Curriculum")}


        </button>
        <button
          className={`${styles.tab} ${activeTab === 'student' ? styles.active : ''}`}
          onClick={() => setActiveTab('student')}>{t("landing:enhancedactivitybuilder.student_preview", "\uD83D\uDC41 Student Preview")}


        </button>
      </div>

      <main className={styles.main}>
        {/* Basic Info Tab */}
        {activeTab === 'basic' &&
        <section className={styles.section}>
            <h2>{t("landing:basic_information", "Basic Information")}</h2>

            <div className={styles.formGroup}>
              <label htmlFor="title">{t("landing:enhancedactivitybuilder.activity_title", "Activity Title *")}</label>
              <input
              id="title"
              type="text"
              value={formData.title}
              onChange={handleTitleChange}
              placeholder={t("landing:enter_activity_title", "Enter activity title")}
              className={styles.input} />
            
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="description">{t("landing:enhancedactivitybuilder.description", "Description")}</label>
              <textarea
              id="description"
              value={formData.description}
              onChange={handleDescriptionChange}
              placeholder={t("landing:describe_the_activity_in_detail", "Describe the activity in detail")}
              rows={4}
              className={styles.textarea} />
            
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label htmlFor="subject">{t("landing:subject", "Subject")}</label>
                <select
                id="subject"
                value={formData.subject}
                onChange={handleSubjectChange}
                className={styles.select}>
                
                  <option value="Science">{t("landing:science", "Science")}</option>
                  <option value="Math">{t("landing:math", "Math")}</option>
                  <option value="English">{t("landing:english", "English")}</option>
                  <option value="History">{t("landing:history", "History")}</option>
                  <option value="Art">{t("landing:art", "Art")}</option>
                  <option value="PE">{t("landing:pe", "PE")}</option>
                </select>
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="gradeLevel">{t("landing:enhancedactivitybuilder.grade_level", "Grade Level")}</label>
                <select
                id="gradeLevel"
                value={formData.grade_level}
                onChange={handleGradeLevelChange}
                className={styles.select}>
                
                  {Array.from({ length: 13 }, (_, i) => i + 3).map((grade) =>
                <option key={grade} value={grade}>{t("landing:enhancedactivitybuilder.grade", "Grade")}{grade}</option>
                )}
                </select>
              </div>
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label htmlFor="activityType">{t("landing:activity_type", "Activity Type")}</label>
                <select
                id="activityType"
                value={formData.activity_type}
                onChange={handleActivityTypeChange}
                className={styles.select}>
                
                  <option value="field-observation">{t("landing:field_observation", "Field Observation")}</option>
                  <option value="hands-on">{t("landing:handson", "Hands-On")}</option>
                  <option value="project">{t("landing:project", "Project")}</option>
                  <option value="discussion">{t("landing:discussion", "Discussion")}</option>
                  <option value="experiment">{t("landing:experiment", "Experiment")}</option>
                </select>
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="difficulty">{t("landing:difficulty_level", "Difficulty Level:")}{formData.difficulty_level}/5</label>
                <input
                id="difficulty"
                type="range"
                min="1"
                max="5"
                value={formData.difficulty_level}
                onChange={handleDifficultyChange}
                className={styles.range} />
              
              </div>
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="duration">{t("landing:estimated_duration_minutes", "Estimated Duration (minutes)")}</label>
              <input
              id="duration"
              type="number"
              value={formData.estimated_duration_minutes}
              onChange={handleDurationChange}
              min="5"
              step="5"
              className={styles.input} />
            
            </div>

            {/* Materials Section */}
            <div className={styles.subsection}>
              <h3>{t("landing:materials_needed", "Materials Needed")}</h3>
              {formData.materials_needed.map((material, index) =>
            <div key={index} className={styles.listItem}>
                  <input
                type="text"
                value={material}
                onChange={(e) => handleMaterialChange(index, e.target.value)}
                placeholder={t("landing:enter_material", "Enter material")}
                className={styles.input} />
              
                  <button
                onClick={() => handleRemoveMaterial(index)}
                className={styles.removeBtn}>{t("landing:remove", "Remove")}


              </button>
                </div>
            )}
              <button onClick={handleAddMaterial} className={styles.addBtn}>{t("landing:add_material", "+ Add Material")}

            </button>
            </div>
          </section>
        }

        {/* Location Tab */}
        {activeTab === 'location' && (
          <section className={styles.section}>
            <h2>{t('components_teacher_enhancedactivitybuilder.locationbased_learning', '📍 Location-Based Learning')}</h2>

            {/* Location name with geocode */}
            <div className={styles.formGroup}>
              <label htmlFor="locationName">{t('components_teacher_enhancedactivitybuilder.location_name', 'Location Name')}</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  id="locationName"
                  type="text"
                  value={formData.location.address || ''}
                  onChange={(e) => setFormData((prev) => ({
                    ...prev,
                    location: { ...prev.location, address: e.target.value }
                  }))}
                  placeholder="e.g. Riverside Park, Austin TX"
                  className={styles.input}
                  style={{ flex: 1 }}
                />
                <button
                  className={styles.addBtn}
                  onClick={async () => {
                    const addr = (formData.location.address || '').trim();
                    if (!addr) return;
                    try {
                      const r = await fetch(
                        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(addr)}&format=json&limit=1`,
                        { headers: { 'Accept-Language': 'en' } }
                      );
                      const data = await r.json();
                      if (data[0]) {
                        setFormData((prev) => ({
                          ...prev,
                          location: { ...prev.location, latitude: parseFloat(data[0].lat), longitude: parseFloat(data[0].lon) }
                        }));
                      }
                    } catch {}
                  }}
                >Geocode →</button>
              </div>
            </div>

            {/* Manual lat/lng with reverse-geocode */}
            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label htmlFor="locLat">{t('components_teacher_enhancedactivitybuilder.latitude', 'Latitude')}</label>
                <input
                  id="locLat"
                  type="number"
                  step="0.0001"
                  value={formData.location.latitude ?? ''}
                  onChange={(e) => setFormData((prev) => ({
                    ...prev,
                    location: { ...prev.location, latitude: e.target.value ? parseFloat(e.target.value) : null }
                  }))}
                  placeholder="30.2672"
                  className={styles.input}
                />
              </div>
              <div className={styles.formGroup}>
                <label htmlFor="locLng">{t('components_teacher_enhancedactivitybuilder.longitude', 'Longitude')}</label>
                <input
                  id="locLng"
                  type="number"
                  step="0.0001"
                  value={formData.location.longitude ?? ''}
                  onChange={(e) => setFormData((prev) => ({
                    ...prev,
                    location: { ...prev.location, longitude: e.target.value ? parseFloat(e.target.value) : null }
                  }))}
                  placeholder="-97.7431"
                  className={styles.input}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 2 }}>
                <button
                  className={styles.addBtn}
                  onClick={async () => {
                    const { latitude, longitude } = formData.location;
                    if (latitude == null || longitude == null) return;
                    try {
                      const r = await fetch(
                        `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`,
                        { headers: { 'Accept-Language': 'en' } }
                      );
                      const data = await r.json();
                      if (data?.display_name) {
                        setFormData((prev) => ({
                          ...prev,
                          location: { ...prev.location, address: data.display_name }
                        }));
                      }
                    } catch {}
                  }}
                >← Lookup Name</button>
              </div>
            </div>

            {/* Map picker */}
            <button
              onClick={() => setShowLocationPicker(!showLocationPicker)}
              className={styles.toggleBtn}>
              {showLocationPicker ? '▼' : '▶'} Map Picker
            </button>
            {showLocationPicker && <LocationPicker onLocationSelected={handleLocationSelected} />}

            {/* GPS tracking toggle */}
            <div className={styles.formGroup} style={{ marginTop: 20 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={gpsEnabled}
                  onChange={(e) => {
                    setGpsEnabled(e.target.checked);
                    if (!e.target.checked) setHomeschoolGpsConsent(false);
                    setFormData((prev) => ({
                      ...prev,
                      discovery_location_gps_capture_enabled: e.target.checked,
                    } as any));
                  }}
                  style={{ width: 16, height: 16 }}
                />
                <span style={{ fontWeight: 600 }}>📍 Enable live GPS tracking during this activity</span>
              </label>
              <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4, marginLeft: 26 }}>{t('components_teacher_enhancedactivitybuilder.students_locations_are_shared_with_you_i', 'Students\' locations are shared with you in real time on the session monitor. Parental consent is requested automatically for students under 13.')}</p>
            </div>

            {/* Homeschool self-consent (parent IS the user) */}
            {gpsEnabled && currentUser?.role?.toLowerCase() === 'homeschool' && (
              <div className={styles.formGroup} style={{ marginLeft: 26, padding: '10px 14px', borderRadius: 8, background: 'var(--surface-raised, #f9f9f9)', border: '1px solid var(--border)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={homeschoolGpsConsent}
                    onChange={(e) => setHomeschoolGpsConsent(e.target.checked)}
                    style={{ width: 16, height: 16 }}
                  />
                  <span style={{ fontSize: 14 }}>
                    I consent to GPS location capture for my child during this activity
                  </span>
                </label>
              </div>
            )}

            {/* Wiki location info (only when coordinates are set) */}
            {formData.location.latitude && formData.location.longitude && (
              <>
                <button onClick={() => setShowWikiInfo(!showWikiInfo)} className={styles.toggleBtn}>
                  {showWikiInfo ? '▼' : '▶'} Location Information
                </button>
                {showWikiInfo && (
                  <WikiLocationInfo
                    latitude={formData.location.latitude}
                    longitude={formData.location.longitude}
                    onInfoLoaded={(info) => {
                      setFormData((prev) => ({
                        ...prev,
                        location_info: info.description || '',
                        location: { ...prev.location, wikiId: info.wikiId }
                      }));
                    }}
                  />
                )}
              </>
            )}
          </section>
        )}

        {/* Learning Tab */}
        {activeTab === 'learning' &&
        <section className={styles.section}>
            <h2>{t("landing:learning_objectives_assessment", "\uD83D\uDCDA Learning Objectives & Assessment")}</h2>

            {/* \u2500\u2500 Phase Content \u2500\u2500 what students read on the mobile app \u2500\u2500 */}
            <div className={styles.subsection}>
              <h3>\uD83D\uDCF1 Activity Phases <span style={{ fontWeight: 'normal', color: '#888', fontSize: 13 }}>\u2014 what students see on mobile</span></h3>
              <p style={{ color: '#666', fontSize: 13, marginBottom: 12 }}>{t('components_teacher_enhancedactivitybuilder.these_three_fields_drive_the_student_exp', 'These three fields drive the student experience. Students progress through Orient \u2192 Inquire \u2192 Reflect on their phone.')}</p>

              <div className={styles.formGroup}>
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ background: '#e8f5e9', color: '#2e7d32', borderRadius: 4, padding: '2px 8px', fontSize: 12, fontWeight: 700 }}>ORIENT</span>
                    What students observe when they arrive
                  </span>
                  <button
                    type="button"
                    onClick={() => generatePhaseContent('orient')}
                    disabled={phaseGenerating.orient}
                    style={{ padding: '3px 10px', fontSize: 12, borderRadius: 6, border: '1px solid #a5d6a7', background: phaseGenerating.orient ? '#f1f8e9' : '#e8f5e9', color: '#2e7d32', cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {phaseGenerating.orient ? '\u23f3 Generating\u2026' : '\u2728 Generate'}
                  </button>
                </label>
                <textarea
                  value={formData.orient_phase}
                  onChange={(e) => setFormData((p) => ({ ...p, orient_phase: e.target.value }))}
                  placeholder="e.g. Look around you. Notice the layers of the forest \u2014 the tall canopy trees, the shrubs and ferns below, and the ground covered in moss and fallen logs. Find a spot to stand quietly for 60 seconds and observe \u2014 what do you see, hear, and smell?"
                  rows={4}
                  className={styles.textarea}
                />
              </div>

              <div className={styles.formGroup}>
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ background: '#e3f2fd', color: '#1565c0', borderRadius: 4, padding: '2px 8px', fontSize: 12, fontWeight: 700 }}>INQUIRE</span>
                    Investigation instructions + capture prompts
                  </span>
                  <button
                    type="button"
                    onClick={() => generatePhaseContent('inquiry')}
                    disabled={phaseGenerating.inquiry}
                    style={{ padding: '3px 10px', fontSize: 12, borderRadius: 6, border: '1px solid #90caf9', background: phaseGenerating.inquiry ? '#e8f4fd' : '#e3f2fd', color: '#1565c0', cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {phaseGenerating.inquiry ? '\u23f3 Generating\u2026' : '\u2728 Generate'}
                  </button>
                </label>
                <textarea
                  value={formData.inquiry_phase}
                  onChange={(e) => setFormData((p) => ({ ...p, inquiry_phase: e.target.value }))}
                  placeholder="e.g. Choose one investigation question and use your capture tools to record evidence:&#10;&#10;1. DECOMPOSERS: Find a fallen log. Who or what is breaking it down? Photograph what you find.&#10;&#10;2. LAYERS: How many distinct layers can you identify in the forest? Photograph each layer."
                  rows={6}
                  className={styles.textarea}
                />
                <small style={{ color: '#888' }}>Tip: Students will have photo, video, audio, and written-note capture tools available during this phase.</small>
              </div>

              <div className={styles.formGroup}>
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ background: '#fff3e0', color: '#e65100', borderRadius: 4, padding: '2px 8px', fontSize: 12, fontWeight: 700 }}>REFLECT</span>
                    Closing reflection prompt
                  </span>
                  <button
                    type="button"
                    onClick={() => generatePhaseContent('reflect')}
                    disabled={phaseGenerating.reflect}
                    style={{ padding: '3px 10px', fontSize: 12, borderRadius: 6, border: '1px solid #ffcc80', background: phaseGenerating.reflect ? '#fff8f0' : '#fff3e0', color: '#e65100', cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {phaseGenerating.reflect ? '\u23f3 Generating\u2026' : '\u2728 Generate'}
                  </button>
                </label>
                <textarea
                  value={formData.reflect_phase}
                  onChange={(e) => setFormData((p) => ({ ...p, reflect_phase: e.target.value }))}
                  placeholder="e.g. Based on your investigation, answer: What would happen to this forest if one species disappeared entirely? Use specific examples from what you observed today."
                  rows={4}
                  className={styles.textarea}
                />
              </div>
            </div>

            {/* Two-level taxonomy picker */}
            <div className={styles.formGroup}>
              <label>{t('components_teacher_enhancedactivitybuilder.cognitive_taxonomy', 'Cognitive Taxonomy')}</label>
              <select
                value={taxonomyType}
                onChange={(e) => {
                  const tx = e.target.value;
                  setTaxonomyType(tx);
                  const first = TAXONOMIES[tx]?.levels[0]?.value ?? 'remember';
                  setFormData(p => ({ ...p, bloom_level: first }));
                }}
                className={styles.select}>
                {Object.entries(TAXONOMIES).map(([k, tx]) => (
                  <option key={k} value={k}>{tx.label}</option>
                ))}
              </select>
              <select
                value={formData.bloom_level}
                onChange={(e) => setFormData(p => ({ ...p, bloom_level: e.target.value }))}
                className={styles.select}
                style={{ marginTop: 6 }}>
                {TAXONOMIES[taxonomyType]?.levels.map(lvl => (
                  <option key={lvl.value} value={lvl.value}>{lvl.label}</option>
                ))}
              </select>
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label htmlFor="assessmentType">{t("landing:assessment_type", "Assessment Type")}</label>
                <select
                  id="assessmentType"
                  value={formData.assessment_type}
                  onChange={handleAssessmentTypeChange}
                  className={styles.select}>
                  <option value="formative">{t("landing:formative", "Formative")}</option>
                  <option value="summative">{t("landing:summative", "Summative")}</option>
                  <option value="diagnostic">{t("landing:diagnostic", "Diagnostic")}</option>
                  <option value="performance">{t("landing:performancebased", "Performance-Based")}</option>
                </select>
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="rubricId">Rubric <span style={{fontWeight:'normal',color:'#888'}}>(optional)</span></label>
                <select
                  id="rubricId"
                  value={formData.rubric_id ?? ''}
                  onChange={(e) => setFormData((p) => ({ ...p, rubric_id: e.target.value || null }))}
                  className={styles.select}>
                  <option value="">— No rubric —</option>
                  {rubrics.map((r) => (
                    <option key={r.id} value={r.id}>{r.title}</option>
                  ))}
                </select>
                {rubrics.length === 0 && (
                  <small style={{color:'#888'}}>No rubrics yet. <Link to={`${rubricsBase}/new`}>Create one</Link>.</small>
                )}
              </div>
            </div>

            {/* Objectives */}
            <div className={styles.subsection}>
              <h3>{t("landing:learning_objectives", "Learning Objectives")}</h3>
              {formData.learning_objectives.map((objective, index) =>
            <div key={index} className={styles.listItem}>
                  <input
                type="text"
                value={objective}
                onChange={(e) => handleObjectiveChange(index, e.target.value)}
                placeholder={`Objective ${index + 1}`}
                className={styles.input} />
              
                  <button
                onClick={() => handleRemoveObjective(index)}
                className={styles.removeBtn}>{t("landing:remove", "Remove")}


              </button>
                </div>
            )}
              <button onClick={handleAddObjective} className={styles.addBtn}>{t("landing:add_objective", "+ Add Objective")}

            </button>
            </div>

            {/* AI Activity Suggestions */}
            <div className={styles.subsection}>
              <h3>{t('components_teacher_enhancedactivitybuilder.get_ai_activity_suggestions', '🤖 Get AI Activity Suggestions')}</h3>
              <p style={{ color: '#666', fontSize: 13, marginBottom: 8 }}>{t('components_teacher_enhancedactivitybuilder.based_on_your_subject_grade_objectives_a', 'Based on your subject, grade, objectives, and selected taxonomies, Peri AI can suggest activity ideas aligned to your learning goals.')}</p>
              <button
                onClick={() => setShowOllamaSuggestions(!showOllamaSuggestions)}
                className={styles.addBtn}>
                {showOllamaSuggestions ? 'Hide Suggestions' : '✨ Suggest Activities with AI'}
              </button>
              {showOllamaSuggestions && (
                <OllamaLessonSuggestions
                  title={formData.title}
                  description={formData.description}
                  latitude={formData.location.latitude}
                  longitude={formData.location.longitude}
                  locationInfo={formData.location_info}
                  onSuggestionSelected={handleAddSuggestedLesson}
                />
              )}
              {(formData.suggested_lessons || []).length > 0 && (
                <div className={styles.suggestionsList}>
                  <h4>{t('components_teacher_enhancedactivitybuilder.selected_suggestions', 'Selected Suggestions')}</h4>
                  {formData.suggested_lessons.map((lesson, index) => (
                    <div key={index} className={styles.tag}>
                      <span>{lesson}</span>
                      <button onClick={() => handleRemoveSuggestedLesson(index)}>✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        }

        {/* Student Preview Tab */}
        {activeTab === 'student' && (
          <section className={styles.section}>
            <h2>{t('components_teacher_enhancedactivitybuilder.student_view_preview', '👁 Student View Preview')}</h2>
            <p style={{ color: '#666', fontSize: 13, marginBottom: 16 }}>{t('components_teacher_enhancedactivitybuilder.this_is_how_the_activity_appears_to_stud', 'This is how the activity appears to students in the app.')}</p>
            <div style={{
              border: '2px solid #e0e0e0', borderRadius: 12, padding: 24, background: '#fafafa',
              maxWidth: 420, margin: '0 auto', fontFamily: 'system-ui, sans-serif'
            }}>
              {/* Activity header */}
              <div style={{ background: '#2e7d32', borderRadius: 8, padding: '12px 16px', marginBottom: 16 }}>
                <div style={{ color: '#a5d6a7', fontSize: 11, letterSpacing: 1, marginBottom: 4 }}>
                  {(formData.subject || 'SUBJECT').toUpperCase()} · GRADE {formData.grade_level} · {formData.estimated_duration_minutes} MIN
                </div>
                <div style={{ color: 'white', fontSize: 20, fontWeight: 700, lineHeight: 1.2 }}>
                  {formData.title || 'Activity Title'}
                </div>
              </div>

              {/* Location */}
              {(formData.location.address || (formData.location.latitude && formData.location.longitude)) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, color: '#555' }}>
                  <span>📍</span>
                  <span style={{ fontSize: 13 }}>
                    {formData.location.address || `${formData.location.latitude?.toFixed(4)}, ${formData.location.longitude?.toFixed(4)}`}
                  </span>
                </div>
              )}

              {/* Description */}
              {formData.description && (
                <p style={{ fontSize: 14, color: '#333', lineHeight: 1.5, marginBottom: 16 }}>
                  {formData.description}
                </p>
              )}

              {/* Phase pills + content preview */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                  {['Orient', 'Inquire', 'Reflect'].map((phase) => (
                    <div key={phase} style={{
                      flex: 1, textAlign: 'center', padding: '6px 0',
                      background: '#e8f5e9', borderRadius: 6,
                      fontSize: 12, fontWeight: 600, color: '#2e7d32'
                    }}>{phase}</div>
                  ))}
                </div>

                {/* Orient phase preview */}
                {formData.orient_phase && (
                  <div style={{ background: '#f1f8e9', borderRadius: 8, padding: '10px 12px', marginBottom: 8 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#558b2f', letterSpacing: 1, marginBottom: 4 }}>ORIENT — Arrive &amp; Observe</div>
                    <p style={{ fontSize: 13, color: '#33691e', margin: 0, lineHeight: 1.5 }}>{formData.orient_phase}</p>
                  </div>
                )}

                {/* Inquiry phase preview + capture tools */}
                <div style={{ background: '#e3f2fd', borderRadius: 8, padding: '10px 12px', marginBottom: 8 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#1565c0', letterSpacing: 1, marginBottom: 4 }}>INQUIRE — Observe &amp; Capture</div>
                  {formData.inquiry_phase
                    ? <p style={{ fontSize: 13, color: '#0d47a1', margin: '0 0 10px', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{formData.inquiry_phase}</p>
                    : <p style={{ fontSize: 13, color: '#90a4ae', margin: '0 0 10px', fontStyle: 'italic' }}>{t('components_teacher_enhancedactivitybuilder.no_inquiry_instructions_yet_write_them_i', 'No inquiry instructions yet — write them in the Learning tab.')}</p>
                  }
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#1565c0', letterSpacing: 1, marginBottom: 6 }}>CAPTURE TOOLS — available to students</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {([['📷', 'Photo'], ['🎬', 'Video'], ['🎤', 'Audio'], ['📝', 'Notes']] as [string, string][]).map(([icon, label]) => (
                      <div key={label} style={{
                        flex: 1, textAlign: 'center', padding: '8px 4px',
                        background: 'white', borderRadius: 8, border: '1px solid #90caf9'
                      }}>
                        <div style={{ fontSize: 20 }}>{icon}</div>
                        <div style={{ fontSize: 10, color: '#1565c0', fontWeight: 600, marginTop: 2 }}>{label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Reflect phase preview */}
                {formData.reflect_phase && (
                  <div style={{ background: '#fff3e0', borderRadius: 8, padding: '10px 12px' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#e65100', letterSpacing: 1, marginBottom: 4 }}>REFLECT — Make Meaning</div>
                    <p style={{ fontSize: 13, color: '#bf360c', margin: 0, lineHeight: 1.5 }}>{formData.reflect_phase}</p>
                  </div>
                )}
              </div>

              {/* Objectives */}
              {formData.learning_objectives.filter(Boolean).length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: 1, marginBottom: 6 }}>
                    LEARNING GOALS
                  </div>
                  {formData.learning_objectives.filter(Boolean).map((obj, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 4, alignItems: 'flex-start' }}>
                      <span style={{ color: '#2e7d32', fontSize: 12, flexShrink: 0 }}>✓</span>
                      <span style={{ fontSize: 13, color: '#444' }}>{obj}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Materials */}
              {formData.materials_needed.filter(Boolean).length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: 1, marginBottom: 6 }}>
                    BRING WITH YOU
                  </div>
                  {formData.materials_needed.filter(Boolean).map((m, i) => (
                    <div key={i} style={{ fontSize: 13, color: '#444', marginBottom: 2 }}>• {m}</div>
                  ))}
                </div>
              )}

              {/* Taxonomy badges */}
              <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6, marginBottom: 16 }}>
                {formData.bloom_level && (
                  <span style={{ background: '#e3f2fd', color: '#1565c0', fontSize: 11, padding: '3px 8px', borderRadius: 20, fontWeight: 600 }}>
                    Bloom: {formData.bloom_level}
                  </span>
                )}
                {formData.activity_type && (
                  <span style={{ background: '#f3e5f5', color: '#6a1b9a', fontSize: 11, padding: '3px 8px', borderRadius: 20, fontWeight: 600 }}>
                    {formData.activity_type.replace('-', ' ')}
                  </span>
                )}
                {formData.difficulty_level && (
                  <span style={{ background: '#fff3e0', color: '#e65100', fontSize: 11, padding: '3px 8px', borderRadius: 20, fontWeight: 600 }}>
                    {'★'.repeat(formData.difficulty_level)}{'☆'.repeat(5 - formData.difficulty_level)} Difficulty
                  </span>
                )}
              </div>

              {/* Publish callout */}
              <div style={{ background: '#fffde7', border: '1px solid #f9a825', borderRadius: 8, padding: '10px 12px', marginBottom: 16, fontSize: 12, color: '#5d4037' }}>
                <strong>📲 Publishing this activity makes it visible on the student mobile app.</strong>
                {' '}Use <em>Save and Publish</em> below, or save as draft to come back later.
              </div>

              {/* CTA */}
              <button style={{
                width: '100%', padding: '12px 0',
                background: '#2e7d32', color: 'white', border: 'none',
                borderRadius: 8, fontSize: 16, fontWeight: 700, cursor: 'pointer'
              }}>Start Activity</button>
            </div>
          </section>
        )}

        {/* Curriculum Tab */}
        {activeTab === 'curriculum' &&
        <section className={styles.section}>
            <h2>{t("landing:curriculum_alignment", "🗂️ Curriculum Alignment")}</h2>
            <CurriculumMapper
            selectedUnits={formData.curriculum_units || []}
            onUnitsChange={(units: string[]) => setFormData((p) => ({ ...p, curriculum_units: units }))}
            subject={formData.subject}
            gradeLevel={formData.grade_level} />
          </section>
        }

        {/* Status Messages */}
        {saveStatus !== 'idle' &&
        <div className={`${styles.statusMessage} ${styles[saveStatus]}`}>
            {saveStatus === 'saving' && 'Saving...'}
            {saveStatus === 'success' && '✅ Saved successfully!'}
            {saveStatus === 'error' && '❌ Error saving activity.'}
          </div>
        }

        {/* Action Buttons */}
        <section className={styles.actions}>
          <button
            onClick={handleCancel}
            className={styles.secondaryBtn}
            disabled={isSaving}>
            Cancel
          </button>
          <button
            onClick={handleSaveChanges}
            className={styles.primaryBtn}
            disabled={isSaving || !formData.title.trim()}>
            {isSaving ? 'Saving...' : 'Save Draft'}
          </button>
          <button
            onClick={handleSaveAndPublish}
            className={styles.primaryBtn}
            disabled={isSaving || !formData.title.trim()}
            style={{ background: '#1b5e20', borderColor: '#1b5e20' }}>
            {isSav