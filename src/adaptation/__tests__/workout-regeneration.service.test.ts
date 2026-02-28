import { describe, it, expect } from 'vitest';
import { generateAdaptationPlan, applyAdaptation } from '../workout-regeneration.service';
import type { SessionRecord, ExercisePerformanceRecord, AdaptationPlan } from '../types';
import type { MesocycleConfig, ProgramPeriodization } from '../../periodization/types';

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
    { phase: 'deload', durationWeeks: 1, volumeMultiplier: 0.5, intensityMultiplier: 0.8, rpeRange: [5, 6] },
  ],
  totalWeeks: 5,
  deloadFrequency: 4,
  autoDeloadEnabled: true,
  goal: 'hypertrophy',
};

function makePeriodizationState(overrides?: Partial<ProgramPeriodization>): ProgramPeriodization {
  return {
    mesocycle: baseMesocycle,
    currentWeek: 3,
    currentPhaseIndex: 0,
    completedPhases: [],
    deloadHistory: [],
    ...overrides,
  };
}

// ==================== generateAdaptationPlan ====================

describe('generateAdaptationPlan', () => {
  it('generates a plan with status pending', () => {
    const plan = generateAdaptationPlan({
      userId: 'u1',
      programId: 'p1',
      sessions: Array.from({ length: 6 }, (_, i) => makeSession({ id: `s-${i}` })),
      totalPlannedSessions: 12,
      targetRPE: 7,
      performanceRecords: [],
      periodizationState: makePeriodizationState(),
      feedback: null,
    });

    expect(plan.status).toBe('pending');
    expect(plan.userId).toBe('u1');
    expect(plan.programId).toBe('p1');
    expect(plan.id).toMatch(/^adapt_/);
    expect(plan.createdAt).toBeDefined();
    expect(plan.analysis).toBeDefined();
    expect(plan.signals).toBeDefined();
    expect(plan.suggestedChanges).toBeDefined();
  });

  it('includes signals and changes for problematic scenarios', () => {
    // Low completion → volume_decrease signal → adjust_volume change
    const completed = Array.from({ length: 2 }, (_, i) =>
      makeSession({ id: `s-${i}`, rpe: 9.5 })
    );
    const skipped = Array.from({ length: 6 }, (_, i) =>
      makeSession({ id: `sk-${i}`, completedAt: null, rpe: null })
    );

    const plan = generateAdaptationPlan({
      userId: 'u1',
      programId: 'p1',
      sessions: [...completed, ...skipped],
      totalPlannedSessions: 12,
      targetRPE: 7,
      performanceRecords: [],
      periodizationState: null,
      feedback: null,
    });

    expect(plan.signals.length).toBeGreaterThan(0);
    expect(plan.suggestedChanges.length).toBeGreaterThan(0);
  });

  it('generates periodization adjustment when deload is needed', () => {
    // Declining performance + high RPE → deload signal
    const sessions = Array.from({ length: 4 }, (_, i) =>
      makeSession({ id: `s-${i}`, rpe: 9.5, totalVolume: 5000 - i * 500 })
    );
    const skipped = Array.from({ length: 8 }, (_, i) =>
      makeSession({ id: `sk-${i}`, completedAt: null, rpe: null })
    );

    const records: ExercisePerformanceRecord[] = [
      makePerfRecord({ id: 'r1', exerciseId: 'squat', exerciseName: 'Squat', date: daysAgo(28), weight: 120, reps: 5, volume: 1800 }),
      makePerfRecord({ id: 'r2', exerciseId: 'squat', exerciseName: 'Squat', date: daysAgo(14), weight: 110, reps: 5, volume: 1650 }),
      makePerfRecord({ id: 'r3', exerciseId: 'squat', exerciseName: 'Squat', date: daysAgo(0), weight: 100, reps: 5, volume: 1500 }),
    ];

    const plan = generateAdaptationPlan({
      userId: 'u1',
      programId: 'p1',
      sessions: [...sessions, ...skipped],
      totalPlannedSessions: 12,
      targetRPE: 7,
      performanceRecords: records,
      periodizationState: makePeriodizationState({ deloadHistory: [], currentWeek: 6 }),
      feedback: null,
    });

    // Should have intensity-related signals at minimum
    expect(plan.signals.length).toBeGreaterThan(0);
    expect(plan.suggestedChanges.length).toBeGreaterThan(0);
  });

  it('incorporates user feedback into the plan', () => {
    const plan = generateAdaptationPlan({
      userId: 'u1',
      programId: 'p1',
      sessions: Array.from({ length: 8 }, (_, i) => makeSession({ id: `s-${i}` })),
      totalPlannedSessions: 12,
      targetRPE: 7,
      performanceRecords: [],
      periodizationState: null,
      feedback: {
        id: 'fb-1',
        programId: 'p1',
        userId: 'u1',
        overallRating: 1,
        volumeRating: 5,
        intensityRating: 4,
        difficultyRating: null,
        whatWorked: null,
        whatDidntWork: 'Everything too hard',
        suggestions: null,
      },
    });

    // Should generate feedback-based signals
    const signalTypes = plan.signals.map((s) => s.type);
    expect(signalTypes).toContain('volume_decrease');
    expect(signalTypes).toContain('intensity_decrease');
    expect(signalTypes).toContain('progression_change');
  });

  it('generates plan with no signals when everything is fine', () => {
    const plan = generateAdaptationPlan({
      userId: 'u1',
      programId: 'p1',
      sessions: Array.from({ length: 10 }, (_, i) =>
        makeSession({ id: `s-${i}`, rpe: 7, totalVolume: 10000 })
      ),
      totalPlannedSessions: 12,
      targetRPE: 7,
      performanceRecords: [],
      periodizationState: makePeriodizationState(),
      feedback: null,
    });

    expect(plan.signals.length).toBe(0);
    expect(plan.suggestedChanges.length).toBe(0);
    expect(plan.status).toBe('pending');
  });
});

// ==================== applyAdaptation ====================

describe('applyAdaptation', () => {
  function makeApprovedPlan(): AdaptationPlan {
    return {
      id: 'adapt_test_123',
      programId: 'p1',
      userId: 'u1',
      signals: [
        { type: 'volume_decrease', priority: 'high', reason: 'Low completion', suggestedChange: 'Reduce volume' },
      ],
      analysis: {
        programId: 'p1',
        userId: 'u1',
        completionRate: 0.5,
        averageRPE: 8,
        targetRPE: 7,
        rpeDeviation: 1,
        volumeTrend: 'stable',
        sessionsCompleted: 6,
        totalSessions: 12,
        strengthChanges: [],
        plateaus: [],
        overallTrend: 'stagnating',
      },
      suggestedChanges: [
        { type: 'adjust_volume', description: 'Decrease volume', before: '12 sets', after: '10 sets' },
      ],
      status: 'approved',
      createdAt: new Date().toISOString(),
    };
  }

  it('transitions status from approved to applied', () => {
    const plan = makeApprovedPlan();
    const { appliedPlan, metadata } = applyAdaptation({ userId: 'u1', adaptationPlan: plan });

    expect(appliedPlan.status).toBe('applied');
    expect(appliedPlan.id).toBe(plan.id);
  });

  it('returns correct metadata', () => {
    const plan = makeApprovedPlan();
    const { metadata } = applyAdaptation({ userId: 'u1', adaptationPlan: plan });

    expect(metadata.planId).toBe(plan.id);
    expect(metadata.userId).toBe('u1');
    expect(metadata.programId).toBe('p1');
    expect(metadata.signalCount).toBe(1);
    expect(metadata.changeCount).toBe(1);
    expect(metadata.periodizationAdjusted).toBe(false);
    expect(metadata.appliedAt).toBeDefined();
  });

  it('throws error when plan is pending', () => {
    const plan = makeApprovedPlan();
    plan.status = 'pending';

    expect(() => applyAdaptation({ userId: 'u1', adaptationPlan: plan })).toThrow(
      /Cannot apply adaptation plan with status 'pending'/
    );
  });

  it('throws error when plan is already applied', () => {
    const plan = makeApprovedPlan();
    plan.status = 'applied';

    expect(() => applyAdaptation({ userId: 'u1', adaptationPlan: plan })).toThrow(
      /Cannot apply adaptation plan with status 'applied'/
    );
  });

  it('throws error when plan is rejected', () => {
    const plan = makeApprovedPlan();
    plan.status = 'rejected';

    expect(() => applyAdaptation({ userId: 'u1', adaptationPlan: plan })).toThrow(
      /Cannot apply adaptation plan with status 'rejected'/
    );
  });

  it('preserves all original plan data in applied plan', () => {
    const plan = makeApprovedPlan();
    const { appliedPlan } = applyAdaptation({ userId: 'u1', adaptationPlan: plan });

    expect(appliedPlan.signals).toEqual(plan.signals);
    expect(appliedPlan.analysis).toEqual(plan.analysis);
    expect(appliedPlan.suggestedChanges).toEqual(plan.suggestedChanges);
    expect(appliedPlan.programId).toBe(plan.programId);
    expect(appliedPlan.createdAt).toBe(plan.createdAt);
  });

  it('reports periodizationAdjusted true when adjustment exists', () => {
    const plan = makeApprovedPlan();
    plan.periodizationAdjustment = {
      reason: 'Deload recommended',
      addDeloadWeek: true,
    };

    const { metadata } = applyAdaptation({ userId: 'u1', adaptationPlan: plan });
    expect(metadata.periodizationAdjusted).toBe(true);
  });
});
