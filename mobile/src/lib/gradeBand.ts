// src/lib/gradeBand.ts
//
// Grade band + taxonomy-key helpers shared by the curated question bank
// fallback (PERI_OFFLINE_SPEC_v2.md item 10) and the K-2 grade floor work
// (item 20). Pure, dependency-free, same shape intended server-side
// (spec: "Add gradeToBand() (server and device)").

export type GradeBand = 'k-2' | '3-5' | '6-8' | '9-12';

/**
 * Convert a numeric grade level to the curated bank's band key.
 * 0-2 -> k-2 (kindergarten represented as 0, per spec's K-2 convention),
 * 3-5 -> 3-5, 6-8 -> 6-8, 9-12 -> 9-12. Returns null for anything outside
 * 0-12 rather than guessing.
 */
export function gradeToBand(grade: number | null | undefined): GradeBand | null {
  if (grade === null || grade === undefined || Number.isNaN(grade)) return null;
  if (grade < 0 || grade > 12) return null;
  if (grade <= 2) return 'k-2';
  if (grade <= 5) return '3-5';
  if (grade <= 8) return '6-8';
  return '9-12';
}

// The curated bank stores Bloom level as its plain-English key, British
// spelling ("analyse", not "analyze" — see backend/data/aristotelian_questions.json).
// The activity payload's bloom_level is the DB's plain integer (1-6).
const _BLOOM_INT_TO_BANK_KEY: Record<number, string> = {
  1: 'remember', 2: 'understand', 3: 'apply', 4: 'analyse', 5: 'evaluate', 6: 'create',
};

/**
 * Resolve an activity's bloom_level (which may arrive as the DB's integer,
 * or occasionally a string key from an older payload shape) to the bank's
 * own string key. Returns undefined if unresolvable, so callers can omit
 * the filter rather than force a result that won't match anything.
 */
export function bloomLevelToBankKey(bloomLevel: number | string | null | undefined): string | undefined {
  if (bloomLevel === null || bloomLevel === undefined) return undefined;
  if (typeof bloomLevel === 'number') return _BLOOM_INT_TO_BANK_KEY[bloomLevel];
  const trimmed = bloomLevel.trim().toLowerCase();
  if (!trimmed) return undefined;
  if (/^\d+$/.test(trimmed)) return _BLOOM_INT_TO_BANK_KEY[parseInt(trimmed, 10)];
  // Already a string key — normalize the one spelling difference so a
  // caller passing the American "analyze" (used elsewhere in this app)
  // still matches the bank's British "analyse" rows.
  return trimmed === 'analyze' ? 'analyse' : trimmed;
}

export type PeriStageName = 'orient' | 'observe' | 'classify' | 'explain' | 'connect' | 'reflect';

// backend/data/aristotelian_questions.json's observation_type values mapped
// onto the same six inquiry stages the Peri script engine uses (spec item
// 10: "map observation_type to the stage"). No bank row's observation_type
// maps to orient/connect/reflect — the bank models description/causation,
// not an arrival or wrap-up moment — so those stages are simply unreachable
// via this mapping, which is a real, documented limitation of the bank
// versus an authored script, not a bug.
const _OBSERVATION_TYPE_TO_STAGE: Record<string, PeriStageName> = {
  observation: 'observe',
  measurement: 'observe',
  comparison: 'classify',
  classification: 'classify',
  pattern: 'classify',
  causation: 'explain',
  evidence: 'explain',
};

export function observationTypeToStage(observationType: string | null | undefined): PeriStageName | null {
  if (!observationType) return null;
  return _OBSERVATION_TYPE_TO_STAGE[observationType.trim().toLowerCase()] ?? null;
}

/** Substitute the one token the curated bank supports (spec item 10/13) —
 * deliberately just {place}, not the script's richer {focus}, since bank
 * rows carry no focus-term list. */
export function fillBankPlaceToken(text: string | null | undefined, placeName: string | null | undefined): string | null {
  if (!text) return text ?? null;
  return text.replace(/\{place\}/g, placeName && placeName.trim() ? placeName : 'this place');
}
