// ─────────────────────────────────────────────────────────────────
// Peripateticware — Onboarding copy
//
// Previously varied by age-band (K-6 / 7-12 / College); the age-band
// system was removed (see mobile/FEATURE_PLAN.md section 1 — it only
// ever changed word choice, never wired to real content). These are
// the former "7-12" (m712) strings, which was the app's default band
// for every user regardless of account, so this is what nearly all
// users actually saw.
//
// Every string goes through t() (src/i18n/t.ts), now backed by real
// i18next (src/i18n/index.ts).
//
// IMPORTANT: this used to be a module-level `const onboardingCopy`
// object built by calling t() once, at import time. That froze this
// copy at whichever language was active the moment the JS module first
// loaded, and it never updated on a runtime language switch (a real bug
// — see WORK_PLAN_20260718_MOBILE_I18N.md Priority 1 item 4). It's now
// `useOnboardingCopy()`, a hook called inside each consuming component's
// render body. `useTranslation()` subscribes the component to i18next's
// `languageChanged` event, so switching languages in Settings now
// re-renders every onboarding screen with the new language on next
// visit (and immediately, if the screen happens to be mounted).
// ─────────────────────────────────────────────────────────────────

import { useTranslation } from 'react-i18next';

export interface OnboardingCopy {
  splashPeriSpeech: string;
  splashCta: string;
  namePeriSpeech: string;
  namePlaceholder: string;
  nameCta: string;
  locationPeriSpeech: string;
  locationConfirmCta: string;
  locationSkipCta: string;
  locationBadge: string;
  locationReassurance: string;
  firstActivityPeriSpeech: (name: string) => string;
  firstActivityCta: string;
  firstActivityBrowseCta: string;
  activityLabel: string;
  activityLabelPlural: string;
  captureLabel: string;
  journalLabel: string;
}

export function useOnboardingCopy(): OnboardingCopy {
  const { t } = useTranslation();
  return {
    splashPeriSpeech: t('onboarding.splash.periSpeech', 'There are field activities in your area worth exploring.'),
    splashCta: t('onboarding.splash.cta', 'Get started'),
    namePeriSpeech: t('onboarding.name.periSpeech', 'What should I call you?'),
    namePlaceholder: t('onboarding.name.placeholder', 'Your name…'),
    nameCta: t('onboarding.name.cta', 'Continue'),
    locationPeriSpeech: t('onboarding.location.periSpeech', 'There are activities near you. Enable location to get started?'),
    locationConfirmCta: t('onboarding.location.confirmCta', 'Allow location'),
    locationSkipCta: t('onboarding.location.skipCta', 'Skip for now'),
    locationBadge: t('onboarding.location.badge', '3 activities nearby'),
    locationReassurance: t('onboarding.location.reassurance', 'Used only to surface nearby activities'),
    firstActivityPeriSpeech: (name: string) => t('onboarding.firstActivity.periSpeech', "There's a field activity near you."),
    firstActivityCta: t('onboarding.firstActivity.cta', 'Open activity'),
    firstActivityBrowseCta: t('onboarding.firstActivity.browseCta', 'Browse all activities'),
    activityLabel: t('common.activity', 'Activity'),
    activityLabelPlural: t('common.activityPlural', 'Activities'),
    captureLabel: t('common.captureLabel', 'Record evidence'),
    journalLabel: t('common.journalLabel', 'Field notes'),
  };
}
