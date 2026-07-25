// Copyright (c) 2026 Paul Christopher Cerda
// Business Source License 1.1

/**
 * Shared country/state constants for anything that needs to resolve a
 * privacy jurisdiction (SignUpScreen's Teaching Context step,
 * PrivacySetupWizard, AdminPrivacyConfigPage's quick-setup card).
 *
 * Previously duplicated three times with no shared source: SignUpScreen.tsx
 * had its own 10-country <select>, PrivacySetupWizard.tsx had its own
 * EU_COUNTRIES + US_STATES arrays. Consolidated here so all three read the
 * same list and SUBDIVISION_SUPPORT stays in sync with the backend's
 * (backend/routes/geo.py's SUBDIVISION_SUPPORT set).
 */

export interface CountryOption {
  code:  string;
  label: string;
}

// Common countries + a generic "Other" escape hatch (free-text 2-letter code
// entry) for anything not listed — matches PrivacySetupWizard's existing
// non-US flow. Not exhaustive; the backend's jurisdiction resolver and
// privacy_source_registry cover far more countries than this UI curates.
export const COUNTRIES: CountryOption[] = [
  { code: 'US', label: '🇺🇸 United States' },
  { code: 'GB', label: '🇬🇧 United Kingdom' },
  { code: 'CA', label: '🇨🇦 Canada' },
  { code: 'AU', label: '🇦🇺 Australia' },
  { code: 'DE', label: '🇩🇪 Germany' },
  { code: 'FR', label: '🇫🇷 France' },
  { code: 'NL', label: '🇳🇱 Netherlands' },
  { code: 'BR', label: '🇧🇷 Brazil' },
  { code: 'IN', label: '🇮🇳 India' },
  { code: 'SG', label: '🇸🇬 Singapore' },
  { code: 'MX', label: '🇲🇽 Mexico' },
  { code: 'ZA', label: '🇿🇦 South Africa' },
];

export const EU_COUNTRIES = [
  'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI',
  'FR', 'GR', 'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT',
  'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK',
];

export const US_STATES = [
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut',
  'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa',
  'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan',
  'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada',
  'New Hampshire', 'New Jersey', 'New Mexico', 'New York', 'North Carolina',
  'North Dakota', 'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island',
  'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont',
  'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming',
];

// Mirrors backend/routes/geo.py's SUBDIVISION_SUPPORT -- countries where a
// state/province picker is meaningful. US gets the full dropdown above;
// the others get a free-text "State/Province" field (no canned list yet).
export const SUBDIVISION_SUPPORT = new Set(['US', 'CA', 'AU', 'BR', 'DE', 'IN']);

/** Build the ISO-3166-2-style subdivision code the backend expects, e.g. "US-CA". */
export function toSubdivisionCode(countryCode: string, stateOrProvince: string): string | undefined {
  if (!countryCode || !stateOrProvince) return undefined;
  if (countryCode === 'US') {
    // Backend only special-cases US-CA by name today (privacy_jurisdiction_resolver.py) --
    // pass the state name itself so a future state-specific rule can match it too
    // (see privacy_regulation_catalog rows seeded with subdivision_code='US-<postal>').
    const postal = US_STATE_POSTAL[stateOrProvince];
    return postal ? `US-${postal}` : undefined;
  }
  return `${countryCode}-${stateOrProvince}`;
}

const US_STATE_POSTAL: Record<string, string> = {
  'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR', 'California': 'CA',
  'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE', 'Florida': 'FL', 'Georgia': 'GA',
  'Hawaii': 'HI', 'Idaho': 'ID', 'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA',
  'Kansas': 'KS', 'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
  'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS',
  'Missouri': 'MO', 'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV',
  'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
  'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH', 'Oklahoma': 'OK',
  'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
  'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT', 'Vermont': 'VT',
  'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV', 'Wisconsin': 'WI', 'Wyoming': 'WY',
};
