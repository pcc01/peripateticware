// ─────────────────────────────────────────────────────────────────
// Peripateticware — Age-band adaptive copy
// Voice guide from handoff:
//   K–6     Friendly, first-person ("I found an adventure!")
//   7–12    Peer-level, direct ("There are field activities near you")
//   College Neutral, academic ("Location access enables contextual loading")
//
// Vocabulary: prefer Explore, Field work, Observe, Inquire
// Avoid: Discover (colonial/possessive), Conquer, Claim
// ─────────────────────────────────────────────────────────────────

export type AgeBand = 'k6' | 'm712' | 'college';

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

export const copy: Record<AgeBand, OnboardingCopy> = {
  k6: {
    splashPeriSpeech: 'Every place around you has an amazing adventure waiting!',
    splashCta: "Let's explore!",
    namePeriSpeech: 'What should I call you on our adventures?',
    namePlaceholder: 'Your explorer name…',
    nameCta: "That's me!",
    locationPeriSpeech: 'I can see adventures near you! Mind if I check where you are?',
    locationConfirmCta: 'Sure, Peri!',
    locationSkipCta: 'Not right now',
    locationBadge: '3 adventures nearby',
    locationReassurance: 'Only used to find adventures near you',
    firstActivityPeriSpeech: (name) => `${name}, I found an adventure near you!`,
    firstActivityCta: "Let's go!",
    firstActivityBrowseCta: 'See all adventures',
    activityLabel: 'Adventure',
    activityLabelPlural: 'Adventures',
    captureLabel: 'Capture',
    journalLabel: 'Field Journal',
  },

  m712: {
    splashPeriSpeech: 'There are field activities in your area worth exploring.',
    splashCta: 'Get started',
    namePeriSpeech: 'What should I call you?',
    namePlaceholder: 'Your name…',
    nameCta: 'Continue',
    locationPeriSpeech: 'There are activities near you. Enable location to get started?',
    locationConfirmCta: 'Allow location',
    locationSkipCta: 'Skip for now',
    locationBadge: '3 activities nearby',
    locationReassurance: 'Used only to surface nearby activities',
    firstActivityPeriSpeech: () => "There's a field activity near you.",
    firstActivityCta: 'Open activity',
    firstActivityBrowseCta: 'Browse all activities',
    activityLabel: 'Activity',
    activityLabelPlural: 'Activities',
    captureLabel: 'Record evidence',
    journalLabel: 'Field notes',
  },

  college: {
    splashPeriSpeech: 'Field observations are available at locations near you.',
    splashCta: 'Continue',
    namePeriSpeech: 'What name should appear on your field records?',
    namePlaceholder: 'Your name…',
    nameCta: 'Save',
    locationPeriSpeech: 'Location access enables contextual field site loading.',
    locationConfirmCta: 'Allow location access',
    locationSkipCta: 'Skip',
    locationBadge: '3 field sites nearby',
    locationReassurance: 'Used exclusively to surface contextually relevant field sites',
    firstActivityPeriSpeech: () => 'A field site has been identified near your current location.',
    firstActivityCta: 'View field site',
    firstActivityBrowseCta: 'Browse field sites',
    activityLabel: 'Field site',
    activityLabelPlural: 'Field sites',
    captureLabel: 'Document',
    journalLabel: 'Field record',
  },
};

export interface NearbyActivity {
  icon: string;
  name: Record<AgeBand, string>;
  location: string;
  distance: string;
  duration: string;
  subject: string;
}

// Sample — replace with API response
export const sampleActivity: NearbyActivity = {
  icon: '🌿',
  name: {
    k6: 'Urban Ecosystems',
    m712: 'Urban Ecology Survey',
    college: 'Ecological Field Assessment',
  },
  location: 'Riverside Park',
  distance: '0.2 mi',
  duration: '45 min',
  subject: 'Life Science',
};
