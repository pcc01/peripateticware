// The (onboarding) group had no landing screen for its bare path — every
// never-onboarded launch (AuthGuard in app/_layout.tsx does
// router.replace('/(onboarding)') for a fresh install) hit Expo Router's
// built-in "Unmatched Route" fallback instead of the tour, with no further
// redirect to recover. Confirmed via Detox CI screenshots: every Android
// test's testStart/testDone artifact showed the same "Page could not be
// found" screen for the full test-suite run, because Detox reinstalls the
// app fresh before every test (always never-onboarded), so this dead end
// was hit 100% of the time. Same pattern as (tabs)/explore.tsx below.
import { Redirect } from 'expo-router';
export default function OnboardingIndexRedirect() {
  return <Redirect href="/(onboarding)/splash" />;
}
