import { describe, it, expect } from 'vitest';
import { calculateSetWeights } from './weight-calculator';
import type { ExerciseSet } from '@onecoach/types';

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

describe('calculateSetWeights', () => {
  it('calculates weight from intensityPercent and 1RM', () => {
    const set = makeSet({ intensityPercent: 80 });
    const result = calculateSetWeights(set, 100);

    expect(result.weight).toBeDefined();
    expect(result.weight).toBe(80); // 80% of 100 = 80, rounds to 80
    expect(result.weightLbs).toBeDefined();
    expect(result.weightLbs).toBeGreaterThan(0);
  });

  it('rounds weight to plate increment (2.5kg default)', () => {
    const set = makeSet({ intensityPercent: 73 });
    const result = calculateSetWeights(set, 100);

    // 73% of 100 = 73kg, rounded to 72.5kg (nearest 2.5)
    expect(result.weight).toBe(72.5);
  });

  it('respects custom plate increment', () => {
    const set = makeSet({ intensityPercent: 73 });
    const result = calculateSetWeights(set, 100, 5);

    // 73% of 100 = 73kg, rounded to 75kg (nearest 5)
    expect(result.weight).toBe(75);
  });

  it('calculates intensityPercent from weight when intensity is missing', () => {
    const set = makeSet({ weight: 80 });
    const result = calculateSetWeights(set, 100);

    expect(result.intensityPercent).toBe(80);
    expect(result.weight).toBe(80);
  });

  it('calculates weightLbs from weight even without 1RM', () => {
    const set = makeSet({ weight: 60 });
    const result = calculateSetWeights(set, 0);

    expect(result.weightLbs).toBeCloseTo(60 * 2.20462, 0);
  });

  it('preserves existing values when both weight and intensity are set', () => {
    const set = makeSet({ weight: 80, intensityPercent: 80 });
    const result = calculateSetWeights(set, 100);

    // intensityPercent is set, so it recalculates weight from intensity
    expect(result.weight).toBe(80);
    expect(result.intensityPercent).toBe(80);
  });

  it('preserves RPE from original set', () => {
    const set = makeSet({ intensityPercent: 80, rpe: 8 });
    const result = calculateSetWeights(set, 100);

    expect(result.rpe).toBe(8);
  });

  it('sets rpe to null if not provided', () => {
    const set = makeSet({ intensityPercent: 80 });
    const result = calculateSetWeights(set, 100);

    expect(result.rpe).toBeNull();
  });

  it('handles a realistic bench press scenario', () => {
    // 1RM = 120kg, prescribed at 75%
    const set = makeSet({ intensityPercent: 75, reps: 5, rest: 180 });
    const result = calculateSetWeights(set, 120);

    expect(result.weight).toBe(90); // 75% of 120 = 90kg
    expect(result.reps).toBe(5);
    expect(result.rest).toBe(180);
  });

  it('handles zero 1RM gracefully', () => {
    const set = makeSet({ intensityPercent: 80 });
    const result = calculateSetWeights(set, 0);

    // oneRepMaxKg is 0, so intensity-based calc won't trigger (0 > 0 is false)
    expect(result.intensityPercent).toBe(80);
  });

  it('handles negative 1RM gracefully', () => {
    const set = makeSet({ intensityPercent: 80 });
    const result = calculateSetWeights(set, -10);

    // Negative 1RM treated same as 0 (condition is > 0)
    expect(result.weight).toBeNull();
  });

  it('does not modify the original set object', () => {
    const originalSet = makeSet({ intensityPercent: 80 });
    const originalWeight = originalSet.weight;
    calculateSetWeights(originalSet, 100);

    expect(originalSet.weight).toBe(originalWeight);
  });

  it('returns set unchanged when no weight or intensity is present', () => {
    const set = makeSet();
    const result = calculateSetWeights(set, 100);

    expect(result.weight).toBeNull();
    expect(result.intensityPercent).toBeNull();
    expect(result.weightLbs).toBeNull();
  });

  it('preserves reps and rest values through calculation', () => {
    const set = makeSet({ reps: 8, rest: 120, intensityPercent: 75 });
    const result = calculateSetWeights(set, 100);

    expect(result.reps).toBe(8);
    expect(result.rest).toBe(120);
  });

  it('handles realistic squat scenario (85% of 180kg)', () => {
    const set = makeSet({ intensityPercent: 85 });
    const result = calculateSetWeights(set, 180);

    // 85% of 180 = 153kg → rounds to 152.5 (nearest 2.5)
    expect(result.weight).toBe(152.5);
    expect(result.weight! % 2.5).toBe(0);
  });
});
