/**
 * Workout Transforms Registration
 *
 * Registers programmatic transforms for the OneAgent SDK workflow.
 * These are TypeScript functions that run instead of AI calls.
 *
 * Features:
 * - assembleWeeksFromDiffs: Clones Week 1 and applies progression diffs
 * - mergeExercises: Validates and corrects exercise IDs using catalog
 * - 1RM Weight Calculation: Calculates weights from intensityPercent using user's 1RM values
 *
 * Call registerWorkoutTransforms() at app initialization.
 */

import { z } from 'zod';
// Local stub replacing @giulio-leone/one-agent/framework (legacy SDK removed)
function registerTransforms(_transforms: Record<string, (...args: never[]) => unknown>): void { /* no-op */ }
import {
  assembleWeeksFromDiffs,
  validateWeeksConsistency,
  type ProgressionDiffs,
} from './program-diff-patcher';
import {
  applyUserOneRepMaxWeights,
  oneRepMaxArrayToMap,
  type UserOneRepMax,
} from './apply-1rm-weights';
import {
  mergeExercisesSync,
  type MergeExercisesInput,
} from '../sdk-agents/workout-generation/transforms/merge-exercises';
import {
  WorkoutWeekSchema,
  WorkoutGoalsSchema,
  UserProfileSchema,
  ExerciseCatalogEntrySchema,
} from '../sdk-agents/workout-generation/schema';

// ==================== INFERRED TYPES ====================
// Type inference from Zod schemas for strict type safety

type WorkoutWeek = z.infer<typeof WorkoutWeekSchema>;
type WorkoutGoals = z.infer<typeof WorkoutGoalsSchema>;
type UserProfile = z.infer<typeof UserProfileSchema>;
type ExerciseCatalogEntry = z.infer<typeof ExerciseCatalogEntrySchema>;

// ==================== TRANSFORM INPUT TYPES ====================

/**
 * Input structure for assembleWeeksFromDiffs transform
 * Maps to WORKFLOW.md step 5 inputs
 */
interface AssembleWeeksTransformInput extends Record<string, unknown> {
  week1Template: WorkoutWeek;
  progressionDiffs: ProgressionDiffs;
  durationWeeks?: number;
  goals?: WorkoutGoals;
  userProfile?: UserProfile;
  exerciseCatalog?: ExerciseCatalogEntry[];
  userOneRepMaxes?: UserOneRepMax[];
  weightIncrement?: number;
}

/**
 * Primary goal for workout programs
 */
type PrimaryGoal = 'strength' | 'hypertrophy' | 'endurance' | 'power' | 'general_fitness';

// ==================== CONSTANTS ====================

const LOG_PREFIX = '[WorkoutTransforms]' as const;

/**
 * Transform wrapper for assembleWeeksFromDiffs
 *
 * This is the main transform that clones Week 1 and applies progression diffs.
 * Input from WORKFLOW.md:
 * - week1Template: The complete Week 1 from day-generator
 * - progressionDiffs: Diffs for weeks 2-4 from progression-diff-generator
 * - durationWeeks: Total program duration
 * - goals: User goals (for metadata)
 * - userProfile: User profile (for metadata)
 * - exerciseCatalog: Available exercises (for ID validation)
 */
function assembleWeeksFromDiffsTransform(rawInput: Record<string, unknown>): unknown {
  // Type-safe input parsing with runtime validation
  const input = rawInput as AssembleWeeksTransformInput;

  const week1Template = input.week1Template;
  const progressionDiffs = input.progressionDiffs;
  const durationWeeks = input.durationWeeks ?? 4;
  const goals = input.goals;
  const exerciseCatalog = input.exerciseCatalog;
  const userProfile = input.userProfile;

  // Validate inputs
  if (!week1Template) {
    throw new Error(`${LOG_PREFIX} week1Template is required`);
  }
  if (!progressionDiffs) {
    throw new Error(`${LOG_PREFIX} progressionDiffs is required`);
  }

  // Use the programmatic diff patcher
  const weeks = assembleWeeksFromDiffs(week1Template, progressionDiffs, durationWeeks);

  // Validate consistency
  const validation = validateWeeksConsistency(weeks);
  if (!validation.valid) {
    console.warn(`${LOG_PREFIX} Validation warnings:`, validation.errors);
  }

  // Determine split type from week template
  const splitType = determineSplitType(week1Template);

  // Determine primary goal
  const primaryGoal: PrimaryGoal = goals?.primary ?? 'hypertrophy';

  // Build the final program structure matching WorkoutProgramSchema
  const program = {
    id: crypto.randomUUID(),
    name: generateProgramName(goals),
    description: `${durationWeeks}-week personalized training program`,
    userId: userProfile?.name ?? 'temp-user-id',
    durationWeeks: durationWeeks,
    splitType,
    primaryGoal,
    weeks,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    metadata: {
      totalWeeks: weeks.length,
      totalDays: weeks.reduce((sum: any, w: any) => sum + w.days.length, 0),
      totalExercises: weeks.reduce((sum: any, w: any) => sum + w.days.reduce((daySum: any, d: any) => daySum + d.setGroups.length, 0),
        0
      ),
      durationWeeks,
      exerciseCatalogSize: exerciseCatalog?.length ?? 0,
      validationErrors: validation.errors,
    },
  };

  // Apply 1RM-based weight calculation if userOneRepMaxes is provided
  const userOneRepMaxes = input.userOneRepMaxes;
  const weightIncrement = input.weightIncrement ?? 2.5;
  let finalProgram = program;

  if (userOneRepMaxes && userOneRepMaxes.length > 0) {
    const oneRepMaxMap = oneRepMaxArrayToMap(userOneRepMaxes);
    finalProgram = applyUserOneRepMaxWeights(
      program,
      oneRepMaxMap,
      weightIncrement
    ) as typeof program;
    console.warn(`${LOG_PREFIX} Applied 1RM weights for ${userOneRepMaxes.length} exercises`);
  }

  // Return complete output matching WorkoutGenerationOutputSchema
  return {
    program: finalProgram,
    tokensUsed: 0, // Will be updated from context.meta
    costUSD: 0, // Will be updated from context.meta
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Generate a premium-sounding program name
 */
function generateProgramName(goals?: WorkoutGoals): string {
  const goal = goals?.primary ?? 'strength';
  const duration = goals?.duration ?? 4;

  const goalNames: Record<string, string> = {
    strength: 'Strength Foundation',
    hypertrophy: 'Mass Builder',
    endurance: 'Endurance Protocol',
    power: 'Power Phase',
    general_fitness: 'Athletic Base',
  };

  const phaseName = goalNames[goal] ?? 'Training Block';
  return `${duration}-Week ${phaseName}`;
}

/**
 * Determine split type from week template day names
 */
function determineSplitType(week1Template: WorkoutWeek): string {
  const dayNames = (week1Template.days ?? []).map((d: any) => d.dayName?.toLowerCase() ?? '');

  // Check for push/pull/legs pattern
  const hasPush = dayNames.some((n) => n.includes('push'));
  const hasPull = dayNames.some((n) => n.includes('pull'));
  const hasLegs = dayNames.some((n) => n.includes('leg'));
  if (hasPush && hasPull && hasLegs) return 'push_pull_legs';

  // Check for upper/lower pattern
  const hasUpper = dayNames.some((n) => n.includes('upper'));
  const hasLower = dayNames.some((n) => n.includes('lower'));
  if (hasUpper && hasLower) return 'upper_lower';

  // Check for full body
  const hasFullBody = dayNames.some((n) => n.includes('full'));
  if (hasFullBody) return 'full_body';

  // Check for bro split patterns (chest, back, shoulders, etc.)
  const hasBroSplitDays = dayNames.some(
    (n) => n.includes('chest') || n.includes('back') || n.includes('arm') || n.includes('shoulder')
  );
  if (hasBroSplitDays) return 'bro_split';

  // Default to custom
  return 'custom';
}

/**
 * Transform wrapper for mergeExercises
 *
 * Validates and corrects exercise IDs in Week 1 template using the catalog.
 * This runs after exercise-selector and before progression calculations.
 *
 * Input:
 * - week1Template: The Week 1 from exercise-selector
 * - exerciseCatalog: Available exercises for validation
 *
 * Output:
 * - validatedWeek1: Week 1 with corrected exercise IDs
 * - correctionStats: Statistics about corrections made
 */
function mergeExercisesTransform(rawInput: Record<string, unknown>): unknown {
  const week1Template = rawInput.week1Template as WorkoutWeek;
  const exerciseCatalog = (rawInput.exerciseCatalog as ExerciseCatalogEntry[]) ?? [];

  const mergeInput: MergeExercisesInput = {
    week1Template,
    exerciseCatalog,
  };

  // Use sync version since transforms are synchronous
  const result = mergeExercisesSync(mergeInput);

  console.warn(`${LOG_PREFIX} MergeExercises completed:`, {
    total: result.correctionStats.total,
    corrected: result.correctionStats.corrected,
  });

  return result;
}

/**
 * Register all workout transforms with the SDK
 * Call this at app initialization (e.g., in instrumentation.ts or api route)
 */
export function registerWorkoutTransforms(): void {
  registerTransforms({
    assembleWeeksFromDiffs: assembleWeeksFromDiffsTransform,
    mergeExercises: mergeExercisesTransform,
  });
}

// Export for direct use if needed
export { assembleWeeksFromDiffsTransform, mergeExercisesTransform };
