// src/onboarding/onboardingFlag.ts
// Tracks whether the user has been through the first-launch onboarding
// tour. See mobile/FEATURE_PLAN.md section 3.4 — the tour was fully built
// (app/(onboarding)/*) but never reachable because AuthGuard sent every
// unauthenticated launch straight to /login. This flag is what lets
// AuthGuard tell "never seen onboarding" apart from "seen it, needs to log
// in" for a returning-but-unauthenticated user (e.g. after logout).
//
// Tour-then-login model: onboarding does NOT create an account — it never
// did (name.tsx only collects a display name for on-screen copy,
// first-activity.tsx's CTA didn't touch auth). Real account creation stays
// where it already happens today: a teacher or homeschool parent creates
// the student account in the web app. Onboarding just ends by routing to
// /login instead of /(tabs) so the student then signs in with those
// real credentials.

import AsyncStorage from '@react-native-async-storage/async-storage';

export const HAS_ONBOARDED_KEY = '@ppw_has_onboarded';

export async function getHasOnboarded(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(HAS_ONBOARDED_KEY)) === 'true';
  } catch {
    // If storage is unavailable, don't trap the user in onboarding forever.
    return true;
  }
}

export async function setHasOnboarded(): Promise<void> {
  try {
    await AsyncStorage.setItem(HAS_ONBOARDED_KEY, 'true');
  } catch {
    // Non-fatal — worst case the tour shows again next launch.
  }
}
