// src/api/onboarding.ts
// Reuses backend/routes/onboarding.py, the same org-scoped "getting started"
// status the web app's HomeschoolWelcomePage.tsx checks/dismisses. `dismissed`
// is stored on the organizations row (onboarding_completed_at), not per
// device — completing or skipping the wizard on either platform dismisses
// it on both. Unrelated to app/(onboarding)/ (mobile's own device-level,
// pre-login first-launch tour, gated by a local AsyncStorage flag) — do not
// confuse the two.

import { apiFetch } from './client';

export interface OnboardingStatus {
  role: string;
  email_verified: boolean;
  classroom_created: boolean;
  student_invited: boolean;
  activity_created: boolean;
  all_done: boolean;
  dismissed: boolean;
  next_step: string | null;
}

export async function fetchOnboardingStatus(): Promise<OnboardingStatus> {
  return apiFetch<OnboardingStatus>('/api/v1/onboarding/status');
}

export async function dismissOnboarding(): Promise<{ dismissed: boolean }> {
  return apiFetch('/api/v1/onboarding/dismiss', { method: 'POST' });
}
