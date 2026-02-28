/**
 * OneWorkout
 *
 * Unified Workout Domain for OneCoach
 */

export * from './core';

// Registry (for bundled environments)
export { initializeWorkoutSchemas } from './registry';

// Services (SDK v4.1)
export * from './services';

// SDK v4.1 Canonical Schemas - Single Source of Truth
export {
  ExerciseSetSchema,
  SetGroupSchema,
  WorkoutDaySchema,
  WorkoutWeekSchema,
  WorkoutProgramSchema,
  TrainingPhaseSchema,
  type ExerciseSet,
  type SetGroup,
  type WorkoutDay,
  type WorkoutWeek,
  type WorkoutProgram,
} from './sdk-agents/workout-generation/schema';

// Shared range helpers (UI builder)
export {
  formatRange,
  parseRange,
  type ParseRangeOptions,
  REPS_OPTIONS,
  WEIGHT_OPTIONS,
  INTENSITY_OPTIONS,
  RPE_OPTIONS,
  REST_OPTIONS,
} from './core/helpers/utils/range-parser';

// Exercise services (merged from lib-exercise)
export * from './exercise';

export { LocalizedExerciseSchema } from './sdk-agents/workout-generation/transforms/merge-exercises';
export type { LocalizedExercise } from './sdk-agents/workout-generation/transforms/merge-exercises';
