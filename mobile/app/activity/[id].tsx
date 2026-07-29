// app/activity/[id].tsx
// Full activity engagement flow: Brief → Orient → Inquiry → Reflect
// Single screen, phase managed via state (slide transitions per spec)

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator,
  TouchableOpacity, TextInput, Alert, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { useTheme } from '@/src/theme/ThemeContext';
import { fetchActivity, Activity } from '@/src/api/activities';
import { fetchQuestion, ObservationQuestion } from '@/src/api/questions';
import PeriSpeech from '@/src/components/PeriSpeech';
import SpeakerButton from '@/src/components/SpeakerButton';
import PeriChatSheet from '@/src/components/PeriChatSheet';
import CaptureSheet from '@/src/components/CaptureSheet';
import CapturePreviewModal from '@/src/components/CapturePreviewModal';
import { Capture } from '@/src/api/captures';
import Btn from '@/src/components/Btn';
import { useGeofence } from '@/src/hooks/useGeofence';
import { logSessionEvent } from '@/src/api/sessionEvents';
import { flushQueue } from '@/src/db/offlineQueue';
import {
  createNotebookEntry, updateNotebookEntry, submitNotebookEntry,
  linkCaptureToNotebook, fetchNotebookEntryForActivity,
} from '@/src/api/journal';
import { useTranslation } from 'react-i18next';

type Phase = 'brief' | 'orient' | 'inquiry' | 'reflect';

const PHASE_LABELS: Record<Phase, string> = {
  brief: 'Brief', orient: 'Orient', inquiry: 'Inquire', reflect: 'Reflect',
};
const PHASES: Phase[] = ['orient', 'inquiry', 'reflect'];

export default function ActivityScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { theme, setLocationSkin } = useTheme();
  const { t } = useTranslation();

  const [activity, setActivity] = useState<Activity | null>(null);
  const [phase, setPhase] = useState<Phase>('brief');
  const [loading, setLoading] = useState(true);
  const [question, setQuestion] = useState<ObservationQuestion | null>(null);
  const [reflection, setReflection] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [notebookEntryId, setNotebookEntryId] = useState<string | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [showChat, setShowChat] = useState(false);
  const [showCapture, setShowCapture] = useState(false);
  const [captureMode, setCaptureMode] = useState<'photo' | 'audio' | 'note' | 'video' | null>(null);
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [previewCapture, setPreviewCapture] = useState<Capture | null>(null);
  const [geofenceToast, setGeofenceToast] = useState(false);

  // M-13: Geofence guard — non-blocking toast when student leaves activity radius
  const { isInside, distanceMeters } = useGeofence({
    centerLat: activity?.location_latitude,
    centerLon: activity?.location_longitude,
    radiusMeters: activity?.location_radius_meters ?? 200,
    enabled: phase === 'inquiry' && !!activity?.location_latitude,
    onExit: () => { setGeofenceToast(true); if (sessionId) logSessionEvent(sessionId, 'geofence_exit', 'inquiry'); },
  });

  useEffect(() => {
    if (!id) return;
    fetchActivity(id)
      .then(async (a) => {
        setActivity(a);
        // M-4: apply city skin if location name suggests urban setting
        const loc = (a.location_name ?? '').toLowerCase();
        const cityTerms = ['city', 'urban', 'downtown', 'street', 'plaza', 'park'];
        if (cityTerms.some((t) => loc.includes(t))) {
          setLocationSkin('city');
        }
        // Resume an existing draft/submission for this activity, if any —
        // this is what makes "Save for later" actually resumable.
        const existing = await fetchNotebookEntryForActivity(a.id);
        if (existing) {
          setNotebookEntryId(existing.id);
          if (existing.learning_insights) setReflection(existing.learning_insights);
          setSubmitted(existing.is_submitted);
        }
      })
      .catch(() => Alert.alert(t('common.error', 'Error'), t('activity.loadError', 'Could not load activity')))
      .finally(() => setLoading(false));
  }, [id]);

  // Load a contextual question when entering Inquiry phase
  useEffect(() => {
    if (phase !== 'inquiry' || !activity) return;
    fetchQuestion({ subject: activity.subject }).then(setQuestion).catch(() => {});
  }, [phase, activity]);

  const advancePhase = useCallback(() => {
    if (phase === 'brief') {
      setPhase('orient');
      if (sessionId) logSessionEvent(sessionId, 'phase_started', 'orient');
      return;
    }
    if (phase === 'orient') {
      setPhase('inquiry');
      if (sessionId) {
        logSessionEvent(sessionId, 'phase_completed', 'orient');
        logSessionEvent(sessionId, 'phase_started', 'inquiry');
      }
      return;
    }
    if (phase === 'inquiry') {
      setPhase('reflect');
      if (sessionId) {
        logSessionEvent(sessionId, 'phase_completed', 'inquiry', { capture_count: captures.length });
        logSessionEvent(sessionId, 'phase_started', 'reflect');
      }
      return;
    }
  }, [phase, sessionId, captures.length]);

  // Create-or-update the backing notebook entry with the current reflection
  // text. Shared by both Save and Submit — Submit just does this and then
  // also flips is_submitted.
  const persistReflection = useCallback(async (): Promise<string> => {
    const input = { activity_id: activity!.id, learning_insights: reflection.trim() };
    if (notebookEntryId) {
      await updateNotebookEntry(notebookEntryId, input);
      return notebookEntryId;
    }
    const created = await createNotebookEntry(input);
    setNotebookEntryId(created.id);
    return created.id;
  }, [activity, reflection, notebookEntryId]);

  // Captures always save to the device first (see CaptureSheet.tsx) and
  // normally drain via the connectivity-triggered background poll — but
  // Save/Submit is the other guaranteed sync point ("save to device until
  // the activity is turned in, or a connection shows up"), so force one
  // real attempt here rather than leaving it purely to the 15s poll timing.
  // Still best-effort: captures already exist as their own local records
  // regardless of linking, so a still-unsynced capture (e.g. no signal at
  // all right now) shouldn't block Save/Submit — it'll link on a later
  // Save/Submit or whenever the background poll catches up.
  const linkPendingCaptures = useCallback(async (entryId: string) => {
    await flushQueue().catch(() => {});
    await Promise.allSettled(captures.map((c) => linkCaptureToNotebook(entryId, c.id)));
  }, [captures]);

  const handleSaveDraft = useCallback(async () => {
    if (!reflection.trim()) {
      Alert.alert(t('activity.reflect.emptyTitle', 'One more thing'), t('activity.reflect.emptySaveBody', 'Write a quick reflection before saving.'));
      return;
    }
    setSavingDraft(true);
    try {
      const entryId = await persistReflection();
      await linkPendingCaptures(entryId);
      if (sessionId) logSessionEvent(sessionId, 'reflection_saved', 'reflect');
      Alert.alert(
        t('activity.reflect.savedTitle', 'Saved'),
        t('activity.reflect.savedBody', 'Your progress is saved — come back anytime to add more before submitting.'),
        [{ text: t('common.ok', 'OK'), onPress: () => router.back() }]
      );
    } catch (e) {
      Alert.alert(t('common.error', 'Error'), e instanceof Error ? e.message : t('common.tryAgain', 'Try again'));
    } finally {
      setSavingDraft(false);
    }
  }, [reflection, persistReflection, linkPendingCaptures, sessionId]);

  const handleSubmit = useCallback(async () => {
    if (submitted) return;
    if (!reflection.trim()) {
      Alert.alert(t('activity.reflect.emptyTitle', 'One more thing'), t('activity.reflect.emptySubmitBody', 'Write a quick reflection before submitting.'));
      return;
    }
    setSubmitting(true);
    try {
      const entryId = await persistReflection();
      await linkPendingCaptures(entryId);
      await submitNotebookEntry(entryId);
      setSubmitted(true);
      if (sessionId) logSessionEvent(sessionId, 'session_submitted', 'reflect');
      Alert.alert(
        t('activity.reflect.submittedTitle', 'Submitted! 🎉'),
        t('activity.reflect.submittedBody', 'Your field work has been sent to your teacher.'),
        [{ text: t('common.done', 'Done'), onPress: () => router.replace('/(tabs)') }]
      );
    } catch (e) {
      Alert.alert(t('common.error', 'Error'), e instanceof Error ? e.message : t('common.tryAgain', 'Try again'));
    } finally {
      setSubmitting(false);
    }
  }, [submitted, reflection, persistReflection, linkPendingCaptures, sessionId]);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.bg }]}>
        <ActivityIndicator color={theme.accent} size="large" />
      </View>
    );
  }

  if (!activity) {
    return (
      <View style={[styles.center, { backgroundColor: theme.bg }]}>
        <Text style={{ color: theme.textMuted }}>{t('activity.notFound', 'Activity not found.')}</Text>
      </View>
    );
  }

  return (
    <SafeAreaView testID="activity-screen" style={[styles.root, { backgroundColor: theme.bg }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity
          testID="activity-back-btn"
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.backTouchTarget}
          accessibilityRole="button"
          accessibilityLabel={t('common.back', 'Back')}
        >
          <Text style={[styles.backArrow, { color: theme.accent }]}>{'‹'}</Text>
          <Text style={[styles.backBtn, { color: theme.accent }]}>{t('common.back', 'Back')}</Text>
        </TouchableOpacity>
        <PhaseIndicator phase={phase} theme={theme} />
      </View>

      {/* Geofence toast — non-blocking, dismissible */}
      {geofenceToast && (
        <TouchableOpacity
          testID="geofence-toast"
          style={[styles.geofenceToast, { backgroundColor: theme.warnLight, borderColor: theme.warn }]}
          onPress={() => setGeofenceToast(false)}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={t('activity.geofence.dismiss', 'Dismiss location warning')}
        >
          <Text style={[styles.geofenceToastText, { fontFamily: theme.fontBody, color: theme.warn }]}>
            📍 {t('activity.geofence.stepCloser', 'Step closer to {{location}} to keep going.', {
              location: activity?.location_name ?? t('activity.geofence.defaultLocation', 'the activity location'),
            })}
            {distanceMeters != null ? ` ${t('activity.geofence.distanceAway', '(~{{meters}}m away)', { meters: distanceMeters })}` : ''} ✕
          </Text>
        </TouchableOpacity>
      )}

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {phase === 'brief' && <BriefPhase activity={activity} theme={theme} onStart={advancePhase} />}
        {phase === 'orient' && <OrientPhase activity={activity} theme={theme} onReady={advancePhase} />}
        {phase === 'inquiry' && (
          <InquiryPhase
            activity={activity}
            question={question}
            theme={theme}
            onNext={advancePhase}
            onAskPeri={() => setShowChat(true)}
            onCapture={(mode: 'photo' | 'audio' | 'note' | 'video') => {
              setCaptureMode(mode);
              setShowCapture(true);
            }}
            captures={captures}
            onReviewCapture={setPreviewCapture}
          />
        )}
        <PeriChatSheet
          visible={showChat}
          onClose={() => setShowChat(false)}
          theme={theme}
          activityTitle={activity.title}
          activitySubject={activity.subject}
          currentPrompt={question?.question_text}
        />
        <CaptureSheet
          visible={showCapture}
          onClose={() => setShowCapture(false)}
          onCaptured={(c) => setCaptures((prev) => [...prev, c])}
          theme={theme}
          activityId={activity.id}
          initialMode={captureMode}
        />
        <CapturePreviewModal
          visible={!!previewCapture}
          onClose={() => setPreviewCapture(null)}
          capture={previewCapture}
          theme={theme}
        />
        {phase === 'reflect' && (
          <ReflectPhase
            activity={activity}
            reflection={reflection}
            onChangeReflection={setReflection}
            theme={theme}
            onSave={handleSaveDraft}
            onSubmit={handleSubmit}
            saving={savingDraft}
            submitting={submitting}
            submitted={submitted}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Phase indicator ────────────────────────────────────────────────────────
function PhaseIndicator({ phase, theme }: { phase: Phase; theme: any }) {
  return (
    <View style={styles.phaseRow}>
      {PHASES.map((p, i) => {
        const idx = PHASES.indexOf(phase as any);
        const done = idx > i;
        const active = phase === p;
        return (
          <React.Fragment key={p}>
            <View style={[
              styles.phaseDot,
              { backgroundColor: done || active ? theme.accent : theme.border }
            ]} />
            {i < PHASES.length - 1 && (
              <View style={[styles.phaseLine, { backgroundColor: done ? theme.accent : theme.border }]} />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

// ── Brief phase ────────────────────────────────────────────────────────────
function BriefPhase({ activity, theme, onStart }: any) {
  const { t } = useTranslation();
  const subjectEmoji: Record<string, string> = {
    science: '🔬', math: '📐', history: '🏛', art: '🎨', language: '📖', default: '📍',
  };
  const emoji = subjectEmoji[activity.subject?.toLowerCase()] ?? subjectEmoji.default;

  return (
    <View style={{ gap: 20 }}>
      <PeriSpeech
        text={t('activity.brief.periIntro', "Here's what you'll be doing today. Take a moment to read through before heading out.")}
        theme={theme}
        size={36}
      />
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: theme.radius }]}>
        <View style={styles.titleRow}>
          <Text style={[styles.cardEmoji]}>{emoji}</Text>
          <Text style={[styles.activityTitle, { fontFamily: theme.fontHead, color: theme.text, flex: 1 }]}>
            {activity.title}
          </Text>
          <SpeakerButton
            testID="activity-brief-speaker"
            text={[activity.title, activity.description].filter(Boolean).join('. ')}
            theme={theme}
          />
        </View>
        {activity.description && (
          <Text style={[styles.bodyText, { fontFamily: theme.fontBody, color: theme.textMuted }]}>
            {activity.description}
          </Text>
        )}
        {activity.location_name && (
          <Text style={[styles.metaText, { fontFamily: theme.fontMono, color: theme.textFaint }]}>
            📍 {activity.location_name.toUpperCase()}
          </Text>
        )}
        <View style={[styles.divider, { backgroundColor: theme.border }]} />
        <Text style={[styles.label, { fontFamily: theme.fontMono, color: theme.textFaint }]}>{t('activity.brief.detailsLabel', 'DETAILS')}</Text>
        <View style={styles.metaRow}>
          {activity.subject && <Chip label={activity.subject} theme={theme} />}
          {activity.estimated_duration_minutes && <Chip label={`${activity.estimated_duration_minutes} min`} theme={theme} />}
          {activity.bloom_level && <Chip label={activity.bloom_level} theme={theme} />}
        </View>
      </View>
      <Btn label={t('activity.brief.startCta', "I'm ready — let's go")} onPress={onStart} theme={theme} />
    </View>
  );
}

// ── Orient phase ───────────────────────────────────────────────────────────
function OrientPhase({ activity, theme, onReady }: any) {
  const { t } = useTranslation();
  const periText = t('activity.orient.periText', "You've arrived. Take a moment to observe your surroundings before starting.");

  return (
    <View style={{ gap: 20 }}>
      <View style={[styles.phaseHeader, { borderColor: theme.border }]}>
        <Text style={[styles.phaseLabel, { fontFamily: theme.fontMono, color: theme.textFaint }]}>{t('activity.orient.phaseLabel', 'PHASE 1 · ORIENT')}</Text>
        <Text style={[styles.phaseTitle, { fontFamily: theme.fontHead, color: theme.text }]}>{t('activity.orient.title', 'Arrive & Observe')}</Text>
      </View>
      <PeriSpeech text={periText} theme={theme} size={36} />
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: theme.radius }]}>
        <View style={styles.titleRow}>
          <Text style={[styles.label, { fontFamily: theme.fontMono, color: theme.textFaint, flex: 1 }]}>{t('activity.orient.targetsLabel', "TODAY'S TARGETS")}</Text>
          <SpeakerButton
            testID="activity-targets-speaker"
            text={(activity.learning_objectives ?? [t('activity.orient.defaultTarget', 'Look around and note what you see')]).join('. ')}
            theme={theme}
            size={22}
          />
        </View>
        {(activity.learning_objectives ?? [t('activity.orient.defaultTarget', 'Look around and note what you see')]).map((obj: string, i: number) => (
          <View key={i} style={styles.targetRow}>
            <Text style={[styles.targetDot, { color: theme.accent }]}>●</Text>
            <Text style={[styles.bodyText, { fontFamily: theme.fontBody, color: theme.text, flex: 1 }]}>{obj}</Text>
          </View>
        ))}
      </View>
      <Btn label={t('activity.orient.readyCta', "I'm oriented — begin inquiry")} onPress={onReady} theme={theme} />
    </View>
  );
}

// ── Inquiry phase ──────────────────────────────────────────────────────────
const CAPTURE_TYPE_EMOJI: Record<string, string> = { photo: '📷', audio: '🎤', video: '🎥', text: '✏️', note: '✏️' };

function InquiryPhase({ activity, question, theme, onNext, onAskPeri, onCapture, captures, onReviewCapture }: any) {
  const { t } = useTranslation();
  const periText = question?.question_text
    ?? t('activity.inquiry.defaultQuestion', 'Look closely. What evidence can you find? Capture what you observe.');

  return (
    <View style={{ gap: 20 }}>
      <View style={[styles.phaseHeader, { borderColor: theme.border }]}>
        <Text style={[styles.phaseLabel, { fontFamily: theme.fontMono, color: theme.textFaint }]}>{t('activity.inquiry.phaseLabel', 'PHASE 2 · INQUIRY')}</Text>
        <Text style={[styles.phaseTitle, { fontFamily: theme.fontHead, color: theme.text }]}>{t('activity.inquiry.title', 'Observe & Capture')}</Text>
      </View>
      <PeriSpeech text={periText} theme={theme} size={36} />

      {question?.follow_up && (
        <View style={[styles.followUpCard, { backgroundColor: theme.accentMuted, borderRadius: theme.radiusSm }]}>
          <View style={styles.titleRow}>
            <Text style={[styles.label, { fontFamily: theme.fontMono, color: theme.accent, flex: 1 }]}>{t('activity.inquiry.followUpLabel', 'FOLLOW-UP')}</Text>
            <SpeakerButton testID="activity-followup-speaker" text={question.follow_up} theme={theme} size={22} />
          </View>
          <Text style={[styles.bodyText, { fontFamily: theme.fontBody, color: theme.text }]}>
            {question.follow_up}
          </Text>
        </View>
      )}

      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: theme.radius }]}>
        <Text style={[styles.label, { fontFamily: theme.fontMono, color: theme.textFaint }]}>{t('activity.inquiry.captureLabel', 'CAPTURE EVIDENCE')}</Text>
        <Text style={[styles.bodyText, { fontFamily: theme.fontBody, color: theme.textMuted }]}>
          {t('activity.inquiry.captureHint', 'Use your camera, voice, or notes to record what you find.')}
        </Text>
        <View style={styles.captureRow}>
          {[
            { icon: '📷', id: 'photo', testID: 'capture-btn-photo', label: t('activity.capture.photo', 'Add photo') },
            { icon: '🎤', id: 'audio', testID: 'capture-btn-audio', label: t('activity.capture.audio', 'Add voice recording') },
            { icon: '✏️', id: 'note',  testID: 'capture-btn-note',  label: t('activity.capture.note', 'Add note')  },
            { icon: '🎥', id: 'video', testID: 'capture-btn-video', label: t('activity.capture.video', 'Add video') },
          ].map(({ icon, id, testID, label }) => (
            <TouchableOpacity
              key={id}
              testID={testID}
              style={[styles.captureBtn, { borderColor: theme.border, borderRadius: theme.radiusSm, backgroundColor: theme.surfaceAlt }]}
              onPress={() => onCapture(id)}
              accessibilityRole="button"
              accessibilityLabel={label}
            >
              <Text style={styles.captureIcon}>{icon}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {captures.length > 0 && (
          <>
            <Text style={[styles.label, { fontFamily: theme.fontMono, color: theme.textFaint, marginTop: 14 }]}>
              {t('activity.inquiry.evidenceCollectedLabel', 'COLLECTED ({{count}})').replace('{{count}}', String(captures.length))}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.evidenceStrip}>
              {captures.map((c: Capture) => (
                <TouchableOpacity
                  key={c.id}
                  testID={`evidence-chip-${c.id}`}
                  onPress={() => onReviewCapture(c)}
                  style={[styles.evidenceChip, { borderColor: theme.border, backgroundColor: theme.surfaceAlt, borderRadius: theme.radiusSm }]}
                  accessibilityRole="button"
                  accessibilityLabel={t('activity.inquiry.reviewEvidence', 'Review this evidence')}
                >
                  <Text style={styles.evidenceEmoji}>{CAPTURE_TYPE_EMOJI[c.capture_type] ?? '📎'}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        )}
      </View>
      <TouchableOpacity
        testID="ask-peri-btn"
        onPress={onAskPeri}
        style={[styles.askPeriBtn, { borderColor: theme.accent, borderRadius: theme.radiusSm }]}
        accessibilityRole="button"
        accessibilityLabel={t('activity.inquiry.askPeri', 'Ask Peri')}
      >
        <Text style={[styles.askPeriLabel, { fontFamily: theme.fontBody, color: theme.accent }]}>
          💬 {t('activity.inquiry.askPeri', 'Ask Peri')}
        </Text>
      </TouchableOpacity>
      <Btn label={t('activity.inquiry.doneCta', 'Done capturing — reflect')} onPress={onNext} theme={theme} />
    </View>
  );
}

// ── Reflect phase ──────────────────────────────────────────────────────────
function ReflectPhase({ activity, reflection, onChangeReflection, theme, onSave, onSubmit, saving, submitting, submitted }: any) {
  const { t } = useTranslation();
  const prompt = t('activity.reflect.prompt', "What did this place teach you that a textbook couldn't?");
  const busy = saving || submitting;

  return (
    <View style={{ gap: 20 }}>
      <View style={[styles.phaseHeader, { borderColor: theme.border }]}>
        <Text style={[styles.phaseLabel, { fontFamily: theme.fontMono, color: theme.textFaint }]}>{t('activity.reflect.phaseLabel', 'PHASE 3 · REFLECT')}</Text>
        <Text style={[styles.phaseTitle, { fontFamily: theme.fontHead, color: theme.text }]}>{t('activity.reflect.title', 'Make Meaning')}</Text>
      </View>
      <PeriSpeech
        text={t('activity.reflect.periSpeech', "Almost done. Write one thing you'll remember from today.")}
        theme={theme}
        size={36}
      />
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: theme.radius }]}>
        <View style={styles.titleRow}>
          <Text style={[styles.label, { fontFamily: theme.fontMono, color: theme.textFaint, flex: 1 }]}>{t('activity.reflect.yourReflectionLabel', 'YOUR REFLECTION')}</Text>
          <SpeakerButton testID="activity-reflect-prompt-speaker" text={prompt} theme={theme} size={22} />
        </View>
        <Text style={[styles.bodyText, { fontFamily: theme.fontBody, color: theme.textMuted, marginBottom: 8 }]}>
          {prompt}
        </Text>
        <TextInput
          testID="reflection-input"
          style={[styles.reflectionInput, {
            backgroundColor: theme.surfaceAlt,
            borderColor: theme.border,
            color: theme.text,
            fontFamily: theme.fontBody,
            borderRadius: theme.radiusSm,
          }]}
          value={reflection}
          onChangeText={onChangeReflection}
          placeholder={t('activity.reflect.placeholder', 'Write your reflection here…')}
          placeholderTextColor={theme.textFaint}
          multiline
          numberOfLines={5}
          textAlignVertical="top"
          editable={!submitted}
        />
      </View>
      {submitted ? (
        <Btn
          label={t('activity.reflect.submitted', 'Submitted ✓')}
          onPress={() => {}}
          theme={theme}
          disabled
        />
      ) : (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Btn
            testID="reflect-save-btn"
            label={t('activity.reflect.saveCta', 'Save for later')}
            onPress={onSave}
            theme={theme}
            variant="secondary"
            loading={saving}
            disabled={busy}
            style={{ flex: 1 }}
          />
          <Btn
            testID="reflect-submit-btn"
            label={t('activity.reflect.submitCta', 'Submit field work')}
            onPress={onSubmit}
            theme={theme}
            loading={submitting}
            disabled={busy}
            style={{ flex: 1 }}
          />
        </View>
      )}
      <Text style={[styles.submitHint, { fontFamily: theme.fontBody, color: theme.textFaint }]}>
        {t('activity.reflect.hint', 'Save keeps this activity open so you can add more later. Submit sends it to your teacher and closes it out.')}
      </Text>
    </View>
  );
}

// ── Small helpers ──────────────────────────────────────────────────────────
function Chip({ label, theme }: { label: string; theme: any }) {
  return (
    <View style={[styles.chip, { backgroundColor: theme.accentMuted, borderRadius: theme.radiusFull }]}>
      <Text style={[styles.chipText, { fontFamily: theme.fontMono, color: theme.accent }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root:            { flex: 1 },
  center:          { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  backTouchTarget: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 4, paddingVertical: 4 },
  backArrow:       { fontSize: 16 },
  backBtn:         { fontSize: 16 },
  phaseRow:        { flexDirection: 'row', alignItems: 'center', gap: 4 },
  phaseDot:        { width: 10, height: 10, borderRadius: 5 },
  phaseLine:       { width: 20, height: 2 },
  content:         { padding: 16, gap: 0, paddingBottom: 40 },
  phaseHeader:     { paddingBottom: 12, borderBottomWidth: 1, marginBottom: 4 },
  phaseLabel:      { fontSize: 9, letterSpacing: 1.4, textTransform: 'uppercase' },
  phaseTitle:      { fontSize: 22, fontWeight: '700', marginTop: 2 },
  card:            { padding: 16, borderWidth: 1, gap: 10 },
  titleRow:        { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardEmoji:       { fontSize: 32 },
  activityTitle:   { fontSize: 20, fontWeight: '700', lineHeight: 26 },
  bodyText:        { fontSize: 14, lineHeight: 22 },
  metaText:        { fontSize: 9, letterSpacing: 1 },
  label:           { fontSize: 9, letterSpacing: 1.4, textTransform: 'uppercase' },
  metaRow:         { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip:            { paddingHorizontal: 10, paddingVertical: 4 },
  chipText:        { fontSize: 11 },
  divider:         { height: 1, marginVertical: 4 },
  targetRow:       { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  targetDot:       { fontSize: 8, marginTop: 7 },
  followUpCard:    { padding: 12, gap: 4 },
  captureRow:      { flexDirection: 'row', gap: 10, justifyContent: 'center', paddingTop: 4 },
  captureBtn:      { width: 56, height: 56, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  captureIcon:     { fontSize: 24 },
  evidenceStrip:   { flexDirection: 'row', gap: 8, paddingTop: 8 },
  evidenceChip:    { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  evidenceEmoji:   { fontSize: 20 },
  reflectionInput:  { minHeight: 120, padding: 12, borderWidth: 1, fontSize: 15, lineHeight: 22 },
  geofenceToast:    { margin: 12, padding: 12, borderWidth: 1, borderRadius: 8 },
  geofenceToastText:{ fontSize: 13, lineHeight: 18 },
  captureMainBtn:  { padding: 14, alignItems: 'center' },
  captureMainLabel:{ fontSize: 15, fontWeight: '600' },
  askPeriBtn:      { borderWidth: 1, padding: 12, alignItems: 'center' },
  askPeriLabel:    { fontSize: 14, fontWeight: '600' },
  submitHint:      { fontSize: 12, lineHeight: 18, textAlign: 'center' },
});
