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
import PeriChatSheet from '@/src/components/PeriChatSheet';
import CaptureSheet from '@/src/components/CaptureSheet';
import Btn from '@/src/components/Btn';
import { useGeofence } from '@/src/hooks/useGeofence';
import { logSessionEvent } from '@/src/api/sessionEvents';
import { t } from '@/src/i18n/t';

type Phase = 'brief' | 'orient' | 'inquiry' | 'reflect';

const PHASE_LABELS: Record<Phase, string> = {
  brief: 'Brief', orient: 'Orient', inquiry: 'Inquire', reflect: 'Reflect',
};
const PHASES: Phase[] = ['orient', 'inquiry', 'reflect'];

export default function ActivityScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { theme, setLocationSkin } = useTheme();

  const [activity, setActivity] = useState<Activity | null>(null);
  const [phase, setPhase] = useState<Phase>('brief');
  const [loading, setLoading] = useState(true);
  const [question, setQuestion] = useState<ObservationQuestion | null>(null);
  const [reflection, setReflection] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [showChat, setShowChat] = useState(false);
  const [showCapture, setShowCapture] = useState(false);
  const [captures, setCaptures] = useState<any[]>([]);
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
      .then((a) => {
        setActivity(a);
        // M-4: apply city skin if location name suggests urban setting
        const loc = (a.location_name ?? '').toLowerCase();
        const cityTerms = ['city', 'urban', 'downtown', 'street', 'plaza', 'park'];
        if (cityTerms.some((t) => loc.includes(t))) {
          setLocationSkin('city');
        }
      })
      .catch(() => Alert.alert('Error', 'Could not load activity'))
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
    if (phase === 'reflect' && !submitted) {
      if (!reflection.trim()) {
        Alert.alert('One more thing', 'Write a quick reflection before submitting.');
        return;
      }
      setSubmitted(true);
      if (sessionId) logSessionEvent(sessionId, 'session_submitted', 'reflect');
      Alert.alert('Submitted! 🎉', 'Your field work has been saved.', [
        { text: 'Done', onPress: () => router.replace('/(tabs)') },
      ]);
    }
  }, [phase, reflection, submitted, sessionId, captures.length]);

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
        <Text style={{ color: theme.textMuted }}>Activity not found.</Text>
      </View>
    );
  }

  return (
    <SafeAreaView testID="activity-screen" style={[styles.root, { backgroundColor: theme.bg }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('common.back', 'Back')}
        >
          <Text style={[styles.backBtn, { color: theme.accent }]}>‹ {t('common.back', 'Back')}</Text>
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
            📍 Step closer to {activity?.location_name ?? 'the activity location'} to keep going.
            {distanceMeters != null ? ` (~${distanceMeters}m away)` : ''} ✕
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
            onCapture={() => setShowCapture(true)}
            captureCount={captures.length}
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
        />
        {phase === 'reflect' && (
          <ReflectPhase
            activity={activity}
            reflection={reflection}
            onChangeReflection={setReflection}
            theme={theme}
            onSubmit={advancePhase}
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
  const subjectEmoji: Record<string, string> = {
    science: '🔬', math: '📐', history: '🏛', art: '🎨', language: '📖', default: '📍',
  };
  const emoji = subjectEmoji[activity.subject?.toLowerCase()] ?? subjectEmoji.default;

  return (
    <View style={{ gap: 20 }}>
      <PeriSpeech
        text={`Here's what you'll be doing today. Take a moment to read through before heading out.`}
        theme={theme}
        size={36}
      />
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: theme.radius }]}>
        <Text style={[styles.cardEmoji]}>{emoji}</Text>
        <Text style={[styles.activityTitle, { fontFamily: theme.fontHead, color: theme.text }]}>
          {activity.title}
        </Text>
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
        <Text style={[styles.label, { fontFamily: theme.fontMono, color: theme.textFaint }]}>DETAILS</Text>
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
  const periText = "You've arrived. Take a moment to observe your surroundings before starting.";

  return (
    <View style={{ gap: 20 }}>
      <View style={[styles.phaseHeader, { borderColor: theme.border }]}>
        <Text style={[styles.phaseLabel, { fontFamily: theme.fontMono, color: theme.textFaint }]}>PHASE 1 · ORIENT</Text>
        <Text style={[styles.phaseTitle, { fontFamily: theme.fontHead, color: theme.text }]}>Arrive & Observe</Text>
      </View>
      <PeriSpeech text={periText} theme={theme} size={36} />
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: theme.radius }]}>
        <Text style={[styles.label, { fontFamily: theme.fontMono, color: theme.textFaint }]}>TODAY'S TARGETS</Text>
        {(activity.learning_objectives ?? ['Look around and note what you see']).map((obj: string, i: number) => (
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
function InquiryPhase({ activity, question, theme, onNext, onAskPeri, onCapture, captureCount }: any) {
  const periText = question?.question_text
    ?? "Look closely. What evidence can you find? Capture what you observe.";

  return (
    <View style={{ gap: 20 }}>
      <View style={[styles.phaseHeader, { borderColor: theme.border }]}>
        <Text style={[styles.phaseLabel, { fontFamily: theme.fontMono, color: theme.textFaint }]}>PHASE 2 · INQUIRY</Text>
        <Text style={[styles.phaseTitle, { fontFamily: theme.fontHead, color: theme.text }]}>Observe & Capture</Text>
      </View>
      <PeriSpeech text={periText} theme={theme} size={36} />

      {question?.follow_up && (
        <View style={[styles.followUpCard, { backgroundColor: theme.accentMuted, borderRadius: theme.radiusSm }]}>
          <Text style={[styles.label, { fontFamily: theme.fontMono, color: theme.accent }]}>FOLLOW-UP</Text>
          <Text style={[styles.bodyText, { fontFamily: theme.fontBody, color: theme.text }]}>
            {question.follow_up}
          </Text>
        </View>
      )}

      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: theme.radius }]}>
        <Text style={[styles.label, { fontFamily: theme.fontMono, color: theme.textFaint }]}>CAPTURE EVIDENCE</Text>
        <Text style={[styles.bodyText, { fontFamily: theme.fontBody, color: theme.textMuted }]}>
          Use your camera, voice, or notes to record what you find.
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
              onPress={onCapture}
              accessibilityRole="button"
              accessibilityLabel={label}
            >
              <Text style={styles.captureIcon}>{icon}</Text>
            </TouchableOpacity>
          ))}
        </View>
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
function ReflectPhase({ activity, reflection, onChangeReflection, theme, onSubmit, submitted }: any) {
  const prompt = 'What did this place teach you that a textbook couldn\'t?';

  return (
    <View style={{ gap: 20 }}>
      <View style={[styles.phaseHeader, { borderColor: theme.border }]}>
        <Text style={[styles.phaseLabel, { fontFamily: theme.fontMono, color: theme.textFaint }]}>PHASE 3 · REFLECT</Text>
        <Text style={[styles.phaseTitle, { fontFamily: theme.fontHead, color: theme.text }]}>Make Meaning</Text>
      </View>
      <PeriSpeech
        text="Almost done. Write one thing you'll remember from today."
        theme={theme}
        size={36}
      />
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: theme.radius }]}>
        <Text style={[styles.label, { fontFamily: theme.fontMono, color: theme.textFaint }]}>YOUR REFLECTION</Text>
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
          placeholder="Write your reflection here…"
          placeholderTextColor={theme.textFaint}
          multiline
          numberOfLines={5}
          textAlignVertical="top"
          editable={!submitted}
        />
      </View>
      <Btn
        label={submitted ? t('activity.reflect.submitted', 'Submitted ✓') : t('activity.reflect.submitCta', 'Submit field work')}
        onPress={onSubmit}
        theme={theme}
      />
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
  backBtn:         { fontSize: 16 },
  phaseRow:        { flexDirection: 'row', alignItems: 'center', gap: 4 },
  phaseDot:        { width: 10, height: 10, borderRadius: 5 },
  phaseLine:       { width: 20, height: 2 },
  content:         { padding: 16, gap: 0, paddingBottom: 40 },
  phaseHeader:     { paddingBottom: 12, borderBottomWidth: 1, marginBottom: 4 },
  phaseLabel:      { fontSize: 9, letterSpacing: 1.4, textTransform: 'uppercase' },
  phaseTitle:      { fontSize: 22, fontWeight: '700', marginTop: 2 },
  card:            { padding: 16, borderWidth: 1, gap: 10 },
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
  reflectionInput:  { minHeight: 120, padding: 12, borderWidth: 1, fontSize: 15, lineHeight: 22 },
  geofenceToast:    { margin: 12, padding: 12, borderWidth: 1, borderRadius: 8 },
  geofenceToastText:{ fontSize: 13, lineHeight: 18 },
  captureMainBtn:  { padding: 14, alignItems: 'center' },
  captureMainLabel:{ fontSize: 15, fontWeight: '600' },
  askPeriBtn:      { borderWidth: 1, padding: 12, alignItems: 'center' },
  askPeriLabel:    { fontSize: 14, fontWeight: '600' },
});
