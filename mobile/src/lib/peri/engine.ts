// src/lib/peri/engine.ts
//
// On-device Peri dialogue engine. Walks a teacher-approved `PeriScript`
// (authored online, shipped inside activity_cache.detail_json — see
// PERI_OFFLINE_SPEC_v2.md section C.1) using the student's replies, with NO
// network call and NO storage: all state is kept in memory for the
// lifetime of one chat session, exactly like the live-chat history
// PeriChatSheet already keeps today.
//
// Pure and dependency-free on purpose — this file must stay unit-testable
// without mocking React Native, SQLite or the network.

export type PeriStageName =
  | 'orient'
  | 'observe'
  | 'classify'
  | 'explain'
  | 'connect'
  | 'reflect';

export const PERI_STAGE_ORDER: PeriStageName[] = [
  'orient',
  'observe',
  'classify',
  'explain',
  'connect',
  'reflect',
];

export interface PeriScriptQuestion {
  id: string;
  // Plain string = one wording for everyone. The mixed-age `{lo, hi}` form
  // (PERI_OFFLINE_SPEC_v2.md "Mixed-age groups") is resolved to a plain
  // string by the caller before it reaches this engine — the engine itself
  // stays framework- and grade-band-agnostic.
  q: string;
  // Focus terms (from the script's top-level `focus` list) that make this
  // question the preferred branch when the student mentions one.
  on?: string[];
  // Rubric criterion id this question is meant to draw evidence for.
  crit?: string;
}

export interface PeriScript {
  v: number;
  framework?: string;
  level?: string | number;
  rubric?: { id: string | null; criteria?: string[] } | null;
  place?: string;
  focus?: string[];
  stages: Partial<Record<PeriStageName, PeriScriptQuestion[]>>;
  probes?: string[];
  generated_at?: string;
  source_hash?: string;
  approved?: boolean;
}

export interface PeriEngineState {
  stage: PeriStageName;
  askedIds: string[];
  turnsInStage: number;
  probedInStage: boolean;
  closed: boolean;
}

export interface PeriEngineResult {
  periText: string;
  state: PeriEngineState;
}

export const PERI_WRAP_UP_TEXT =
  "That's a great place to stop. Think back on everything you noticed here today.";

const FALLBACK_QUESTION_TEXT = 'What do you notice right now?';

const VAGUE_PHRASES = new Set([
  'idk',
  'i dont know',
  "i don't know",
  'dunno',
  'nothing',
  'not sure',
  'no idea',
]);

const VAGUE_MAX_WORDS = 2;
const TURNS_BEFORE_ADVANCE = 2;

export function createPeriEngineState(startStage: PeriStageName = 'orient'): PeriEngineState {
  return {
    stage: startStage,
    askedIds: [],
    turnsInStage: 0,
    probedInStage: false,
    closed: false,
  };
}

function stageQuestions(script: PeriScript, stage: PeriStageName): PeriScriptQuestion[] {
  return script.stages?.[stage] ?? [];
}

function unaskedIn(
  script: PeriScript,
  state: PeriEngineState,
  stage: PeriStageName
): PeriScriptQuestion[] {
  return stageQuestions(script, stage).filter((q) => !state.askedIds.includes(q.id));
}

/** First stage at or after `from` (inclusive) that still has an unasked question. */
function firstAvailableStage(
  script: PeriScript,
  state: PeriEngineState,
  from: PeriStageName
): PeriStageName | null {
  const startIdx = PERI_STAGE_ORDER.indexOf(from);
  for (let i = startIdx; i < PERI_STAGE_ORDER.length; i++) {
    const stage = PERI_STAGE_ORDER[i];
    if (unaskedIn(script, state, stage).length > 0) return stage;
  }
  return null;
}

function normalize(text: string): string {
  return text.trim().toLowerCase();
}

function isVague(text: string): boolean {
  const t = normalize(text);
  if (!t) return true;
  if (VAGUE_PHRASES.has(t)) return true;
  if (/\d/.test(t)) return false; // a number is meaningful, never vague
  const words = t.split(/\s+/).filter(Boolean);
  return words.length <= VAGUE_MAX_WORDS;
}

function containsNumber(text: string): boolean {
  return /\d/.test(text);
}

/** Focus terms from the script that appear (as whole words) in the reply. */
function matchedFocusTerms(text: string, focus: string[] | undefined): string[] {
  if (!focus || focus.length === 0) return [];
  const t = normalize(text);
  return focus.filter((term) => {
    const needle = normalize(term);
    if (!needle) return false;
    return new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(t);
  });
}

function fillTemplate(text: string, script: PeriScript): string {
  const place = script.place || 'this place';
  const focus = (script.focus && script.focus[0]) || 'what you see';
  return text.replace(/\{place\}/g, place).replace(/\{focus\}/g, focus);
}

/** Exported so screens that just need to DISPLAY script text (not run the
 * engine) still get the same {place}/{focus} substitution — e.g. the
 * activity screen's opening Inquiry prompt (item 9). */
export function fillPeriTemplate(text: string, script: PeriScript): string {
  return fillTemplate(text, script);
}

export interface PeriOpeningPrompt {
  question_text: string;
  follow_up: string | null;
}

/**
 * The activity screen's Inquiry-phase opening prompt, read directly from
 * the script's `orient` stage — NOT run through the engine, since this is
 * shown before any student reply exists (mirrors the shape of the curated
 * bank's ObservationQuestion: a main question plus an optional follow-up).
 * Returns null if the script has no usable orient question, so callers can
 * fall back to the curated bank unchanged.
 */
export function periOpeningPrompt(script: PeriScript | null | undefined): PeriOpeningPrompt | null {
  const orient = script?.stages?.orient;
  if (!orient || orient.length === 0) return null;
  return {
    question_text: fillTemplate(orient[0].q, script!),
    follow_up: orient[1] ? fillTemplate(orient[1].q, script!) : null,
  };
}

function pickProbe(script: PeriScript): string {
  const probes = script.probes ?? [];
  if (probes.length === 0) {
    return 'Look again. What exactly do you notice?';
  }
  return fillTemplate(probes[0], script);
}

/** Prefer an unasked question in `stage` whose `on` list matches one of `terms`. */
function pickPreferringFocus(
  script: PeriScript,
  state: PeriEngineState,
  stage: PeriStageName,
  terms: string[]
): PeriScriptQuestion | null {
  const pool = unaskedIn(script, state, stage);
  if (pool.length === 0) return null;
  if (terms.length > 0) {
    const match = pool.find((q) => q.on?.some((term) => terms.includes(term)));
    if (match) return match;
  }
  return pool[0];
}

/** Move state onto the next stage that still has a question, or close. */
function advanceStage(
  script: PeriScript,
  state: PeriEngineState,
  from: PeriStageName
): { question: PeriScriptQuestion | null; state: PeriEngineState } {
  const fromIdx = PERI_STAGE_ORDER.indexOf(from);
  if (fromIdx === PERI_STAGE_ORDER.length - 1) {
    // Already on the last stage (reflect) — nothing to advance to.
    return { question: null, state: { ...state, closed: true } };
  }
  const nextStage = firstAvailableStage(script, state, PERI_STAGE_ORDER[fromIdx + 1]);
  if (nextStage === null) {
    return { question: null, state: { ...state, closed: true } };
  }
  const freshState: PeriEngineState = {
    ...state,
    stage: nextStage,
    turnsInStage: 0,
    probedInStage: false,
  };
  const question = unaskedIn(script, freshState, nextStage)[0] ?? null;
  return { question, state: freshState };
}

function askQuestion(
  script: PeriScript,
  state: PeriEngineState,
  question: PeriScriptQuestion
): PeriEngineResult {
  return {
    periText: fillTemplate(question.q, script),
    state: {
      ...state,
      askedIds: [...state.askedIds, question.id],
      turnsInStage: state.turnsInStage + 1,
      probedInStage: false,
    },
  };
}

function closeResult(state: PeriEngineState): PeriEngineResult {
  return { periText: PERI_WRAP_UP_TEXT, state: { ...state, closed: true } };
}

/**
 * Advance the dialogue by one turn.
 *
 * Pass `studentText` as `undefined` only for the very first call of a
 * session, to get the opening question with no reply to evaluate yet.
 * Every subsequent call must pass the student's (possibly empty/vague)
 * reply so the engine can apply its branching rules.
 */
export function next(
  script: PeriScript,
  state: PeriEngineState,
  studentText?: string
): PeriEngineResult {
  if (state.closed) {
    return closeResult(state);
  }

  // --- Opening turn: no reply yet, just surface the first question. ---
  if (studentText === undefined) {
    const stage = firstAvailableStage(script, state, state.stage);
    if (stage === null) return closeResult(state);
    const stageState = stage === state.stage ? state : { ...state, stage, turnsInStage: 0, probedInStage: false };
    const question = unaskedIn(script, stageState, stage)[0];
    if (!question) return closeResult(state); // defensive; shouldn't happen given the check above
    return askQuestion(script, stageState, question);
  }

  // --- Rule 1: vague reply -> probe once per stage. ---
  if (isVague(studentText) && !state.probedInStage) {
    return {
      periText: pickProbe(script),
      state: { ...state, probedInStage: true },
    };
  }

  // --- Rule 2: reply has a number/unit -> advance to the next stage. ---
  if (containsNumber(studentText)) {
    const { question, state: nextState } = advanceStage(script, state, state.stage);
    if (!question) return closeResult(nextState);
    return askQuestion(script, nextState, question);
  }

  // --- Rule 3: reply names a focus term -> prefer the matching branch. ---
  const terms = matchedFocusTerms(studentText, script.focus);
  if (terms.length > 0) {
    const branch = pickPreferringFocus(script, state, state.stage, terms);
    if (branch) return askQuestion(script, state, branch);
  }

  // --- Rule 4: default — next unasked question, advancing after 2 turns. ---
  if (state.turnsInStage < TURNS_BEFORE_ADVANCE) {
    const pool = unaskedIn(script, state, state.stage);
    if (pool.length > 0) {
      return askQuestion(script, state, pool[0]);
    }
  }
  const { question, state: nextState } = advanceStage(script, state, state.stage);
  if (!question) return closeResult(nextState);
  return askQuestion(script, nextState, question);
}

/** Fallback text if a script is entirely empty — should never surface in practice. */
export const PERI_FALLBACK_QUESTION_TEXT = FALLBACK_QUESTION_TEXT;
