/**
 * Merge Exercises Transform
 *
 * Validates and corrects exercise IDs in the generated Week 1 template using the exercise catalog.
 * This ensures that all exercises have valid IDs before progression diffs and validation.
 *
 * Pipeline position: After day-generator, before progression-diff-generator/validator
 *
 * Features:
 * - Validates exerciseId against catalog
 * - Corrects invalid IDs using fuzzy matching
 * - Logs correction statistics for monitoring
 * - Zero-dependency on database (uses provided catalog)
 *
 * @since v5.1
 */

import { z } from 'zod';
import { deepClone } from '@giulio-leone/lib-shared';
import { createExerciseMatcher, type CatalogExercise } from '../../../core/utils/exercise-matcher';
import { WorkoutWeekSchema } from '../schema';

// ==================== SCHEMAS ====================

/**
 * Minimal exercise catalog entry for matching
 */
export const LocalizedExerciseSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string().optional(),
  category: z.string().optional(),
  targetMuscles: z.array(z.string()).optional(),
  equipment: z.array(z.string()).optional(),
  translation: z
    .object({
      name: z.string(),
      description: z.string().optional(),
    })
    .optional(),
  fallbackLocale: z.string().optional(),
  muscles: z
    .array(z.object({ name: z.string() }).passthrough())
    .optional(),
  equipments: z
    .array(z.object({ name: z.string() }).passthrough())
    .optional(),
});

/**
 * Input schema for merge-exercises transform
 */
export const MergeExercisesInputSchema = z.object({
  /** Week 1 template from exercise-selector */
  week1Template: WorkoutWeekSchema,
  /** Exercise catalog for validation */
  exerciseCatalog: z.array(LocalizedExerciseSchema),
});

/**
 * Output schema for merge-exercises transform
 */
export const MergeExercisesOutputSchema = z.object({
  /** Validated Week 1 with corrected exercise IDs */
  validatedWeek1: WorkoutWeekSchema,
  /** Correction statistics */
  correctionStats: z.object({
    total: z.number(),
    corrected: z.number(),
    failed: z.number(),
  }),
  /** Details of corrections made (for logging) */
  corrections: z
    .array(
      z.object({
        originalId: z.string(),
        originalName: z.string(),
        correctedId: z.string(),
        correctedName: z.string(),
        matchType: z.string(),
        confidence: z.number(),
      })
    )
    .optional(),
});

// ==================== TYPES ====================

export type MergeExercisesInput = z.infer<typeof MergeExercisesInputSchema>;
export type MergeExercisesOutput = z.infer<typeof MergeExercisesOutputSchema>;
export type LocalizedExercise = z.infer<typeof LocalizedExerciseSchema>;

// ==================== TRANSFORM ====================

/**
 * Logger for transform operations
 */
const transformLogger = {
  info: (message: string, meta?: Record<string, unknown>) => {
    console.warn(`[MergeExercises] ${message}`, meta ?? '');
  },
  warn: (message: string, meta?: Record<string, unknown>) => {
    console.warn(`[MergeExercises] ${message}`, meta ?? '');
  },
};

/**
 * Validates and corrects exercise IDs in the workout template using the catalog.
 *
 * This transform is critical for ensuring AI-generated exercise IDs map to
 * real exercises in the database catalog.
 */
export async function mergeExercises(input: MergeExercisesInput): Promise<MergeExercisesOutput> {
  const { week1Template, exerciseCatalog } = input;

  // Hard fail if no catalog provided (deterministic ID matching required)
  if (!exerciseCatalog || exerciseCatalog.length === 0) {
    throw new Error('[MergeExercises] Exercise catalog is required for deterministic ID matching.');
  }

  // Create matcher instance
  const matcher = createExerciseMatcher(exerciseCatalog as CatalogExercise[], transformLogger);

  // Stats tracking
  let totalExercises = 0;
  let correctedCount = 0;
  const corrections: MergeExercisesOutput['corrections'] = [];

  // Deep clone to avoid mutation (structuredClone is faster than JSON.parse/stringify)
  const validatedWeek: typeof week1Template = deepClone(week1Template);

  // Process each day's set groups
  for (const day of validatedWeek.days) {
    if (!day.setGroups || !Array.isArray(day.setGroups)) {
      continue;
    }

    for (const setGroup of day.setGroups) {
      totalExercises++;

      // Check if exerciseId is valid
      if (!matcher.isValidId(setGroup.exerciseId)) {
        // Attempt to match and correct
        const matchResult = matcher.match(
          setGroup.exerciseName,
          setGroup.exerciseId,
          undefined,
          day.targetMuscles
        );

        if (matchResult.wasCorrection) {
          correctedCount++;

          // Track correction details
          corrections.push({
            originalId: setGroup.exerciseId,
            originalName: setGroup.exerciseName,
            correctedId: matchResult.exerciseId,
            correctedName: matchResult.exerciseName,
            matchType: matchResult.matchType,
            confidence: matchResult.confidence,
          });

          // Apply correction
          setGroup.exerciseId = matchResult.exerciseId;
          setGroup.exerciseName = matchResult.exerciseName;
        }
      }
    }
  }

  // Log summary
  if (correctedCount > 0) {
    transformLogger.info('Exercise ID corrections applied', {
      total: totalExercises,
      corrected: correctedCount,
      catalogSize: exerciseCatalog.length,
    });
  } else {
    transformLogger.info('All exercise IDs valid', {
      total: totalExercises,
      catalogSize: exerciseCatalog.length,
    });
  }

  return {
    validatedWeek1: validatedWeek,
    correctionStats: {
      total: totalExercises,
      corrected: correctedCount,
      failed: 0, // With fallback matching, we never truly fail
    },
    corrections: corrections.length > 0 ? corrections : undefined,
  };
}

/**
 * Sync version for non-async contexts
 */
export function mergeExercisesSync(input: MergeExercisesInput): MergeExercisesOutput {
  const { week1Template, exerciseCatalog } = input;

  if (!exerciseCatalog || exerciseCatalog.length === 0) {
    throw new Error('[MergeExercises] Exercise catalog is required for deterministic ID matching.');
  }

  const matcher = createExerciseMatcher(exerciseCatalog as CatalogExercise[], transformLogger);

  let totalExercises = 0;
  let correctedCount = 0;
  const corrections: MergeExercisesOutput['corrections'] = [];

  const validatedWeek: typeof week1Template = deepClone(week1Template);

  for (const day of validatedWeek.days) {
    if (!day.setGroups || !Array.isArray(day.setGroups)) {
      continue;
    }

    for (const setGroup of day.setGroups) {
      totalExercises++;

      if (!matcher.isValidId(setGroup.exerciseId)) {
        const matchResult = matcher.match(
          setGroup.exerciseName,
          setGroup.exerciseId,
          undefined,
          day.targetMuscles
        );

        if (matchResult.wasCorrection) {
          correctedCount++;

          corrections.push({
            originalId: setGroup.exerciseId,
            originalName: setGroup.exerciseName,
            correctedId: matchResult.exerciseId,
            correctedName: matchResult.exerciseName,
            matchType: matchResult.matchType,
            confidence: matchResult.confidence,
          });

          setGroup.exerciseId = matchResult.exerciseId;
          setGroup.exerciseName = matchResult.exerciseName;
        }
      }
    }
  }

  return {
    validatedWeek1: validatedWeek,
    correctionStats: {
      total: totalExercises,
      corrected: correctedCount,
      failed: 0,
    },
    corrections: corrections.length > 0 ? corrections : undefined,
  };
}
