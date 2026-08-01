import { useTranslation } from 'react-i18next';
// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import { useTeacherStore } from '@/stores/teacher';
import { useAuthStore } from '@/stores/auth';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { Activity, ActivityType, CreateActivityInput } from '@/types/teacher';
import { OllamaLessonSuggestions, AcceptedSuggestion } from './OllamaLessonSuggestions';
import { WikiLocationInfo } from './WikiLocationInfo';
import CurriculumMapper from './CurriculumMapper';
import styles from './ActivityManager.module.css';

// ── Backend-payload normalization ─────────────────────────────────────────────
// The backend expects bloom_level as an integer (1-6) and activity_type as one of
// the ActivityTypeEnum values. Form/cached-suggestion defaults use text labels
// (e.g. 'understand', 'outdoor') which 422 on submit. Map them before sending.
const BLOOM_LEVEL_MAP: Record<string, number> = {
  remember: 1, understand: 2, apply: 3, analyze: 4, evaluate: 5, create: 6,
};

const ACTIVITY_TYPE_MAP: Record<string, string> = {
  inquiry: 'inquiry',
  discussion: 'discussion',
  'hands-on': 'hands_on',
  hands_on: 'hands_on',
  virtual: 'virtual',
  hybrid: 'hybrid',
  // legacy / suggestion aliases not in the backend enum -> nearest valid value
  outdoor: 'hands_on',
  'field-observation': 'hands_on',
  field_observation: 'hands_on',
  observation: 'hands_on',
  project: 'inquiry',
  experiment: 'inquiry',
  discovery: 'inquiry',
};

function normalizeBloomLevel(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const asInt = parseInt(value, 10);
    if (!Number.isNaN(asInt) && asInt >= 1 && asInt <= 6) return asInt;
    return BLOOM_LEVEL_MAP[value.trim().toLowerCase()] ?? 2;
  }
  return 2;
}

function normalizeActivityType(value: unknown): string {
  if (typeof value === 'string') {
    return ACTIVITY_TYPE_MAP[value.trim().toLowerCase()] ?? 'inquiry';
  }
  return 'inquiry';
}

// ── Nominatim geocoding helpers ───────────────────────────────────────────────
async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`;
  const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
  if (!res.ok) return '';
  const data = await res.json();
  return data.display_name ?? '';
}

// Forward geocode — turns whatever the teacher typed into "Location Name"
// (a landmark name, e.g. "Eiffel Tower", OR a full street address, e.g.
// "7015 Maxwelton Rd, Clinton, WA 98236") into coordinates. One field
// handles both forms of input; no separate "Address" field needed.
//
// This used to call Wikipedia/Nominatim directly from the browser
// (uncached, unauthenticated, and invisible to the backend's location
// cache). It now goes through the backend's /locations/geocode endpoint,
// which shares the same pooled HTTP client and CachedLocation cache as the
// nearby-search/enrichment pipeline below — so a repeated or popular query
// resolves instantly instead of re-hitting Nominatim every time.
async function forwardGeocode(name: string): Promise<{ lat: number; lng: number; isApproximate: boolean } | null> {
  try {
    const res = await fetch('/api/v1/locations/geocode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: name }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (typeof data.latitude !== 'number' || typeof data.longitude !== 'number') return null;
    return { lat: data.latitude, lng: data.longitude, isApproximate: !!data.is_approximate };
  } catch {
    return null;
  }
}

const ActivityManager = () => {
  const { t } = useTranslation('landing');
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const activitiesBase = location.pathname.startsWith('/homeschool')
    ? '/homeschool/activities'
    : '/teacher/activities';
  const currentUser = useAuthStore(state => state.user);
  const isOrgTeacher = !!(currentUser?.org_id);

  const { activities, getActivity, createActivity, updateActivity, loading, error, clearCurrentActivity } = useTeacherStore();

  const isEditing = !!id;
  const [formData, setFormData] = useState<CreateActivityInput>({
    title: '',
    description: '',
    grade_level: 5,
    subject: 'Science',
    difficulty_level: 3,
    // 0 is treated as "not set yet" by every consumer below (the WikiLocationInfo
    // panel gate at line ~744 and the /locations/search trigger it drives both
    // check `location_latitude && location_longitude` truthiness). This used to
    // default to a real place (47.6839, -122.3081 — Seattle), which meant any
    // teacher who typed a location name but whose forward-geocode hadn't
    // resolved yet (slow network, Nominatim rate-limit, typo) got real-looking
    // — but wrong — search results for Seattle instead of an empty/pending
    // state. 0,0 (Null Island) is never a real POI, so the panel just stays
    // hidden until real coordinates come back.
    location_latitude: 0,
    location_longitude: 0,
    location_radius_meters: 500,
    location_name: '',
    estimated_duration_minutes: 45,
    materials_needed: [],
    resources: [],
    learning_objectives: [],
    curriculum_unit_ids: [],
    bloom_level: 'understand',
    activity_type: 'outdoor',
    is_shareable: false,
    share_scope: 'org' as 'org' | 'all',
    language: '',
    state_standard: '',
    discipline: '',
  });
  const [taxonomyType, setTaxonomyType] = useState<string>('blooms');
  const [rubrics, setRubrics] = useState<{ id: string; title: string }[]>([]);
  const [selectedRubricId, setSelectedRubricId] = useState('');
  // Filter-as-you-type for the rubric list — a plain <select> gets slow to
  // scan once a teacher has more than a handful of rubrics.
  const [rubricFilter, setRubricFilter] = useState('');

  // GPS live tracking + homeschool self-consent (parent IS the user, so consent
  // is recorded at save time rather than via the async per-student parent-consent
  // flow used for org/school accounts). See GPS_MAP_HANDOFF.md.
  const [showLocationTools, setShowLocationTools] = useState(false);
  const [gpsEnabled, setGpsEnabled] = useState(false);
  const [homeschoolGpsConsent, setHomeschoolGpsConsent] = useState(false);

  const TAXONOMIES: Record<string, { label: string; levels: { value: string; label: string }[] }> = {
    blooms: {
      label: "Bloom's Revised",
      levels: [
        { value: 'remember',   label: 'Remember — recall facts and basic concepts' },
        { value: 'understand', label: 'Understand — explain ideas or concepts' },
        { value: 'apply',      label: 'Apply — use information in new situations' },
        { value: 'analyze',    label: 'Analyze — draw connections, break down information' },
        { value: 'evaluate',   label: 'Evaluate — justify a decision or course of action' },
        { value: 'create',     label: 'Create — produce new or original work' },
      ],
    },
    dok: {
      label: "DOK (Webb's)",
      levels: [
        { value: 'dok1', label: 'Level 1 — Recall & Reproduction' },
        { value: 'dok2', label: 'Level 2 — Skills & Concepts' },
        { value: 'dok3', label: 'Level 3 — Strategic Thinking' },
        { value: 'dok4', label: 'Level 4 — Extended Thinking' },
      ],
    },
    solo: {
      label: 'SOLO Taxonomy',
      levels: [
        { value: 'prestructural',   label: 'Pre-structural — no understanding yet' },
        { value: 'unistructural',   label: 'Uni-structural — one relevant aspect' },
        { value: 'multistructural', label: 'Multi-structural — several independent aspects' },
        { value: 'relational',      label: 'Relational — integrated understanding' },
        { value: 'extended',        label: 'Extended Abstract — generalise beyond context' },
      ],
    },
    marzano: {
      label: "Marzano's",
      levels: [
        { value: 'retrieval',            label: 'Retrieval — recall / execute' },
        { value: 'comprehension',        label: 'Comprehension — identify / symbolise' },
        { value: 'analysis',             label: 'Analysis — match / classify / error analysis' },
        { value: 'knowledge_utilization', label: 'Knowledge Utilization — decision / investigation / experiment' },
      ],
    },
  };

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Collapsible form chapters — Context starts open (it feeds Peri AI),
  // the rest start closed to cut initial scroll length. A chapter is forced
  // open regardless of this state whenever one of its own fields has a
  // validation error, so a failed submit never hides the reason why.
  const [openSections, setOpenSections] = useState({
    context: true, basic: false, academic: false, assessments: false, materials: false, additional: false,
  });
  const toggleSection = (key: keyof typeof openSections) => (e: React.SyntheticEvent<HTMLDetailsElement>) => {
    setOpenSections(s => ({ ...s, [key]: (e.target as HTMLDetailsElement).open }));
  };
  const contextHasError = !!(errors.subject || errors.location_name || errors.location_latitude || errors.location_longitude);
  const basicHasError = !!(errors.title || errors.description);
  const academicHasError = !!(errors.grade_level || errors.difficulty_level || errors.estimated_duration_minutes);

  // 14e.3 — Privacy compliance badge: debounced check when location or grade changes
  useEffect(() => {
    if (complianceTimer) clearTimeout(complianceTimer)
    const timer = setTimeout(async () => {
      try {
        const token = localStorage.getItem('auth_token')
        const res = await fetch('/api/v1/activities/check-compliance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({
            location_name: formData.location_name || '',
            grade_level: formData.grade_level || 0,
            data_types: ['location', 'audio', 'photo'],
          }),
        })
        if (res.ok) setCompliance(await res.json())
      } catch { /* non-fatal */ }
    }, 1200)
    setComplianceTimer(timer)
    return () => clearTimeout(timer)
  }, [formData.location_name, formData.grade_level])
  // Fetch available rubrics for picker
  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (!token) return;
    fetch('/api/v1/rubrics', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : [])
      .then(data => setRubrics(data.rubrics || (Array.isArray(data) ? data : [])))
      .catch((err) => console.warn('Rubric list fetch failed:', err));
  }, []);

  const [submitError, setSubmitError] = useState('');
  const [newMaterial, setNewMaterial] = useState('');
  const [newObjective, setNewObjective] = useState('');
  const [newResource, setNewResource] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [compliance, setCompliance] = useState<{ status: 'compliant'|'review'|'blocked'; issues: string[] } | null>(null);
  // Privacy confirmation state (shown when compliance status is 'review')
  const [privacyChecks, setPrivacyChecks] = useState({ dataMinimization: false, locationPurpose: false, parentalConsent: false });
  const [privacyConfirmed, setPrivacyConfirmed] = useState(false);
  const [complianceTimer, setComplianceTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [geoStatus, setGeoStatus] = useState<string>('');
  const [showQuickPreview, setShowQuickPreview] = useState(false);

  // Auto-classify (Priority 1 — build_taxonomy_classification_prompt()):
  // suggest-then-confirm only. The AI's suggested level is held here until
  // the teacher explicitly clicks "Accept" — it never silently overwrites
  // formData.bloom_level.
  const [classifyLoading, setClassifyLoading] = useState(false);
  const [classifyError, setClassifyError] = useState('');
  const [taxonomySuggestion, setTaxonomySuggestion] = useState<{ value: string; label: string; rationale: string } | null>(null);
  const geoLatLngTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const geoNameTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleAISuggestionSelected = (suggestion: AcceptedSuggestion) => {
    setFormData(f => {
      // If title is empty, offer the suggestion title as the activity title too
      const newTitle = f.title?.trim() ? f.title : suggestion.title;
      const draft = [
        suggestion.description || suggestion.title,
        ...(suggestion.learningObjectives.length
          ? ['', 'Students will:', ...suggestion.learningObjectives.map(o => `• ${o}`)]
          : []),
        '',
        '(Edit this description to add specific instructions, materials, and expectations for your students.)',
      ].join('\n');
      const newDesc = f.description?.trim() ? f.description + '\n\n' + draft : draft;
      return { ...f, title: newTitle, description: newDesc };
    });

    // Also offer the matching taxonomy level as a suggestion, through the
    // same suggest-then-confirm flow already used for auto-classify
    // (acceptTaxonomySuggestion below) — one taxonomy-accept UI, not two.
    const levelByFramework: Record<string, number | undefined> = {
      blooms: suggestion.bloomLevel,
      dok: suggestion.dokLevel,
      marzano: suggestion.marzanoLevel,
      solo: suggestion.soloLevel,
    };
    const level = levelByFramework[taxonomyType];
    const entry = level ? TAXONOMIES[taxonomyType]?.levels[level - 1] : undefined;
    if (entry) {
      setTaxonomySuggestion({
        value: entry.value,
        label: entry.label,
        rationale: `From the AI suggestion "${suggestion.title}"`,
      });
    }
  };

  // Reverse geocode when lat/lng change (debounced 800 ms)
  const handleLatLngChange = (lat: number, lng: number) => {
    if (geoLatLngTimer.current) clearTimeout(geoLatLngTimer.current);
    geoLatLngTimer.current = setTimeout(async () => {
      if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return;
      setGeoStatus('Looking up location…');
      const name = await reverseGeocode(lat, lng);
      if (name) {
        setFormData(f => ({ ...f, location_name: name }));
        setGeoStatus('');
      } else {
        setGeoStatus('');
      }
    }, 800);
  };

  // Forward geocode when location name changes (debounced 1000 ms)
  const handleLocationNameChange = (name: string) => {
    setFormData(f => ({ ...f, location_name: name }));
    if (geoNameTimer.current) clearTimeout(geoNameTimer.current);
    if (name.length < 4) return;
    geoNameTimer.current = setTimeout(async () => {
      setGeoStatus('Finding coordinates…');
      try {
        const coords = await forwardGeocode(name);
        if (coords) {
          setFormData(f => ({ ...f, location_latitude: coords.lat, location_longitude: coords.lng }));
          // Rural/small-town addresses are frequently missing house-number
          // detail in OSM — the backend falls back to the nearest town in
          // that case rather than failing outright. Say so, since the pin
          // this drops is then only approximate and may need dragging to
          // the exact spot.
          setGeoStatus(coords.isApproximate
            ? 'Exact address not found — pinned to the nearest town. Adjust lat/long below if needed.'
            : '');
        } else {
          // No match from Nominatim — leave lat/lng untouched (still 0,0 / whatever
          // was there before) rather than silently keeping stale coordinates from
          // a previous search. Tell the teacher so they know to enter coords
          // manually instead of unknowingly saving the wrong place.
          setGeoStatus('Could not find that location — try a more specific name or enter coordinates manually.');
        }
      } catch (err) {
        console.warn('Forward geocode failed:', err);
        setGeoStatus('Could not look up that location — try a more specific name or enter coordinates manually.');
      }
    }, 1000);
  };

  // Load existing activity if editing
  useEffect(() => {
    if (isEditing && id) {
      getActivity(id).
      then((activity) => {
        if (!activity) {
          setSubmitError('Failed to load activity: activity not found or access denied.');
          return;
        }
        setFormData({
          title: activity.title,
          description: activity.description,
          grade_level: activity.grade_level,
          subject: activity.subject,
          difficulty_level: activity.difficulty_level,
          location_latitude: activity.location_latitude,
          location_longitude: activity.location_longitude,
          location_radius_meters: activity.location_radius_meters,
          location_name: activity.location_name,
          estimated_duration_minutes: activity.estimated_duration_minutes,
          materials_needed: activity.materials_needed,
          resources: activity.resources,
          learning_objectives: activity.learning_objectives,
          curriculum_unit_ids: activity.curriculum_unit_ids,
          bloom_level: activity.bloom_level,
          activity_type: activity.activity_type,
          is_shareable: activity.is_shareable,
          share_scope: (activity.share_scope as 'org' | 'all') ?? 'org',
          language: activity.language ?? '',
          state_standard: activity.state_standard ?? '',
          discipline: activity.discipline ?? '',
          location_wiki_data: activity.location_wiki_data ?? null,
          location_info: activity.location_info ?? '',
        });
        // Pre-existing gap: the rubric picker only ever wrote to this state
        // via its own onChange — never populated from a loaded activity, so
        // editing an activity that already had a rubric attached showed
        // "No rubric" instead of the real selection.
        setSelectedRubricId(activity.rubric_id ?? '');
      }).
      catch((err) => {
        setSubmitError('Failed to load activity: ' + err.message);
      });
    }

    return () => {
      clearCurrentActivity();
    };
  }, [isEditing, id, getActivity, clearCurrentActivity]);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.title?.trim()) {
      newErrors.title = 'Title is required';
    } else if (formData.title.length < 3) {
      newErrors.title = 'Title must be at least 3 characters';
    } else if (formData.title.length > 200) {
      newErrors.title = 'Title must be less than 200 characters';
    }

    if (!formData.description?.trim()) {
      newErrors.description = 'Description is required';
    } else if (formData.description.trim().length < 10) {
      newErrors.description = 'Description must be at least 10 characters';
    } else if (formData.description.length > 5000) {
      newErrors.description = 'Description must be less than 5000 characters';
    }

    if (!formData.location_name?.trim()) {
      newErrors.location_name = 'Location name is required';
    }

    if (!formData.subject) {
      newErrors.subject = 'Subject is required';
    }

    if (!formData.grade_level || formData.grade_level < 3 || formData.grade_level > 12) {
      newErrors.grade_level = 'Grade must be between 3 and 12';
    }

    if (formData.difficulty_level && (formData.difficulty_level < 1 || formData.difficulty_level > 5)) {
      newErrors.difficulty_level = 'Difficulty must be between 1 and 5';
    }

    if (formData.estimated_duration_minutes && formData.estimated_duration_minutes < 1) {
      newErrors.estimated_duration_minutes = 'Duration must be at least 1 minute';
    }

    if (formData.location_latitude && (formData.location_latitude < -90 || formData.location_latitude > 90)) {
      newErrors.location_latitude = 'Latitude must be between -90 and 90';
    }

    if (formData.location_longitude && (formData.location_longitude < -180 || formData.location_longitude > 180)) {
      newErrors.location_longitude = 'Longitude must be between -180 and 180';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');
    setIsSubmitting(true);

    if (!validateForm()) {
      setIsSubmitting(false);
      return;
    }

    try {
      // Coerce text labels / invalid cached-suggestion values to the backend's
      // expected types before submitting (bloom_level -> int, activity_type -> enum).
      const payload = {
        ...formData,
        bloom_level: normalizeBloomLevel(formData.bloom_level),
        activity_type: normalizeActivityType(formData.activity_type),
        // Include privacy confirmation flag when the teacher has confirmed review items
        ...(privacyConfirmed ? { privacy_confirmed: true } : {}),
        discovery_location_gps_capture_enabled: gpsEnabled,
      } as any;

      let savedActivityId: string | undefined = isEditing ? id : undefined;
      if (isEditing && id) {
        await updateActivity(id, payload);
      } else {
        const created = await createActivity(payload);
        savedActivityId = created?.id;
      }

      // Attach rubric if one was selected
      if (selectedRubricId && savedActivityId) {
        const token = localStorage.getItem('auth_token');
        if (token) {
          try {
            await fetch(`/api/v1/rubrics/${selectedRubricId}/attach/${savedActivityId}`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}` },
            });
          } catch (err) { console.warn('Rubric attach error:', err); }
        }
      }

      // Homeschool self-consent: the parent IS the account holder, so consent
      // is recorded immediately on save rather than via the async per-student
      // parent-consent flow used for org/school accounts.
      if (gpsEnabled && homeschoolGpsConsent && savedActivityId && currentUser?.role?.toLowerCase() === 'homeschool') {
        const token = localStorage.getItem('auth_token');
        if (token) {
          try {
            await fetch('/api/v1/parent/consent/gps', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({
                student_id: currentUser.id,
                activity_id: savedActivityId,
                consent_given: true,
              }),
            });
          } catch (err) { console.warn('GPS self-consent error:', err); }
        }
      }

      navigate(activitiesBase);
    } catch (error: any) {
      setSubmitError(error.message || 'An error occurred while saving');
      setIsSubmitting(false);
    }
  };

  const handleAddMaterial = () => {
    if (newMaterial.trim()) {
      setFormData({
        ...formData,
        materials_needed: [...(formData.materials_needed || []), newMaterial.trim()]
      });
      setNewMaterial('');
    }
  };

  const handleRemoveMaterial = (index: number) => {
    setFormData({
      ...formData,
      materials_needed: formData.materials_needed?.filter((_, i) => i !== index) || []
    });
  };

  const handleAddObjective = () => {
    if (newObjective.trim()) {
      setFormData({
        ...formData,
        learning_objectives: [...(formData.learning_objectives || []), newObjective.trim()]
      });
      setNewObjective('');
    }
  };

  const handleRemoveObjective = (index: number) => {
    setFormData({
      ...formData,
      learning_objectives: formData.learning_objectives?.filter((_, i) => i !== index) || []
    });
  };

  const handleAddResource = () => {
    if (newResource.trim()) {
      setFormData({
        ...formData,
        resources: [...(formData.resources || []), newResource.trim()]
      });
      setNewResource('');
    }
  };

  const handleRemoveResource = (index: number) => {
    setFormData({
      ...formData,
      resources: formData.resources?.filter((_, i) => i !== index) || []
    });
  };

  // ── Auto-classify (Priority 1) ────────────────────────────────────────────
  // Suggest-then-confirm: posts the most recently added learning objective
  // (falling back to title + description) to the classify-taxonomy endpoint,
  // then shows the result as a suggestion the teacher must explicitly accept.
  const getClassifyText = (): string => {
    const objectives = formData.learning_objectives || [];
    if (objectives.length > 0) return objectives[objectives.length - 1];
    return [formData.title, formData.description].filter(Boolean).join(' — ');
  };

  const handleAutoClassify = async () => {
    const text = getClassifyText().trim();
    if (!text) {
      setClassifyError('Add a learning objective (or a title/description) before auto-classifying.');
      return;
    }
    setClassifyLoading(true);
    setClassifyError('');
    setTaxonomySuggestion(null);
    try {
      const token = localStorage.getItem('auth_token');
      const res = await fetch('/api/v1/activities/classify-taxonomy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ text, classify_for: [taxonomyType] }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error || !data.result) {
        setClassifyError(data.error || 'Auto-classify failed. Set the taxonomy manually.');
        return;
      }
      const frameworkResult = data.result[taxonomyType];
      if (!frameworkResult || typeof frameworkResult.level !== 'number') {
        setClassifyError("The AI didn't return a level for this taxonomy. Set it manually.");
        return;
      }
      const levels = TAXONOMIES[taxonomyType]?.levels || [];
      const matched = levels[frameworkResult.level - 1];
      if (!matched) {
        setClassifyError('The AI suggested a level outside the expected range. Set it manually.');
        return;
      }
      setTaxonomySuggestion({
        value: matched.value,
        label: matched.label,
        rationale: frameworkResult.rationale || '',
      });
    } catch (err: any) {
      setClassifyError('Auto-classify failed: ' + (err?.message || 'network error'));
    } finally {
      setClassifyLoading(false);
    }
  };

  const acceptTaxonomySuggestion = () => {
    if (!taxonomySuggestion) return;
    setFormData(f => ({ ...f, bloom_level: taxonomySuggestion.value }));
    setTaxonomySuggestion(null);
  };

  return (
    <div className="max-w-[100rem] mx-auto p-4">
      <h1 className="text-2xl font-bold mb-2">
        {isEditing ? 'Edit Activity' : 'Create Activity'}
      </h1>
      <p className="text-[var(--text-muted)] mb-6">
        {isEditing ? 'Update your activity details' : 'Create a new educational activity'}
      </p>

      {/* 14e.3 — Privacy compliance badge */}
      {compliance && (
        <div className="mb-4">
          <div className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${
            compliance.status === 'compliant' ? 'bg-green-50 text-green-700 border border-green-200' :
            compliance.status === 'review'    ? 'bg-yellow-50 text-yellow-700 border border-yellow-200' :
                                               'bg-red-50 text-red-700 border border-red-200'
          }`}>
            <span>{compliance.status === 'compliant' ? '✅' : compliance.status === 'review' ? '⚠️' : '🚫'}</span>
            <span>{compliance.status === 'compliant' ? t("landing:privacy_compliant","Privacy Compliant") :
                   compliance.status === 'review'    ? t("landing:privacy_review_needed","Privacy Review Needed") :
                                                      t("landing:privacy_blocked","Privacy Issue — Review Required")}</span>
            {compliance.issues.length > 0 && (
              <span className="ml-1 text-xs opacity-75">({compliance.issues.slice(0,2).join('; ')})</span>
            )}
            {compliance.status === 'review' && privacyConfirmed && (
              <span className="ml-auto text-xs font-semibold text-green-700">{t('components_teacher_activitymanager.privacy_settings_confirmed', 'Privacy settings confirmed ✓')}</span>
            )}
          </div>

          {/* Privacy confirmation panel — shown when compliance requires review and not yet confirmed */}
          {compliance.status === 'review' && !privacyConfirmed && (
            <div className="mt-2 border border-yellow-300 rounded-lg bg-yellow-50 p-4 space-y-3">
              <p className="text-sm text-yellow-800 font-medium">{t('components_teacher_activitymanager.this_activity_involves_student_location_', 'This activity involves student location data and/or students under 13. Please confirm the following before publishing.')}</p>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={privacyChecks.dataMinimization}
                  onChange={e => setPrivacyChecks(p => ({ ...p, dataMinimization: e.target.checked }))}
                  className="mt-0.5 accent-yellow-600"
                />
                <span className="text-sm text-[var(--text)]">{t('components_teacher_activitymanager.this_activity_only_collects_data_necessa', 'This activity only collects data necessary for the educational purpose')}</span>
              </label>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={privacyChecks.locationPurpose}
                  onChange={e => setPrivacyChecks(p => ({ ...p, locationPurpose: e.target.checked }))}
                  className="mt-0.5 accent-yellow-600"
                />
                <span className="text-sm text-[var(--text)]">{t('components_teacher_activitymanager.location_data_is_used_only_to_verify_stu', 'Location data is used only to verify student presence at the activity site')}</span>
              </label>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={privacyChecks.parentalConsent}
                  onChange={e => setPrivacyChecks(p => ({ ...p, parentalConsent: e.target.checked }))}
                  className="mt-0.5 accent-yellow-600"
                />
                <span className="text-sm text-[var(--text)]">{t('components_teacher_activitymanager.parental_or_guardian_consent_is_in_place', 'Parental or guardian consent is in place where required by law')}</span>
              </label>
              <button
                type="button"
                disabled={!(privacyChecks.dataMinimization && privacyChecks.locationPurpose && privacyChecks.parentalConsent)}
                onClick={() => {
                  setPrivacyConfirmed(true);
                  setCompliance(c => c ? { ...c, status: 'compliant' } : c);
                }}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: (privacyChecks.dataMinimization && privacyChecks.locationPurpose && privacyChecks.parentalConsent) ? '#ca8a04' : '#d1d5db' }}
              >
                Confirm Privacy Settings
              </button>
            </div>
          )}
        </div>
      )}

      {/* Peri AI header — sticky banner pinned above both columns while
          they scroll beneath it, not a sidebar: reacts to whatever
          subject/objective/location is filled in on the form, teacher
          explicitly clicks a card to add it (see handleAISuggestionSelected)
          — nothing here auto-applies. */}
      <aside className="w-full mb-4 sticky top-0 z-10 bg-purple-50 rounded-lg p-4 border-t-[3px] border-purple-300 shadow-sm">
        <h2 className="text-lg font-bold text-purple-900 mb-1">{t('components_teacher_activitymanager.peri_ai_activity_suggestions', '✨ Peri AI Activity Suggestions')}</h2>
        <OllamaLessonSuggestions
          layout="horizontal"
          subject={formData.subject}
          gradeLevel={formData.grade_level}
          taxonomyType={taxonomyType}
          locationName={formData.location_name}
          latitude={formData.location_latitude}
          longitude={formData.location_longitude}
          onSuggestionSelected={handleAISuggestionSelected}
        />
      </aside>

      <div className="flex flex-col lg:flex-row gap-4 items-start">
        {/* Context column — read-only background/reference material, pulled
            out of the form so a long Wikidata synopsis (description,
            architect/date, nearby points of interest, etc.) doesn't push
            the rest of the form's fields far down the page. Always visible
            once a location is set — no extra click needed to see it. */}
        <div className={`w-full lg:w-80 flex-shrink-0 p-4 ${styles.journal}`}>
          <h2 className={`text-lg font-bold text-[var(--text)] mb-1 ${styles.journalTitle}`}>{t('components_teacher_activitymanager.background_context', '📖 Background & Context')}</h2>
          {formData.location_latitude && formData.location_longitude ? (
            <WikiLocationInfo
              latitude={formData.location_latitude}
              longitude={formData.location_longitude}
              subject={formData.subject}
              locationName={formData.location_name}
              onInfoLoaded={(info) => {
                setFormData(f => ({
                  ...f,
                  location_wiki_data: info,
                  location_info: info.description || '',
                }));
              }}
            />
          ) : (
            <p className="text-sm text-[var(--text-faint)] mt-2">
              {t('components_teacher_activitymanager.add_a_location_to_see_background', 'Add a location above to see background information about it here.')}
            </p>
          )}
        </div>

      <form onSubmit={handleSubmit} className="flex-1 min-w-0 bg-[var(--surface)] rounded-lg p-6 shadow">
        {/* Error Alert */}
        {submitError &&
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800 mb-6">
            <p className="font-semibold">{t("landing:error", "Error")}</p>
            <p>{submitError}</p>
          </div>
        }

        {/* Context Section — Subject · Location · Objectives (feeds Peri AI).
            Leads the form: these are the inputs the AI sidebar reacts to,
            and location can be the reason the activity exists at all (a
            field trip to a specific place), so they come before title/
            description rather than after. */}
        <details className={styles.chapter} open={openSections.context || contextHasError} onToggle={toggleSection('context')}>
          <summary className={styles.chapterSummary}>
            <span className={styles.chevron} aria-hidden="true">▸</span>
            <h2 className={styles.chapterTitle}>{t('components_teacher_activitymanager.context', 'Context')}</h2>
          </summary>
          <div className={styles.chapterBody}>
          <p className="text-sm text-[var(--text-faint)] mb-4">{t('components_teacher_activitymanager.subject_location_and_objectives_peri_ai_', 'Subject, location, and objectives — Peri AI uses these to generate activity suggestions.')}</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {/* Subject */}
            <div>
              <label className="block text-sm font-semibold text-[var(--text)] mb-2">{t("landing:subject", "Subject")}<span className="text-red-500">*</span></label>
              <select
                value={formData.subject}
                onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)] ${errors.subject ? 'border-red-500' : 'border-[var(--border)]'}`}>
                <option value="Science">{t("landing:science", "Science")}</option>
                <option value="Math">{t("landing:math", "Math")}</option>
                <option value="Language">{t('components_teacher_activitymanager.language_arts', 'Language Arts')}</option>
                <option value="History">{t("landing:history", "History")}</option>
                <option value="Art">{t("landing:art", "Art")}</option>
                <option value="PE">{t("landing:pe", "PE")}</option>
                <option value="Social Studies">{t('components_teacher_activitymanager.social_studies', 'Social Studies')}</option>
                <option value="Interdisciplinary">{t('components_teacher_activitymanager.interdisciplinary', 'Interdisciplinary')}</option>
                <option value="Other">{t('components_teacher_activitymanager.other', 'Other')}</option>
              </select>
              {errors.subject && <p className="text-red-500 text-sm mt-1">{errors.subject}</p>}
            </div>

            {/* Location Name */}
            <div>
              <label className="block text-sm font-semibold text-[var(--text)] mb-2">{t("landing:location_name", "Location Name")}
                <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.location_name}
                onChange={(e) => handleLocationNameChange(e.target.value)}
                className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)] ${
                errors.location_name ? 'border-red-500' : 'border-[var(--border)]'}`
                }
                placeholder={t('components_teacher_activitymanager.placeholder_eg_lincoln_park_city_museum', 'e.g., Lincoln Park, City Museum…')} />
              {errors.location_name && <p className="text-red-500 text-sm mt-1">{errors.location_name}</p>}
              {geoStatus && <p className="text-xs text-[var(--primary)] mt-1 italic">{geoStatus}</p>}
            </div>
          </div>

          {/* Lat / Lng — secondary, collapsible feel via small text */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="block text-xs text-[var(--text-muted)] mb-1">{t('components_teacher_activitymanager.latitude', 'Latitude')}</label>
              <input type="number" step="0.0001" aria-label={t('components_teacher_activitymanager.aria_label_location_latitude', 'Location latitude')} value={formData.location_latitude || ''}
                onChange={(e) => { const lat = parseFloat(e.target.value)||0; setFormData(f=>({...f,location_latitude:lat})); handleLatLngChange(lat,formData.location_longitude); }}
                className="w-full px-3 py-1.5 border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[var(--primary)]" placeholder="47.6839" />
            </div>
            <div>
              <label className="block text-xs text-[var(--text-muted)] mb-1">{t('components_teacher_activitymanager.longitude', 'Longitude')}</label>
              <input type="number" step="0.0001" aria-label={t('components_teacher_activitymanager.aria_label_location_longitude', 'Location longitude')} value={formData.location_longitude || ''}
                onChange={(e) => { const lng = parseFloat(e.target.value)||0; setFormData(f=>({...f,location_longitude:lng})); handleLatLngChange(formData.location_latitude,lng); }}
                className="w-full px-3 py-1.5 border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[var(--primary)]" placeholder="-122.3081" />
            </div>
          </div>

          {/* GPS live tracking toggle */}
          <button
            type="button"
            onClick={() => setShowLocationTools(v => !v)}
            className="text-sm text-[var(--primary)] hover:text-[var(--primary-deep)] font-medium mb-3"
          >
            {showLocationTools ? '▼' : '▶'} {t('components_teacher_activitymanager.location', '📍 Location')}
          </button>
          {showLocationTools && (
            <div className="mb-4">
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={gpsEnabled}
                  onChange={(e) => {
                    setGpsEnabled(e.target.checked);
                    if (!e.target.checked) setHomeschoolGpsConsent(false);
                  }}
                  style={{ width: 16, height: 16 }}
                />
                <span style={{ fontWeight: 600 }}>{t('components_teacher_activitymanager.enable_live_gps_tracking_during_this_act', '📍 Enable live GPS tracking during this activity')}</span>
              </label>
              <p className="text-xs text-[var(--text-muted)] mt-1" style={{ marginLeft: 26 }}>{t('components_teacher_activitymanager.students_locations_are_shared_with_you_i', 'Students\' locations are shared with you in real time on the session monitor. Parental consent is requested automatically for students under 13.')}</p>

              {/* Homeschool self-consent — the parent IS the account holder, so
                  consent is collected here rather than via the async per-student
                  parent-consent flow used for org/school accounts. */}
              {gpsEnabled && currentUser?.role?.toLowerCase() === 'homeschool' && (
                <div className="mt-2 p-3 rounded-lg border border-[var(--border)] bg-[var(--surface-alt)]" style={{ marginLeft: 26 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={homeschoolGpsConsent}
                      onChange={(e) => setHomeschoolGpsConsent(e.target.checked)}
                      style={{ width: 16, height: 16 }}
                    />
                    <span className="text-sm">{t('components_teacher_activitymanager.i_consent_to_gps_location_capture_for_my', 'I consent to GPS location capture for my child during this activity')}</span>
                  </label>
                </div>
              )}
            </div>
          )}

          {/* Learning Objectives */}
          <div>
            <label className="block text-sm font-semibold text-[var(--text)] mb-2">{t("landing:learning_objectives", "Learning Objectives")}</label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={newObjective}
                onChange={(e) => setNewObjective(e.target.value)}
                className="flex-1 px-4 py-2 border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                placeholder={t("landing:eg_understand_photosynthesis_process", "e.g., Understand photosynthesis process")}
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddObjective())} />
              <button type="button" onClick={handleAddObjective}
                className="px-4 py-2 bg-[var(--primary)] text-white rounded-lg hover:bg-[var(--primary-deep)] font-semibold">
                {t("landing:activitymanager.add", "Add")}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {(formData.learning_objectives || []).map((objective, index) => (
                <div key={index} className="bg-green-100 text-green-800 px-3 py-1 rounded-full flex items-center gap-2">
                  <span>{objective}</span>
                  <button type="button" onClick={() => handleRemoveObjective(index)} className="font-bold hover:text-green-900">✕</button>
                </div>
              ))}
            </div>
          </div>
          </div>
        </details>

        {/* Basic Information Section */}
        <details className={styles.chapter} open={openSections.basic || basicHasError} onToggle={toggleSection('basic')}>
          <summary className={styles.chapterSummary}>
            <span className={styles.chevron} aria-hidden="true">▸</span>
            <h2 className={styles.chapterTitle}>{t("landing:basic_information", "Basic Information")}</h2>
          </summary>
          <div className={styles.chapterBody}>

          {/* Title */}
          <div className="mb-4">
            <label className="block text-sm font-semibold text-[var(--text)] mb-2">{t("landing:activitymanager.title", "Title")}
              <span className="text-red-500">*</span>
            </label>
            <input
              id="title"
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)] ${
              errors.title ? 'border-red-500' : 'border-[var(--border)]'}`
              }
              placeholder={t("landing:enter_activity_title", "Enter activity title")}
              maxLength={200} />

            {errors.title && <p className="text-red-500 text-sm mt-1">{errors.title}</p>}
            <p className="text-[var(--text-muted)] text-xs mt-1">{formData.title?.length || 0}/200</p>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-semibold text-[var(--text)] mb-2">{t("landing:activitymanager.description", "Description")}
              <span className="text-red-500">*</span>
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)] ${
              errors.description ? 'border-red-500' : 'border-[var(--border)]'}`
              }
              placeholder={t("landing:enter_activity_description", "Enter activity description")}
              rows={4} />
            {errors.description && <p className="text-red-500 text-sm mt-1">{errors.description}</p>}
            <p className="text-[var(--text-muted)] text-xs mt-1">{t('components_teacher_activitymanager.min_10_characters', 'Minimum 10 characters')}</p>
          </div>
          </div>
        </details>

        {/* Academic Information Section */}
        <details className={styles.chapter} open={openSections.academic || academicHasError} onToggle={toggleSection('academic')}>
          <summary className={styles.chapterSummary}>
            <span className={styles.chevron} aria-hidden="true">▸</span>
            <h2 className={styles.chapterTitle}>{t("landing:academic_information", "Academic Information")}</h2>
          </summary>
          <div className={styles.chapterBody}>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Grade Level */}
            <div>
              <label className="block text-sm font-semibold text-[var(--text)] mb-2">{t("landing:activitymanager.grade_level", "Grade Level")}
                <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.grade_level}
                onChange={(e) => setFormData({ ...formData, grade_level: parseInt(e.target.value) })}
                className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)] ${
                errors.grade_level ? 'border-red-500' : 'border-[var(--border)]'}`
                }>
                
                {Array.from({ length: 10 }, (_, i) => i + 3).map((grade) =>
                <option key={grade} value={grade}>{t("landing:activitymanager.grade", "Grade")}{grade}</option>
                )}
              </select>
              {errors.grade_level && <p className="text-red-500 text-sm mt-1">{errors.grade_level}</p>}
            </div>

            {/* Difficulty Level */}
            <div>
              <label className="block text-sm font-semibold text-[var(--text)] mb-2">{t("landing:difficulty_level", "Difficulty Level:")}
                {formData.difficulty_level}/5
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="1"
                  max="5"
                  value={formData.difficulty_level || 3}
                  onChange={(e) => setFormData({ ...formData, difficulty_level: parseInt(e.target.value) })}
                  className="flex-1" />
                
                <span className="text-sm font-semibold text-[var(--text-muted)]">
                  {'★'.repeat(formData.difficulty_level || 3)}{'☆'.repeat(5 - (formData.difficulty_level || 3))}
                </span>
              </div>
            </div>

            {/* Duration */}
            <div>
              <label className="block text-sm font-semibold text-[var(--text)] mb-2">{t("landing:estimated_duration_minutes", "Estimated Duration (minutes)")}

              </label>
              <input
                type="number"
                min="1"
                value={formData.estimated_duration_minutes}
                onChange={(e) => setFormData({ ...formData, estimated_duration_minutes: parseInt(e.target.value) || 0 })}
                className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)] ${
                errors.estimated_duration_minutes ? 'border-red-500' : 'border-[var(--border)]'}`
                } />
              
              {errors.estimated_duration_minutes &&
              <p className="text-red-500 text-sm mt-1">{errors.estimated_duration_minutes}</p>
              }
            </div>

            {/* Activity Type */}
            <div>
              <label className="block text-sm font-semibold text-[var(--text)] mb-2">{t("landing:activity_type", "Activity Type")}

              </label>
              <select
                value={formData.activity_type}
                onChange={(e) => setFormData({ ...formData, activity_type: e.target.value as ActivityType })}
                className="w-full px-4 py-2 border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)]">
                
                <option value="outdoor">{t("landing:outdoor", "Outdoor")}</option>
                <option value="indoor">{t("landing:indoor", "Indoor")}</option>
                <option value="virtual">{t("landing:virtual", "Virtual")}</option>
                <option value="mixed">{t("landing:mixed", "Mixed")}</option>
              </select>
            </div>
          </div>
          </div>
        </details>

        {/* Assessments — the 3 ways a teacher can assess this activity,
            grouped in one place instead of scattered across the form
            (state/curriculum standards used to live under a "Share this
            activity" toggle, taxonomy under Academic Information, rubric at
            the very bottom). Up to all 3 can be applied together. */}
        <details className={styles.chapter} open={openSections.assessments} onToggle={toggleSection('assessments')}>
          <summary className={styles.chapterSummary}>
            <span className={styles.chevron} aria-hidden="true">▸</span>
            <h2 className={styles.chapterTitle}>{t('components_teacher_activitymanager.assessments', 'Assessments')}</h2>
            <span className={styles.chapterMeta}>
              {/* Taxonomy always carries a value (defaults to the first
                  level), so it counts as always-applied; standards and
                  rubric start empty and count only once the teacher picks one. */}
              {((formData.curriculum_unit_ids || []).length > 0 ? 1 : 0) + (selectedRubricId ? 1 : 0) + 1}/3 {t('components_teacher_activitymanager.applied', 'applied')}
            </span>
          </summary>
          <div className={styles.chapterBody}>
          <p className="text-sm text-[var(--text-faint)] mb-4">{t('components_teacher_activitymanager.assessments_intro', 'Apply up to three: state/curriculum standards, a cognitive taxonomy, and your own rubric.')}</p>

          <div className="space-y-5">
            {/* 1. State / Curriculum Standards */}
            <div className="rounded-lg border border-[var(--border)] p-4">
              <label className="block text-sm font-semibold text-[var(--text)] mb-2">
                📐 {t('components_teacher_activitymanager.state_curriculum_standards', 'State / Curriculum Standards')}{' '}
                <span className="text-[var(--text-faint)] font-normal">{t('components_teacher_activitymanager.optional', '(optional)')}</span>
              </label>
              <CurriculumMapper
                selectedUnits={formData.curriculum_unit_ids || []}
                onUnitsChange={(unitIds) => setFormData((p) => ({ ...p, curriculum_unit_ids: unitIds }))}
                subject={formData.subject}
                gradeLevel={formData.grade_level}
              />
            </div>

            {/* 2. Taxonomy — two-level picker */}
            <div className="rounded-lg border border-[var(--border)] p-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className="block text-sm font-semibold text-[var(--text)]">🧠 {t('components_teacher_activitymanager.cognitive_taxonomy', 'Cognitive Taxonomy')}</label>
                <button
                  type="button"
                  onClick={handleAutoClassify}
                  disabled={classifyLoading}
                  className="text-xs px-3 py-1 rounded-full bg-purple-100 text-purple-700 hover:bg-purple-200 font-semibold disabled:opacity-50 whitespace-nowrap"
                >
                  {classifyLoading ? 'Classifying…' : '✨ Auto-classify'}
                </button>
              </div>
              <select
                value={taxonomyType}
                onChange={(e) => {
                  const t = e.target.value;
                  setTaxonomyType(t);
                  // Reset bloom_level to first option of new taxonomy
                  const first = TAXONOMIES[t]?.levels[0]?.value ?? 'remember';
                  setFormData(f => ({ ...f, bloom_level: first }));
                  // Suggestion was computed against the previous taxonomy — discard it.
                  setTaxonomySuggestion(null);
                  setClassifyError('');
                }}
                className="w-full px-4 py-2 border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)] bg-white">
                {Object.entries(TAXONOMIES).map(([key, tx]) => (
                  <option key={key} value={key}>{tx.label}</option>
                ))}
              </select>
              <select
                value={formData.bloom_level}
                onChange={(e) => setFormData(f => ({ ...f, bloom_level: e.target.value }))}
                className="w-full px-4 py-2 border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)] bg-white">
                {TAXONOMIES[taxonomyType]?.levels.map(lvl => (
                  <option key={lvl.value} value={lvl.value}>{lvl.label}</option>
                ))}
              </select>
              {classifyError && <p className="text-red-500 text-xs mt-1">{classifyError}</p>}
              {taxonomySuggestion && (
                <div className="mt-1 p-2 rounded-lg border border-purple-200 bg-purple-50 text-xs">
                  <p className="text-purple-800">
                    <span className="font-semibold">AI suggests:</span> {taxonomySuggestion.label}
                    {taxonomySuggestion.rationale && <span className="text-purple-600"> — {taxonomySuggestion.rationale}</span>}
                  </p>
                  <div className="mt-1 flex gap-2">
                    <button
                      type="button"
                      onClick={acceptTaxonomySuggestion}
                      className="px-2 py-0.5 rounded bg-purple-600 text-white font-semibold hover:bg-purple-700"
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      onClick={() => setTaxonomySuggestion(null)}
                      className="px-2 py-0.5 rounded border border-purple-300 text-purple-700 hover:bg-purple-100"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 3. Rubric — filter-as-you-type once the list gets long */}
            <div className="rounded-lg border border-[var(--border)] p-4">
              <label className="block text-sm font-semibold text-[var(--text)] mb-2">
                📋 {t('components_teacher_activitymanager.attach_rubric', 'Attach Rubric')}{' '}
                <span className="text-[var(--text-faint)] font-normal">{t('components_teacher_activitymanager.optional', '(optional)')}</span>
              </label>
              {rubrics.length > 6 && (
                <input
                  type="text"
                  value={rubricFilter}
                  onChange={(e) => setRubricFilter(e.target.value)}
                  placeholder={t('components_teacher_activitymanager.filter_rubrics', 'Filter rubrics…')}
                  className="w-full px-3 py-1.5 mb-2 border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                />
              )}
              <select
                value={selectedRubricId}
                onChange={(e) => setSelectedRubricId(e.target.value)}
                className="w-full px-4 py-2 border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
              >
                <option value="">{t('components_teacher_activitymanager.no_rubric', 'No rubric')}</option>
                {rubrics
                  .filter(r => r.title.toLowerCase().includes(rubricFilter.trim().toLowerCase()))
                  .map((r) => (
                    <option key={r.id} value={r.id}>{r.title}</option>
                  ))}
              </select>
            </div>
          </div>

          {/* Location Radius — geofence used to verify student presence,
              grouped here with the other verification/assessment settings. */}
          <div className="mt-5 pt-5 border-t border-[var(--border)]">
            <label className="block text-sm font-semibold text-[var(--text)] mb-2">{t("landing:location_radius_meters", "Location Radius (meters)")}</label>
            <input
              type="number" min="1"
              value={formData.location_radius_meters}
              onChange={(e) => setFormData({ ...formData, location_radius_meters: parseInt(e.target.value) || 500 })}
              className="w-48 px-4 py-2 border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
              placeholder="500" />
          </div>
          </div>
        </details>

        {/* Materials Section */}
        <details className={styles.chapter} open={openSections.materials} onToggle={toggleSection('materials')}>
          <summary className={styles.chapterSummary}>
            <span className={styles.chevron} aria-hidden="true">▸</span>
            <h2 className={styles.chapterTitle}>{t("landing:materials_resources", "Materials & Resources")}</h2>
          </summary>
          <div className={styles.chapterBody}>

          <div>
            <label className="block text-sm font-semibold text-[var(--text)] mb-2">{t("landing:materials_needed", "Materials Needed")}

            </label>
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={newMaterial}
                onChange={(e) => setNewMaterial(e.target.value)}
                className="flex-1 px-4 py-2 border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                placeholder={t("landing:eg_microscopes_beakers_worksheets", "e.g., Microscopes, Beakers, Worksheets")}
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddMaterial())} />
              
              <button
                type="button"
                onClick={handleAddMaterial}
                className="px-4 py-2 bg-[var(--primary)] text-white rounded-lg hover:bg-[var(--primary-deep)] font-semibold">{t("landing:activitymanager.add", "Add")}


              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {(formData.materials_needed || []).map((material, index) =>
              <div
                key={index}
                className="bg-[var(--primary-muted)] text-[var(--primary-deep)] px-3 py-1 rounded-full flex items-center gap-2">
                
                  <span>{material}</span>
                  <button
                  type="button"
                  onClick={() => handleRemoveMaterial(index)}
                  className="font-bold hover:text-[var(--primary-deep)]">
                  
                    ✕
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="mt-6">
            <label className="block text-sm font-semibold text-[var(--text)] mb-2">{t("landing:additional_resources", "Additional Resources")}

            </label>
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={newResource}
                onChange={(e) => setNewResource(e.target.value)}
                className="flex-1 px-4 py-2 border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                placeholder={t("landing:eg_online_videos_pdf_guides_websites", "e.g., Online videos, PDF guides, websites")}
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddResource())} />
              
              <button
                type="button"
                onClick={handleAddResource}
                className="px-4 py-2 bg-[var(--primary)] text-white rounded-lg hover:bg-[var(--primary-deep)] font-semibold">{t("landing:activitymanager.add", "Add")}


              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {(formData.resources || []).map((resource, index) =>
              <div
                key={index}
                className="bg-purple-100 text-purple-800 px-3 py-1 rounded-full flex items-center gap-2">
                
                  <span>{resource}</span>
                  <button
                  type="button"
                  onClick={() => handleRemoveResource(index)}
                  className="font-bold hover:text-purple-900">
                  
                    ✕
                  </button>
                </div>
              )}
            </div>
          </div>
          </div>
        </details>

        {/* Additional Options */}
        <details className={styles.chapter} open={openSections.additional} onToggle={toggleSection('additional')}>
          <summary className={styles.chapterSummary}>
            <span className={styles.chevron} aria-hidden="true">▸</span>
            <h2 className={styles.chapterTitle}>{t("landing:additional_options", "Additional Options")}</h2>
          </summary>
          <div className={styles.chapterBody}>

          {/* Shareable toggle */}
          <div className="flex items-center p-3 border border-[var(--border)] rounded-lg hover:bg-[var(--surface-alt)] mb-3">
            <input
              type="checkbox"
              id="shareable"
              checked={formData.is_shareable || false}
              onChange={(e) => {
                const on = e.target.checked;
                setFormData(f => on
                  ? {
                      ...f,
                      is_shareable: true,
                      // Auto-fill sharing defaults from the teacher's org / the activity itself
                      share_scope: f.share_scope ?? 'org',
                      language: f.language || 'English',
                      discipline: f.discipline || f.subject || '',
                      state_standard: f.state_standard || ((currentUser as any)?.state_standard ?? ''),
                    }
                  : { ...f, is_shareable: false });
              }}
              className="w-4 h-4" />
            <label htmlFor="shareable" className="ml-3 text-sm font-semibold text-[var(--text)] cursor-pointer flex-1">
              {t("landing:make_this_activity_shareable_with_other_", "Make this activity shareable with other teachers")}
            </label>
          </div>

          {/* Share scope + metadata — shown only when shareable */}
          {formData.is_shareable && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg space-y-3">
              {/* The shared-library endpoint requires BOTH is_shareable=true
                  AND status='published' — marking an activity shareable
                  here does nothing on its own until it's also published
                  from the Activities list. This was a recurring point of
                  confusion ("I flagged it for sharing but it's not
                  showing up"), so make the requirement explicit here. */}
              <p className="text-xs text-green-800 bg-green-100 border border-green-300 rounded px-3 py-2">
                {t(
                  'components_teacher_activitymanager.share_publish_note',
                  "This activity also needs to be Published (from the Activities list) before it appears in the Shared Library."
                )}
              </p>
              {/* Scope */}
              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">{t('components_teacher_activitymanager.share_with', 'Share with')}</label>
                <div className="flex gap-2">
                  {(['org', 'all'] as const).map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setFormData({ ...formData, share_scope: s })}
                      className="px-4 py-1.5 rounded-lg text-sm font-semibold border transition"
                      style={{
                        background: (formData.share_scope ?? 'org') === s ? 'var(--primary)' : 'white',
                        color: (formData.share_scope ?? 'org') === s ? 'white' : 'var(--text-muted)',
                        borderColor: (formData.share_scope ?? 'org') === s ? 'var(--primary)' : '#d1d5db',
                      }}
                    >
                      {s === 'org' ? '🏫 My organisation only' : '🌐 All organisations'}
                    </button>
                  ))}
                </div>
              </div>              {/* Language / State / Discipline */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">{t('components_teacher_activitymanager.language', 'Language')}</label>
                  <input
                    type="text"
                    placeholder={t('components_teacher_activitymanager.placeholder_eg_english', 'e.g. English')}
                    value={formData.language ?? ''}
                    onChange={e => setFormData({ ...formData, language: e.target.value })}
                    className="w-full border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">{t('components_teacher_activitymanager.state_standard', 'State standard')}</label>
                  {isOrgTeacher ? (
                    /* Org/district teacher — admin controls state standards */
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
                      {formData.state_standard ? (
                        <p className="text-sm font-medium text-[var(--text)] mb-1">{formData.state_standard}</p>
                      ) : (
                        <p className="text-sm text-[var(--text-faint)] italic mb-1">{t('components_teacher_activitymanager.not_set_by_administrator', 'Not set by administrator')}</p>
                      )}
                      <p className="text-xs text-amber-700">{t('components_teacher_activitymanager.state_standards_for_your_school_or_distr', 'State standards for your school or district are managed by your administrator. Contact them to update this setting.')}</p>
                    </div>
                  ) : (
                    /* Standalone teacher — free to choose */
                    <select
                      value={formData.state_standard ?? ''}
                      onChange={e => setFormData({ ...formData, state_standard: e.target.value })}
                      className="w-full border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                    >
                      <option value="">{t('components_teacher_activitymanager.none', 'None')}</option>
                      {['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
                        'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
                        'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'].map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">{t('components_teacher_activitymanager.discipline', 'Discipline')}</label>
                  <select
                    value={formData.discipline ?? ''}
                    onChange={e => setFormData({ ...formData, discipline: e.target.value })}
                    className="w-full border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                  >
                    <option value="">{t('components_teacher_activitymanager.none', 'None')}</option>
                    {['STEM','Humanities','Arts','Social Studies','Physical Education','Foreign Language','Computer Science','Career & Technical'].map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}
          </div>
        </details>

        {/* Buttons */}
        <div className="flex gap-3 pt-6 border-t border-[var(--border)]">
          <button
            type="button"
            onClick={() => setShowQuickPreview(true)}
            className="px-5 py-3 rounded-lg font-semibold text-sm transition-colors"
            style={{ background: 'var(--primary)', color: 'white', minWidth: 140 }}>
            👁 Quick Preview
          </button>
          {isEditing && id && (
            <button
              type="button"
              onClick={() => navigate(`${activitiesBase}/${id}/student-preview`)}
              className="px-5 py-3 rounded-lg font-semibold text-sm transition-colors"
              style={{ background: '#2e7d32', color: 'white', minWidth: 160 }}>
              📱 {t("landing:preview_as_student", "Preview as Student")}
            </button>
          )}
          {isEditing && id && !location.pathname.startsWith('/homeschool') && (
            <button
              type="button"
              onClick={() => navigate(`/teacher/activities/${id}/fieldwork`)}
              className="px-5 py-3 rounded-lg font-semibold text-sm transition-colors"
              style={{ background: '#0066cc', color: 'white', minWidth: 140 }}>
              🗺 {t('components_teacher_activitymanager.fieldwork_map', 'Fieldwork Map')}
            </button>
          )}
          <button
            type="submit"
            disabled={isSubmitting || loading}
            className="flex-1 px-6 py-3 bg-[var(--primary)] text-white rounded-lg hover:bg-[var(--primary-deep)] transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed">
            {isSubmitting || loading ?
            <span className="flex items-center justify-center">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></span>{t("landing:saving", "Saving...")}
            </span> :
            isEditing ? 'Update Activity' : 'Create Activity'
            }
          </button>
          <button
            type="button"
            onClick={() => navigate('/teacher/activities')}
            disabled={isSubmitting}
            className="flex-1 px-6 py-3 border border-[var(--border)] text-[var(--text)] rounded-lg hover:bg-[var(--surface-alt)] transition-colors font-semibold disabled:opacity-50">{t("landing:cancel", "Cancel")}
          </button>
        </div>
      </form>
      </div>

      {/* Quick Preview Modal */}
      {showQuickPreview && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.55)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', padding: 24,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowQuickPreview(false); }}
        >
          <div style={{
            background: 'var(--surface, #fff)', borderRadius: 16, padding: '24px 20px',
            maxWidth: 460, width: '100%', maxHeight: '90vh', overflowY: 'auto',
            boxShadow: '0 24px 80px rgba(0,0,0,0.3)',
          }}>
            {/* Modal header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <span style={{ fontWeight: 700, fontSize: 16 }}>{t('components_teacher_activitymanager.student_view_preview', '👁 Student View Preview')}</span>
              <button
                onClick={() => setShowQuickPreview(false)}
                style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', lineHeight: 1, color: '#666' }}
              >✕</button>
            </div>
            <p style={{ color: '#666', fontSize: 12, marginBottom: 16 }}>{t('components_teacher_activitymanager.this_is_how_the_activity_appears_to_stud', 'This is how the activity appears to students in the app.')}</p>

            {/* Phone frame */}
            <div style={{
              border: '3px solid #222', borderRadius: 28, padding: '16px 14px',
              background: '#fafafa', margin: '0 auto', maxWidth: 360, position: 'relative',
            }}>
              {/* Notch */}
              <div style={{
                width: 80, height: 14, background: '#222', borderRadius: '0 0 12px 12px',
                margin: '-16px auto 12px auto',
              }} />

              {/* Activity header */}
              <div style={{ background: '#2e7d32', borderRadius: 8, padding: '10px 14px', marginBottom: 14 }}>
                <div style={{ color: '#a5d6a7', fontSize: 10, letterSpacing: 1, marginBottom: 3 }}>
                  {(formData.subject || 'SUBJECT').toUpperCase()} · GRADE {formData.grade_level} · {formData.estimated_duration_minutes} MIN
                </div>
                <div style={{ color: 'white', fontSize: 18, fontWeight: 700, lineHeight: 1.2 }}>
                  {formData.title || 'Activity Title'}
                </div>
              </div>

              {/* Location */}
              {formData.location_name && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, color: '#555' }}>
                  <span>📍</span>
                  <span style={{ fontSize: 12 }}>{formData.location_name}</span>
                </div>
              )}

              {/* Description */}
              {formData.description && (
                <p style={{ fontSize: 13, color: '#333', lineHeight: 1.5, marginBottom: 14 }}>
                  {formData.description.slice(0, 200)}{formData.description.length > 200 ? '…' : ''}
                </p>
              )}

              {/* Phases */}
              <div style={{ display: 'flex', gap: 5, marginBottom: 14 }}>
                {['Orient', 'Observe', 'Capture', 'Reflect'].map((phase) => (
                  <div key={phase} style={{
                    flex: 1, textAlign: 'center', padding: '5px 0',
                    background: '#e8f5e9', borderRadius: 6,
                    fontSize: 10, fontWeight: 600, color: '#2e7d32',
                  }}>{phase}</div>
                ))}
              </div>

              {/* Learning objectives */}
              {(formData.learning_objectives ?? []).filter(Boolean).length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#888', letterSpacing: 1, marginBottom: 5 }}>{t('components_teacher_activitymanager.learning_goals', 'LEARNING GOALS')}</div>
                  {(formData.learning_objectives ?? []).filter(Boolean).slice(0, 3).map((obj, i) => (
                    <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 3, alignItems: 'flex-start' }}>
                      <span style={{ color: '#2e7d32', fontSize: 11, flexShrink: 0 }}>✓</span>
                      <span style={{ fontSize: 12, color: '#444' }}>{obj}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Materials */}
              {(formData.materials_needed ?? []).filter(Boolean).length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#888', letterSpacing: 1, marginBottom: 5 }}>{t('components_teacher_activitymanager.bring_with_you', 'BRING WITH YOU')}</div>
                  {(formData.materials_needed ?? []).filter(Boolean).map((m, i) => (
                    <div key={i} style={{ fontSize: 12, color: '#444', marginBottom: 2 }}>• {m}</div>
                  ))}
                </div>
              )}

              {/* CTA */}
              <button disabled style={{
                width: '100%', marginTop: 16, padding: '10px 0',
                background: '#2e7d32', color: 'white', border: 'none',
                borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'not-allowed', opacity: 0.7,
              }}>{t('components_teacher_activitymanager.start_activity', 'Start Activity')}</button>

              {/* Home indicator */}
              <div style={{ width: 60, height: 4, background: '#ccc', borderRadius: 4, margin: '14px auto 0' }} />
            </div>

            <p style={{ textAlign: 'center', color: '#999', fontSize: 11, marginTop: 12 }}>{t('components_teacher_activitymanager.capture_buttons_are_disabled_in_preview_', 'Capture buttons are disabled in preview mode.')}</p>

            {isEditing && id && (
              <div style={{ textAlign: 'center', marginTop: 12 }}>
                <button
                  onClick={() => { setShowQuickPreview(false); navigate(`/teacher/activities/${id}/student-preview`); }}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--primary)', fontSize: 13, textDecoration: 'underline',
                  }}
                >
                  Open full phone preview →
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>);

};

export default ActivityManager;
