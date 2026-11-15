import {
  gradeToBand,
  bloomLevelToBankKey,
  observationTypeToStage,
  fillBankPlaceToken,
} from '../gradeBand';

describe('gradeToBand', () => {
  it('covers every grade including the K-2 edge', () => {
    expect(gradeToBand(0)).toBe('k-2');
    expect(gradeToBand(1)).toBe('k-2');
    expect(gradeToBand(2)).toBe('k-2');
    expect(gradeToBand(3)).toBe('3-5');
    expect(gradeToBand(5)).toBe('3-5');
    expect(gradeToBand(6)).toBe('6-8');
    expect(gradeToBand(8)).toBe('6-8');
    expect(gradeToBand(9)).toBe('9-12');
    expect(gradeToBand(12)).toBe('9-12');
  });

  it('returns null outside 0-12 or when missing', () => {
    expect(gradeToBand(-1)).toBeNull();
    expect(gradeToBand(13)).toBeNull();
    expect(gradeToBand(null)).toBeNull();
    expect(gradeToBand(undefined)).toBeNull();
    expect(gradeToBand(NaN)).toBeNull();
  });
});

describe('bloomLevelToBankKey', () => {
  it('maps every DB integer to the bank key (British spelling for 4)', () => {
    expect(bloomLevelToBankKey(1)).toBe('remember');
    expect(bloomLevelToBankKey(2)).toBe('understand');
    expect(bloomLevelToBankKey(3)).toBe('apply');
    expect(bloomLevelToBankKey(4)).toBe('analyse');
    expect(bloomLevelToBankKey(5)).toBe('evaluate');
    expect(bloomLevelToBankKey(6)).toBe('create');
  });

  it('accepts a numeric string', () => {
    expect(bloomLevelToBankKey('4')).toBe('analyse');
  });

  it('normalizes the American "analyze" spelling to the bank\'s "analyse"', () => {
    expect(bloomLevelToBankKey('analyze')).toBe('analyse');
  });

  it('passes through an already-correct string key', () => {
    expect(bloomLevelToBankKey('remember')).toBe('remember');
  });

  it('returns undefined for missing/unresolvable input', () => {
    expect(bloomLevelToBankKey(undefined)).toBeUndefined();
    expect(bloomLevelToBankKey(null)).toBeUndefined();
    expect(bloomLevelToBankKey('')).toBeUndefined();
  });
});

describe('observationTypeToStage', () => {
  it('maps observation/measurement to observe', () => {
    expect(observationTypeToStage('observation')).toBe('observe');
    expect(observationTypeToStage('measurement')).toBe('observe');
  });

  it('maps comparison/classification/pattern to classify', () => {
    expect(observationTypeToStage('comparison')).toBe('classify');
    expect(observationTypeToStage('classification')).toBe('classify');
    expect(observationTypeToStage('pattern')).toBe('classify');
  });

  it('maps causation/evidence to explain', () => {
    expect(observationTypeToStage('causation')).toBe('explain');
    expect(observationTypeToStage('evidence')).toBe('explain');
  });

  it('returns null for unmapped or missing types', () => {
    expect(observationTypeToStage('not-a-real-type')).toBeNull();
    expect(observationTypeToStage(null)).toBeNull();
    expect(observationTypeToStage(undefined)).toBeNull();
  });
});

describe('fillBankPlaceToken', () => {
  it('substitutes {place} with the activity location name', () => {
    expect(fillBankPlaceToken('What do you see at {place}?', 'Sather Tower')).toBe(
      'What do you see at Sather Tower?'
    );
  });

  it('falls back to generic wording when no place name is given', () => {
    expect(fillBankPlaceToken('What do you see at {place}?', undefined)).toBe(
      'What do you see at this place?'
    );
  });

  it('passes through text with no token unchanged', () => {
    expect(fillBankPlaceToken('What colour is this object?', 'Sather Tower')).toBe(
      'What colour is this object?'
    );
  });

  it('handles null/empty text without throwing', () => {
    expect(fillBankPlaceToken(null, 'Sather Tower')).toBeNull();
    expect(fillBankPlaceToken(undefined, 'Sather Tower')).toBeNull();
  });
});
