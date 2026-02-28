import { describe, it, expect } from 'vitest';
import {
  analyzeWorkoutPerformance,
  analyzeStrengthProgress,
  detectPlateaus,
  generateAdaptationSignals,
} from '../performance-analysis.service';
import type {
  SessionRecord,
  ExercisePerformanceRecord,
  WorkoutPerformanceAnalysis,
  FeedbackSummary,
} from '../types';

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

// ==================== analyzeWorkoutPerformance ====================

describe('analyzeWorkoutPerformance', () => {
  it('returns correct metrics for 100% completion', () => {
    const sessions: SessionRecord[] = Array.from({ length: 12 }, (_, i) =>
      makeSession({ id: `s-${i}`, weekNumber: Math.floor(i / 3) + 1, dayNumber: (i % 3) + 1, rpe: 7, totalVolume: 10000 })
    );

    const result = analyzeWorkoutPerformance({
      userId: 'u1',
      programId: 'p1',
      sessions,
      totalPlannedSessions: 12,
      targetRPE: 7,
      performanceRecords: [],
    });

    expect(result.completionRate).toBe(1);
    expect(result.sessionsCompleted).toBe(12);
    expect(result.totalSessions).toBe(12);
    expect(result.averageRPE).toBe(7);
    expect(result.rpeDeviation).toBeCloseTo(0);
    expect(result.userId).toBe('u1');
    expect(result.programId).toBe('p1');
  });

  it('returns correct metrics for 50% completion', () => {
    const completed = Array.from({ length: 6 }, (_, i) =>
      makeSession({ id: `s-${i}`, rpe: 8, totalVolume: 9000 })
    );
    const skipped = Array.from({ length: 6 }, (_, i) =>
      makeSession({ id: `sk-${i}`, completedAt: null, rpe: null, totalVolume: null })
    );

    const result = analyzeWorkoutPerformance({
      userId: 'u1',
      programId: 'p1',
      sessions: [...completed, ...skipped],
      totalPlannedSessions: 12,
      targetRPE: 7,
      performanceRecords: [],
    });

    expect(result.completionRate).toBe(0.5);
    expect(result.sessionsCompleted).toBe(6);
    expect(result.averageRPE).toBe(8);
    expect(result.rpeDeviation).toBeCloseTo(1);
  });

  it('handles no sessions gracefully', () => {
    const result = analyzeWorkoutPerformance({
      userId: 'u1',
      programId: 'p1',
      sessions: [],
      totalPlannedSessions: 12,
      targetRPE: 7,
      performanceRecords: [],
    });

    expect(result.completionRate).toBe(0);
    expect(result.sessionsCompleted).toBe(0);
    expect(result.averageRPE).toBe(0);
    expect(result.strengthChanges).toEqual([]);
    expect(result.plateaus).toEqual([]);
  });

  it('handles zero planned sessions', () => {
    const result = analyzeWorkoutPerformance({
      userId: 'u1',
      programId: 'p1',
      sessions: [],
      totalPlannedSessions: 0,
      targetRPE: 7,
      performanceRecords: [],
    });

    expect(result.completionRate).toBe(0);
  });

  it('computes strength changes from performance records', () => {
    const records: ExercisePerformanceRecord[] = [
      makePerfRecord({ id: 'r1', exerciseId: 'squat', exerciseName: 'Squat', date: daysAgo(28), weight: 100, reps: 5, volume: 1500 }),
      makePerfRecord({ id: 'r2', exerciseId: 'squat', exerciseName: 'Squat', date: daysAgo(14), weight: 105, reps: 5, volume: 1575 }),
      makePerfRecord({ id: 'r3', exerciseId: 'squat', exerciseName: 'Squat', date: daysAgo(0), weight: 110, reps: 5, volume: 1650 }),
    ];

    const result = analyzeWorkoutPerformance({
      userId: 'u1',
      programId: 'p1',
      sessions: [makeSession({ id: 's1' })],
      totalPlannedSessions: 1,
      targetRPE: 7,
      performanceRecords: records,
    });

    expect(result.strengthChanges.length).toBe(1);
    expect(result.strengthChanges[0]!.exerciseId).toBe('squat');
    expect(result.strengthChanges[0]!.trend).toBe('improving');
    expect(result.strengthChanges[0]!.changePercent).toBeGreaterThan(0);
  });

  it('derives declining overall trend correctly', () => {
    // Low completion + high RPE deviation + declining strength
    const sessions = [
      makeSession({ id: 's1', rpe: 9.5, totalVolume: 5000 }),
      makeSession({ id: 's2', rpe: 9, totalVolume: 4500 }),
      makeSession({ id: 's3', completedAt: null, rpe: null }),
    ];

    const records: ExercisePerformanceRecord[] = [
      makePerfRecord({ id: 'r1', exerciseId: 'bench', exerciseName: 'Bench', date: daysAgo(28), weight: 100, reps: 5, volume: 1500 }),
      makePerfRecord({ id: 'r2', exerciseId: 'bench', exerciseName: 'Bench', date: daysAgo(14), weight: 95, reps: 5, volume: 1425 }),
      makePerfRecord({ id: 'r3', exerciseId: 'bench', exerciseName: 'Bench', date: daysAgo(0), weight: 90, reps: 5, volume: 1350 }),
    ];

    const result = analyzeWorkoutPerformance({
      userId: 'u1',
      programId: 'p1',
      sessions,
      totalPlannedSessions: 10,
      targetRPE: 7,
      performanceRecords: records,
    });

    expect(result.overallTrend).toBe('declining');
  });
});

// ==================== analyzeStrengthProgress ====================

describe('analyzeStrengthProgress', () => {
  it('detects improving trends', () => {
    const records: ExercisePerformanceRecord[] = [
      makePerfRecord({ id: 'r1', exerciseId: 'squat', exerciseName: 'Squat', date: daysAgo(28), weight: 100, reps: 5, volume: 1500 }),
      makePerfRecord({ id: 'r2', exerciseId: 'squat', exerciseName: 'Squat', date: daysAgo(14), weight: 110, reps: 5, volume: 1650 }),
      makePerfRecord({ id: 'r3', exerciseId: 'squat', exerciseName: 'Squat', date: daysAgo(0), weight: 120, reps: 5, volume: 1800 }),
    ];

    const result = analyzeStrengthProgress(records);

    expect(result.exerciseTrends.length).toBe(1);
    expect(result.exerciseTrends[0]!.changePercent).toBeGreaterThan(2);
    expect(result.overallTrend).toBe('improving');
  });

  it('detects stable trends', () => {
    const records: ExercisePerformanceRecord[] = [
      makePerfRecord({ id: 'r1', exerciseId: 'curl', exerciseName: 'Curl', date: daysAgo(28), weight: 20, reps: 10, volume: 600 }),
      makePerfRecord({ id: 'r2', exerciseId: 'curl', exerciseName: 'Curl', date: daysAgo(14), weight: 20, reps: 10, volume: 600 }),
      makePerfRecord({ id: 'r3', exerciseId: 'curl', exerciseName: 'Curl', date: daysAgo(0), weight: 20, reps: 10, volume: 600 }),
    ];

    const result = analyzeStrengthProgress(records);

    expect(result.exerciseTrends.length).toBe(1);
    expect(result.exerciseTrends[0]!.changePercent).toBeCloseTo(0);
    expect(result.overallTrend).toBe('stable');
  });

  it('detects declining trends', () => {
    const records: ExercisePerformanceRecord[] = [
      makePerfRecord({ id: 'r1', exerciseId: 'deadlift', exerciseName: 'Deadlift', date: daysAgo(28), weight: 150, reps: 5, volume: 2250 }),
      makePerfRecord({ id: 'r2', exerciseId: 'deadlift', exerciseName: 'Deadlift', date: daysAgo(14), weight: 140, reps: 5, volume: 2100 }),
      makePerfRecord({ id: 'r3', exerciseId: 'deadlift', exerciseName: 'Deadlift', date: daysAgo(0), weight: 130, reps: 5, volume: 1950 }),
    ];

    const result = analyzeStrengthProgress(records);

    expect(result.exerciseTrends.length).toBe(1);
    expect(result.exerciseTrends[0]!.changePercent).toBeLessThan(-2);
    expect(result.overallTrend).toBe('declining');
  });

  it('skips exercises with fewer than 2 records', () => {
    const records: ExercisePerformanceRecord[] = [
      makePerfRecord({ id: 'r1', exerciseId: 'ohp', exerciseName: 'OHP', date: daysAgo(7), weight: 60, reps: 5, volume: 900 }),
    ];

    const result = analyzeStrengthProgress(records);
    expect(result.exerciseTrends.length).toBe(0);
    expect(result.overallTrend).toBe('stable');
  });

  it('handles multiple exercises with mixed trends', () => {
    const records: ExercisePerformanceRecord[] = [
      // Improving squat
      makePerfRecord({ id: 'r1', exerciseId: 'squat', exerciseName: 'Squat', date: daysAgo(28), weight: 100, reps: 5, volume: 1500 }),
      makePerfRecord({ id: 'r2', exerciseId: 'squat', exerciseName: 'Squat', date: daysAgo(0), weight: 115, reps: 5, volume: 1725 }),
      // Declining bench
      makePerfRecord({ id: 'r3', exerciseId: 'bench', exerciseName: 'Bench', date: daysAgo(28), weight: 100, reps: 5, volume: 1500 }),
      makePerfRecord({ id: 'r4', exerciseId: 'bench', exerciseName: 'Bench', date: daysAgo(0), weight: 85, reps: 5, volume: 1275 }),
      // Stable deadlift
      makePerfRecord({ id: 'r5', exerciseId: 'dl', exerciseName: 'Deadlift', date: daysAgo(28), weight: 140, reps: 5, volume: 2100 }),
      makePerfRecord({ id: 'r6', exerciseId: 'dl', exerciseName: 'Deadlift', date: daysAgo(0), weight: 141, reps: 5, volume: 2115 }),
    ];

    const result = analyzeStrengthProgress(records);
    expect(result.exerciseTrends.length).toBe(3);
    // With 1 improving, 1 declining, 1 stable — no majority → stable
    expect(result.overallTrend).toBe('stable');
  });

  it('returns empty trends for empty records', () => {
    const result = analyzeStrengthProgress([]);
    expect(result.exerciseTrends).toEqual([]);
    expect(result.overallTrend).toBe('stable');
  });
});

// ==================== detectPlateaus ====================

describe('detectPlateaus', () => {
  it('detects plateau when no PR for 3+ weeks', () => {
    // PR set at day 28, then stagnation for 21+ days
    const records: ExercisePerformanceRecord[] = [
      makePerfRecord({ id: 'r1', exerciseId: 'squat', exerciseName: 'Squat', date: daysAgo(42), weight: 100, reps: 5, volume: 1500 }),
      makePerfRecord({ id: 'r2', exerciseId: 'squat', exerciseName: 'Squat', date: daysAgo(35), weight: 105, reps: 5, volume: 1575 }),
      makePerfRecord({ id: 'r3', exerciseId: 'squat', exerciseName: 'Squat', date: daysAgo(28), weight: 95, reps: 5, volume: 1425 }),
      makePerfRecord({ id: 'r4', exerciseId: 'squat', exerciseName: 'Squat', date: daysAgo(21), weight: 95, reps: 5, volume: 1425 }),
      makePerfRecord({ id: 'r5', exerciseId: 'squat', exerciseName: 'Squat', date: daysAgo(14), weight: 95, reps: 5, volume: 1425 }),
      makePerfRecord({ id: 'r6', exerciseId: 'squat', exerciseName: 'Squat', date: daysAgo(0), weight: 95, reps: 5, volume: 1425 }),
    ];

    const plateaus = detectPlateaus(records);

    expect(plateaus.length).toBe(1);
    expect(plateaus[0]!.exerciseId).toBe('squat');
    expect(plateaus[0]!.plateauWeeks).toBeGreaterThanOrEqual(3);
    expect(plateaus[0]!.suggestion).toContain('Squat');
  });

  it('returns no plateau for improving exercises', () => {
    const records: ExercisePerformanceRecord[] = [
      makePerfRecord({ id: 'r1', exerciseId: 'bench', exerciseName: 'Bench', date: daysAgo(28), weight: 80, reps: 8, volume: 1920 }),
      makePerfRecord({ id: 'r2', exerciseId: 'bench', exerciseName: 'Bench', date: daysAgo(21), weight: 82.5, reps: 8, volume: 1980 }),
      makePerfRecord({ id: 'r3', exerciseId: 'bench', exerciseName: 'Bench', date: daysAgo(14), weight: 85, reps: 8, volume: 2040 }),
      makePerfRecord({ id: 'r4', exerciseId: 'bench', exerciseName: 'Bench', date: daysAgo(7), weight: 87.5, reps: 8, volume: 2100 }),
      makePerfRecord({ id: 'r5', exerciseId: 'bench', exerciseName: 'Bench', date: daysAgo(0), weight: 90, reps: 8, volume: 2160 }),
    ];

    const plateaus = detectPlateaus(records);
    expect(plateaus.length).toBe(0);
  });

  it('skips exercises with fewer than 3 records', () => {
    const records: ExercisePerformanceRecord[] = [
      makePerfRecord({ id: 'r1', exerciseId: 'ohp', exerciseName: 'OHP', date: daysAgo(28), weight: 60, reps: 5, volume: 900 }),
      makePerfRecord({ id: 'r2', exerciseId: 'ohp', exerciseName: 'OHP', date: daysAgo(0), weight: 60, reps: 5, volume: 900 }),
    ];

    const plateaus = detectPlateaus(records);
    expect(plateaus.length).toBe(0);
  });

  it('returns empty array for empty records', () => {
    expect(detectPlateaus([])).toEqual([]);
  });

  it('uses custom window weeks parameter', () => {
    // PR at day 42, stagnation for ~5 weeks — should pass with windowWeeks=4 but not windowWeeks=6
    const records: ExercisePerformanceRecord[] = [
      makePerfRecord({ id: 'r1', exerciseId: 'row', exerciseName: 'Row', date: daysAgo(56), weight: 80, reps: 8, volume: 1920 }),
      makePerfRecord({ id: 'r2', exerciseId: 'row', exerciseName: 'Row', date: daysAgo(42), weight: 85, reps: 8, volume: 2040 }),
      makePerfRecord({ id: 'r3', exerciseId: 'row', exerciseName: 'Row', date: daysAgo(28), weight: 80, reps: 8, volume: 1920 }),
      makePerfRecord({ id: 'r4', exerciseId: 'row', exerciseName: 'Row', date: daysAgo(14), weight: 80, reps: 8, volume: 1920 }),
      makePerfRecord({ id: 'r5', exerciseId: 'row', exerciseName: 'Row', date: daysAgo(0), weight: 80, reps: 8, volume: 1920 }),
    ];

    expect(detectPlateaus(records, 4).length).toBe(1);
    expect(detectPlateaus(records, 8).length).toBe(0);
  });

  it('generates different suggestions based on plateau duration', () => {
    // 6+ week plateau → "Consider swapping"
    const longPlateauRecords: ExercisePerformanceRecord[] = [
      makePerfRecord({ id: 'r1', exerciseId: 'squat', exerciseName: 'Squat', date: daysAgo(70), weight: 100, reps: 5, volume: 1500 }),
      makePerfRecord({ id: 'r2', exerciseId: 'squat', exerciseName: 'Squat', date: daysAgo(63), weight: 105, reps: 5, volume: 1575 }),
      makePerfRecord({ id: 'r3', exerciseId: 'squat', exerciseName: 'Squat', date: daysAgo(42), weight: 95, reps: 5, volume: 1425 }),
      makePerfRecord({ id: 'r4', exerciseId: 'squat', exerciseName: 'Squat', date: daysAgo(21), weight: 95, reps: 5, volume: 1425 }),
      makePerfRecord({ id: 'r5', exerciseId: 'squat', exerciseName: 'Squat', date: daysAgo(0), weight: 95, reps: 5, volume: 1425 }),
    ];

    const plateaus = detectPlateaus(longPlateauRecords);
    expect(plateaus.length).toBe(1);
    expect(plateaus[0]!.plateauWeeks).toBeGreaterThanOrEqual(6);
    expect(plateaus[0]!.suggestion).toContain('swapping');
  });
});

// ==================== generateAdaptationSignals ====================

describe('generateAdaptationSignals', () => {
  const baseAnalysis: WorkoutPerformanceAnalysis = {
    programId: 'p1',
    userId: 'u1',
    completionRate: 0.9,
    averageRPE: 7,
    targetRPE: 7,
    rpeDeviation: 0,
    volumeTrend: 'stable',
    sessionsCompleted: 10,
    totalSessions: 12,
    strengthChanges: [],
    plateaus: [],
    overallTrend: 'improving',
  };

  it('returns empty signals when everything is fine', () => {
    const signals = generateAdaptationSignals(baseAnalysis);
    expect(signals).toEqual([]);
  });

  it('generates high-priority intensity_decrease for high RPE deviation (above target)', () => {
    const analysis: WorkoutPerformanceAnalysis = {
      ...baseAnalysis,
      averageRPE: 9,
      rpeDeviation: 2,
    };

    const signals = generateAdaptationSignals(analysis);
    const intensitySignal = signals.find((s) => s.type === 'intensity_decrease');

    expect(intensitySignal).toBeDefined();
    expect(intensitySignal!.priority).toBe('high');
    expect(intensitySignal!.reason).toContain('RPE deviation');
  });

  it('generates high-priority intensity_increase for high RPE deviation (below target)', () => {
    const analysis: WorkoutPerformanceAnalysis = {
      ...baseAnalysis,
      averageRPE: 5,
      targetRPE: 7,
      rpeDeviation: 2,
    };

    const signals = generateAdaptationSignals(analysis);
    const intensitySignal = signals.find((s) => s.type === 'intensity_increase');

    expect(intensitySignal).toBeDefined();
    expect(intensitySignal!.priority).toBe('high');
  });

  it('generates medium-priority signal for moderate RPE deviation', () => {
    const analysis: WorkoutPerformanceAnalysis = {
      ...baseAnalysis,
      averageRPE: 8,
      rpeDeviation: 1,
    };

    const signals = generateAdaptationSignals(analysis);
    const intensitySignal = signals.find((s) => s.type === 'intensity_decrease');

    expect(intensitySignal).toBeDefined();
    expect(intensitySignal!.priority).toBe('medium');
  });

  it('generates high-priority volume_decrease for low completion rate', () => {
    const analysis: WorkoutPerformanceAnalysis = {
      ...baseAnalysis,
      completionRate: 0.5,
    };

    const signals = generateAdaptationSignals(analysis);
    const volumeSignal = signals.find((s) => s.type === 'volume_decrease');

    expect(volumeSignal).toBeDefined();
    expect(volumeSignal!.priority).toBe('high');
    expect(volumeSignal!.reason).toContain('50%');
  });

  it('generates frequency_adjust for moderate completion rate', () => {
    const analysis: WorkoutPerformanceAnalysis = {
      ...baseAnalysis,
      completionRate: 0.7,
    };

    const signals = generateAdaptationSignals(analysis);
    const freqSignal = signals.find((s) => s.type === 'frequency_adjust');

    expect(freqSignal).toBeDefined();
    expect(freqSignal!.priority).toBe('medium');
  });

  it('generates volume_increase for decreasing volume without improvement', () => {
    const analysis: WorkoutPerformanceAnalysis = {
      ...baseAnalysis,
      volumeTrend: 'decreasing',
      overallTrend: 'stagnating',
    };

    const signals = generateAdaptationSignals(analysis);
    const volumeUp = signals.find((s) => s.type === 'volume_increase');

    expect(volumeUp).toBeDefined();
  });

  it('does NOT generate volume_increase when volume decreases but strength improves', () => {
    const analysis: WorkoutPerformanceAnalysis = {
      ...baseAnalysis,
      volumeTrend: 'decreasing',
      overallTrend: 'improving',
    };

    const signals = generateAdaptationSignals(analysis);
    const volumeUp = signals.find((s) => s.type === 'volume_increase');

    expect(volumeUp).toBeUndefined();
  });

  it('generates exercise_swap for 3+ plateaus', () => {
    const analysis: WorkoutPerformanceAnalysis = {
      ...baseAnalysis,
      plateaus: [
        { exerciseId: 'squat', exerciseName: 'Squat', plateauWeeks: 4, lastPRDate: daysAgo(28), suggestion: '' },
        { exerciseId: 'bench', exerciseName: 'Bench', plateauWeeks: 5, lastPRDate: daysAgo(35), suggestion: '' },
        { exerciseId: 'ohp', exerciseName: 'OHP', plateauWeeks: 3, lastPRDate: daysAgo(21), suggestion: '' },
      ],
    };

    const signals = generateAdaptationSignals(analysis);
    const swapSignal = signals.find((s) => s.type === 'exercise_swap');

    expect(swapSignal).toBeDefined();
    expect(swapSignal!.priority).toBe('high');
    expect(swapSignal!.affectedExercises).toEqual(['squat', 'bench', 'ohp']);
  });

  it('generates progression_change for 1-2 plateaus', () => {
    const analysis: WorkoutPerformanceAnalysis = {
      ...baseAnalysis,
      plateaus: [
        { exerciseId: 'squat', exerciseName: 'Squat', plateauWeeks: 4, lastPRDate: daysAgo(28), suggestion: '' },
      ],
    };

    const signals = generateAdaptationSignals(analysis);
    const progSignal = signals.find((s) => s.type === 'progression_change');

    expect(progSignal).toBeDefined();
    expect(progSignal!.priority).toBe('medium');
  });

  it('generates deload signal for declining overall trend', () => {
    const analysis: WorkoutPerformanceAnalysis = {
      ...baseAnalysis,
      overallTrend: 'declining',
    };

    const signals = generateAdaptationSignals(analysis);
    const deload = signals.find((s) => s.type === 'deload');

    expect(deload).toBeDefined();
    expect(deload!.priority).toBe('high');
  });

  it('generates feedback-based volume_decrease when volume rating is high', () => {
    const feedback: FeedbackSummary = {
      overallRating: 3,
      volumeRating: 5,
      intensityRating: null,
      difficultyRating: null,
      whatWorked: null,
      whatDidntWork: null,
      suggestions: null,
    };

    const signals = generateAdaptationSignals(baseAnalysis, feedback);
    const volDown = signals.find((s) => s.reason.includes('volume'));

    expect(volDown).toBeDefined();
    expect(volDown!.type).toBe('volume_decrease');
  });

  it('generates feedback-based intensity_decrease when intensity rating is high', () => {
    const feedback: FeedbackSummary = {
      overallRating: 3,
      volumeRating: null,
      intensityRating: 4,
      difficultyRating: null,
      whatWorked: null,
      whatDidntWork: null,
      suggestions: null,
    };

    const signals = generateAdaptationSignals(baseAnalysis, feedback);
    const intDown = signals.find((s) => s.reason.includes('intensity'));

    expect(intDown).toBeDefined();
    expect(intDown!.type).toBe('intensity_decrease');
  });

  it('generates progression_change for low overall program rating', () => {
    const feedback: FeedbackSummary = {
      overallRating: 1,
      volumeRating: null,
      intensityRating: null,
      difficultyRating: null,
      whatWorked: null,
      whatDidntWork: null,
      suggestions: null,
    };

    const signals = generateAdaptationSignals(baseAnalysis, feedback);
    const prog = signals.find((s) => s.reason.includes('rating'));

    expect(prog).toBeDefined();
    expect(prog!.type).toBe('progression_change');
    expect(prog!.priority).toBe('high');
  });

  it('handles null feedback gracefully', () => {
    const signals = generateAdaptationSignals(baseAnalysis, null);
    expect(signals).toEqual([]);
  });

  it('combines multiple signals from analysis + feedback', () => {
    const analysis: WorkoutPerformanceAnalysis = {
      ...baseAnalysis,
      completionRate: 0.5,
      overallTrend: 'declining',
    };
    const feedback: FeedbackSummary = {
      overallRating: 1,
      volumeRating: 5,
      intensityRating: null,
      difficultyRating: null,
      whatWorked: null,
      whatDidntWork: null,
      suggestions: null,
    };

    const signals = generateAdaptationSignals(analysis, feedback);

    // Should have: volume_decrease (completion), deload (declining), volume_decrease (feedback), progression_change (low rating)
    expect(signals.length).toBeGreaterThanOrEqual(3);
    const types = signals.map((s) => s.type);
    expect(types).toContain('volume_decrease');
    expect(types).toContain('deload');
    expect(types).toContain('progression_change');
  });
});
