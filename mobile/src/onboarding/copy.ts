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
// Every string goes through t() (src/i18n/t.ts) so button text and
// other copy here is already localizable — t() is a pass-through today
// (mobile has no i18n library wired up yet, see FEATURE_PLAN.md section
// 3.1), but nothing here needs to change again once one is picked.
// ─────────────────────────────────────────────────────────────────

import { t } from '@/src/i18n/t';

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

export const onboardingCopy: OnboardingCopy = {
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
