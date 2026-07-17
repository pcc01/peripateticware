// Onboarding 4 — First Activity Reveal
// Map comes alive. Crow reveals a nearby activity. Onboarding ends.
// Design ref: Handoff v1.0 screen 04 "FIRST ACTIVITY"
import React from 'react';
import { View, Text, StyleSheet, useWindowDimensions, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/src/theme/ThemeContext';
import { useOnboardingCopy } from '@/src/onboarding/copy';
import { setHasOnboarded } from '@/src/onboarding/onboardingFlag';
import { fetchActivities, Activity } from '@/src/api/activities';
import MapIllustration from '@/src/components/MapIllustration';
import PeriSpeech from '@/src/components/PeriSpeech';
import Btn from '@/src/components/Btn';

export default function FirstActivityScreen() {
  const { width, height } = useWindowDimensions();
  const { theme, themeName } = useTheme();
  const c = useOnboardingCopy();
  const { name = '' } = useLocalSearchParams<{ name: string }>();
  const [firstActivity, setFirstActivity] = React.useState<Activity | null>(null);

  React.useEffect(() => {
    fetchActivities().then((acts) => { if (acts.length > 0) setFirstActivity(acts[0]); }).catch(() => {});
  }, []);

  // Tour-then-login (mobile/FEATURE_PLAN.md section 3.4): onboarding never
  // created an account — it only ever collected a display name for
  // on-screen copy. Ending the tour here means "mark it seen, then send
  // the student to the real login screen" — a teacher or homeschool
  // parent creates the actual account in the web app, unchanged by this.
  const finishOnboarding = async () => {
    await setHasOnboarded();
    router.replace('/login');
  };

  return (
    <View testID="onboarding-first-activity" style={[styles.root, { backgroundColor: theme.mapBase }]}>
      <StatusBar barStyle={themeName === 'atmosphere' ? 'light-content' : 'dark-content'} translucent backgroundColor="transparent" />
      <View style={StyleSheet.absoluteFill}>
        <MapIllustration theme={theme} themeName={themeName} width={width} height={height} />
      </View>

      <SafeAreaView edges={['bottom']} style={styles.safeArea}>
        <View style={[styles.sheet, {
          backgroundColor: theme.surface,
          borderTopLeftRadius: theme.radiusLg,
          borderTopRightRadius: theme.radiusLg,
          borderColor: theme.border,
        }]}>
          <View style={[styles.handle, { backgroundColor: theme.border }]} />

          <PeriSpeech
            text={c.firstActivityPeriSpeech(name as string)}
            theme={theme}
            size={40}
          />

          {/* Activity card */}
          <View style={[styles.activityCard, {
            backgroundColor: theme.surfaceAlt,
            borderColor: theme.border,
            borderRadius: theme.radius,
          }]}>
            <Text style={[styles.distanceLabel, { fontFamily: theme.fontMono, color: theme.textFaint }]}>
              {firstActivity?.location_name?.toUpperCase() ?? 'NEARBY LOCATION'}
            </Text>
            <View style={styles.activityRow}>
              <View style={[styles.iconBg, { backgroundColor: theme.accentMuted, borderRadius: theme.radiusSm }]}>
                <Text style={styles.activityIcon}>📍</Text>
              </View>
              <View style={styles.activityMeta}>
                <Text style={[styles.activityName, { fontFamily: theme.fontHead, color: theme.text }]} numberOfLines={1}>
                  {firstActivity?.title ?? 'Field Activity'}
                </Text>
                <Text style={[styles.activitySub, { fontFamily: theme.fontBody, color: theme.textMuted }]}>
                  {[firstActivity?.subject, firstActivity?.estimated_duration_minutes ? `${firstActivity.estimated_duration_minutes} min` : null].filter(Boolean).join(' · ')}
                </Text>
              </View>
            </View>
          </View>

          <Btn
            testID="onboarding-first-activity-open"
            label={c.firstActivityCta}
            onPress={finishOnboarding}
            theme={theme}
          />
          <Btn
            testID="onboarding-first-activity-browse"
            label={c.firstActivityBrowseCta}
            onPress={finishOnboarding}
            theme={theme}
            variant="secondary"
          />
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root:          { flex: 1 },
  safeArea:      { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    padding: 20, paddingTop: 14, gap: 14, borderTopWidth: 1,
    shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 8,
  },
  handle:        { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 4 },
  activityCard:  { padding: 12, borderWidth: 1, gap: 8 },
  distanceLabel: { fontSize: 9, letterSpacing: 1 },
  activityRow:   { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconBg:        { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  activityIcon:  { fontSize: 20 },
  activityMeta:  { flex: 1, gap: 2 },
  activityName:  { fontSize: 14, fontWeight: '600', lineHeight: 18 },
  activitySub:   { fontSize: 11 },
});
