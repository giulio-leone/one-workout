/**
 * Performance Analysis Service
 *
 * Pure domain service that analyzes workout performance data
 * and generates adaptation signals.
 * NO database access — receives all data as parameters.
 */

import type {
  WorkoutPerformanceAnalysis,
  StrengthProgressAnalysis,
  StrengthChange,
  ExerciseTrend,
  PlateauDetection,
  AdaptationSignal,
  SessionRecord,
  ExercisePerformanceRecord,
  FeedbackSummary,
} from './types';

// ==================== CONSTANTS ====================

const PLATEAU_THRESHOLD_WEEKS = 3;
const STRENGTH_IMPROVEMENT_THRESHOLD = 2; // % change to count as improving
const STRENGTH_DECLINE_THRESHOLD = -2;
const RPE_DEVIATION_HIGH = 1.5;
const RPE_DEVIATION_MODERATE = 0.75;
const COMPLETION_LOW_THRESHOLD = 0.6;
const COMPLETION_MODERATE_THRESHOLD = 0.8;

// ==================== PUBLIC API ====================

/**
 * Analyze workout sessions for a program.
 * Calculates completion rate, RPE deviation, volume trends, strength changes.
 */
export function analyzeWorkoutPerformance(params: {
  userId: string;
  programId: string;
  sessions: SessionRecord[];
  totalPlannedSessions: number;
  targetRPE: number;
  performanceRecords: ExercisePerformanceRecord[];
}): WorkoutPerformanceAnalysis {
  const { userId, programId, sessions, totalPlannedSessions, targetRPE, performanceRecords } = params;

  const completedSessions = sessions.filter((s) => s.completedAt !== null);
  const completionRate = totalPlannedSessions > 0
    ? completedSessions.length / totalPlannedSessions
    : 0;

  const sessionRPEs = completedSessions
    .map((s) => s.rpe)
    .filter((rpe): rpe is number => rpe != null);
  const averageRPE = sessionRPEs.length > 0
    ? sessionRPEs.reduce((sum, r) => sum + r, 0) / sessionRPEs.length
    : 0;
  const rpeDeviation = Math.abs(averageRPE - targetRPE);

  const volumeTrend = computeVolumeTrend(completedSessions);

  const strengthAnalysis = analyzeStrengthProgress(performanceRecords);
  const strengthChanges: StrengthChange[] = strengthAnalysis.exerciseTrends.map((t) => ({
    exerciseId: t.exerciseId,
    exerciseName: t.exerciseName,
    startEstimated1RM: t.estimated1RMStart,
    currentEstimated1RM: t.estimated1RMCurrent,
    changePercent: t.changePercent,
    trend: t.changePercent >= STRENGTH_IMPROVEMENT_THRESHOLD
      ? 'improving'
      : t.changePercent <= STRENGTH_DECLINE_THRESHOLD
        ? 'declining'
        : 'stable',
  }));

  const plateaus = detectPlateaus(performanceRecords, PLATEAU_THRESHOLD_WEEKS);

  const overallTrend = deriveOverallTrend(strengthChanges, completionRate, rpeDeviation);

  return {
    programId,
    userId,
    completionRate,
    averageRPE,
    targetRPE,
    rpeDeviation,
    volumeTrend,
    sessionsCompleted: completedSessions.length,
    totalSessions: totalPlannedSessions,
    strengthChanges,
    plateaus,
    overallTrend,
  };
}

/**
 * Analyze exercise-level strength trends from performance records.
 */
export function analyzeStrengthProgress(
  performanceRecords: ExercisePerformanceRecord[]
): StrengthProgressAnalysis {
  const byExercise = groupBy(performanceRecords, (r) => r.exerciseId);
  const exerciseTrends: ExerciseTrend[] = [];

  for (const [exerciseId, records] of Object.entries(byExercise)) {
    if (records.length < 2) continue;

    const sorted = [...records].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    const firstRecord = sorted[0]!;
    const lastRecord = sorted[sorted.length - 1]!;
    const start1RM = estimate1RM(firstRecord.weight, firstRecord.reps);
    const current1RM = estimate1RM(lastRecord.weight, lastRecord.reps);
    const changePercent = start1RM > 0
      ? ((current1RM - start1RM) / start1RM) * 100
      : 0;

    const volumes = sorted.map((r) => r.volume);
    const volumeTrend = computeTrendFromValues(volumes);

    exerciseTrends.push({
      exerciseId,
      exerciseName: firstRecord.exerciseName ?? exerciseId,
      volumeTrend,
      estimated1RMStart: Math.round(start1RM * 10) / 10,
      estimated1RMCurrent: Math.round(current1RM * 10) / 10,
      changePercent: Math.round(changePercent * 10) / 10,
    });
  }

  const improvingCount = exerciseTrends.filter(
    (t) => t.changePercent >= STRENGTH_IMPROVEMENT_THRESHOLD
  ).length;
  const decliningCount = exerciseTrends.filter(
    (t) => t.changePercent <= STRENGTH_DECLINE_THRESHOLD
  ).length;

  let overallTrend: 'improving' | 'stable' | 'declining';
  if (improvingCount > decliningCount && improvingCount > exerciseTrends.length * 0.3) {
    overallTrend = 'improving';
  } else if (decliningCount > improvingCount && decliningCount > exerciseTrends.length * 0.3) {
    overallTrend = 'declining';
  } else {
    overallTrend = 'stable';
  }

  return { exerciseTrends, overallTrend };
}

/**
 * Detect stagnation in key lifts.
 */
export function detectPlateaus(
  records: ExercisePerformanceRecord[],
  windowWeeks: number = PLATEAU_THRESHOLD_WEEKS
): PlateauDetection[] {
  const byExercise = groupBy(records, (r) => r.exerciseId);
  const plateaus: PlateauDetection[] = [];

  for (const [exerciseId, exerciseRecords] of Object.entries(byExercise)) {
    if (exerciseRecords.length < 3) continue;

    const sorted = [...exerciseRecords].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    // Find the last PR (highest estimated 1RM)
    let maxE1RM = 0;
    let lastPRDate = sorted[0]!.date;
    for (const record of sorted) {
      const e1rm = estimate1RM(record.weight, record.reps);
      if (e1rm >= maxE1RM) {
        maxE1RM = e1rm;
        lastPRDate = record.date;
      }
    }

    // Calculate weeks since last PR
    const lastRecordDate = new Date(sorted[sorted.length - 1]!.date);
    const prDate = new Date(lastPRDate);
    const weeksSincePR = Math.max(0, Math.floor(
      (lastRecordDate.getTime() - prDate.getTime()) / (7 * 24 * 60 * 60 * 1000)
    ));

    if (weeksSincePR >= windowWeeks) {
      const exerciseName = sorted[0]!.exerciseName ?? exerciseId;
      plateaus.push({
        exerciseId,
        exerciseName,
        plateauWeeks: weeksSincePR,
        lastPRDate,
        suggestion: generatePlateauSuggestion(weeksSincePR, exerciseName),
      });
    }
  }

  return plateaus;
}

/**
 * Combine performance analysis and optional feedback into adaptation signals.
 */
export function generateAdaptationSignals(
  analysis: WorkoutPerformanceAnalysis,
  feedback?: FeedbackSummary | null
): AdaptationSignal[] {
  const signals: AdaptationSignal[] = [];

  // High RPE deviation → intensity adjustment
  if (analysis.rpeDeviation >= RPE_DEVIATION_HIGH) {
    const direction = analysis.averageRPE > analysis.targetRPE ? 'decrease' : 'increase';
    signals.push({
      type: direction === 'decrease' ? 'intensity_decrease' : 'intensity_increase',
      priority: 'high',
      reason: `RPE deviation of ${analysis.rpeDeviation.toFixed(1)} (avg ${analysis.averageRPE.toFixed(1)} vs target ${analysis.targetRPE})`,
      suggestedChange: `${direction === 'decrease' ? 'Reduce' : 'Increase'} working weights by 5-10%`,
    });
  } else if (analysis.rpeDeviation >= RPE_DEVIATION_MODERATE) {
    const direction = analysis.averageRPE > analysis.targetRPE ? 'decrease' : 'increase';
    signals.push({
      type: direction === 'decrease' ? 'intensity_decrease' : 'intensity_increase',
      priority: 'medium',
      reason: `Moderate RPE deviation of ${analysis.rpeDeviation.toFixed(1)}`,
      suggestedChange: `Fine-tune working weights by 2-5%`,
    });
  }

  // Low completion rate → reduce volume or frequency
  if (analysis.completionRate < COMPLETION_LOW_THRESHOLD) {
    signals.push({
      type: 'volume_decrease',
      priority: 'high',
      reason: `Low completion rate: ${(analysis.completionRate * 100).toFixed(0)}%`,
      suggestedChange: 'Reduce weekly volume or training frequency',
    });
  } else if (analysis.completionRate < COMPLETION_MODERATE_THRESHOLD) {
    signals.push({
      type: 'frequency_adjust',
      priority: 'medium',
      reason: `Moderate completion rate: ${(analysis.completionRate * 100).toFixed(0)}%`,
      suggestedChange: 'Consider reducing training days or session length',
    });
  }

  // Volume trend signals
  if (analysis.volumeTrend === 'decreasing' && analysis.overallTrend !== 'improving') {
    signals.push({
      type: 'volume_increase',
      priority: 'medium',
      reason: 'Decreasing volume trend without strength improvement',
      suggestedChange: 'Gradually increase sets or reps',
    });
  }

  // Plateau-based signals
  if (analysis.plateaus.length >= 3) {
    const affectedExercises = analysis.plateaus.map((p) => p.exerciseId);
    signals.push({
      type: 'exercise_swap',
      priority: 'high',
      reason: `${analysis.plateaus.length} exercises showing plateau (${analysis.plateaus.map((p) => p.exerciseName).join(', ')})`,
      affectedExercises,
      suggestedChange: 'Swap stagnating exercises for variations',
    });
  } else if (analysis.plateaus.length > 0) {
    const affectedExercises = analysis.plateaus.map((p) => p.exerciseId);
    signals.push({
      type: 'progression_change',
      priority: 'medium',
      reason: `${analysis.plateaus.length} exercise(s) plateauing`,
      affectedExercises,
      suggestedChange: 'Try different rep scheme or progression method',
    });
  }

  // Overall decline → deload signal
  if (analysis.overallTrend === 'declining') {
    signals.push({
      type: 'deload',
      priority: 'high',
      reason: 'Overall performance trend is declining',
      suggestedChange: 'Insert deload week before continuing progression',
    });
  }

  // Feedback-based signals
  if (feedback) {
    if (feedback.volumeRating != null && feedback.volumeRating >= 4) {
      signals.push({
        type: 'volume_decrease',
        priority: 'medium',
        reason: `User rated volume ${feedback.volumeRating}/5 (too high)`,
        suggestedChange: 'Reduce sets per muscle group by 1-2',
      });
    }
    if (feedback.intensityRating != null && feedback.intensityRating >= 4) {
      signals.push({
        type: 'intensity_decrease',
        priority: 'medium',
        reason: `User rated intensity ${feedback.intensityRating}/5 (too high)`,
        suggestedChange: 'Lower working weights or reduce RPE targets',
      });
    }
    if (feedback.overallRating <= 2) {
      signals.push({
        type: 'progression_change',
        priority: 'high',
        reason: `Low overall program rating: ${feedback.overallRating}/5`,
        suggestedChange: 'Consider significant program restructuring',
      });
    }
  }

  return signals;
}

// ==================== INTERNAL HELPERS ====================

/** Epley formula: 1RM = weight × (1 + reps / 30) */
function estimate1RM(weight: number, reps: number): number {
  if (weight <= 0 || reps <= 0) return 0;
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}

function computeVolumeTrend(
  sessions: SessionRecord[]
): 'increasing' | 'stable' | 'decreasing' {
  const volumes = sessions
    .filter((s) => s.totalVolume != null)
    .map((s) => s.totalVolume!);
  return computeTrendFromValues(volumes);
}

function computeTrendFromValues(
  values: number[]
): 'increasing' | 'stable' | 'decreasing' {
  if (values.length < 3) return 'stable';

  // Simple linear regression slope
  const n = values.length;
  const xMean = (n - 1) / 2;
  const yMean = values.reduce((s, v) => s + v, 0) / n;

  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i++) {
    numerator += (i - xMean) * (values[i]! - yMean);
    denominator += (i - xMean) ** 2;
  }

  if (denominator === 0) return 'stable';

  const slope = numerator / denominator;
  // Normalize slope relative to mean
  const normalizedSlope = yMean !== 0 ? slope / yMean : 0;

  if (normalizedSlope > 0.02) return 'increasing';
  if (normalizedSlope < -0.02) return 'decreasing';
  return 'stable';
}

function deriveOverallTrend(
  strengthChanges: StrengthChange[],
  completionRate: number,
  rpeDeviation: number
): 'improving' | 'stagnating' | 'declining' {
  let score = 0;

  // Strength component
  const improving = strengthChanges.filter((c) => c.trend === 'improving').length;
  const declining = strengthChanges.filter((c) => c.trend === 'declining').length;
  if (improving > declining) score += 1;
  else if (declining > improving) score -= 1;

  // Completion component
  if (completionRate >= 0.85) score += 1;
  else if (completionRate < 0.6) score -= 1;

  // RPE component
  if (rpeDeviation < 0.5) score += 1;
  else if (rpeDeviation > 1.5) score -= 1;

  if (score >= 2) return 'improving';
  if (score <= -1) return 'declining';
  return 'stagnating';
}

function generatePlateauSuggestion(weeks: number, exerciseName: string): string {
  if (weeks >= 6) {
    return `${exerciseName} has stalled for ${weeks} weeks. Consider swapping for a variation or changing rep scheme.`;
  }
  if (weeks >= 4) {
    return `${exerciseName} showing plateau (${weeks} weeks). Try adjusting rep ranges or adding intensity techniques.`;
  }
  return `${exerciseName} may be plateauing (${weeks} weeks). Monitor and consider progression change.`;
}

function groupBy<T>(items: T[], keyFn: (item: T) => string): Record<string, T[]> {
  const result: Record<string, T[]> = {};
  for (const item of items) {
    const key = keyFn(item);
    if (!result[key]) result[key] = [];
    result[key]!.push(item);
  }
  return result;
}
