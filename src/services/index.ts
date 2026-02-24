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

// One Rep Max (canonical in exercise/)
export { OneRepMaxService } from '../exercise/one-rep-max.service';

// Weight Calculator
export { calculateWeightsInProgram } from './workout-weight-calculator.service';

// Workout generation pipeline
export * from './workout-generation-persistence.service';
export * from './workout-generation-mapper';
export * from './workout-generation-config.service';
export * from './workout-generation-prompts';
export * from './workout-generation-stream.service';
export * from './workout-generation-utils';
export * from './workout-normalization.service';
export * from './program-builder';
export * from './exercise-normalizer';

// Workout agent utils
export * from './agents/utils/sdk-input-builder';
export * from './agents/utils/data-service';
