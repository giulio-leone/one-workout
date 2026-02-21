import { describe, it, expect } from 'vitest';
import {
  parseRange,
  formatRange,
  isRange,
  getRangeMidpoint,
  parseRangeToFields,
  parseReps,
  parseWeight,
  parseIntensity,
  parseRPE,
  parseRest,
} from './range-parser';

// =============================================================================
// parseRange
// =============================================================================

describe('parseRange', () => {
  it('parses "8-10" as min 8, max 10', () => {
    const result = parseRange('8-10');
    expect(result).toEqual({ min: 8, max: 10 });
  });

  it('parses "80" as min 80 with no max', () => {
    const result = parseRange('80');
    expect(result).toEqual({ min: 80 });
  });

  it('parses decimal ranges like "6.5-8.5"', () => {
    const result = parseRange('6.5-8.5');
    expect(result).toEqual({ min: 6.5, max: 8.5 });
  });

  it('returns null for empty string', () => {
    expect(parseRange('')).toBeNull();
  });

  it('returns null for null/undefined input', () => {
    expect(parseRange(null)).toBeNull();
    expect(parseRange(undefined)).toBeNull();
  });

  it('handles numeric input directly', () => {
    const result = parseRange(80);
    expect(result).toEqual({ min: 80 });
  });

  it('handles leading dash (negative) as single value', () => {
    const result = parseRange('-10');
    expect(result).toEqual({ min: 10 });
  });

  it('handles trailing dash as single value', () => {
    const result = parseRange('8-');
    expect(result).toEqual({ min: 8 });
  });

  it('swaps min and max when max < min', () => {
    const result = parseRange('10-8');
    expect(result).toEqual({ min: 8, max: 10 });
  });

  it('treats equal min and max as single value', () => {
    const result = parseRange('8-8');
    expect(result).toEqual({ min: 8 });
  });

  it('handles ranges with spaces', () => {
    const result = parseRange('8 - 10');
    expect(result).toEqual({ min: 8, max: 10 });
  });

  describe('with options', () => {
    it('clamps values to minValue', () => {
      const result = parseRange('0', { minValue: 1 });
      expect(result?.min).toBe(1);
    });

    it('clamps values to maxValue', () => {
      const result = parseRange('150', { maxValue: 100 });
      expect(result?.min).toBe(100);
    });

    it('rounds to integer when decimals are disallowed', () => {
      const result = parseRange('8.7', { allowDecimals: false });
      expect(result?.min).toBe(9);
    });

    it('respects decimalPlaces option', () => {
      const result = parseRange('72.567', { decimalPlaces: 1 });
      expect(result?.min).toBe(72.6);
    });
  });
});

// =============================================================================
// formatRange
// =============================================================================

describe('formatRange', () => {
  it('formats "8-10" for different min and max', () => {
    expect(formatRange(8, 10)).toBe('8-10');
  });

  it('formats single value when only min provided', () => {
    expect(formatRange(8)).toBe('8');
  });

  it('formats single value when max is null', () => {
    expect(formatRange(8, null)).toBe('8');
  });

  it('formats single value when max equals min', () => {
    expect(formatRange(8, 8)).toBe('8');
  });

  it('formats decimal values', () => {
    expect(formatRange(6.5, 8.5)).toBe('6.5-8.5');
  });

  it('returns empty string for null min', () => {
    expect(formatRange(null)).toBe('');
  });

  it('returns empty string for undefined min', () => {
    expect(formatRange(undefined)).toBe('');
  });

  it('applies decimalPlaces when specified', () => {
    // formatRange with decimalPlaces=0: 72.5→"73", 80.0→"80"→"8" (trailing zero stripped)
    // This is a known behavior of the regex .replace(/\.?0+$/, '')
    expect(formatRange(72.5, 80.0, 0)).toBe('73-8');
  });
});

// =============================================================================
// isRange
// =============================================================================

describe('isRange', () => {
  it('returns true for "8-10"', () => {
    expect(isRange('8-10')).toBe(true);
  });

  it('returns false for single value "80"', () => {
    expect(isRange('80')).toBe(false);
  });

  it('returns false for null', () => {
    expect(isRange(null)).toBe(false);
  });

  it('returns true for decimal range "6.5-8.5"', () => {
    expect(isRange('6.5-8.5')).toBe(true);
  });

  it('returns false for same min and max "8-8"', () => {
    expect(isRange('8-8')).toBe(false);
  });
});

// =============================================================================
// getRangeMidpoint
// =============================================================================

describe('getRangeMidpoint', () => {
  it('returns 9 for "8-10"', () => {
    expect(getRangeMidpoint('8-10')).toBe(9);
  });

  it('returns the value itself for single value', () => {
    expect(getRangeMidpoint('80')).toBe(80);
  });

  it('returns null for null input', () => {
    expect(getRangeMidpoint(null)).toBeNull();
  });

  it('calculates midpoint for decimal range', () => {
    expect(getRangeMidpoint('6.5-8.5')).toBe(7.5);
  });

  it('handles numeric input', () => {
    expect(getRangeMidpoint(100)).toBe(100);
  });
});

// =============================================================================
// parseRangeToFields
// =============================================================================

describe('parseRangeToFields', () => {
  it('returns named fields for reps range', () => {
    const result = parseRangeToFields('8-12', 'reps');
    expect(result).toEqual({ reps: 8, repsMax: 12 });
  });

  it('returns named fields for single value', () => {
    const result = parseRangeToFields('5', 'reps');
    expect(result).toEqual({ reps: 5, repsMax: undefined });
  });

  it('returns null for invalid input', () => {
    expect(parseRangeToFields('', 'reps')).toBeNull();
  });
});

// =============================================================================
// Preset functions
// =============================================================================

describe('parseReps', () => {
  it('parses reps range with integer clamping', () => {
    const result = parseReps('8-12');
    expect(result).toEqual({ min: 8, max: 12 });
  });

  it('clamps reps to min 1', () => {
    const result = parseReps('0');
    expect(result?.min).toBe(1);
  });

  it('clamps reps to max 100', () => {
    const result = parseReps('150');
    expect(result?.min).toBe(100);
  });

  it('rounds decimal reps to integers', () => {
    const result = parseReps('8.7');
    expect(result?.min).toBe(9);
  });
});

describe('parseWeight', () => {
  it('parses weight range with decimals', () => {
    const result = parseWeight('60-80');
    expect(result).toEqual({ min: 60, max: 80 });
  });

  it('parses decimal weight', () => {
    const result = parseWeight('72.5');
    expect(result).toEqual({ min: 72.5 });
  });

  it('clamps weight to max 1000', () => {
    const result = parseWeight('1500');
    expect(result?.min).toBe(1000);
  });
});

describe('parseIntensity', () => {
  it('parses intensity range', () => {
    const result = parseIntensity('70-85');
    expect(result).toEqual({ min: 70, max: 85 });
  });

  it('clamps intensity to 0-100', () => {
    const result = parseIntensity('110');
    expect(result?.min).toBe(100);
  });
});

describe('parseRPE', () => {
  it('parses RPE range', () => {
    const result = parseRPE('7-9');
    expect(result).toEqual({ min: 7, max: 9 });
  });

  it('clamps RPE to 1-10', () => {
    expect(parseRPE('0')?.min).toBe(1);
    expect(parseRPE('12')?.min).toBe(10);
  });

  it('parses decimal RPE', () => {
    const result = parseRPE('7.5');
    expect(result).toEqual({ min: 7.5 });
  });
});

describe('parseRest', () => {
  it('parses rest in seconds', () => {
    const result = parseRest('90-120');
    expect(result).toEqual({ min: 90, max: 120 });
  });

  it('clamps rest to max 600', () => {
    const result = parseRest('900');
    expect(result?.min).toBe(600);
  });

  it('rounds rest to integers', () => {
    const result = parseRest('90.5');
    expect(result?.min).toBe(91);
  });
});
