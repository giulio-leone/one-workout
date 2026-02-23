import { OneRepMaxService } from './one-rep-max.service';
import { normalizeAgentWorkoutPayload } from '@giulio-leone/one-workout';
import { calculateSetWeights } from './workout-weight-calculator.service';
import type {
  WorkoutProgram,
  WorkoutWeek,
  WorkoutDay,
  Exercise,
  SetGroup,
  ExerciseSet,
} from '@giulio-leone/types/workout';

/**
 * Normalize workout program and calculate weights based on user's 1RM
 * @param rawPayload - Raw workout payload from AI agent
 * @param userId - User ID for 1RM lookup (optional)
 * @param baseProgram - Base program data (optional)
 * @returns Normalized workout program with calculated weights
 */
export async function normalizeWithWeightCalculation(
  rawPayload: unknown,
  userId?: string,
  baseProgram?: Partial<WorkoutProgram>
): Promise<WorkoutProgram> {
  // First, normalize the structure
  const normalizedProgram = await normalizeAgentWorkoutPayload(rawPayload, baseProgram);

  // If no userId provided, return normalized program without weight calculation
  if (!userId) {
    return normalizedProgram;
  }

  // Collect all catalogExerciseIds in the program
  const exerciseIds = new Set<string>();
  normalizedProgram.weeks.forEach((week: WorkoutWeek) =>
    week.days.forEach((day: WorkoutDay) =>
      day.exercises.forEach((exercise: Exercise) => {
        if (exercise.catalogExerciseId) {
          exerciseIds.add(exercise.catalogExerciseId);
        }
      })
    )
  );

  // Load 1RM for all exercises in the program
  const userMaxesMap = new Map<string, number>();
  if (exerciseIds.size > 0) {
    const maxesResult = await OneRepMaxService.getBatchByExercises(
      userId!,
      Array.from(exerciseIds)
    );
    if (maxesResult.success && maxesResult.data) {
      maxesResult.data.forEach((max, catalogExerciseId) => {
        const oneRM = typeof max.oneRepMax === 'number' ? max.oneRepMax : Number(max.oneRepMax);
        userMaxesMap.set(catalogExerciseId, oneRM);
      });
    }
  }

  // Apply weight calculations to all exercises
  const programWithWeights: WorkoutProgram = {
    ...normalizedProgram,
    weeks: normalizedProgram.weeks.map((week: WorkoutWeek) => ({
      ...week,
      days: week.days.map((day: WorkoutDay) => ({
        ...day,
        exercises: day.exercises.map((exercise: Exercise) => {
          // Skip calculation if no catalogExerciseId
          if (!exercise.catalogExerciseId) {
            return exercise;
          }

          // Get 1RM for this exercise
          const oneRepMaxKg = userMaxesMap.get(exercise.catalogExerciseId);
          if (!oneRepMaxKg || oneRepMaxKg <= 0) {
            return exercise;
          }

          // Update setGroups with calculated weights
          const updatedSetGroups = exercise.setGroups.map((setGroup: SetGroup) => ({
            ...setGroup,
            baseSet: calculateSetWeights(setGroup.baseSet, oneRepMaxKg),
            sets: setGroup.sets.map((set: ExerciseSet) => calculateSetWeights(set, oneRepMaxKg)),
          }));

          return {
            ...exercise,
            setGroups: updatedSetGroups,
          };
        }),
      })),
    })),
  };

  return programWithWeights;
}
