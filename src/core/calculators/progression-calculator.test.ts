import { describe, it, expect } from 'vitest';
import {
  applyProgression,
  generateSetsFromGroup,
  calculateGroupSummary,
  isUniformGroup,
} from './progression-calculator';
import type { ExerciseSet, SetProgression, SetGroup } from '@giulio-leone/types';

function makeSet(overrides: Partial<ExerciseSet> = {}): ExerciseSet {
  return {
    weight: null,
    weightLbs: null,
    rest: 120,
    intensityPercent: null,
    rpe: null,
    ...overrides,
  };
}

function makeProgression(
  type: SetProgression['type'],
  adjustment: number,
  fromSet = 1,
  toSet = 10
): SetProgression {
  return {
    type,
    steps: [{ fromSet, toSet, adjustment }],
  };
}

// =============================================================================
// applyProgression
// =============================================================================

describe('applyProgression', () => {
  describe('linear progression (weight)', () => {
    it('adds weight increment per set', () => {
      const base = makeSet({ weight: 80, reps: 5 });
      const progression = makeProgression('linear', 2.5);

      const set1 = applyProgression(base, progression, 1);
      const set2 = applyProgression(base, progression, 2);
      const set3 = applyProgression(base, progression, 3);

      expect(set1.weight).toBe(82.5); // 80 + 2.5 * 1
      expect(set2.weight).toBe(85); // 80 + 2.5 * 2
      expect(set3.weight).toBe(87.5); // 80 + 2.5 * 3
    });

    it('updates weightLbs proportionally', () => {
      const base = makeSet({ weight: 80, weightLbs: 80 * 2.20462 });
      const progression = makeProgression('linear', 5);

      const set2 = applyProgression(base, progression, 2);
      expect(set2.weightLbs).toBeGreaterThan(base.weightLbs!);
    });

    it('returns unchanged set when no step applies', () => {
      const base = makeSet({ weight: 100, reps: 5 });
      const progression: SetProgression = {
        type: 'linear',
        steps: [{ fromSet: 3, toSet: 5, adjustment: 5 }],
      };

      const set1 = applyProgression(base, progression, 1);
      expect(set1.weight).toBe(100); // Set 1 is outside step range 3-5
    });
  });

  describe('percentage progression (intensity)', () => {
    it('increases intensityPercent per set', () => {
      const base = makeSet({ intensityPercent: 70, reps: 5 });
      const progression = makeProgression('percentage', 2.5);

      const set1 = applyProgression(base, progression, 1);
      const set2 = applyProgression(base, progression, 2);

      expect(set1.intensityPercent).toBe(72.5); // 70 + 2.5 * 1
      expect(set2.intensityPercent).toBe(75); // 70 + 2.5 * 2
    });

    it('clamps intensityPercent to 100', () => {
      const base = makeSet({ intensityPercent: 95 });
      const progression = makeProgression('percentage', 5);

      const set3 = applyProgression(base, progression, 3);
      expect(set3.intensityPercent).toBeLessThanOrEqual(100);
    });

    it('clamps intensityPercent to 0 minimum', () => {
      const base = makeSet({ intensityPercent: 5 });
      const progression = makeProgression('percentage', -10);

      const set2 = applyProgression(base, progression, 2);
      expect(set2.intensityPercent).toBeGreaterThanOrEqual(0);
    });
  });

  describe('RPE progression', () => {
    it('increases RPE per set', () => {
      const base = makeSet({ rpe: 7, reps: 5 });
      const progression = makeProgression('rpe', 1);

      const set1 = applyProgression(base, progression, 1);
      const set2 = applyProgression(base, progression, 2);

      expect(set1.rpe).toBe(8); // 7 + 1 * 1
      expect(set2.rpe).toBe(9); // 7 + 1 * 2
    });

    it('clamps RPE to max 10', () => {
      const base = makeSet({ rpe: 9 });
      const progression = makeProgression('rpe', 1);

      const set3 = applyProgression(base, progression, 3);
      expect(set3.rpe).toBeLessThanOrEqual(10);
    });

    it('clamps RPE to min 1', () => {
      const base = makeSet({ rpe: 3 });
      const progression = makeProgression('rpe', -2);

      const set3 = applyProgression(base, progression, 3);
      expect(set3.rpe).toBeGreaterThanOrEqual(1);
    });
  });

  describe('multi-step progression', () => {
    it('applies different steps to different set ranges', () => {
      const progression: SetProgression = {
        type: 'linear',
        steps: [
          { fromSet: 1, toSet: 2, adjustment: 5 },
          { fromSet: 3, toSet: 4, adjustment: 2.5 },
        ],
      };
      const base = makeSet({ weight: 80, reps: 5 });

      const set1 = applyProgression(base, progression, 1);
      expect(set1.weight).toBe(85); // 80 + 5*1

      const set2 = applyProgression(base, progression, 2);
      expect(set2.weight).toBe(90); // 80 + 5*2

      const set3 = applyProgression(base, progression, 3);
      expect(set3.weight).toBe(82.5); // 80 + 2.5*1 (stepsSinceStart=1)

      const set4 = applyProgression(base, progression, 4);
      expect(set4.weight).toBe(85); // 80 + 2.5*2
    });
  });

  it('returns base set unchanged for unknown progression type', () => {
    const base = makeSet({ weight: 80, reps: 5 });
    const progression = {
      type: 'wave' as SetProgression['type'],
      steps: [{ fromSet: 1, toSet: 4, adjustment: 5 }],
    };
    const result = applyProgression(base, progression, 2);
    expect(result.weight).toBe(80);
  });
});

// =============================================================================
// generateSetsFromGroup
// =============================================================================

describe('generateSetsFromGroup', () => {
  it('generates identical sets when no progression', () => {
    const group: SetGroup = {
      id: 'sg-squat-1',
      count: 4,
      baseSet: makeSet({ weight: 100, reps: 5, rest: 180 }),
      sets: [],
    };

    const sets = generateSetsFromGroup(group);
    expect(sets).toHaveLength(4);
    sets.forEach((set) => {
      expect(set.weight).toBe(100);
      expect(set.reps).toBe(5);
      expect(set.rest).toBe(180);
    });
  });

  it('applies linear progression across sets', () => {
    const group: SetGroup = {
      id: 'sg-bench-1',
      count: 3,
      baseSet: makeSet({ weight: 60, reps: 8, rest: 120 }),
      progression: makeProgression('linear', 5),
      sets: [],
    };

    const sets = generateSetsFromGroup(group);
    expect(sets).toHaveLength(3);
    expect(sets[0]!.weight).toBe(65); // 60 + 5 * 1
    expect(sets[1]!.weight).toBe(70); // 60 + 5 * 2
    expect(sets[2]!.weight).toBe(75); // 60 + 5 * 3
  });

  it('applies percentage progression across sets', () => {
    const group: SetGroup = {
      id: 'sg-deadlift-1',
      count: 3,
      baseSet: makeSet({ intensityPercent: 70, reps: 3, rest: 180 }),
      progression: makeProgression('percentage', 5),
      sets: [],
    };

    const sets = generateSetsFromGroup(group);
    expect(sets[0]!.intensityPercent).toBe(75); // 70 + 5
    expect(sets[1]!.intensityPercent).toBe(80); // 70 + 10
    expect(sets[2]!.intensityPercent).toBe(85); // 70 + 15
  });
});

// =============================================================================
// calculateGroupSummary
// =============================================================================

describe('calculateGroupSummary', () => {
  it('generates summary for uniform sets with weight', () => {
    const group: SetGroup = {
      id: 'sg-1',
      count: 4,
      baseSet: makeSet({ weight: 80, reps: 5, rest: 180 }),
      sets: [
        makeSet({ weight: 80, reps: 5, rest: 180 }),
        makeSet({ weight: 80, reps: 5, rest: 180 }),
        makeSet({ weight: 80, reps: 5, rest: 180 }),
        makeSet({ weight: 80, reps: 5, rest: 180 }),
      ],
    };

    const summary = calculateGroupSummary(group);
    expect(summary).toContain('4x');
    expect(summary).toContain('5');
    expect(summary).toContain('80kg');
  });

  it('generates summary for sets with intensity', () => {
    const group: SetGroup = {
      id: 'sg-2',
      count: 3,
      baseSet: makeSet({ intensityPercent: 75, reps: 8, rest: 120 }),
      sets: [
        makeSet({ intensityPercent: 75, reps: 8, rest: 120 }),
        makeSet({ intensityPercent: 75, reps: 8, rest: 120 }),
        makeSet({ intensityPercent: 75, reps: 8, rest: 120 }),
      ],
    };

    const summary = calculateGroupSummary(group);
    expect(summary).toContain('3x');
    expect(summary).toContain('8');
    expect(summary).toContain('75%');
    expect(summary).toContain('1RM');
  });

  it('shows rep range for varying reps', () => {
    const group: SetGroup = {
      id: 'sg-3',
      count: 3,
      baseSet: makeSet({ reps: 8 }),
      sets: [
        makeSet({ reps: 8, weight: 60 }),
        makeSet({ reps: 10, weight: 60 }),
        makeSet({ reps: 12, weight: 60 }),
      ],
    };

    const summary = calculateGroupSummary(group);
    expect(summary).toContain('8-12');
  });

  it('shows rest when all sets have same rest', () => {
    const group: SetGroup = {
      id: 'sg-4',
      count: 2,
      baseSet: makeSet({ reps: 10, rest: 90 }),
      sets: [
        makeSet({ reps: 10, weight: 50, rest: 90 }),
        makeSet({ reps: 10, weight: 50, rest: 90 }),
      ],
    };

    const summary = calculateGroupSummary(group);
    expect(summary).toContain('rest 90s');
  });

  it('generates summary from baseSet when sets array is empty', () => {
    const group: SetGroup = {
      id: 'sg-5',
      count: 5,
      baseSet: makeSet({ reps: 5, weight: 100, rest: 180 }),
      sets: [],
    };

    const summary = calculateGroupSummary(group);
    expect(summary).toContain('5x');
    expect(summary).toContain('5');
    expect(summary).toContain('100kg');
  });
});

// =============================================================================
// isUniformGroup
// =============================================================================

describe('isUniformGroup', () => {
  it('returns true for group without progression', () => {
    const group: SetGroup = {
      id: 'sg-1',
      count: 3,
      baseSet: makeSet({ reps: 5, weight: 80 }),
      sets: [
        makeSet({ reps: 5, weight: 80 }),
        makeSet({ reps: 5, weight: 80 }),
        makeSet({ reps: 5, weight: 80 }),
      ],
    };

    expect(isUniformGroup(group)).toBe(true);
  });

  it('returns true for single-set group with progression', () => {
    const group: SetGroup = {
      id: 'sg-2',
      count: 1,
      baseSet: makeSet({ reps: 5, weight: 80 }),
      progression: makeProgression('linear', 5),
      sets: [makeSet({ reps: 5, weight: 80 })],
    };

    expect(isUniformGroup(group)).toBe(true);
  });

  it('returns false for group with varying weights', () => {
    const group: SetGroup = {
      id: 'sg-3',
      count: 3,
      baseSet: makeSet({ reps: 5, weight: 80 }),
      progression: makeProgression('linear', 5),
      sets: [
        makeSet({ reps: 5, weight: 80, rest: 120 }),
        makeSet({ reps: 5, weight: 85, rest: 120 }),
        makeSet({ reps: 5, weight: 90, rest: 120 }),
      ],
    };

    expect(isUniformGroup(group)).toBe(false);
  });

  it('returns false for group with varying reps', () => {
    const group: SetGroup = {
      id: 'sg-4',
      count: 3,
      baseSet: makeSet({ reps: 8 }),
      progression: makeProgression('linear', 0),
      sets: [
        makeSet({ reps: 8, rest: 90 }),
        makeSet({ reps: 10, rest: 90 }),
        makeSet({ reps: 12, rest: 90 }),
      ],
    };

    expect(isUniformGroup(group)).toBe(false);
  });

  it('returns true for empty sets array', () => {
    const group: SetGroup = {
      id: 'sg-5',
      count: 3,
      baseSet: makeSet({ reps: 5, weight: 80 }),
      sets: [],
    };

    // sets.length < 2 → true
    expect(isUniformGroup(group)).toBe(true);
  });
});
