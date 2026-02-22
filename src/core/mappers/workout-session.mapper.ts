/**
 * Workout Session Mapper
 *
 * Clean mapping functions between Prisma entities and domain types.
 * Follows SOLID principles: Single Responsibility for mapping logic.
 */

import type { WorkoutSession, Exercise } from '@giulio-leone/types-workout';
import { toExerciseArrayTyped } from '@giulio-leone/lib-shared';
import type { workout_sessions } from '@prisma/client';

/**
 * Maps Prisma workout_sessions entity to domain WorkoutSession
 *
 * @param prismaSession - Raw Prisma session entity
 * @returns Properly typed WorkoutSession domain object
 */
export function mapToWorkoutSession(prismaSession: workout_sessions): WorkoutSession {
  return {
    id: prismaSession.id,
    createdAt: prismaSession.createdAt.toISOString(),
    updatedAt: prismaSession.updatedAt.toISOString(),
    userId: prismaSession.userId ?? '',
    programId: prismaSession.programId,
    weekNumber: prismaSession.weekNumber,
    dayNumber: prismaSession.dayNumber,
    startedAt: prismaSession.startedAt || new Date(),
    completedAt: prismaSession.completedAt || null,
    exercises: mapExercisesFromJson(prismaSession.exercises) as Exercise[],
    notes: prismaSession.notes || undefined,
  };
}

/**
 * Maps array of Prisma sessions to domain WorkoutSessions
 *
 * @param prismaSessions - Array of raw Prisma session entities
 * @returns Array of properly typed WorkoutSession domain objects
 */
export function mapToWorkoutSessions(prismaSessions: workout_sessions[]): WorkoutSession[] {
  return prismaSessions.map(mapToWorkoutSession);
}

/**
 * Helper function to safely map exercises from JsonValue
 *
 * @param exercisesJson - JsonValue from Prisma
 * @returns Array of Exercise objects
 */
function mapExercisesFromJson(exercisesJson: unknown): Exercise[] {
  if (!exercisesJson || !Array.isArray(exercisesJson)) {
    return [];
  }

  return toExerciseArrayTyped(exercisesJson);
}
