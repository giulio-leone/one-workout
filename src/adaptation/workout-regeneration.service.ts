/**
 * Workout Regeneration Service
 *
 * Orchestrates the full program adaptation / regeneration flow.
 * Produces an AdaptationPlan (preview for user approval) and
 * applies approved adaptations.
 *
 * Pure domain service — receives data as parameters.
 */

import type {
  AdaptationPlan,
  AdaptationSignal,
  SuggestedChange,
  PeriodizationAdjustment,
  WorkoutPerformanceAnalysis,
  SessionRecord,
  ExercisePerformanceRecord,
  ProgramFeedbackRecord,
} from './types';
import type { ProgramPeriodization } from '../periodization/types';
import { buildWorkoutHistoryContext } from './history-context.service';

// ==================== PUBLIC API ====================

/**
 * Generate an adaptation plan for a program.
 *
 * Analyzes performance, evaluates deload needs, produces adaptation signals,
 * and translates them into concrete suggested changes.
 * Returns an AdaptationPlan with status 'pending' for user review.
 */
export function generateAdaptationPlan(params: {
  userId: string;
  programId: string;
  sessions: SessionRecord[];
  totalPlannedSessions: number;
  targetRPE: number;
  performanceRecords: ExercisePerformanceRecord[];
  periodizationState: ProgramPeriodization | null;
  feedback: ProgramFeedbackRecord | null;
}): AdaptationPlan {
  const context = buildWorkoutHistoryContext(params);

  const suggestedChanges = signalsToChanges(
    context.adaptationSignals,
    context.performanceAnalysis,
    context.periodizationState
  );

  const periodizationAdjustment = derivePeriodizationAdjustment(
    context.adaptationSignals,
    context.deloadRecommendation
  );

  return {
    id: generatePlanId(),
    programId: params.programId,
    userId: params.userId,
    signals: context.adaptationSignals,
    analysis: context.performanceAnalysis,
    suggestedChanges,
    periodizationAdjustment: periodizationAdjustment ?? undefined,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
}

/**
 * Apply an approved adaptation plan.
 *
 * Returns the plan with status updated to 'applied' and any
 * metadata that the caller should persist.
 */
export function applyAdaptation(params: {
  userId: string;
  adaptationPlan: AdaptationPlan;
}): { appliedPlan: AdaptationPlan; metadata: AdaptationMetadata } {
  const { userId, adaptationPlan } = params;

  if (adaptationPlan.status !== 'approved') {
    throw new Error(
      `Cannot apply adaptation plan with status '${adaptationPlan.status}'. ` +
      `Plan must be approved first.`
    );
  }

  const appliedPlan: AdaptationPlan = {
    ...adaptationPlan,
    status: 'applied',
  };

  const metadata: AdaptationMetadata = {
    planId: appliedPlan.id,
    userId,
    programId: appliedPlan.programId,
    appliedAt: new Date().toISOString(),
    signalCount: appliedPlan.signals.length,
    changeCount: appliedPlan.suggestedChanges.length,
    periodizationAdjusted: !!appliedPlan.periodizationAdjustment,
  };

  return { appliedPlan, metadata };
}

// ==================== TYPES ====================

export interface AdaptationMetadata {
  planId: string;
  userId: string;
  programId: string;
  appliedAt: string;
  signalCount: number;
  changeCount: number;
  periodizationAdjusted: boolean;
}

// ==================== INTERNAL HELPERS ====================

function signalsToChanges(
  signals: AdaptationSignal[],
  analysis: WorkoutPerformanceAnalysis,
  periodizationState: ProgramPeriodization | null
): SuggestedChange[] {
  const changes: SuggestedChange[] = [];

  for (const signal of signals) {
    switch (signal.type) {
      case 'volume_increase':
        changes.push({
          type: 'adjust_volume',
          description: `Increase volume: ${signal.reason}`,
          before: 'Current set count',
          after: 'Add 1-2 sets per muscle group',
        });
        break;

      case 'volume_decrease':
        changes.push({
          type: 'adjust_volume',
          description: `Decrease volume: ${signal.reason}`,
          before: 'Current set count',
          after: 'Remove 1-2 sets per muscle group',
        });
        break;

      case 'intensity_increase':
        changes.push({
          type: 'adjust_intensity',
          description: `Increase intensity: ${signal.reason}`,
          before: `Current target RPE: ${analysis.targetRPE}`,
          after: `New target RPE: ${Math.min(analysis.targetRPE + 0.5, 10)}`,
        });
        break;

      case 'intensity_decrease':
        changes.push({
          type: 'adjust_intensity',
          description: `Decrease intensity: ${signal.reason}`,
          before: `Current target RPE: ${analysis.targetRPE}`,
          after: `New target RPE: ${Math.max(analysis.targetRPE - 0.5, 5)}`,
        });
        break;

      case 'exercise_swap':
        if (signal.affectedExercises) {
          for (const exerciseId of signal.affectedExercises) {
            const plateau = analysis.plateaus.find((p) => p.exerciseId === exerciseId);
            changes.push({
              type: 'swap_exercise',
              description: plateau
                ? `Swap ${plateau.exerciseName}: plateaued for ${plateau.plateauWeeks} weeks`
                : `Swap exercise ${exerciseId}: ${signal.reason}`,
              exerciseId,
            });
          }
        }
        break;

      case 'deload':
        changes.push({
          type: 'add_deload',
          description: `Insert deload week: ${signal.reason}`,
          weekAffected: periodizationState
            ? periodizationState.currentWeek + 1
            : undefined,
        });
        break;

      case 'progression_change':
        if (signal.affectedExercises) {
          for (const exerciseId of signal.affectedExercises) {
            changes.push({
              type: 'modify_exercise',
              description: `Change progression for ${exerciseId}: ${signal.reason}`,
              exerciseId,
            });
          }
        } else {
          changes.push({
            type: 'modify_exercise',
            description: `Change progression approach: ${signal.reason}`,
          });
        }
        break;

      case 'frequency_adjust':
        changes.push({
          type: 'change_split',
          description: `Adjust training frequency: ${signal.reason}`,
        });
        break;
    }
  }

  return changes;
}

function derivePeriodizationAdjustment(
  signals: AdaptationSignal[],
  deloadRecommendation: { shouldDeload: boolean; reason: string } | null
): PeriodizationAdjustment | null {
  const reasons: string[] = [];
  let volumeDelta = 0;
  let intensityDelta = 0;
  let addDeload = false;

  for (const signal of signals) {
    if (signal.type === 'volume_increase') volumeDelta += 0.05;
    if (signal.type === 'volume_decrease') volumeDelta -= 0.05;
    if (signal.type === 'intensity_increase') intensityDelta += 0.05;
    if (signal.type === 'intensity_decrease') intensityDelta -= 0.05;
    if (signal.type === 'deload') addDeload = true;
  }

  if (deloadRecommendation?.shouldDeload) {
    addDeload = true;
    reasons.push(deloadRecommendation.reason);
  }

  if (volumeDelta !== 0) reasons.push(`Volume adjustment: ${volumeDelta > 0 ? '+' : ''}${(volumeDelta * 100).toFixed(0)}%`);
  if (intensityDelta !== 0) reasons.push(`Intensity adjustment: ${intensityDelta > 0 ? '+' : ''}${(intensityDelta * 100).toFixed(0)}%`);
  if (addDeload) reasons.push('Deload week recommended');

  if (reasons.length === 0) return null;

  return {
    reason: reasons.join('. '),
    volumeMultiplierDelta: volumeDelta !== 0 ? volumeDelta : undefined,
    intensityMultiplierDelta: intensityDelta !== 0 ? intensityDelta : undefined,
    addDeloadWeek: addDeload || undefined,
  };
}

function generatePlanId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `adapt_${timestamp}_${random}`;
}
