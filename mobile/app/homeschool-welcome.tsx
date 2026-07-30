// app/homeschool-welcome.tsx — first-run onboarding wizard for HOMESCHOOL
// accounts, mirroring web's HomeschoolWelcomePage.tsx (frontend/src/pages/
// homeschool/HomeschoolWelcomePage.tsx): add children, pick your state,
// then a confirmation screen. Reached automatically after login (see
// app/(tabs)/_layout.tsx) when GET /api/v1/onboarding/status returns
// dismissed:false for a HOMESCHOOL account — that flag lives on the
// organizations row, so dismissing here also dismisses it on web and vice
// versa. Unrelated to app/(onboarding)/, mobile's own device-level,
// pre-login first-launch tour — do not confuse the two.
//
// Step 3 differs from web on purpose: web's last step offers "Create first
// activity →", but mobile has no activity-authoring screen anywhere (stays
// web-only everywhere else in this app) — so this just points the parent
// to the web app instead of a dead link.

import React, { useState } from 'react';
import { View, Text, TextInput, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Modal, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '@/src/theme/ThemeContext';
import { createHomeschoolChild } from '@/src/api/homeschool';
import { dismissOnboarding } from '@/src/api/onboarding';

// Same key name as web's localStorage 'hs_state_code' — naming parity only,
// AsyncStorage here is device-local and doesn't actually share state with
// the browser's localStorage on web. No mobile screen reads this yet (there
// is no mobile equivalent of HomeschoolRequirementsPage.tsx); stored for
// forward compatibility if one is built later.
const HS_STATE_KEY = 'hs_state_code';

const US_STATES: [string, string][] = [
  ['AL','Alabama'],['AK','Alaska'],['AZ','Arizona'],['AR','Arkansas'],['CA','California'],
  ['CO','Colorado'],['CT','Connecticut'],['DE','Delaware'],['FL','Florida'],['GA','Georgia'],
  ['HI','Hawaii'],['ID','Idaho'],['IL','Illinois'],['IN','Indiana'],['IA','Iowa'],
  ['KS','Kansas'],['KY','Kentucky'],['LA','Louisiana'],['ME','Maine'],['MD','Maryland'],
  ['MA','Massachusetts'],['MI','Michigan'],['MN','Minnesota'],['MS','Mississippi'],['MO','Missouri'],
  ['MT','Montana'],['NE','Nebraska'],['NV','Nevada'],['NH','New Hampshire'],['NJ','New Jersey'],
  ['NM','New Mexico'],['NY','New York'],['NC','North Carolina'],['ND','North Dakota'],['OH','Ohio'],
  ['OK','Oklahoma'],['OR','Oregon'],['PA','Pennsylvania'],['RI','Rhode Island'],['SC','South Carolina'],
  ['SD','South Dakota'],['TN','Tennessee'],['TX','Texas'],['UT','Utah'],['VT','Vermont'],
  ['VA','Virginia'],['WA','Washington'],['WV','West Virginia'],['WI','Wisconsin'],['WY','Wyoming'],
];

const GRADES = ['K','1','2','3','4','5','6','7','8','9','10','11','12'];

interface ChildDraft {
  name: string;
  grade: string;
}

function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '') || 'child';
}

export default function HomeschoolWelcomeScreen() {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [children, setChildren] = useState<ChildDraft[]>([{ name: '', grade: '1' }]);
  const [selectedState, setSelectedState] = useState('');
  const [statePickerOpen, setStatePickerOpen] = useState(false);

  const addChild = () => setChildren((prev) => [...prev, { name: '', grade: '1' }]);
  const updateChild = (i: number, field: keyof ChildDraft, value: string) =>
    setChildren((prev) => prev.map((c, idx) => (idx === i ? { ...c, [field]: value } : c)));
  const removeChild = (i: number) => setChildren((prev) => prev.filter((_, idx) => idx !== i));

  const finishAndGo = async () => {
    await dismissOnboarding().catch(() => null);
    router.replace('/(tabs)');
  };

  const skipSetup = () => { finishAndGo(); };

  const saveChildren = async () => {
    const valid = children.filter((c) => c.name.trim());
    if (!valid.length) {
      setError(t('homeschoolWelcome.noChildrenError', 'Please add at least one child.'));
      return;
    }
    setError(null);
    setSaving(true);
    let anyFailed = false;
    for (const child of valid) {
      const slug = slugify(child.name);
      try {
        await createHomeschoolChild({
          full_name: child.name.trim(),
          // Not @homeschool.local — `.local` is an RFC 6762 special-use TLD
          // that pydantic's EmailStr rejects outright ("special-use or
          // reserved name"), confirmed live against this backend. A
          // subdomain of the real product domain passes validation and
          // still can't collide with a real user's own email.
          email: `${slug}.${Math.random().toString(36).slice(2, 7)}@homeschool.peripateticware.com`,
          password: 'Homeschool@1234',
          grade_level: child.grade === 'K' ? 0 : parseInt(child.grade, 10) || 0,
          // Matches web's HomeschoolWelcomePage.tsx as-built behavior: every
          // child added through this wizard defaults to age_band 'k6'
          // regardless of grade — the wizard form never exposes an age-band
          // field to change it. Kept identical here rather than "fixed" to
          // avoid mobile and web diverging on first-run behavior.
          age_band: 'k6',
        });
      } catch {
        anyFailed = true;
      }
    }
    setSaving(false);
    if (anyFailed) {
      setError(t('homeschoolWelcome.someFailedError', 'Some children could not be saved automatically — you can add them later from the web app.'));
    }
    setStep(1);
  };

  const saveStateAndContinue = async () => {
    if (selectedState) {
      try { await AsyncStorage.setItem(HS_STATE_KEY, selectedState); } catch { /* ignore */ }
    }
    setStep(2);
  };

  const selectedStateName = US_STATES.find(([code]) => code === selectedState)?.[1];

  return (
    <SafeAreaView testID="homeschool-welcome-screen" style={[styles.root, { backgroundColor: theme.bg }]}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 20, justifyContent: 'center' }}>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: theme.radius }]}>
          <View style={[styles.headerBanner, { backgroundColor: theme.accent }]}>
            <TouchableOpacity
              testID="homeschool-welcome-skip"
              onPress={skipSetup}
              hitSlop={12}
              style={styles.skipBtn}
              accessibilityRole="button"
              accessibilityLabel={t('homeschoolWelcome.skipSetup', 'Skip setup')}
            >
              <Text style={styles.skipBtnText}>✕</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{t('homeschoolWelcome.welcomeTitle', 'Welcome! 🌿')}</Text>
            <Text style={styles.headerSubtitle}>{t('homeschoolWelcome.welcomeSubtitle', "Let's get you set up in 3 quick steps.")}</Text>
          </View>

          <View style={[styles.stepIndicator, { borderBottomColor: theme.border }]}>
            {[t('homeschoolWelcome.step1', 'Add Children'), t('homeschoolWelcome.step2', 'Your State'), t('homeschoolWelcome.step3', 'First Activity')].map((label, i) => (
              <View key={i} style={styles.stepDotRow}>
                <View style={[styles.stepDot, { backgroundColor: i <= step ? theme.accent : theme.border }]}>
                  <Text style={[styles.stepDotText, { color: i <= step ? '#fff' : theme.textMuted }]}>{i < step ? '✓' : i + 1}</Text>
                </View>
                <Text style={[styles.stepLabel, { fontFamily: theme.fontMono, color: i === step ? theme.text : theme.textFaint }]} numberOfLines={1}>{label}</Text>
              </View>
            ))}
          </View>

          <View style={styles.stepContent}>
            {step === 0 && (
              <View>
                <Text style={[styles.stepHeading, { fontFamily: theme.fontHead, color: theme.text }]}>{t('homeschoolWelcome.whoTeaching', 'Who are you teaching?')}</Text>
                <Text style={[styles.stepBody, { fontFamily: theme.fontBody, color: theme.textMuted }]}>
                  {t('homeschoolWelcome.whoTeachingBody', "Add each child's name and grade. You can add more children later from the web app.")}
                </Text>

                {children.map((child, i) => (
                  <View key={i} style={styles.childRow}>
                    <TextInput
                      testID={`homeschool-welcome-child-name-${i}`}
                      value={child.name}
                      onChangeText={(v) => updateChild(i, 'name', v)}
                      placeholder={t('homeschoolWelcome.childNamePlaceholder', 'Child {{n}} name', { n: i + 1 })}
                      placeholderTextColor={theme.textFaint}
                      style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.bg }]}
                    />
                    <View style={styles.gradeChips}>
                      {GRADES.map((g) => (
                        <TouchableOpacity
                          key={g}
                          testID={`homeschool-welcome-child-grade-${i}-${g}`}
                          onPress={() => updateChild(i, 'grade', g)}
                          style={[styles.gradeChip, { borderColor: child.grade === g ? theme.accent : theme.border, backgroundColor: child.grade === g ? theme.accentMuted : 'transparent' }]}
                        >
                          <Text style={[styles.gradeChipText, { color: child.grade === g ? theme.accent : theme.textMuted }]}>{g}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    {children.length > 1 && (
                      <TouchableOpacity
                        testID={`homeschool-welcome-child-remove-${i}`}
                        onPress={() => removeChild(i)}
                        hitSlop={10}
                        style={styles.removeChildBtn}
                        accessibilityRole="button"
                        accessibilityLabel={t('common.remove', 'Remove')}
                      >
                        <Text style={{ color: theme.textMuted, fontSize: 16 }}>✕</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}

                <TouchableOpacity
                  testID="homeschool-welcome-add-child"
                  onPress={addChild}
                  style={[styles.addChildBtn, { borderColor: theme.border }]}
                >
                  <Text style={[styles.addChildBtnText, { color: theme.textMuted }]}>{t('homeschoolWelcome.addAnotherChild', '+ Add another child')}</Text>
                </TouchableOpacity>

                {!!error && <Text style={styles.errorText}>{error}</Text>}
              </View>
            )}

            {step === 1 && (
              <View>
                <Text style={[styles.stepHeading, { fontFamily: theme.fontHead, color: theme.text }]}>{t('homeschoolWelcome.whichState', 'Which state do you homeschool in?')}</Text>
                <Text style={[styles.stepBody, { fontFamily: theme.fontBody, color: theme.textMuted }]}>
                  {t('homeschoolWelcome.whichStateBody', 'This helps show the right state reporting requirements. You can change this any time.')}
                </Text>

                <TouchableOpacity
                  testID="homeschool-welcome-state-trigger"
                  onPress={() => setStatePickerOpen(true)}
                  style={[styles.stateTrigger, { borderColor: theme.border, backgroundColor: theme.surfaceAlt }]}
                >
                  <Text style={[styles.stateTriggerText, { color: selectedStateName ? theme.text : theme.textFaint }]} numberOfLines={1}>
                    {selectedStateName ?? t('homeschoolWelcome.selectStateOptional', '— Select your state (optional) —')}
                  </Text>
                  <Text style={{ color: theme.textFaint }}>▾</Text>
                </TouchableOpacity>

                <Text style={[styles.footnote, { fontFamily: theme.fontBody, color: theme.textMuted }]}>
                  {t('homeschoolWelcome.stateFootnote', '35 US states require homeschool parents to keep learning records — Peripateticware generates reports automatically from your activity log.')}
                </Text>
              </View>
            )}

            {step === 2 && (
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 48, marginBottom: 12 }}>🌿</Text>
                <Text style={[styles.stepHeading, { fontFamily: theme.fontHead, color: theme.text, textAlign: 'center' }]}>{t('homeschoolWelcome.allSet', "You're all set!")}</Text>
                <Text style={[styles.stepBody, { fontFamily: theme.fontBody, color: theme.textMuted, textAlign: 'center' }]}>
                  {t('homeschoolWelcome.allSetBody', 'Head to the web app to create your first outdoor activity — Peri will suggest Aristotelian inquiry questions tailored to your location and subject.')}
                </Text>
              </View>
            )}
          </View>

          <View style={[styles.footer, { borderTopColor: theme.border }]}>
            {step < 2 ? (
              <>
                <TouchableOpacity
                  testID="homeschool-welcome-back"
                  onPress={() => (step > 0 ? setStep((s) => s - 1) : skipSetup())}
                  style={styles.footerGhostBtn}
                >
                  <Text style={{ color: theme.textMuted, fontFamily: theme.fontBody }}>{step === 0 ? t('homeschoolWelcome.skipSetup', 'Skip setup') : t('common.back', 'Back')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  testID="homeschool-welcome-continue"
                  onPress={() => (step === 0 ? saveChildren() : saveStateAndContinue())}
                  disabled={saving}
                  style={[styles.footerPrimaryBtn, { backgroundColor: theme.accent, opacity: saving ? 0.7 : 1 }]}
                >
                  {saving ? <ActivityIndicator color="#fff" size="small" /> : (
                    <Text style={styles.footerPrimaryBtnText}>{t('common.continue', 'Continue')}</Text>
                  )}
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity
                testID="homeschool-welcome-finish"
                onPress={finishAndGo}
                style={[styles.footerPrimaryBtn, { backgroundColor: theme.accent, flex: 1 }]}
              >
                <Text style={styles.footerPrimaryBtnText}>{t('homeschoolWelcome.goToDashboard', 'Go to dashboard')}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </ScrollView>

      <Modal visible={statePickerOpen} animationType="fade" transparent onRequestClose={() => setStatePickerOpen(false)}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setStatePickerOpen(false)}>
          <TouchableOpacity activeOpacity={1} style={[styles.pickerCard, { backgroundColor: theme.bg, borderColor: theme.border }]}>
            <View style={styles.pickerHeader}>
              <Text style={[styles.pickerTitle, { fontFamily: theme.fontHead, color: theme.text }]} numberOfLines={1}>{t('homeschoolWelcome.selectState', 'Select your state')}</Text>
              <TouchableOpacity testID="homeschool-welcome-state-close" onPress={() => setStatePickerOpen(false)} hitSlop={12}>
                <Text style={{ fontSize: 18, color: theme.textMuted, flexShrink: 0 }}>✕</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={US_STATES}
              keyExtractor={([code]) => code}
              style={{ flexGrow: 0 }}
              renderItem={({ item: [code, name] }) => (
                <TouchableOpacity
                  testID={`homeschool-welcome-state-${code}`}
                  onPress={() => { setSelectedState(code); setStatePickerOpen(false); }}
                  style={[styles.stateOption, { borderColor: selectedState === code ? theme.accent : theme.border, backgroundColor: selectedState === code ? theme.accentMuted : theme.surfaceAlt }]}
                >
                  <Text style={{ color: theme.text }}>{name}</Text>
                  {selectedState === code && <Text style={{ color: theme.accent, fontWeight: '700' }}>✓</Text>}
                </TouchableOpacity>
              )}
            />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:              { flex: 1 },
  card:              { width: '100%', maxWidth: 480, alignSelf: 'center', borderWidth: 1, overflow: 'hidden' },
  headerBanner:      { padding: 20 },
  skipBtn:           { position: 'absolute', top: 14, right: 14, padding: 4, zIndex: 1 },
  skipBtnText:       { color: 'rgba(255,255,255,0.8)', fontSize: 16 },
  headerTitle:       { color: '#fff', fontSize: 19, fontWeight: '700' },
  headerSubtitle:    { color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 4 },
  stepIndicator:     { flexDirection: 'row', padding: 14, gap: 6, borderBottomWidth: 1 },
  stepDotRow:        { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
  stepDot:           { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  stepDotText:       { fontSize: 11, fontWeight: '700' },
  stepLabel:         { fontSize: 10, flexShrink: 1, minWidth: 0 },
  stepContent:       { padding: 20 },
  stepHeading:       { fontSize: 17, fontWeight: '700', marginBottom: 6 },
  stepBody:          { fontSize: 13, lineHeight: 19, marginBottom: 16 },
  childRow:          { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' },
  input:             { flex: 1, minWidth: 140, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  gradeChips:        { flexDirection: 'row', flexWrap: 'wrap', gap: 4, flexBasis: '100%' },
  gradeChip:         { paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderRadius: 6 },
  gradeChipText:     { fontSize: 12, fontWeight: '600' },
  removeChildBtn:    { padding: 4 },
  addChildBtn:       { borderWidth: 1, borderStyle: 'dashed', borderRadius: 8, padding: 10, alignItems: 'center', marginBottom: 8 },
  addChildBtnText:   { fontSize: 13 },
  errorText:         { color: '#dc2626', fontSize: 12, marginTop: 4 },
  stateTrigger:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: 8, padding: 12, marginBottom: 12 },
  stateTriggerText:  { fontSize: 14, flexShrink: 1, minWidth: 0 },
  footnote:          { fontSize: 12, lineHeight: 18 },
  footer:            { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderTopWidth: 1, gap: 12 },
  footerGhostBtn:    { paddingVertical: 8, paddingHorizontal: 4 },
  footerPrimaryBtn:  { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8, alignItems: 'center', justifyContent: 'center', minWidth: 100 },
  footerPrimaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  backdrop:          { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  pickerCard:        { width: '100%', maxHeight: '75%', borderWidth: 1, borderRadius: 16, padding: 16, gap: 12 },
  pickerHeader:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pickerTitle:       { fontSize: 17, fontWeight: '700', flexShrink: 1 },
  stateOption:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderWidth: 1, borderRadius: 8, marginBottom: 6 },
});
