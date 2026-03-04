/**
 * Workout Services
 *
 * Service layer for workout domain operations.
 */

// Workout Generation (OneAgent SDK v4.1)
export {
  generateWorkoutProgram,
  initializeWorkoutGeneration,
  getWorkoutBasePath,
  type WorkoutGenerationResult,
  type GenerateOptions,
} from './workout-generation.service';

// Exercise Generation
export {
  generateExercises,
  initializeExerciseGeneration,
  type ExerciseGenerationResult,
} from './exercise-generation.service';

// One Rep Max and Weight Calculator are exported from ./exercise and ./core respectively in src/index.ts

// Workout generation pipeline
export * from './workout-generation-persistence.service';
export * from './workout-generation-mapper';
export * from './workout-generation-utils';
export * from './workout-normalization.service';
export * from './program-builder';
export * from './exercise-normalizer';
