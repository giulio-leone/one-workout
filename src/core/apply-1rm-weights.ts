/**
 * Apply 1RM Weights Transform
 *
 * Calculates actual weights from intensityPercent using user's 1RM values.
 *
 * Performance optimized:
 * 1. Single pass to collect all unique exercise IDs
 * 2. Batch fetch all 1RM values in one DB call
 * 3. Single pass to apply weights using a lookup Map
 *
 * If no 1RM exists for an exercise:
 * - weight = 0 (placeholder)
 * - intensityPercent is preserved for user reference
 */

// Using ProgramWithWeeks interface since the actual runtime structure (with setGroups)
// differs from the static WorkoutProgram type

/**
 * User's 1RM data for an exercise
 */
export interface UserOneRepMax {
  exerciseId: string;
  oneRepMax: number; // in kg
}

/**
 * Set structure with optional intensity and weight fields
 */
interface SetWithIntensity {
  intensityPercent?: number | null;
  weight?: number | null;
  [key: string]: unknown;
}

/**
 * Exercise structure within a set group
 */
interface ExerciseInSetGroup {
  exerciseId: string;
  sets?: SetWithIntensity[];
  [key: string]: unknown;
}

/**
 * Generic workout program structure for type safety
 * Uses Record<string, unknown> for nested structures due to schema variations
 */
interface ProgramWithWeeks {
  weeks?: Array<{
    days?: Array<{
      setGroups?: Array<{
        exercises?: ExerciseInSetGroup[];
        [key: string]: unknown;
      }>;
      [key: string]: unknown;
    }>;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

/**
 * Collects all unique exercise IDs from a workout program.
 * Single pass through the entire structure.
 *
 * @param program - The workout program to scan
 * @returns Set of unique exercise IDs
 */
export function collectExerciseIds(program: ProgramWithWeeks): Set<string> {
  const exerciseIds = new Set<string>();

  if (!program.weeks) return exerciseIds;

  for (const week of program.weeks) {
    if (!week.days) continue;

    for (const day of week.days) {
      if (!day.setGroups) continue;

      for (const setGroup of day.setGroups) {
        if (!setGroup.exercises) continue;

        for (const exercise of setGroup.exercises) {
          if (exercise.exerciseId) {
            exerciseIds.add(exercise.exerciseId);
          }
        }
      }
    }
  }

  return exerciseIds;
}

/**
 * Applies 1RM-based weight calculation to all sets in a workout program.
 *
 * Formula: weight = (intensityPercent / 100) * oneRepMax
 *
 * If no 1RM exists for an exercise:
 * - weight is set to 0
 * - intensityPercent is preserved
 *
 * This is a pure function - does not mutate input.
 *
 * @param program - The workout program to enrich
 * @param oneRepMaxMap - Map of exerciseId -> 1RM value in kg
 * @param weightIncrement - User's preferred weight increment (default 2.5kg)
 * @returns New program with calculated weights
 */
export function applyUserOneRepMaxWeights(
  program: ProgramWithWeeks,
  oneRepMaxMap: Map<string, number>,
  weightIncrement: number = 2.5
): ProgramWithWeeks {
  if (!program.weeks || program.weeks.length === 0) {
    return program;
  }

  // Deep clone to avoid mutation (structuredClone is faster than JSON.parse/stringify)
  const enrichedProgram: ProgramWithWeeks = structuredClone(program);

  // Ensure increment is valid (default to 2.5 if invalid)
  const increment = weightIncrement > 0 ? weightIncrement : 2.5;

  let appliedCount = 0;
  let missingCount = 0;

  for (const week of enrichedProgram.weeks!) {
    if (!week.days) continue;

    for (const day of week.days) {
      if (!day.setGroups) continue;

      for (const setGroup of day.setGroups) {
        if (!setGroup.exercises) continue;

        for (const exercise of setGroup.exercises as ExerciseInSetGroup[]) {
          const exerciseId = exercise.exerciseId;
          if (!exerciseId || !exercise.sets) continue;

          const userOneRepMax = oneRepMaxMap.get(exerciseId);

          for (const set of exercise.sets) {
            const intensityPercent = set.intensityPercent;

            if (intensityPercent != null && intensityPercent > 0) {
              if (userOneRepMax && userOneRepMax > 0) {
                // Calculate weight from 1RM
                const rawWeight = (intensityPercent / 100) * userOneRepMax;
                // Round to nearest increment (2.5kg or 2kg based on user preference)
                const roundedWeight = Math.round(rawWeight / increment) * increment;
                // Limit to 2 decimal places
                set.weight = Math.round(roundedWeight * 100) / 100;
                appliedCount++;
              } else {
                // No 1RM available - set weight to 0, keep intensity
                set.weight = 0;
                missingCount++;
              }
            }
          }
        }
      }
    }
  }

  console.log(
    `[Apply1RMWeights] Applied ${appliedCount} weights, ${missingCount} missing 1RM values`
  );

  return enrichedProgram;
}

/**
 * Helper to convert service result to Map
 */
export function oneRepMaxArrayToMap(oneRepMaxes: UserOneRepMax[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const orm of oneRepMaxes) {
    map.set(orm.exerciseId, orm.oneRepMax);
  }
  return map;
}
