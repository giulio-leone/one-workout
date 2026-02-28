/**
 * History Context Service
 *
 * Builds the workout history context that gets passed to AI
 * when regenerating or adapting a program.
 *
 * This service DOES use ServiceRegistry to fetch data from repos,
 * then delegates to pure analysis functions.
 */

import type {
  WorkoutHistoryContext,
  FeedbackSummary,
  SessionRecord,
  ExercisePerformanceRecord,
  ProgramFeedbackRecord,
} from './types';
import type { ProgramPeriodization } from '../periodization/types';
import {
  getWeekPeriodization,
  evaluateDeload,
} from '../periodization/periodization.service';
import {
  analyzeWorkoutPerformance,
  generateAdaptationSignals,
} from './performance-analysis.service';

// ==================== PUBLIC API ====================

/**
 * Build a complete history context for AI program regeneration.
 *
 * Receives pre-fetched data (from repos) and computes the full context.
 * The caller is responsible for fetching data via ServiceRegistry.
 */
export function buildWorkoutHistoryContext(params: {
  userId: string;
  programId: string;
  sessions: SessionRecord[];
  totalPlannedSessions: number;
  targetRPE: number;
  performanceRecords: ExercisePerformanceRecord[];
  periodizationState: ProgramPeriodization | null;
  feedback: ProgramFeedbackRecord | null;
}): WorkoutHistoryContext {
  const {
    userId,
    programId,
    sessions,
    totalPlannedSessions,
    targetRPE,
    performanceRecords,
    periodizationState,
    feedback,
  } = params;

  // 1. Performance analysis
  const performanceAnalysis = analyzeWorkoutPerformance({
    userId,
    programId,
    sessions,
    totalPlannedSessions,
    targetRPE,
    performanceRecords,
  });

  // 2. Current week periodization
  let currentWeekPeriodization = null;
  if (periodizationState?.mesocycle) {
    try {
      currentWeekPeriodization = getWeekPeriodization(
        periodizationState.mesocycle,
        periodizationState.currentWeek
      );
    } catch {
      // Week out of range — program may be complete
      currentWeekPeriodization = null;
    }
  }

  // 3. Deload recommendation
  let deloadRecommendation = null;
  if (periodizationState?.mesocycle) {
    const lastDeloadWeek = periodizationState.deloadHistory.length > 0
      ? periodizationState.deloadHistory[periodizationState.deloadHistory.length - 1]!
      : 0;
    const weeksSinceLastDeload = Math.max(0, periodizationState.currentWeek - lastDeloadWeek);

    deloadRecommendation = evaluateDeload(
      {
        weeksSinceLastDeload,
        averageRPE: performanceAnalysis.averageRPE,
        rpeDeviation: performanceAnalysis.rpeDeviation,
        completionRate: performanceAnalysis.completionRate,
        performanceTrend: performanceAnalysis.overallTrend === 'improving'
          ? 'improving'
          : performanceAnalysis.overallTrend === 'declining'
            ? 'declining'
            : 'stagnating',
      },
      {
        deloadFrequency: periodizationState.mesocycle.deloadFrequency,
        autoDeloadEnabled: periodizationState.mesocycle.autoDeloadEnabled,
      }
    );
  }

  // 4. Feedback summary
  const feedbackSummary = feedback ? mapFeedbackToSummary(feedback) : null;

  // 5. Adaptation signals
  const adaptationSignals = generateAdaptationSignals(performanceAnalysis, feedbackSummary);

  return {
    userId,
    programId,
    performanceAnalysis,
    periodizationState,
    currentWeekPeriodization,
    deloadRecommendation,
    adaptationSignals,
    feedbackSummary,
  };
}

// ==================== INTERNAL HELPERS ====================

function mapFeedbackToSummary(feedback: ProgramFeedbackRecord): FeedbackSummary {
  return {
    overallRating: feedback.overallRating,
    volumeRating: feedback.volumeRating,
    intensityRating: feedback.intensityRating,
    difficultyRating: feedback.difficultyRating,
    whatWorked: feedback.whatWorked,
    whatDidntWork: feedback.whatDidntWork,
    suggestions: feedback.suggestions,
  };
}
