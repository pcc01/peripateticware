// app/teacher-create-scavenger-hunt.tsx — TEACHER/HOMESCHOOL authoring a
// "discovery" activity (backend's own term for a reverse scavenger hunt —
// see backend/models/database.py's "DISCOVERY / SCAVENGER HUNT (Phase 3)"
// section) from wherever they're standing, instead of needing to remember
// the exact spot later at a desk.
//
// General activity creation deliberately stays web-only (web's builder is
// a full multi-step AI-assisted flow — grade bands, standards alignment,
// rubrics, Wikidata place enrichment). This screen is intentionally the
// one narrow exception: only activity_type='discovery', only the fields
// that matter for a place-based challenge authored on the spot, GPS
// capture front and center. Everything else about the activity (editing,
// standards, sharing) still goes through the web app afterward.
//
// See src/api/discoveryActivities.ts for why the discovery_* fields
// needed a backend schema/route change to even be persistable — they
// existed on the Activity model since Phase 3 but nothing had ever wired
// them through create_activity() before this.

import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Location from 'expo-location';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/src/theme/ThemeContext';
import { createDiscoveryActivity, publishActivity, DiscoveryMode } from '@/src/api/discoveryActivities';

const SUBJECTS = ['General', 'Science', 'Math', 'History', 'Art', 'Language', 'Biology'];
const GRADES = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const DURATIONS = [15, 30, 45, 60, 90];
const BLOOM_LABELS = ['Remember', 'Understand', 'Apply', 'Analyze', 'Evaluate', 'Create'];
const DIFFICULTIES = [1, 2, 3, 4];
const TIME_LIMITS = [null, 15, 30, 60];

interface Coords { latitude: number; longitude: number }
interface Stop extends Coords { name: string }

export default function CreateScavengerHuntScreen() {
  const { theme } = useTheme();
  const { t } = useTranslation();

  const [title, setTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [locationName, setLocationName] = useState('');
  const [coords, setCoords] = useState<Coords | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  // Multi-step hunt: capture a few stops on the spot, same as the single
  // location above. 2+ stops => a wayfinding hunt (map + bearing arrow on the
  // student side); 0 stops => a plain single-point discovery hunt, unchanged.
  // Rung B only from here (on-device navigation, no consent prompt) — matches
  // WAYFINDING_CONSENT_LADDER.md's recommended default; C/D/E stay web-only.
  const [multiStep, setMultiStep] = useState(false);
  const [stops, setStops] = useState<Stop[]>([]);
  const [capturingStop, setCapturingStop] = useState(false);

  const [grade, setGrade] = useState(6);
  const [subject, setSubject] = useState('General');
  const [duration, setDuration] = useState(45);
  const [bloomLevel, setBloomLevel] = useState(2); // "Apply" — default fits a find/do/observe task well
  const [discoveryMode, setDiscoveryMode] = useState<DiscoveryMode>('location_based');
  const [difficulty, setDifficulty] = useState(2);
  const [timeLimit, setTimeLimit] = useState<number | null>(30);
  const [successCriteria, setSuccessCriteria] = useState('');
  const [learningObjective, setLearningObjective] = useState('');

  const [saving, setSaving] = useState(false);

  // expo-location's getCurrentPositionAsync has no built-in timeout -- on a
  // weak/slow GPS fix (indoors, poor sky view) it can hang indefinitely
  // with the button just stuck on "locating" and zero feedback, which reads
  // as "the location was never found" rather than "still trying." Race it
  // against a manual timeout so a bad fix fails visibly instead of hanging
  // forever.
  const LOCATION_TIMEOUT_MS = 15000;

  const captureLocation = async () => {
    setLocating(true);
    setLocationError(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationError(t('createScavengerHunt.locationDenied', 'Location permission is needed to capture where this challenge is.'));
        return;
      }
      const pos = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('LOCATION_TIMEOUT')), LOCATION_TIMEOUT_MS)
        ),
      ]);
      setCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
    } catch (err) {
      setLocationError(
        err instanceof Error && err.message === 'LOCATION_TIMEOUT'
          ? t('createScavengerHunt.locationTimeout', "Couldn't get a GPS fix within 15 seconds — try moving somewhere with a clearer view of the sky, then try again.")
          : t('createScavengerHunt.locationError', "Couldn't get your location. Try again.")
      );
    } finally {
      setLocating(false);
    }
  };

  const captureStop = async () => {
    setCapturingStop(true);
    setLocationError(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationError(t('createScavengerHunt.locationDenied', 'Location permission is needed to capture where this challenge is.'));
        return;
      }
      const pos = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('LOCATION_TIMEOUT')), LOCATION_TIMEOUT_MS)
        ),
      ]);
      setStops((prev) => [
        ...prev,
        {
          name: t('createScavengerHunt.stopNameDefault', 'Stop {{n}}', { n: prev.length + 1 }),
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        },
      ]);
    } catch (err) {
      setLocationError(
        err instanceof Error && err.message === 'LOCATION_TIMEOUT'
          ? t('createScavengerHunt.locationTimeout', "Couldn't get a GPS fix within 15 seconds — try moving somewhere with a clearer view of the sky, then try again.")
          : t('createScavengerHunt.locationError', "Couldn't get your location. Try again.")
      );
    } finally {
      setCapturingStop(false);
    }
  };

  const wayfinding = discoveryMode === 'location_based' && multiStep && stops.length >= 2;

  const valid =
    title.trim().length >= 3 &&
    taskDescription.trim().length >= 10 &&
    locationName.trim().length > 0 &&
    learningObjective.trim().length > 0 &&
    (discoveryMode === 'task_based'
      ? true
      : multiStep
        ? stops.length >= 2
        : coords !== null);

  const handleCreate = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      const { id } = await createDiscoveryActivity({
        title: title.trim(),
        description: taskDescription.trim(),
        // task_based challenges don't require a specific spot — fall back
        // to (0,0) with radius 0 rather than blocking on GPS the student
        // won't need anyway. A multi-step hunt uses the first stop as the
        // activity's base location; single-point uses `coords`.
        location_latitude: (wayfinding ? stops[0].latitude : coords?.latitude) ?? 0,
        location_longitude: (wayfinding ? stops[0].longitude : coords?.longitude) ?? 0,
        location_name: locationName.trim(),
        location_radius_meters: 100,
        grade_level: grade,
        subject,
        estimated_duration_minutes: duration,
        learning_objectives: [learningObjective.trim()],
        bloom_level: bloomLevel + 1, // BLOOM_LABELS is 0-indexed, backend is 1-6
        discovery_mode: discoveryMode,
        discovery_task_description: taskDescription.trim(),
        discovery_difficulty_level: difficulty,
        discovery_time_limit_minutes: timeLimit ?? undefined,
        discovery_success_criteria: successCriteria.trim() || undefined,
        discovery_location_required: discoveryMode === 'location_based',
        // Multi-step => a rung-B wayfinding hunt. Backend clamps the ceiling
        // and stores the waypoints (see ActivityCreate.waypoints).
        ...(wayfinding
          ? {
              discovery_wayfinding_enabled: true,
              wayfinding_mode: 'ordered' as const,
              wayfinding_capability_ceiling: 'B' as const,
              waypoints: stops.map((s, i) => ({
                sequence_index: i,
                name: s.name,
                latitude: s.latitude,
                longitude: s.longitude,
                arrival_radius_meters: 30,
                required: true,
              })),
            }
          : {}),
      });
      await publishActivity(id);
      Alert.alert(
        t('createScavengerHunt.successTitle', 'Published!'),
        t('createScavengerHunt.successBody', 'Students can attempt this challenge now.'),
        [{ text: t('common.done', 'Done'), onPress: () => router.back() }]
      );
    } catch (e) {
      Alert.alert(
        t('common.error', 'Something went wrong'),
        e instanceof Error ? e.message : t('createScavengerHunt.saveError', 'Could not create this activity.')
      );
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = [styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.surfaceAlt, fontFamily: theme.fontBody, borderRadius: theme.radiusSm }];
  const labelStyle = [styles.label, { fontFamily: theme.fontMono, color: theme.textFaint }];

  function ChipRow<T extends string | number | boolean | null>({ options, value, onChange, render }: { options: T[]; value: T; onChange: (v: T) => void; render: (v: T) => string }) {
    return (
      <View style={styles.chipRow}>
        {options.map((opt) => (
          <TouchableOpacity
            key={String(opt)}
            testID={`scavenger-hunt-chip-${render(opt)}`}
            onPress={() => onChange(opt)}
            style={[
              styles.chip,
              { borderColor: value === opt ? theme.accent : theme.border, backgroundColor: value === opt ? theme.accentMuted : theme.surfaceAlt, borderRadius: theme.radiusFull },
            ]}
          >
            <Text style={{ fontFamily: theme.fontBody, fontSize: 13, fontWeight: '600', color: value === opt ? theme.accent : theme.textMuted }}>{render(opt)}</Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  }

  return (
    <SafeAreaView testID="create-scavenger-hunt-screen" style={[styles.root, { backgroundColor: theme.bg }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity
          testID="create-scavenger-hunt-back-btn"
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.backTouchTarget}
          accessibilityRole="button"
          accessibilityLabel={t('common.back', 'Back')}
        >
          <Text style={[styles.backArrow, { color: theme.accent }]}>{'‹'}</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { fontFamily: theme.fontHead, color: theme.text }]} numberOfLines={1}>
          {t('createScavengerHunt.title', 'New Scavenger Hunt')}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Text style={labelStyle}>{t('createScavengerHunt.titleLabel', 'CHALLENGE TITLE')}</Text>
          <TextInput
            testID="scavenger-hunt-title"
            style={inputStyle}
            value={title}
            onChangeText={setTitle}
            placeholder={t('createScavengerHunt.titlePlaceholder', 'e.g. The Oak Tree Mystery')}
            placeholderTextColor={theme.textFaint}
          />

          <Text style={labelStyle}>{t('createScavengerHunt.taskLabel', 'WHAT SHOULD STUDENTS DO?')}</Text>
          <TextInput
            testID="scavenger-hunt-task"
            style={[inputStyle, styles.multiline]}
            value={taskDescription}
            onChangeText={setTaskDescription}
            placeholder={t('createScavengerHunt.taskPlaceholder', 'Describe what to find, do, or observe…')}
            placeholderTextColor={theme.textFaint}
            multiline
          />

          <Text style={labelStyle}>{t('createScavengerHunt.modeLabel', 'HUNT TYPE')}</Text>
          <ChipRow
            options={['location_based', 'task_based'] as DiscoveryMode[]}
            value={discoveryMode}
            onChange={setDiscoveryMode}
            render={(v) => (v === 'location_based' ? t('createScavengerHunt.modeLocation', 'This exact spot') : t('createScavengerHunt.modeTask', 'Anywhere they can find it'))}
          />

          <Text style={labelStyle}>{t('createScavengerHunt.locationNameLabel', 'LOCATION NAME')}</Text>
          <TextInput
            testID="scavenger-hunt-location-name"
            style={inputStyle}
            value={locationName}
            onChangeText={setLocationName}
            placeholder={t('createScavengerHunt.locationNamePlaceholder', 'e.g. Riverside Park, north entrance')}
            placeholderTextColor={theme.textFaint}
          />

          {discoveryMode === 'location_based' && (
            <>
              <Text style={labelStyle}>{t('createScavengerHunt.stepsLabel', 'HOW MANY STOPS?')}</Text>
              <ChipRow
                options={[false, true]}
                value={multiStep}
                onChange={setMultiStep}
                render={(v) => (v ? t('createScavengerHunt.multiStep', 'Multi-step route') : t('createScavengerHunt.oneSpot', 'One spot'))}
              />

              {!multiStep && (
                <TouchableOpacity
                  testID="scavenger-hunt-capture-location"
                  onPress={captureLocation}
                  disabled={locating}
                  style={[styles.locateBtn, { borderColor: coords ? theme.accent : theme.border, backgroundColor: coords ? theme.accentMuted : theme.surfaceAlt, borderRadius: theme.radiusSm }]}
                >
                  {locating ? (
                    <ActivityIndicator color={theme.accent} />
                  ) : (
                    <Text style={{ fontFamily: theme.fontBody, fontWeight: '600', color: coords ? theme.accent : theme.text }}>
                      {coords
                        ? t('createScavengerHunt.locationCaptured', '📍 Location captured ({{lat}}, {{lng}})', { lat: coords.latitude.toFixed(5), lng: coords.longitude.toFixed(5) })
                        : t('createScavengerHunt.captureLocation', '📍 Use my current location')}
                    </Text>
                  )}
                </TouchableOpacity>
              )}

              {multiStep && (
                <>
                  {stops.map((s, i) => (
                    <View key={i} style={styles.stopRow}>
                      <Text style={{ flex: 1, fontFamily: theme.fontBody, color: theme.text }}>
                        {i + 1}. {s.name}  ({s.latitude.toFixed(5)}, {s.longitude.toFixed(5)})
                      </Text>
                      <TouchableOpacity
                        testID={`scavenger-hunt-remove-stop-${i}`}
                        onPress={() => setStops((prev) => prev.filter((_, k) => k !== i))}
                        hitSlop={10}
                      >
                        <Text style={{ color: '#dc2626', fontSize: 16, fontWeight: '700' }}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                  <TouchableOpacity
                    testID="scavenger-hunt-capture-stop"
                    onPress={captureStop}
                    disabled={capturingStop}
                    style={[styles.locateBtn, { borderColor: theme.border, backgroundColor: theme.surfaceAlt, borderRadius: theme.radiusSm }]}
                  >
                    {capturingStop ? (
                      <ActivityIndicator color={theme.accent} />
                    ) : (
                      <Text style={{ fontFamily: theme.fontBody, fontWeight: '600', color: theme.text }}>
                        {t('createScavengerHunt.captureStop', '📍 Capture a stop here')}
                      </Text>
                    )}
                  </TouchableOpacity>
                  <Text style={[styles.metaHint, { fontFamily: theme.fontBody, color: theme.textFaint }]}>
                    {t('createScavengerHunt.stopsHint', 'Walk to each stop and capture it. Students get a map with a bearing arrow — nothing about their location leaves their phone.')}
                  </Text>
                </>
              )}
              {!!locationError && <Text style={styles.errorText}>{locationError}</Text>}
            </>
          )}

          <Text style={labelStyle}>{t('createScavengerHunt.gradeLabel', 'GRADE LEVEL')}</Text>
          <ChipRow options={GRADES} value={grade} onChange={setGrade} render={(v) => String(v)} />

          <Text style={labelStyle}>{t('createScavengerHunt.subjectLabel', 'SUBJECT')}</Text>
          <ChipRow options={SUBJECTS} value={subject} onChange={setSubject} render={(v) => v} />

          <Text style={labelStyle}>{t('createScavengerHunt.durationLabel', 'ESTIMATED TIME (MINUTES)')}</Text>
          <ChipRow options={DURATIONS} value={duration} onChange={setDuration} render={(v) => String(v)} />

          <Text style={labelStyle}>{t('createScavengerHunt.difficultyLabel', 'DIFFICULTY (1-4)')}</Text>
          <ChipRow options={DIFFICULTIES} value={difficulty} onChange={setDifficulty} render={(v) => String(v)} />

          <Text style={labelStyle}>{t('createScavengerHunt.timeLimitLabel', 'TIME LIMIT ONCE STARTED (OPTIONAL)')}</Text>
          <ChipRow
            options={TIME_LIMITS}
            value={timeLimit}
            onChange={setTimeLimit}
            render={(v) => (v === null ? t('createScavengerHunt.noLimit', 'No limit') : t('createScavengerHunt.minutesShort', '{{n}}m', { n: v }))}
          />

          <Text style={labelStyle}>{t('createScavengerHunt.bloomLabel', 'LEARNING LEVEL')}</Text>
          <ChipRow options={[0, 1, 2, 3, 4, 5]} value={bloomLevel} onChange={setBloomLevel} render={(v) => BLOOM_LABELS[v]} />

          <Text style={labelStyle}>{t('createScavengerHunt.objectiveLabel', 'WHAT SHOULD THEY LEARN?')}</Text>
          <TextInput
            testID="scavenger-hunt-objective"
            style={inputStyle}
            value={learningObjective}
            onChangeText={setLearningObjective}
            placeholder={t('createScavengerHunt.objectivePlaceholder', 'e.g. Identify native tree species by leaf shape')}
            placeholderTextColor={theme.textFaint}
          />

          <Text style={labelStyle}>{t('createScavengerHunt.successLabel', 'HOW DO YOU KNOW THEY SUCCEEDED? (OPTIONAL)')}</Text>
          <TextInput
            testID="scavenger-hunt-success-criteria"
            style={[inputStyle, styles.multiline]}
            value={successCriteria}
            onChangeText={setSuccessCriteria}
            placeholder={t('createScavengerHunt.successPlaceholder', 'e.g. A clear photo of the item plus one sentence explaining why it fits')}
            placeholderTextColor={theme.textFaint}
            multiline
          />
        </ScrollView>

        <View style={[styles.footer, { borderTopColor: theme.border, backgroundColor: theme.surface }]}>
          <TouchableOpacity
            testID="scavenger-hunt-publish"
            onPress={handleCreate}
            disabled={!valid || saving}
            style={[styles.publishBtn, { backgroundColor: theme.accent, opacity: !valid || saving ? 0.5 : 1 }]}
          >
            {saving ? <ActivityIndicator color="#fff" /> : (
              <Text style={styles.publishBtnText}>{t('createScavengerHunt.publish', 'Publish challenge')}</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:            { flex: 1 },
  header:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  backTouchTarget: { width: 40, alignItems: 'flex-start', justifyContent: 'center', paddingVertical: 4, flexShrink: 0 },
  backArrow:       { fontSize: 28 },
  title:           { fontSize: 17, fontWeight: '700', flex: 1, textAlign: 'center' },
  body:            { padding: 16, gap: 8, paddingBottom: 32 },
  label:           { fontSize: 9, letterSpacing: 1.2, textTransform: 'uppercase', marginTop: 14, marginBottom: 2 },
  input:           { minHeight: 44, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, fontSize: 15 },
  multiline:       { minHeight: 80, textAlignVertical: 'top' },
  chipRow:         { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:            { paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1 },
  locateBtn:       { minHeight: 48, borderWidth: 1, alignItems: 'center', justifyContent: 'center', padding: 10, marginTop: 4 },
  errorText:       { color: '#dc2626', fontSize: 12, marginTop: 4 },
  stopRow:         { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  metaHint:        { fontSize: 12, lineHeight: 17, marginTop: 4 },
  footer:          { padding: 16, borderTopWidth: 1 },
  publishBtn:      { minHeight: 48, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  publishBtnText:  { color: '#fff', fontWeight: '700', fontSize: 15 },
});
