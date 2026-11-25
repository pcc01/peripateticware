// app/spontaneous-discovery.tsx
// PERI_SPONTANEOUS_DISCOVERY_SPEC_v1.md -- "I'm somewhere new, ask Peri
// about it." A student standing at an unplanned place gets a real,
// place-grounded Peri question within seconds, no teacher having
// pre-authored an Activity for that exact spot.
//
// Two paths to a place (Design A), so GPS is never the only option:
//   - "Use my location": one-shot GPS read -> /locations/search -> the
//     student confirms which candidate they're actually at (never silently
//     picks the nearest one). Hidden for an under-13/consent-flagged
//     student (Design C) -- canUseLocationGps reuses the same predicate
//     chat's AI-sharing gate already runs server-side.
//   - "Type where you are": always available. Forward-geocodes the typed
//     name, then runs the exact same search -- since the student already
//     named the place, the top match is taken directly rather than asking
//     them to pick again from a list.
//
// Either path ends at one short screen: place name (editable), a subject
// chip, one "Go" button. No grade/duration/objectives form -- every other
// required Activity field is auto-filled server-side.

import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator,
  ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/src/theme/ThemeContext';
import { useAuth } from '@/src/stores/AuthContext';
import { getOneShotLocation } from '@/src/lib/oneShotLocation';
import {
  searchNearbyLocations, geocodeLocationName, enrichLocation, createSpontaneousActivity,
  LocationCandidate, LocationEnrichment,
} from '@/src/api/spontaneousDiscovery';

const SUBJECTS = ['Science', 'Math', 'History', 'Art', 'Language', 'Biology', 'General'];

type Step = 'choose' | 'candidates' | 'confirm';

export default function SpontaneousDiscoveryScreen() {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { user } = useAuth();

  const [step, setStep] = useState<Step>('choose');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typedName, setTypedName] = useState('');

  const [candidates, setCandidates] = useState<LocationCandidate[]>([]);
  const [placeName, setPlaceName] = useState('');
  const [placeId, setPlaceId] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [subject, setSubject] = useState(SUBJECTS[0]);
  const [creating, setCreating] = useState(false);

  const canUseGps = user?.canUseLocationGps !== false;

  async function handleUseMyLocation() {
    setError(null);
    setBusy(true);
    try {
      const loc = await getOneShotLocation();
      if (!loc.ok) {
        setError(
          loc.reason === 'permission_denied'
            ? t('spontaneous.locationDenied', "Couldn't get your location — try typing where you are instead.")
            : t('spontaneous.locationUnavailable', "Location isn't available right now — try typing where you are instead.")
        );
        return;
      }
      const results = await searchNearbyLocations(loc.latitude, loc.longitude);
      if (results.length === 0) {
        setError(t('spontaneous.noNearbyPlaces', "Couldn't find a named place nearby — try typing where you are."));
        return;
      }
      setCoords({ latitude: loc.latitude, longitude: loc.longitude });
      setCandidates(results.slice(0, 5));
      setStep('candidates');
    } catch {
      setError(t('spontaneous.searchFailed', 'Something went wrong finding nearby places. Try again.'));
    } finally {
      setBusy(false);
    }
  }

  async function handleTypeSubmit() {
    const name = typedName.trim();
    if (!name) return;
    setError(null);
    setBusy(true);
    try {
      const geo = await geocodeLocationName(name);
      const results = await searchNearbyLocations(geo.latitude, geo.longitude);
      // Already told us the name -- take the best match directly instead
      // of asking the student to confirm again from a list.
      const best = results[0];
      setCoords({ latitude: geo.latitude, longitude: geo.longitude });
      setPlaceName(best?.name || name);
      setPlaceId(best?.place_id ?? null);
      setStep('confirm');
    } catch {
      setError(t('spontaneous.geocodeFailed', "Couldn't find that place. Check the spelling, or try a nearby landmark instead."));
    } finally {
      setBusy(false);
    }
  }

  function selectCandidate(c: LocationCandidate) {
    setPlaceName(c.name);
    setPlaceId(c.place_id);
    setCoords({ latitude: c.latitude, longitude: c.longitude });
    setStep('confirm');
  }

  async function handleGo() {
    const name = placeName.trim();
    if (!name) return;
    setCreating(true);
    setError(null);
    try {
      let wikiData: LocationEnrichment | null = null;
      if (placeId) {
        try {
          wikiData = await enrichLocation(placeId);
        } catch {
          // Enrichment is a nice-to-have -- the generator still works with
          // just a place name, same as any activity with no wiki match.
        }
      }
      const result = await createSpontaneousActivity({
        locationName: name,
        subject,
        latitude: coords?.latitude,
        longitude: coords?.longitude,
        locationWikiData: wikiData,
      });
      router.replace({ pathname: '/activity/[id]', params: { id: result.activity_id } });
    } catch (e: any) {
      setError(
        e?.status === 429
          ? String(e?.message || t('spontaneous.dailyCapReached', "You've reached today's discovery limit. Try again tomorrow."))
          : e?.status === 403
          // Discover screen already hides the entry point for non-student
          // roles -- this only fires for someone who reached this screen
          // some other way (deep link, stale role cache). Surface the
          // backend's own reason instead of a generic "try again".
          ? String(e?.message || t('spontaneous.studentOnly', 'This is only available for students.'))
          : String(t('spontaneous.createFailed', "Couldn't create this right now. Try again in a moment."))
      );
      setCreating(false);
    }
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.bg }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={t('common.back', 'Back')}>
            <Text style={[styles.backArrow, { color: theme.accent }]}>{'‹'}</Text>
          </TouchableOpacity>
          <Text style={[styles.title, { fontFamily: theme.fontHead, color: theme.text }]}>
            {t('spontaneous.title', "I'm somewhere new")}
          </Text>
        </View>

        <ScrollView contentContainerStyle={styles.body}>
          {error && (
            <Text style={[styles.errorText, { color: theme.warn, fontFamily: theme.fontBody }]}>{error}</Text>
          )}

          {step === 'choose' && (
            <>
              <Text style={[styles.subtitle, { color: theme.textMuted, fontFamily: theme.fontBody }]}>
                {t('spontaneous.subtitle', 'Ask Peri about the place you\'re standing in right now.')}
              </Text>

              {canUseGps && (
                <TouchableOpacity
                  testID="spontaneous-use-location"
                  onPress={handleUseMyLocation}
                  disabled={busy}
                  style={[styles.primaryBtn, { backgroundColor: theme.accent, borderRadius: theme.radius }]}
                  accessibilityRole="button"
                >
                  {busy ? <ActivityIndicator color="#fff" /> : (
                    <Text style={[styles.primaryBtnText, { fontFamily: theme.fontBody }]}>
                      📍 {t('spontaneous.useMyLocation', 'Use my location')}
                    </Text>
                  )}
                </TouchableOpacity>
              )}

              <Text style={[styles.orText, { color: theme.textFaint, fontFamily: theme.fontMono }]}>
                {canUseGps ? t('spontaneous.or', 'or') : t('spontaneous.typeInstead', 'Type where you are:')}
              </Text>

              <TextInput
                testID="spontaneous-type-name"
                value={typedName}
                onChangeText={setTypedName}
                placeholder={t('spontaneous.typePlaceholder', 'e.g. Golden Gate Bridge, the big redwood trail')}
                placeholderTextColor={theme.textFaint}
                style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.surfaceAlt, fontFamily: theme.fontBody, borderRadius: theme.radiusSm }]}
                editable={!busy}
                onSubmitEditing={handleTypeSubmit}
                returnKeyType="search"
              />
              <TouchableOpacity
                testID="spontaneous-find-it"
                onPress={handleTypeSubmit}
                disabled={busy || !typedName.trim()}
                style={[styles.secondaryBtn, { borderColor: theme.accent, borderRadius: theme.radius, opacity: typedName.trim() ? 1 : 0.5 }]}
                accessibilityRole="button"
              >
                {busy ? <ActivityIndicator color={theme.accent} /> : (
                  <Text style={[styles.secondaryBtnText, { color: theme.accent, fontFamily: theme.fontBody }]}>
                    {t('spontaneous.findIt', 'Find it')}
                  </Text>
                )}
              </TouchableOpacity>
            </>
          )}

          {step === 'candidates' && (
            <>
              <Text style={[styles.subtitle, { color: theme.textMuted, fontFamily: theme.fontBody }]}>
                {t('spontaneous.whichOne', "Which one are you at?")}
              </Text>
              {candidates.map((c) => (
                <TouchableOpacity
                  key={c.place_id}
                  testID="spontaneous-candidate"
                  onPress={() => selectCandidate(c)}
                  style={[styles.candidateCard, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: theme.radiusSm }]}
                  accessibilityRole="button"
                >
                  <Text style={[styles.candidateName, { color: theme.text, fontFamily: theme.fontBody }]}>{c.name}</Text>
                  {c.address ? (
                    <Text style={[styles.candidateMeta, { color: theme.textFaint, fontFamily: theme.fontMono }]} numberOfLines={1}>
                      {c.address}
                    </Text>
                  ) : null}
                </TouchableOpacity>
              ))}
              <TouchableOpacity onPress={() => setStep('choose')} style={styles.backLink}>
                <Text style={[styles.backLinkText, { color: theme.textMuted, fontFamily: theme.fontBody }]}>
                  {t('spontaneous.noneOfThese', "None of these -- go back")}
                </Text>
              </TouchableOpacity>
            </>
          )}

          {step === 'confirm' && (
            <>
              <Text style={[styles.label, { color: theme.textMuted, fontFamily: theme.fontBody }]}>
                {t('spontaneous.placeLabel', 'Place')}
              </Text>
              <TextInput
                testID="spontaneous-place-name"
                value={placeName}
                onChangeText={setPlaceName}
                style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.surfaceAlt, fontFamily: theme.fontBody, borderRadius: theme.radiusSm }]}
              />

              <Text style={[styles.label, { color: theme.textMuted, fontFamily: theme.fontBody, marginTop: 16 }]}>
                {t('spontaneous.subjectLabel', 'Subject')}
              </Text>
              <View style={styles.chipRow}>
                {SUBJECTS.map((s) => (
                  <TouchableOpacity
                    key={s}
                    testID={`spontaneous-subject-${s}`}
                    onPress={() => setSubject(s)}
                    style={[
                      styles.chip,
                      { borderColor: subject === s ? theme.accent : theme.border, backgroundColor: subject === s ? theme.accentMuted : theme.surfaceAlt, borderRadius: theme.radiusFull },
                    ]}
                  >
                    <Text style={{ fontFamily: theme.fontBody, fontSize: 13, fontWeight: '600', color: subject === s ? theme.accent : theme.textMuted }}>
                      {s}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                testID="spontaneous-go"
                onPress={handleGo}
                disabled={creating || !placeName.trim()}
                style={[styles.primaryBtn, { backgroundColor: theme.accent, borderRadius: theme.radius, marginTop: 24, opacity: placeName.trim() ? 1 : 0.5 }]}
                accessibilityRole="button"
              >
                {creating ? <ActivityIndicator color="#fff" /> : (
                  <Text style={[styles.primaryBtnText, { fontFamily: theme.fontBody }]}>
                    {t('spontaneous.go', 'Go')}
                  </Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  backArrow: { fontSize: 28, fontWeight: '600' },
  title: { fontSize: 20, fontWeight: '700' },
  body: { padding: 20, gap: 12 },
  subtitle: { fontSize: 15, marginBottom: 8 },
  errorText: { fontSize: 14, marginBottom: 8 },
  primaryBtn: { paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  secondaryBtn: { paddingVertical: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  secondaryBtnText: { fontSize: 15, fontWeight: '600' },
  orText: { textAlign: 'center', fontSize: 12, marginVertical: 4 },
  input: { borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1.5 },
  candidateCard: { padding: 14, borderWidth: 1, marginBottom: 8 },
  candidateName: { fontSize: 15, fontWeight: '600' },
  candidateMeta: { fontSize: 12, marginTop: 2 },
  backLink: { alignItems: 'center', marginTop: 8 },
  backLinkText: { fontSize: 14 },
});
