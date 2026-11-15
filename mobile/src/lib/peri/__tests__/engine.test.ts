// Unit tests for the pure, on-device Peri dialogue engine. No React Native,
// SQLite or network involved — see engine.ts's own header comment.

import {
  createPeriEngineState,
  next,
  periOpeningPrompt,
  fillPeriTemplate,
  PeriScript,
  PERI_WRAP_UP_TEXT,
} from '../engine';

function makeScript(overrides: Partial<PeriScript> = {}): PeriScript {
  return {
    v: 1,
    place: 'Cliff Palace',
    focus: ['rooms', 'alcove', 'kiva'],
    stages: {
      orient: [
        { id: 'o1', q: 'What do you first notice about {place}?' },
        { id: 'o2', q: 'What sounds can you hear right now?' },
      ],
      observe: [
        { id: 'b1', q: 'How many rooms can you count?', on: ['rooms'] },
        { id: 'b2', q: 'What is the alcove made of?', on: ['alcove'] },
        { id: 'b3', q: 'What else do you notice about the walls?' },
      ],
      classify: [
        { id: 'c1', q: 'How would you group what you see?' },
      ],
      explain: [
        { id: 'e1', q: 'Why might the kiva be shaped that way?', on: ['kiva'] },
      ],
      connect: [
        { id: 'n1', q: 'What does this remind you of elsewhere?' },
      ],
      reflect: [
        { id: 'r1', q: 'What is the one thing you want to remember?' },
      ],
    },
    probes: ['Look again. What exactly do you see at {place}?'],
    ...overrides,
  };
}

describe('Peri engine', () => {
  it('opens with the first orient question', () => {
    const script = makeScript();
    const state = createPeriEngineState();
    const result = next(script, state);
    expect(result.periText).toBe('What do you first notice about Cliff Palace?');
    expect(result.state.askedIds).toEqual(['o1']);
    expect(result.state.stage).toBe('orient');
  });

  it('gives a probe exactly once per stage on a vague reply', () => {
    const script = makeScript();
    let state = createPeriEngineState();
    let r = next(script, state); // o1
    state = r.state;

    r = next(script, state, 'idk');
    expect(r.periText).toBe('Look again. What exactly do you see at Cliff Palace?');
    expect(r.state.probedInStage).toBe(true);
    state = r.state;

    // A second vague reply in the SAME stage must not probe again.
    r = next(script, state, 'nothing');
    expect(r.periText).not.toBe('Look again. What exactly do you see at Cliff Palace?');
    expect(r.state.askedIds).toContain('o2');
  });

  it('advances to the next stage when the reply contains a number', () => {
    const script = makeScript();
    let state = createPeriEngineState();
    let r = next(script, state); // o1
    state = r.state;

    r = next(script, state, 'I count 12 steps');
    expect(r.state.stage).toBe('observe');
    expect(['b1', 'b2', 'b3']).toContain(r.state.askedIds[r.state.askedIds.length - 1]);
  });

  it('prefers the branch whose "on" list matches a focus term in the reply', () => {
    const script = makeScript();
    let state = createPeriEngineState('observe');
    let r = next(script, state); // b1 (first unasked in observe)
    state = r.state;
    expect(state.askedIds).toEqual(['b1']);

    r = next(script, state, 'I see a big alcove above the rooms');
    expect(r.periText).toBe('What is the alcove made of?');
    expect(r.state.askedIds).toContain('b2');
  });

  it('never repeats a question id across an entire run', () => {
    const script = makeScript();
    let r = next(script, createPeriEngineState());
    const replies = [
      'a plain reply with no digits',
      'rocks and an alcove over the rooms',
      'maybe thirty feet tall',
      'it looks like a kiva',
      'because people lived here',
      'reminds me of a cave',
      'I will remember the rooms',
    ];
    for (const reply of replies) {
      if (r.state.closed) break;
      r = next(script, r.state, reply);
    }
    const ids = r.state.askedIds;
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('advances after two turns in a stage even with plain replies', () => {
    const script = makeScript();
    let state = createPeriEngineState('observe');
    let r = next(script, state); // b1
    state = r.state;
    r = next(script, state, 'I see rock walls'); // 2nd question in observe (turn 2)
    state = r.state;
    expect(state.stage).toBe('observe');
    r = next(script, state, 'they look old'); // should advance now (3rd turn)
    expect(r.state.stage).toBe('classify');
  });

  it('closes cleanly with a wrap-up after reflect is exhausted', () => {
    const script = makeScript();
    let state = createPeriEngineState('reflect');
    let r = next(script, state); // r1
    state = r.state;
    r = next(script, state, 'I will remember the kiva');
    expect(r.state.closed).toBe(true);
    expect(r.periText).toBe(PERI_WRAP_UP_TEXT);

    // Further calls after closed stay closed and don't throw.
    r = next(script, r.state, 'anything');
    expect(r.state.closed).toBe(true);
    expect(r.periText).toBe(PERI_WRAP_UP_TEXT);
  });

  it('does not crash on empty or missing stages and skips over them', () => {
    const script = makeScript({
      stages: {
        orient: [],
        observe: [{ id: 'b1', q: 'What do you see?' }],
        // classify/explain/connect/reflect intentionally omitted
      },
    });
    const state = createPeriEngineState('orient');
    const r = next(script, state);
    expect(r.periText).toBe('What do you see?');
    expect(r.state.stage).toBe('observe');
  });

  it('closes immediately with no crash when every stage is empty', () => {
    const script = makeScript({ stages: {} });
    const state = createPeriEngineState();
    const r = next(script, state);
    expect(r.state.closed).toBe(true);
    expect(r.periText).toBe(PERI_WRAP_UP_TEXT);
  });
});

describe('periOpeningPrompt', () => {
  it('reads the orient stage as question_text/follow_up with templates filled', () => {
    const script = makeScript();
    const opening = periOpeningPrompt(script);
    expect(opening).toEqual({
      question_text: 'What do you first notice about Cliff Palace?',
      follow_up: 'What sounds can you hear right now?',
    });
  });

  it('returns null when there is no script', () => {
    expect(periOpeningPrompt(null)).toBeNull();
    expect(periOpeningPrompt(undefined)).toBeNull();
  });

  it('returns null when the orient stage is empty, so callers fall back to the bank', () => {
    const script = makeScript({ stages: { orient: [] } });
    expect(periOpeningPrompt(script)).toBeNull();
  });

  it('follow_up is null when orient has only one question', () => {
    const script = makeScript({
      stages: { orient: [{ id: 'o1', q: 'What do you see at {place}?' }] },
    });
    expect(periOpeningPrompt(script)).toEqual({
      question_text: 'What do you see at Cliff Palace?',
      follow_up: null,
    });
  });
});

describe('fillPeriTemplate', () => {
  it('substitutes {place} and {focus}', () => {
    const script = makeScript();
    expect(fillPeriTemplate('Look at the {place} and its {focus}.', script)).toBe(
      'Look at the Cliff Palace and its rooms.'
    );
  });

  it('falls back to generic wording when place/focus are missing', () => {
    const script = makeScript({ place: undefined, focus: undefined });
    expect(fillPeriTemplate('{place}: {focus}', script)).toBe('this place: what you see');
  });
});
