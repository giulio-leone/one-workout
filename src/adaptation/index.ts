/**
 * Adaptation Module
 *
 * AI adaptation pipeline for workout programs.
 * Pure domain services — no database dependencies.
 */

// Domain types
export type {
  WorkoutPerformanceAnalysis,
  StrengthChange,
  StrengthProgressAnalysis,
  ExerciseTrend,
  PlateauDetection,
  AdaptationSignalType,
  AdaptationSignal,
  WorkoutHistoryContext,
  FeedbackSummary,
  AdaptationPlan,
  SuggestedChange,
  PeriodizationAdjustment,
  AutoTriggerResult,
  TriggerDetail,
  SessionRecord,
  ExercisePerformanceRecord,
  ProgramFeedbackRecord,
} from './types';

// Performance analysis (pure functions)
export {
  analyzeWorkoutPerformance,
  analyzeStrengthProgress,
  detectPlateaus,
  generateAdaptationSignals,
} from './performance-analysis.service';

// History context builder
export { buildWorkoutHistoryContext } from './history-context.service';

// Workout regeneration pipeline
export {
  generateAdaptationPlan,
  applyAdaptation,
} from './workout-regeneration.service';
export type { AdaptationMetadata } from './workout-regeneration.service';

// Auto-trigger evaluation
export { evaluateAutoTrigger } from './auto-trigger.service';
