// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import { useTranslation } from 'react-i18next';
import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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
  assessment_type: string;
  materials_needed: string[];
  resources: string[];
  location_info?: string;
  suggested_lessons?: string[];
  curriculum_units?: string[];
}

export const ActivityBuilder = () => {
  const { t } = useTranslation('landing');
  
  
  
  
  
  const navigate = useNavigate();
  const { id } = useParams();
  const token = useAuthStore((s) => s.token);

  const [formData, setFormData] = useState<ActivityData>({
    title: '',
    description: '',
    subject: 'Science',
    grade_level: 6,
    activity_type: 'field-observation',
    difficulty_level: 3,
    estimated_duration_minutes: 60,
    location: {
      latitude: null,
      longitude: null
    },
    learning_objectives: [],
    bloom_level: 'apply',
    assessment_type: 'formative',
    materials_needed: [],
    resources: [],
    location_info: '',
    suggested_lessons: [],
    curriculum_units: []
  });

  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [showOllamaSuggestions, setShowOllamaSuggestions] = useState(false);
  const [showWikiInfo, setShowWikiInfo] = useState(false);
  const [showCurriculum, setShowCurriculum] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('basic');

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
      activity_type: activityType,
      is_shareable: false,
      status,
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
      if (id) {
        await apiPut(`/api/v1/activities/${id}`, payload, token);
      } else {
        await apiPost('/api/v1/activities', payload, token);
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
        {activeTab === 'location' &&
        <section className={styles.section}>
            <h2>{t("landing:locationbased_learning", "\uD83D\uDCCD Location-Based Learning")}</h2>

            {formData.location.latitude && formData.location.longitude &&
          <div className={styles.locationDisplay}>
                <p>
                  <strong>{t("landing:selected_location", "Selected Location:")}</strong>{' '}
                  {formData.location.latitude.toFixed(4)}, {formData.location.longitude.toFixed(4)}
                </p>
                {formData.location.address &&
            <p><strong>{t("landing:address", "Address:")}</strong> {formData.location.address}</p>
            }
              </div>
          }

            <button
            onClick={() => setShowLocationPicker(!showLocationPicker)}
            className={styles.toggleBtn}>
            
              {showLocationPicker ? '▼' : '▶'}{t("landing:location_picker", "Location Picker")}
          </button>

            {showLocationPicker &&
          <LocationPicker onLocationSelected={handleLocationSelected} />
          }

            {formData.location.latitude && formData.location.longitude &&
          <>
                <button
              onClick={() => setShowWikiInfo(!showWikiInfo)}
              className={styles.toggleBtn}>
              
                  {showWikiInfo ? '▼' : '▶'}{t("landing:location_information", "Location Information")}
            </button>
                {showWikiInfo &&
            <WikiLocationInfo
              latitude={formData.location.latitude}
              longitude={formData.location.longitude}
              onInfoLoaded={(info) => {
                setFormData((prev) => ({
                  ...prev,
                  location_info: info.description || '',
                  location: {
                    ...prev.location,
                    wikiId: info.wikiId
                  }
                }));
              }} />

            }

                <button
              onClick={() => setShowOllamaSuggestions(!showOllamaSuggestions)}
              className={styles.toggleBtn}>
              
                  {showOllamaSuggestions ? '▼' : '▶'}{t("landing:ai_suggestions", "AI Suggestions")}
            </button>
                {showOllamaSuggestions &&
            <OllamaLessonSuggestions
              title={formData.title}
              description={formData.description}
              latitude={formData.location.latitude}
              longitude={formData.location.longitude}
              locationInfo={formData.location_info}
              onSuggestionSelected={handleAddSuggestedLesson} />

            }
              </>
          }

            {(formData.suggested_lessons || []).length > 0 &&
          <div className={styles.suggestionsList}>
                <h3>{t("landing:selected_ai_suggestions", "Selected AI Suggestions")}</h3>
                {formData.suggested_lessons.map((lesson, index) =>
            <div key={index} className={styles.tag}>
                    <span>{lesson}</span>
                    <button onClick={() => handleRemoveSuggestedLesson(index)}>✕</button>
                  </div>
            )}
              </div>
          }
          </section>
        }

        {/* Learning Tab */}
        {activeTab === 'learning' &&
        <section className={styles.section}>
            <h2>{t("landing:learning_objectives_assessment", "\uD83D\uDCDA Learning Objectives & Assessment")}</h2>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label htmlFor="bloomLevel">{t("landing:blooms_level", "Bloom's Level")}</label>
                <select
                id="bloomLevel"
                value={formData.bloom_level}
                onChange={handleBloomLevelChange}
                className={styles.select}>
                
                  <option value="remember">{t("landing:remember", "Remember")}</option>
                  <option value="understand">{t("landing:understand", "Understand")}</option>
                  <option value="apply">{t("landing:apply", "Apply")}</option>
                  <option value="analyze">{t("landing:analyze", "Analyze")}</option>
                  <option value="evaluate">{t("landing:evaluate", "Evaluate")}</option>
                  <option value="create">{t("landing:create", "Create")}</option>
                </select>
              </div>

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
          </section>
        }

        {/* Curriculum Tab */}
        {activeTab === 'curriculum' &&
        <section className={styles.section}>
            <h2>{t("landing:curriculum_alignment", "\uD83D\uDDC2\uFE0F Curriculum Alignment")}</h2>
            <CurriculumMapper
            selectedUnits={formData.curriculum_units || []}
            onUnitsChange={handleCurriculumChange}
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
            disabled={isSaving}>{t("landing:cancel", "Cancel")}


          </button>
          <button
            onClick={handleSaveChanges}
            className={styles.primaryBtn}
            disabled={isSaving || !formData.title.trim()}>
            
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
          <button
            onClick={handleSaveAndPublish}
            className={styles.publishBtn}
            disabled={isSaving || !formData.title.trim()}>
            
            {isSaving ? 'Publishing...' : 'Save & Publish'}
          </button>
        </section>
      </main>
    </div>);

};

export default ActivityBuilder;