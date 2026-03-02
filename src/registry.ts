/**
 * OneWorkout Schema & Tools Registry
 *
 * Registers schemas and tools with OneAgent SDK.
 * Call initializeWorkoutSchemas() before executing workout agents.
 */

import { z } from 'zod';

// Local stubs replacing @giulio-leone/one-agent/framework (legacy SDK removed)
function registerSchemas(_schemas: Record<string, z.ZodSchema>): void { /* no-op */ }
function registerTools(_tools: Record<string, Record<string, unknown>>): void { /* no-op */ }

// ==================== MAIN COORDINATOR SCHEMAS ====================

import {
  WorkoutGenerationInputSchema,
  WorkoutGenerationOutputSchema,
} from './sdk-agents/workout-generation/schema';

import {
  ExerciseGenerationInputSchema,
  ExerciseGenerationOutputSchema,
} from './sdk-agents/exercise-generation/schema';

// ==================== WORKER SCHEMAS ====================

import {
  ExerciseSelectorInputSchema,
  ExerciseSelectorOutputSchema,
} from './sdk-agents/workout-generation/workers/exercise-selector/schema';

import {
  WorkoutPlannerInputSchema,
  WorkoutPlannerOutputSchema,
} from './sdk-agents/workout-generation/workers/workout-planner/schema';

import {
  DayGeneratorInputSchema,
  DayGeneratorOutputSchema,
} from './sdk-agents/workout-generation/workers/day-generator/schema';

import {
  ProgressionCalculatorInputSchema,
  ProgressionCalculatorOutputSchema,
} from './sdk-agents/workout-generation/workers/progression-calculator/schema';

import {
  ValidatorInputSchema,
  ValidatorOutputSchema,
} from './sdk-agents/workout-generation/workers/validator/schema';

import {
  ProgramAssemblerInputSchema,
  ProgramAssemblerOutputSchema,
} from './sdk-agents/workout-generation/workers/program-assembler/schema';

import {
  ProgressionDiffGeneratorInputSchema,
  ProgressionDiffGeneratorOutputSchema,
} from './sdk-agents/workout-generation/workers/progression-diff-generator/schema';

// ==================== LOCAL TOOLS ====================

import { workoutTools } from './sdk-agents/workout-generation/tools/tools';

// ==================== INITIALIZATION ====================

let initialized = false;

/**
 * Initialize all workout schemas and tools with the SDK registry
 */
export function initializeWorkoutSchemas(): void {
  if (initialized) return;

  // Register all schemas at once
  registerSchemas({
    // Coordinator schemas
    'workout-generation:input': WorkoutGenerationInputSchema,
    'workout-generation:output': WorkoutGenerationOutputSchema,
    // Exercise Generation
    'exercise-generation:input': ExerciseGenerationInputSchema,
    'exercise-generation:output': ExerciseGenerationOutputSchema,
    // Exercise Selector
    'exercise-selector:input': ExerciseSelectorInputSchema,
    'exercise-selector:output': ExerciseSelectorOutputSchema,
    // Workout Planner
    'workout-planner:input': WorkoutPlannerInputSchema,
    'workout-planner:output': WorkoutPlannerOutputSchema,
    // Day Generator
    'day-generator:input': DayGeneratorInputSchema,
    'day-generator:output': DayGeneratorOutputSchema,
    // Progression Calculator
    'progression-calculator:input': ProgressionCalculatorInputSchema,
    'progression-calculator:output': ProgressionCalculatorOutputSchema,
    // Validator
    'validator:input': ValidatorInputSchema,
    'validator:output': ValidatorOutputSchema,
    // Program Assembler
    'program-assembler:input': ProgramAssemblerInputSchema,
    'program-assembler:output': ProgramAssemblerOutputSchema,
    // Progression Diff Generator
    'progression-diff-generator:input': ProgressionDiffGeneratorInputSchema,
    'progression-diff-generator:output': ProgressionDiffGeneratorOutputSchema,
  });

  // Register local tools for workout generation
  registerTools({ 'workout-generation': workoutTools });

  initialized = true;
}

// ==================== RE-EXPORTS ====================

export * from './sdk-agents/workout-generation/schema';
