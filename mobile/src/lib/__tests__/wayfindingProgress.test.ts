import { isHuntComplete } from '../wayfindingProgress';

describe('isHuntComplete', () => {
  it('is false when no required waypoints are reached', () => {
    const waypoints = [{ id: 'a', required: true }, { id: 'b', required: true }];
    expect(isHuntComplete(waypoints, new Set())).toBe(false);
  });

  it('is false when only some required waypoints are reached', () => {
    const waypoints = [{ id: 'a', required: true }, { id: 'b', required: true }];
    expect(isHuntComplete(waypoints, new Set(['a']))).toBe(false);
  });

  it('is true once every required waypoint is reached, even if an optional one is not', () => {
    const waypoints = [{ id: 'a', required: true }, { id: 'b', required: false }];
    expect(isHuntComplete(waypoints, new Set(['a']))).toBe(true);
  });

  it('falls back to "every waypoint reached" when none are marked required', () => {
    const waypoints = [{ id: 'a', required: false }, { id: 'b', required: false }];
    expect(isHuntComplete(waypoints, new Set(['a']))).toBe(false);
    expect(isHuntComplete(waypoints, new Set(['a', 'b']))).toBe(true);
  });

  it('is false for an empty waypoint list (nothing to complete)', () => {
    expect(isHuntComplete([], new Set())).toBe(false);
  });
});
