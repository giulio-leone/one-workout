import { describe, it, expect } from 'vitest';
import {
  calculateWeightFromIntensity,
  calculateIntensityFromWeight,
  calculateWeightFromRPE,
  calculateIntensityFromRPE,
  calculateRPEFromWeight,
  calculateRPEFromIntensity,
  estimateOneRMFromReps,
  syncSetValues,
  type FocusField,
} from './intensity-calculator';

// =============================================================================
// calculateWeightFromIntensity
// =============================================================================

describe('calculateWeightFromIntensity', () => {
  it('calculates weight from 1RM and intensity percent', () => {
    expect(calculateWeightFromIntensity(100, 80)).toBe(80);
  });

  it('returns exact value for 100% intensity', () => {
    expect(calculateWeightFromIntensity(140, 100)).toBe(140);
  });

  it('returns 0 for 0% intensity', () => {
    expect(calculateWeightFromIntensity(100, 0)).toBe(0);
  });

  it('handles non-round numbers correctly', () => {
    expect(calculateWeightFromIntensity(120, 72.5)).toBeCloseTo(87, 0);
  });

  it('throws for oneRepMax <= 0', () => {
    expect(() => calculateWeightFromIntensity(0, 80)).toThrow();
    expect(() => calculateWeightFromIntensity(-10, 80)).toThrow();
  });

  it('throws for intensityPercent out of range', () => {
    expect(() => calculateWeightFromIntensity(100, -5)).toThrow();
    expect(() => calculateWeightFromIntensity(100, 101)).toThrow();
  });
});

// =============================================================================
// calculateIntensityFromWeight
// =============================================================================

describe('calculateIntensityFromWeight', () => {
  it('calculates intensity from weight and 1RM', () => {
    expect(calculateIntensityFromWeight(80, 100)).toBe(80);
  });

  it('returns 100% when weight equals 1RM', () => {
    expect(calculateIntensityFromWeight(140, 140)).toBe(100);
  });

  it('returns 0% for zero weight', () => {
    expect(calculateIntensityFromWeight(0, 100)).toBe(0);
  });

  it('handles realistic squat scenario', () => {
    // 1RM = 180kg, working weight = 135kg → 75%
    expect(calculateIntensityFromWeight(135, 180)).toBe(75);
  });

  it('throws for oneRepMax <= 0', () => {
    expect(() => calculateIntensityFromWeight(80, 0)).toThrow();
    expect(() => calculateIntensityFromWeight(80, -1)).toThrow();
  });

  it('throws for negative weight', () => {
    expect(() => calculateIntensityFromWeight(-10, 100)).toThrow();
  });
});

// =============================================================================
// calculateWeightFromRPE
// =============================================================================

describe('calculateWeightFromRPE', () => {
  it('calculates weight for 5 reps at RPE 8 with 100kg 1RM', () => {
    // RPE 8 @ 5 reps = 81.1% → 81.1kg
    expect(calculateWeightFromRPE(100, 5, 8)).toBeCloseTo(81.1, 0);
  });

  it('calculates weight for 1 rep at RPE 10 (max single)', () => {
    // RPE 10 @ 1 rep = 100% → full 1RM
    expect(calculateWeightFromRPE(100, 1, 10)).toBe(100);
  });

  it('calculates weight for 3 reps at RPE 9 with 140kg bench 1RM', () => {
    // RPE 9 @ 3 reps = 89.2% → 124.88kg
    expect(calculateWeightFromRPE(140, 3, 9)).toBeCloseTo(124.88, 0);
  });

  it('clamps reps > 12 to 12', () => {
    // Should not throw for reps > 12 - it clamps
    const result = calculateWeightFromRPE(100, 15, 8);
    expect(result).toBeGreaterThan(0);
  });

  it('clamps RPE below 6.5 to 6.5', () => {
    const result = calculateWeightFromRPE(100, 5, 5);
    expect(result).toBeGreaterThan(0);
  });

  it('rounds RPE to nearest 0.5', () => {
    // RPE 8.3 rounds to 8.5 → 5 reps @ RPE 8.5 = 82.4%
    const result = calculateWeightFromRPE(100, 5, 8.3);
    expect(result).toBeCloseTo(82.4, 1);
  });

  it('throws for negative oneRepMax', () => {
    expect(() => calculateWeightFromRPE(-50, 5, 8)).toThrow();
  });

  it('throws for oneRepMax <= 0', () => {
    expect(() => calculateWeightFromRPE(0, 5, 8)).toThrow();
  });
});

// =============================================================================
// calculateIntensityFromRPE
// =============================================================================

describe('calculateIntensityFromRPE', () => {
  it('returns 81.1% for 5 reps at RPE 8', () => {
    expect(calculateIntensityFromRPE(5, 8)).toBe(81.1);
  });

  it('returns 100% for 1 rep at RPE 10', () => {
    expect(calculateIntensityFromRPE(1, 10)).toBe(100);
  });

  it('returns 86.3% for 5 reps at RPE 10', () => {
    expect(calculateIntensityFromRPE(5, 10)).toBe(86.3);
  });

  it('clamps reps below 1 to 1', () => {
    expect(calculateIntensityFromRPE(0, 8)).toBe(calculateIntensityFromRPE(1, 8));
  });

  it('clamps reps above 12 to 12', () => {
    expect(calculateIntensityFromRPE(20, 8)).toBe(calculateIntensityFromRPE(12, 8));
  });

  it('clamps RPE below 6.5 to 6.5', () => {
    expect(calculateIntensityFromRPE(5, 4)).toBe(calculateIntensityFromRPE(5, 6.5));
  });

  it('clamps RPE above 10 to 10', () => {
    expect(calculateIntensityFromRPE(5, 12)).toBe(calculateIntensityFromRPE(5, 10));
  });
});

// =============================================================================
// calculateRPEFromIntensity
// =============================================================================

describe('calculateRPEFromIntensity', () => {
  it('returns RPE 10 for 100% at 1 rep', () => {
    expect(calculateRPEFromIntensity(100, 1)).toBe(10);
  });

  it('returns RPE 8 for ~81.1% at 5 reps', () => {
    expect(calculateRPEFromIntensity(81.1, 5)).toBe(8);
  });

  it('finds closest RPE when intensity does not exactly match', () => {
    const rpe = calculateRPEFromIntensity(90, 3);
    expect(rpe).toBeGreaterThanOrEqual(6.5);
    expect(rpe).toBeLessThanOrEqual(10);
  });

  it('clamps reps < 1 to 1', () => {
    expect(calculateRPEFromIntensity(95, 0)).toBe(calculateRPEFromIntensity(95, 1));
  });

  it('clamps reps > 12 to 12', () => {
    expect(calculateRPEFromIntensity(65, 20)).toBe(calculateRPEFromIntensity(65, 12));
  });
});

// =============================================================================
// calculateRPEFromWeight
// =============================================================================

describe('calculateRPEFromWeight', () => {
  it('estimates RPE from weight, 1RM and reps', () => {
    // 81.1kg with 100kg 1RM at 5 reps should be ~RPE 8
    const rpe = calculateRPEFromWeight(81.1, 100, 5);
    expect(rpe).toBeGreaterThanOrEqual(7.5);
    expect(rpe).toBeLessThanOrEqual(8.5);
  });

  it('returns RPE 10 for 1 rep at 1RM', () => {
    const rpe = calculateRPEFromWeight(100, 100, 1);
    expect(rpe).toBe(10);
  });

  it('returns fallback RPE 8 for invalid inputs', () => {
    expect(calculateRPEFromWeight(0, 100, 5)).toBe(8);
    expect(calculateRPEFromWeight(80, 0, 5)).toBe(8);
  });

  it('handles a realistic deadlift scenario', () => {
    // 1RM = 200kg, weight = 160kg (80%), 3 reps → ~RPE 8ish
    const rpe = calculateRPEFromWeight(160, 200, 3);
    expect(rpe).toBeGreaterThanOrEqual(6.5);
    expect(rpe).toBeLessThanOrEqual(10);
  });
});

// =============================================================================
// estimateOneRMFromReps
// =============================================================================

describe('estimateOneRMFromReps', () => {
  it('estimates 1RM using Epley formula (RPE 10)', () => {
    // 100kg x 5 reps, RPE 10: 1RM = 100 * (1 + 5/30) = 116.67
    expect(estimateOneRMFromReps(5, 100)).toBeCloseTo(116.67, 1);
  });

  it('estimates 1RM for 1 rep at RPE 10 (equals weight)', () => {
    // 1 rep = 1RM = weight * (1 + 1/30)
    expect(estimateOneRMFromReps(1, 140)).toBeCloseTo(144.67, 1);
  });

  it('adjusts for RPE (reps in reserve)', () => {
    // 100kg x 5 reps at RPE 8 → 2 reps in reserve → effective reps = 7
    // 1RM = 100 * (1 + 7/30) = 123.33
    expect(estimateOneRMFromReps(5, 100, 8)).toBeCloseTo(123.33, 1);
  });

  it('adjusts for RPE 6 with more reps in reserve', () => {
    // 3 reps at 100kg RPE 6 → repsInReserve = 4, effectiveReps = 7
    // 100 * (1 + 7/30) = 123.33
    expect(estimateOneRMFromReps(3, 100, 6)).toBeCloseTo(123.33, 1);
  });

  it('higher RPE yields lower estimated 1RM (harder = closer to max)', () => {
    const oneRmAtRPE10 = estimateOneRMFromReps(5, 100, 10);
    const oneRmAtRPE8 = estimateOneRMFromReps(5, 100, 8);
    // RPE 8 means 2 reps in reserve, so effective reps higher → higher estimate
    expect(oneRmAtRPE8).toBeGreaterThan(oneRmAtRPE10);
  });

  it('throws for invalid weight', () => {
    expect(() => estimateOneRMFromReps(5, 0)).toThrow();
    expect(() => estimateOneRMFromReps(5, -10)).toThrow();
  });

  it('throws for invalid reps', () => {
    expect(() => estimateOneRMFromReps(0, 100)).toThrow();
    expect(() => estimateOneRMFromReps(31, 100)).toThrow();
  });

  it('throws for invalid RPE', () => {
    expect(() => estimateOneRMFromReps(5, 100, 0)).toThrow();
    expect(() => estimateOneRMFromReps(5, 100, 11)).toThrow();
  });
});

// =============================================================================
// syncSetValues
// =============================================================================

describe('syncSetValues', () => {
  it('returns empty result when oneRepMax is missing', () => {
    const result = syncSetValues('weight', { weight: 80 });
    expect(result).toEqual({});
  });

  it('returns empty result when oneRepMax is 0', () => {
    const result = syncSetValues('weight', { weight: 80 }, 0);
    expect(result).toEqual({});
  });

  it('returns empty result when oneRepMax is negative', () => {
    const result = syncSetValues('weight', { weight: 80 }, -10);
    expect(result).toEqual({});
  });

  describe('focus: weight', () => {
    it('calculates intensity and lbs from weight', () => {
      const result = syncSetValues('weight', { weight: 80 }, 100);
      expect(result.intensityPercent).toBe(80);
      expect(result.weightLbs).toBeCloseTo(80 * 2.20462, 0);
    });

    it('calculates RPE when reps are provided', () => {
      const result = syncSetValues('weight', { weight: 81.1 }, 100, 5);
      expect(result.rpe).toBeDefined();
      expect(result.rpe).toBeGreaterThanOrEqual(6.5);
      expect(result.rpe).toBeLessThanOrEqual(10);
    });

    it('skips RPE when reps are not provided', () => {
      const result = syncSetValues('weight', { weight: 80 }, 100);
      expect(result.intensityPercent).toBe(80);
      expect(result.rpe).toBeUndefined();
    });

    it('calculates intensityPercentMax from weightMax', () => {
      const result = syncSetValues('weight', { weight: 70, weightMax: 80 }, 100);
      expect(result.intensityPercent).toBe(70);
      expect(result.intensityPercentMax).toBe(80);
    });
  });

  describe('focus: intensity', () => {
    it('calculates weight from intensity', () => {
      const result = syncSetValues('intensity', { intensityPercent: 80 }, 100);
      expect(result.weight).toBeDefined();
      expect(result.weight).toBeGreaterThan(0);
      expect(result.weightLbs).toBeDefined();
    });

    it('calculates RPE when reps are provided', () => {
      const result = syncSetValues('intensity', { intensityPercent: 80 }, 100, 5);
      expect(result.rpe).toBeDefined();
    });

    it('handles intensity range with max', () => {
      const result = syncSetValues(
        'intensity',
        { intensityPercent: 70, intensityPercentMax: 80 },
        100
      );
      expect(result.weight).toBeDefined();
      expect(result.weightMax).toBeDefined();
      expect(result.weightMax!).toBeGreaterThan(result.weight!);
    });

    it('rounds weight to plate increment', () => {
      const result = syncSetValues('intensity', { intensityPercent: 73 }, 100, 5);
      expect(result.weight! % 2.5).toBe(0);
    });

    it('uses custom weight increment', () => {
      const result = syncSetValues('intensity', { intensityPercent: 73 }, 100, 5, 1.25);
      expect(result.weight! % 1.25).toBe(0);
    });
  });

  describe('focus: rpe', () => {
    it('calculates intensity and weight from RPE', () => {
      const result = syncSetValues('rpe', { rpe: 8 }, 100, 5);
      expect(result.intensityPercent).toBeDefined();
      expect(result.weight).toBeDefined();
      expect(result.weightLbs).toBeDefined();
    });

    it('skips calculation if RPE < 6.5', () => {
      const result = syncSetValues('rpe', { rpe: 5 }, 100, 5);
      expect(result.weight).toBeUndefined();
    });

    it('skips calculation if reps not provided', () => {
      const result = syncSetValues('rpe', { rpe: 8 }, 100);
      expect(result.weight).toBeUndefined();
    });

    it('handles RPE range with max', () => {
      const result = syncSetValues('rpe', { rpe: 7, rpeMax: 9 }, 100, 5);
      expect(result.intensityPercent).toBeDefined();
      expect(result.intensityPercentMax).toBeDefined();
      expect(result.weight).toBeDefined();
      expect(result.weightMax).toBeDefined();
    });
  });
});
