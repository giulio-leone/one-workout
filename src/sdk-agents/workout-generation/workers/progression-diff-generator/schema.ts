/**
 * Progression Diff Generator Schema
 *
 * Genera diff per settimane 2-4 basandosi su Week 1 template.
 * Usa lo schema progressionDiffSchema già definito in @giulio-leone/schemas.
 */

import { z } from 'zod';
import { WorkoutWeekSchema, UserProfileSchema, TrainingPhaseSchema } from '../../schema';

// ==================== INPUT ====================

/**
 * Week progression data from progression-calculator
 */
const WeekProgressionSchema = z.object({
  weekNumber: z.number(),
  phase: TrainingPhaseSchema,
  volumeMultiplier: z.number().describe('1.0 = baseline, 1.1 = +10%'),
  intensityMultiplier: z.number().describe('0.75 = 75% of 1RM'),
  notes: z.string().optional(),
});

export const ProgressionDiffGeneratorInputSchema = z.object({
  week1Template: WorkoutWeekSchema.describe('Complete Week 1 with all days and exercises'),
  durationWeeks: z.number().min(2).max(4).describe('Total program duration'),
  progressionMatrix: z.array(WeekProgressionSchema).describe('Progression data for each week'),
  userProfile: UserProfileSchema,
});

export type ProgressionDiffGeneratorInput = z.infer<typeof ProgressionDiffGeneratorInputSchema>;

// ==================== OUTPUT ====================

/**
 * Single change to apply to an exercise
 *
 * NOTE: This replicates progressionChangeSchema from @giulio-leone/schemas
 * to avoid import issues with the SDK agent system.
 */
const ProgressionChangeSchema = z.object({
  dayNumber: z
    .number()
    .int()
    .positive()
    .describe('REQUIRED: Day number (1-based). Every exercise on every day MUST have a change.'),
  exerciseIndex: z
    .number()
    .int()
    .nonnegative()
    .describe(
      'REQUIRED: Exercise index (0-based). You MUST include a change for EVERY exercise in Week 1.'
    ),
  setGroupIndex: z
    .number()
    .int()
    .nonnegative()
    .describe('REQUIRED: SetGroup index (0-based). Target the primary set group of the exercise.'),
  // reps is REQUIRED to ensure it's never lost when applying progression
  reps: z
    .number()
    .int()
    .positive()
    .describe(
      'REQUIRED: Target reps. Must be included in EVERY change, even if unchanged from Week 1.'
    ),
  // Other fields are optional - only include if they change
  weight: z
    .number()
    .nonnegative()
    .optional()
    .describe('Optional: New weight in kg. Only include if changing.'),
  weightLbs: z
    .number()
    .nonnegative()
    .optional()
    .describe('Optional: Weight in lbs. If weight changes, update both.'),
  intensityPercent: z
    .number()
    .min(0)
    .max(100)
    .optional()
    .describe('Optional: New intensity as % of 1RM.'),
  rpe: z.number().int().min(1).max(10).optional().describe('Optional: New RPE target.'),
  rest: z.number().int().positive().optional().describe('Optional: New rest time in seconds.'),
  count: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Optional: Change number of sets. Use for volume manipulation.'),
});

export type ProgressionChange = z.infer<typeof ProgressionChangeSchema>;

/**
 * Diff for a single week
 */
const ProgressionWeekDiffSchema = z.object({
  focus: z
    .string()
    .describe(
      'REQUIRED: Strategic focus for this week (e.g., "Volume accumulation", "Intensity peak", "Deload recovery")'
    ),
  notes: z.string().optional(),
  changes: z
    .array(ProgressionChangeSchema)
    .min(1)
    .describe('Array of changes. MUST have at least one change for every exercise in every day.'),
});

export type ProgressionWeekDiff = z.infer<typeof ProgressionWeekDiffSchema>;

/**
 * Complete progression diff output
 */
export const ProgressionDiffGeneratorOutputSchema = z.object({
  week2: ProgressionWeekDiffSchema.describe('Diff for week 2 - REQUIRED'),
  week3: ProgressionWeekDiffSchema.optional().describe('Diff for week 3 - if durationWeeks >= 3'),
  week4: ProgressionWeekDiffSchema.optional().describe('Diff for week 4 - if durationWeeks >= 4'),
});

export type ProgressionDiffGeneratorOutput = z.infer<typeof ProgressionDiffGeneratorOutputSchema>;
