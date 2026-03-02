/**
 * Workout Generation Schema
 *
 * Input/Output schemas for the multi-agent workout generation system.
 * Extracted from one-agent/src/agents/workout/types.ts
 */

import { z } from 'zod';

// Local stubs replacing @giulio-leone/one-agent/framework (legacy SDK removed)
function registerSchemas(_schemas: Record<string, z.ZodSchema>): void { /* no-op */ }
const ProgressFieldSchema = z.object({
  step: z.string(),
  userMessage: z.string(),
  adminDetails: z.string().optional(),
  estimatedProgress: z.number().min(0).max(100),
  iconHint: z.enum(['search', 'analyze', 'compare', 'filter', 'loading', 'success', 'error']).optional(),
  toolName: z.string().optional(),
});

// ==================== ENUMS ====================

export const ExperienceLevelSchema = z.enum(['beginner', 'intermediate', 'advanced', 'elite']);
export const PrimaryGoalSchema = z.enum([
  'strength',
  'hypertrophy',
  'endurance',
  'power',
  'general_fitness',
]);
export const TrainingPhaseSchema = z.enum([
  'accumulation',
  'intensification',
  'realization',
  'deload',
]);
export const SplitTypeSchema = z.enum([
  'full_body',
  'upper_lower',
  'push_pull_legs',
  'bro_split',
  'custom',
]);
export const WeightUnitSchema = z.enum(['kg', 'lbs', 'bodyweight']);

// ==================== USER PROFILE ====================

export const UserProfileSchema = z.object({
  name: z.string().optional(),
  weight: z.number().describe('Weight in kg'),
  height: z.number().describe('Height in cm'),
  age: z.number(),
  gender: z.enum(['male', 'female', 'other']),
  experienceLevel: ExperienceLevelSchema,
  currentLifts: z
    .record(z.string(), z.number())
    .optional()
    .describe('Exercise name -> weight in kg'),
  injuries: z.array(z.string()).optional(),
  fitnessLevel: z.enum(['sedentary', 'light', 'moderate', 'active', 'very_active']),
});

// ==================== GOALS & CONSTRAINTS ====================

export const WorkoutGoalsSchema = z.object({
  primary: PrimaryGoalSchema,
  targetMuscles: z.array(z.string()),
  daysPerWeek: z.number().min(2).max(7),
  duration: z.number().describe('Duration in weeks'),
  sessionDuration: z.number().optional().describe('Minutes per session'),
});

export const WorkoutConstraintsSchema = z.object({
  equipment: z.array(z.string()),
  location: z.enum(['gym', 'home', 'outdoor']),
  timePerSession: z.number().describe('Minutes per session'),
});

export const WorkoutPreferencesSchema = z.object({
  preferredExercises: z.array(z.string()).optional(),
  dislikedExercises: z.array(z.string()).optional(),
  workoutTime: z.enum(['morning', 'afternoon', 'evening']).optional(),
});

export const OneRepMaxRecordSchema = z.object({
  exerciseId: z.string(),
  exerciseName: z.string(),
  weight: z.number(),
  weightUnit: z.enum(['kg', 'lbs']),
  dateRecorded: z.string().describe('ISO 8601 date string'),
  estimated: z.boolean(),
});

export const ExerciseCatalogEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string().optional(),
  targetMuscles: z.array(z.string()).optional(),
  equipment: z.array(z.string()).optional(),
  difficulty: ExperienceLevelSchema.optional(),
});

// ==================== MAIN INPUT ====================

export const WorkoutGenerationInputSchema = z.object({
  userId: z.string(),
  userProfile: UserProfileSchema,
  goals: WorkoutGoalsSchema,
  constraints: WorkoutConstraintsSchema,
  preferences: WorkoutPreferencesSchema.optional(),
  additionalNotes: z.string().optional(),
  availableExercises: z.array(z.union([z.string(), ExerciseCatalogEntrySchema])).optional(),
  exerciseCatalog: z.array(ExerciseCatalogEntrySchema).optional(),
  oneRepMaxData: z.array(OneRepMaxRecordSchema).optional(),
  // Dynamic week range for parallel generation (e.g., [2,3,4] for 4-week program)
  weekRange: z.array(z.number()).optional(),
});

// ==================== EXERCISE & SET SCHEMAS ====================

export const ExerciseSetSchema = z.object({
  setNumber: z.number(),
  reps: z.number().or(z.string()),
  weight: z.number(),
  weightUnit: WeightUnitSchema.default('kg'),
  rpe: z.number().min(1).max(10).optional(),
  rir: z.number().optional(),
  restSeconds: z.number(),
  tempo: z.string().optional(),
  notes: z.string().optional(),
});

export const SetGroupSchema = z.object({
  exerciseId: z.string(),
  exerciseName: z.string(),
  order: z.number(),
  sets: z.array(ExerciseSetSchema),
  notes: z.string().optional(),
  technicalCues: z.array(z.string()).optional(),
});

// ==================== WORKOUT DAY/WEEK/PROGRAM ====================

export const WorkoutDaySchema = z.object({
  dayNumber: z.number(),
  dayName: z.string(),
  focus: z.array(z.string()),
  targetMuscles: z.array(z.string()),
  setGroups: z.array(SetGroupSchema),
  estimatedDuration: z.number().optional(),
  notes: z.string().optional(),
});

export const WorkoutWeekSchema = z.object({
  weekNumber: z.number(),
  phase: TrainingPhaseSchema,
  focus: z.string().optional(),
  days: z.array(WorkoutDaySchema),
  notes: z.string().optional(),
});

export const WorkoutProgramSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  description: z.string().optional(),
  userId: z.string(),
  durationWeeks: z.number(),
  splitType: SplitTypeSchema,
  primaryGoal: PrimaryGoalSchema,
  weeks: z.array(WorkoutWeekSchema),
  createdAt: z.string().optional().describe('ISO 8601 date string'),
  updatedAt: z.string().optional().describe('ISO 8601 date string'),
});

// ==================== MAIN OUTPUT ====================

/**
 * Workout Generation Output Schema
 *
 * IMPORTANT: _progress is positioned FIRST to ensure it's emitted early
 * in the partialOutputStream during AI structured output streaming.
 * The AI SDK streams fields in order as they're generated.
 */
export const WorkoutGenerationOutputSchema = z.object({
  /**
   * AI-driven progress updates (v4.1 / v5.1)
   *
   * POSITIONED FIRST: This field is at the top of the schema to ensure
   * the AI populates it early during structured output generation.
   * The partialOutputStream emits partial objects as fields are generated,
   * so having _progress first means it arrives early in the stream.
   *
   * REQUIRED: The AI MUST populate this field BEFORE generating the program.
   * This provides real-time feedback to the UI during execution.
   *
   * @see PROGRESS_PROMPT_INSTRUCTIONS in OneAgent SDK types
   */
  _progress: ProgressFieldSchema.describe(
    'EMIT FIRST: Progress update. Populate this BEFORE generating program content. ' +
      'Fields: step (internal ID), userMessage (user-friendly, same language as input), ' +
      'estimatedProgress (0-100), iconHint. Update throughout the generation process.'
  ),

  // Main output fields
  program: WorkoutProgramSchema,
  tokensUsed: z.number(),
  costUSD: z.number(),
  generatedAt: z.string().describe('ISO 8601 date string'),
  metadata: z
    .object({
      validationScore: z.number().optional(),
      refinementPasses: z.number().optional(),
    })
    .optional(),
});

// ==================== SCHEMA REGISTRATION ====================
// Register schemas for bundled environments (Next.js Turbopack)
registerSchemas({
  'workout-generation:input': WorkoutGenerationInputSchema,
  'workout-generation:output': WorkoutGenerationOutputSchema,
});

// ==================== TYPE EXPORTS ====================

export type WorkoutGenerationInput = z.infer<typeof WorkoutGenerationInputSchema>;
export type WorkoutGenerationOutput = z.infer<typeof WorkoutGenerationOutputSchema>;
export type WorkoutProgram = z.infer<typeof WorkoutProgramSchema>;
export type WorkoutWeek = z.infer<typeof WorkoutWeekSchema>;
export type WorkoutDay = z.infer<typeof WorkoutDaySchema>;
export type SetGroup = z.infer<typeof SetGroupSchema>;
export type ExerciseSet = z.infer<typeof ExerciseSetSchema>;
