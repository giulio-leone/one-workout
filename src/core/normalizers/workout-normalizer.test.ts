import { describe, it, expect } from 'vitest';
import {
  normalizeDifficulty,
  normalizeStatus,
  normalizeDay,
  normalizeWeek,
} from './workout-normalizer';

// =============================================================================
// normalizeDifficulty
// =============================================================================

describe('normalizeDifficulty', () => {
  it('returns BEGINNER for "BEGINNER"', () => {
    expect(normalizeDifficulty('BEGINNER')).toBe('BEGINNER');
  });

  it('returns INTERMEDIATE for "INTERMEDIATE"', () => {
    expect(normalizeDifficulty('INTERMEDIATE')).toBe('INTERMEDIATE');
  });

  it('returns ADVANCED for "ADVANCED"', () => {
    expect(normalizeDifficulty('ADVANCED')).toBe('ADVANCED');
  });

  it('normalizes lowercase to uppercase', () => {
    expect(normalizeDifficulty('beginner')).toBe('BEGINNER');
    expect(normalizeDifficulty('intermediate')).toBe('INTERMEDIATE');
    expect(normalizeDifficulty('advanced')).toBe('ADVANCED');
  });

  it('handles mixed case', () => {
    expect(normalizeDifficulty('Beginner')).toBe('BEGINNER');
    expect(normalizeDifficulty('Advanced')).toBe('ADVANCED');
  });

  it('defaults to BEGINNER for unknown values', () => {
    expect(normalizeDifficulty('unknown')).toBe('BEGINNER');
    expect(normalizeDifficulty('expert')).toBe('BEGINNER');
  });

  it('defaults to BEGINNER for non-string values', () => {
    expect(normalizeDifficulty(null)).toBe('BEGINNER');
    expect(normalizeDifficulty(undefined)).toBe('BEGINNER');
    expect(normalizeDifficulty(42)).toBe('BEGINNER');
  });

  it('trims whitespace', () => {
    expect(normalizeDifficulty('  ADVANCED  ')).toBe('ADVANCED');
  });
});

// =============================================================================
// normalizeStatus
// =============================================================================

describe('normalizeStatus', () => {
  it('returns ACTIVE for "ACTIVE"', () => {
    expect(normalizeStatus('ACTIVE')).toBe('ACTIVE');
  });

  it('returns DRAFT for "DRAFT"', () => {
    expect(normalizeStatus('DRAFT')).toBe('DRAFT');
  });

  it('returns COMPLETED for "COMPLETED"', () => {
    expect(normalizeStatus('COMPLETED')).toBe('COMPLETED');
  });

  it('returns ARCHIVED for "ARCHIVED"', () => {
    expect(normalizeStatus('ARCHIVED')).toBe('ARCHIVED');
  });

  it('normalizes lowercase to uppercase', () => {
    expect(normalizeStatus('active')).toBe('ACTIVE');
    expect(normalizeStatus('draft')).toBe('DRAFT');
  });

  it('defaults to DRAFT for unknown values', () => {
    expect(normalizeStatus('unknown')).toBe('DRAFT');
    expect(normalizeStatus('pending')).toBe('DRAFT');
  });

  it('defaults to DRAFT for non-string values', () => {
    expect(normalizeStatus(null)).toBe('DRAFT');
    expect(normalizeStatus(undefined)).toBe('DRAFT');
    expect(normalizeStatus(123)).toBe('DRAFT');
  });
});

// =============================================================================
// normalizeDay
// =============================================================================

describe('normalizeDay', () => {
  it('normalizes a raw day object with index fallback', () => {
    const result = normalizeDay({}, 0);

    expect(result.dayNumber).toBe(1);
    expect(result.dayName).toContain('1');
    expect(result.exercises).toEqual([]);
    expect(result.notes).toBe('');
    expect(result.targetMuscles).toEqual([]);
  });

  it('uses provided dayNumber over index', () => {
    const result = normalizeDay({ dayNumber: 3 }, 0);
    expect(result.dayNumber).toBe(3);
  });

  it('preserves dayName from input', () => {
    const result = normalizeDay({ dayName: 'Push Day' }, 0);
    expect(result.dayName).toBe('Push Day');
  });

  it('uses "name" field as fallback for dayName', () => {
    const result = normalizeDay({ name: 'Upper Body' }, 0);
    expect(result.dayName).toBe('Upper Body');
    expect(result.name).toBe('Upper Body');
  });

  it('preserves notes', () => {
    const result = normalizeDay({ notes: 'Focus on compound movements' }, 0);
    expect(result.notes).toBe('Focus on compound movements');
  });

  it('handles totalDuration', () => {
    const result = normalizeDay({ totalDuration: 60 }, 0);
    expect(result.totalDuration).toBe(60);
  });

  it('falls back to estimatedDurationMinutes for totalDuration', () => {
    const result = normalizeDay({ estimatedDurationMinutes: 45 }, 0);
    expect(result.totalDuration).toBe(45);
  });

  it('handles targetMuscles array', () => {
    const result = normalizeDay({ targetMuscles: ['chest', 'triceps'] }, 0);
    expect(result.targetMuscles).toEqual(['chest', 'triceps']);
  });

  it('deduplicates targetMuscles', () => {
    const result = normalizeDay({ targetMuscles: ['chest', 'chest', 'back'] }, 0);
    expect(result.targetMuscles).toEqual(['chest', 'back']);
  });

  it('handles non-object input gracefully', () => {
    const result = normalizeDay(null, 2);
    expect(result.dayNumber).toBe(3); // index 2 → dayNumber 3
    expect(result.exercises).toEqual([]);
  });
});

// =============================================================================
// normalizeWeek
// =============================================================================

describe('normalizeWeek', () => {
  it('normalizes an empty week with index fallback', () => {
    const result = normalizeWeek({}, 0);

    expect(result.weekNumber).toBe(1);
    expect(result.days).toHaveLength(1); // Default day
    expect(result.days[0]!.dayNumber).toBe(1);
  });

  it('uses provided weekNumber over index', () => {
    const result = normalizeWeek({ weekNumber: 4 }, 0);
    expect(result.weekNumber).toBe(4);
  });

  it('normalizes days array', () => {
    const raw = {
      weekNumber: 1,
      days: [
        { dayName: 'Push Day', dayNumber: 1 },
        { dayName: 'Pull Day', dayNumber: 2 },
        { dayName: 'Legs Day', dayNumber: 3 },
      ],
    };

    const result = normalizeWeek(raw, 0);
    expect(result.days).toHaveLength(3);
    expect(result.days[0]!.dayName).toBe('Push Day');
    expect(result.days[1]!.dayName).toBe('Pull Day');
    expect(result.days[2]!.dayName).toBe('Legs Day');
  });

  it('falls back to "workouts" key for days', () => {
    const raw = {
      workouts: [{ dayName: 'Full Body A' }, { dayName: 'Full Body B' }],
    };

    const result = normalizeWeek(raw, 0);
    expect(result.days).toHaveLength(2);
    expect(result.days[0]!.dayName).toBe('Full Body A');
  });

  it('falls back to "sessions" key for days', () => {
    const raw = {
      sessions: [{ dayName: 'Session 1' }],
    };

    const result = normalizeWeek(raw, 0);
    expect(result.days).toHaveLength(1);
    expect(result.days[0]!.dayName).toBe('Session 1');
  });

  it('preserves notes', () => {
    const result = normalizeWeek({ notes: 'Deload week' }, 0);
    expect(result.notes).toBe('Deload week');
  });

  it('preserves focus from "focus" key', () => {
    const result = normalizeWeek({ focus: 'Hypertrophy' }, 0);
    expect(result.focus).toBe('Hypertrophy');
  });

  it('uses "theme" as fallback for focus', () => {
    const result = normalizeWeek({ theme: 'Strength' }, 0);
    expect(result.focus).toBe('Strength');
  });

  it('creates default day when days array is empty', () => {
    const result = normalizeWeek({ days: [] }, 0);
    expect(result.days).toHaveLength(1);
    expect(result.days[0]!.dayNumber).toBe(1);
  });

  it('handles non-object input gracefully', () => {
    const result = normalizeWeek(null, 3);
    expect(result.weekNumber).toBe(4); // index 3 → weekNumber 4
    expect(result.days).toHaveLength(1);
  });
});
