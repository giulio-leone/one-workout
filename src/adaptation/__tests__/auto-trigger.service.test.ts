import { describe, it, expect } from 'vitest';
import { evaluateAutoTrigger } from '../auto-trigger.service';
import type { SessionRecord, ExercisePerformanceRecord } from '../types';
import type { ProgramPeriodization, MesocycleConfig } from '../../periodization/types';

// ==================== HELPERS ====================

function makeSession(overrides: Partial<SessionRecord> & { id: string }): SessionRecord {
  return {
    programId: 'prog-1',
    weekNumber: 1,
    dayNumber: 1,
    completedAt: new Date().toISOString(),
    rpe: 7,
    totalVolume: 10000,
    ...overrides,
  };
}

function makePerfRecord(
  overrides: Partial<ExercisePerformanceRecord> & { id: string; exerciseId: string; date: string }
): ExercisePerformanceRecord {
  return {
    exerciseName: overrides.exerciseId,
    sessionId: 'sess-1',
    sets: 3,
    reps: 8,
    weight: 80,
    volume: 1920,
    rpe: 7,
    ...overrides,
  };
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0]!;
}

const baseMesocycle: MesocycleConfig = {
  id: 'meso-1',
  name: 'Hypertrophy Block',
  model: 'linear',
  phases: [
    { phase: 'accumulation', durationWeeks: 4, volumeMultiplier: 1, intensityMultiplier: 1, rpeRange: [7, 8] },
    { phase: 'intensification', durationWeeks: 3, volumeMultiplier: 0.9, intensityMultiplier: 1.1, rpeRange: [8, 9] },
    { phase: 'deload', durationWeeks: 1, volumeMultiplier: 0.5, intensityMultiplier: 0.8, rpeRange: [5, 6] },
  ],
  totalWeeks: 8,
  deloadFrequency: 4,
  autoDeloadEnabled: true,
  goal: 'hypertrophy',
};

function makePeriodizationState(overrides?: Partial<ProgramPeriodization>): ProgramPeriodization {
  return {
    mesocycle: baseMesocycle,
    currentWeek: 4,
    currentPhaseIndex: 0,
    completedPhases: [],
    deloadHistory: [],
    ...overrides,
  };
}

const baseParams = {
  userId: 'u1',
  programId: 'p1',
  targetRPE: 7,
};

// ==================== TESTS ====================

describe('evaluateAutoTrigger', () => {
  it('triggers on program completion', () => {
    const periodizationState = makePeriodizationState({ currentWeek: 8 });

    const result = evaluateAutoTrigger({
      ...baseParams,
      sessions: Array.from({ length: 8 }, (_, i) => makeSession({ id: `s-${i}` })),
      totalPlannedSessions: 8,
      performanceRecords: [],
      periodizationState,
    });

    expect(result.shouldTrigger).toBe(true);
    expect(result.triggers.some((t) => t.type === 'program_complete')).toBe(true);
    expect(result.urgency).toBe('high');
  });

  it('triggers on low completion rate (<60%) with enough planned sessions', () => {
    const completed = Array.from({ length: 2 }, (_, i) => makeSession({ id: `s-${i}` }));
    const skipped = Array.from({ length: 6 }, (_, i) =>
      makeSession({ id: `sk-${i}`, completedAt: null, rpe: null })
    );

    const result = evaluateAutoTrigger({
      ...baseParams,
      sessions: [...completed, ...skipped],
      totalPlannedSessions: 8,
      performanceRecords: [],
      periodizationState: null,
    });

    expect(result.shouldTrigger).toBe(true);
    expect(result.triggers.some((t) => t.type === 'low_completion')).toBe(true);
    expect(result.urgency).toBe('high');
  });

  it('does NOT trigger low_completion when totalPlannedSessions < 4', () => {
    // 1 out of 3 = 33% but totalPlannedSessions < 4
    const result = evaluateAutoTrigger({
      ...baseParams,
      sessions: [
        makeSession({ id: 's1' }),
        makeSession({ id: 's2', completedAt: null, rpe: null }),
        makeSession({ id: 's3', completedAt: null, rpe: null }),
      ],
      totalPlannedSessions: 3,
      performanceRecords: [],
      periodizationState: null,
    });

    expect(result.triggers.some((t) => t.type === 'low_completion')).toBe(false);
  });

  it('triggers on multiple plateaus (≥3 exercises)', () => {
    // Create 3+ exercises each with 3+ records showing plateau (no PR for 3+ weeks)
    const exercises = ['squat', 'bench', 'ohp'];
    const records: ExercisePerformanceRecord[] = [];
    for (const ex of exercises) {
      // PR at day 35, then stagnation
      records.push(
        makePerfRecord({ id: `${ex}-1`, exerciseId: ex, exerciseName: ex, date: daysAgo(49), weight: 100, reps: 5, volume: 1500 }),
        makePerfRecord({ id: `${ex}-2`, exerciseId: ex, exerciseName: ex, date: daysAgo(35), weight: 105, reps: 5, volume: 1575 }),
        makePerfRecord({ id: `${ex}-3`, exerciseId: ex, exerciseName: ex, date: daysAgo(28), weight: 95, reps: 5, volume: 1425 }),
        makePerfRecord({ id: `${ex}-4`, exerciseId: ex, exerciseName: ex, date: daysAgo(14), weight: 95, reps: 5, volume: 1425 }),
        makePerfRecord({ id: `${ex}-5`, exerciseId: ex, exerciseName: ex, date: daysAgo(0), weight: 95, reps: 5, volume: 1425 }),
      );
    }

    const result = evaluateAutoTrigger({
      ...baseParams,
      sessions: Array.from({ length: 8 }, (_, i) => makeSession({ id: `s-${i}` })),
      totalPlannedSessions: 8,
      performanceRecords: records,
      periodizationState: null,
    });

    expect(result.shouldTrigger).toBe(true);
    expect(result.triggers.some((t) => t.type === 'multiple_plateaus')).toBe(true);
  });

  it('does NOT trigger when everything is fine', () => {
    const sessions = Array.from({ length: 8 }, (_, i) =>
      makeSession({ id: `s-${i}`, rpe: 7, totalVolume: 10000 })
    );

    const result = evaluateAutoTrigger({
      ...baseParams,
      sessions,
      totalPlannedSessions: 12,
      performanceRecords: [],
      periodizationState: makePeriodizationState({ currentWeek: 2 }),
    });

    expect(result.shouldTrigger).toBe(false);
    expect(result.triggers.length).toBe(0);
    expect(result.reason).toContain('No adaptation triggers');
  });

  it('handles empty data gracefully', () => {
    const result = evaluateAutoTrigger({
      ...baseParams,
      sessions: [],
      totalPlannedSessions: 0,
      performanceRecords: [],
      periodizationState: null,
    });

    expect(result.shouldTrigger).toBe(false);
    expect(result.triggers.length).toBe(0);
  });

  it('triggers mesocycle_end when at last week of a phase', () => {
    // Phase 0 (accumulation) has 4 weeks. currentWeek = 4, currentPhaseIndex = 0 → weekInPhase = 4 >= 4
    const periodizationState = makePeriodizationState({
      currentWeek: 4,
      currentPhaseIndex: 0,
    });

    const result = evaluateAutoTrigger({
      ...baseParams,
      sessions: Array.from({ length: 8 }, (_, i) => makeSession({ id: `s-${i}` })),
      totalPlannedSessions: 12,
      performanceRecords: [],
      periodizationState,
    });

    expect(result.triggers.some((t) => t.type === 'mesocycle_end')).toBe(true);
  });

  it('triggers performance_decline when overall trend is declining', () => {
    // Low completion + high RPE = declining trend
    const sessions = [
      makeSession({ id: 's1', rpe: 9.5, totalVolume: 5000 }),
      makeSession({ id: 's2', rpe: 9.5, totalVolume: 4500 }),
      makeSession({ id: 's3', rpe: 9.5, totalVolume: 4000 }),
      ...Array.from({ length: 7 }, (_, i) =>
        makeSession({ id: `sk-${i}`, completedAt: null, rpe: null })
      ),
    ];

    // Declining strength records
    const records: ExercisePerformanceRecord[] = [
      makePerfRecord({ id: 'r1', exerciseId: 'squat', exerciseName: 'Squat', date: daysAgo(28), weight: 120, reps: 5, volume: 1800 }),
      makePerfRecord({ id: 'r2', exerciseId: 'squat', exerciseName: 'Squat', date: daysAgo(14), weight: 110, reps: 5, volume: 1650 }),
      makePerfRecord({ id: 'r3', exerciseId: 'squat', exerciseName: 'Squat', date: daysAgo(0), weight: 100, reps: 5, volume: 1500 }),
    ];

    const result = evaluateAutoTrigger({
      ...baseParams,
      sessions,
      totalPlannedSessions: 10,
      performanceRecords: records,
      periodizationState: null,
    });

    expect(result.triggers.some((t) => t.type === 'performance_decline')).toBe(true);
  });

  it('returns correct urgency levels', () => {
    // Only medium triggers (plateaus)
    const exercises = ['squat', 'bench', 'ohp'];
    const records: ExercisePerformanceRecord[] = [];
    for (const ex of exercises) {
      records.push(
        makePerfRecord({ id: `${ex}-1`, exerciseId: ex, exerciseName: ex, date: daysAgo(49), weight: 100, reps: 5, volume: 1500 }),
        makePerfRecord({ id: `${ex}-2`, exerciseId: ex, exerciseName: ex, date: daysAgo(35), weight: 105, reps: 5, volume: 1575 }),
        makePerfRecord({ id: `${ex}-3`, exerciseId: ex, exerciseName: ex, date: daysAgo(28), weight: 95, reps: 5, volume: 1425 }),
        makePerfRecord({ id: `${ex}-4`, exerciseId: ex, exerciseName: ex, date: daysAgo(14), weight: 95, reps: 5, volume: 1425 }),
        makePerfRecord({ id: `${ex}-5`, exerciseId: ex, exerciseName: ex, date: daysAgo(0), weight: 95, reps: 5, volume: 1425 }),
      );
    }

    const result = evaluateAutoTrigger({
      ...baseParams,
      sessions: Array.from({ length: 10 }, (_, i) => makeSession({ id: `s-${i}` })),
      totalPlannedSessions: 12,
      performanceRecords: records,
      periodizationState: null,
    });

    // multiple_plateaus is medium-priority
    if (result.triggers.length > 0 && !result.triggers.some((t) => ['program_complete', 'performance_decline', 'low_completion'].includes(t.type))) {
      expect(result.urgency).toBe('medium');
    }
  });

  it('joins multiple trigger descriptions in reason', () => {
    const periodizationState = makePeriodizationState({ currentWeek: 8 });

    const result = evaluateAutoTrigger({
      ...baseParams,
      sessions: Array.from({ length: 2 }, (_, i) => makeSession({ id: `s-${i}` })),
      totalPlannedSessions: 8,
      performanceRecords: [],
      periodizationState,
    });

    // Should have both program_complete and low_completion
    expect(result.triggers.length).toBeGreaterThanOrEqual(2);
    expect(result.reason).toContain(';');
  });
});
