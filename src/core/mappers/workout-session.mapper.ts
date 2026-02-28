/**
 * Workout Session Mapper
 *
 * Clean mapping functions between repository entities and domain types.
 * Follows SOLID principles: Single Responsibility for mapping logic.
 */

import type { WorkoutSession, Exercise } from '@giulio-leone/types/workout';
import { toExerciseArrayTyped } from '@giulio-leone/lib-shared';

/** Shape accepted by the mapper — compatible with both Prisma and repo types */
interface SessionRecord {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  userId: string | null;
  programId: string;
  weekNumber: number;
  dayNumber: number;
  startedAt: Date;
  completedAt: Date | null;
  exercises: unknown;
  notes: string | null;
}

/**
 * Maps a session record to domain WorkoutSession
 */
export function mapToWorkoutSession(session: SessionRecord): WorkoutSession {
  return {
    id: session.id,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
    userId: session.userId ?? '',
    programId: session.programId,
    weekNumber: session.weekNumber,
    dayNumber: session.dayNumber,
    startedAt: session.startedAt || new Date(),
    completedAt: session.completedAt || null,
    exercises: mapExercisesFromJson(session.exercises) as Exercise[],
    notes: session.notes || undefined,
  };
}

/**
 * Maps array of session records to domain WorkoutSessions
 */
export function mapToWorkoutSessions(sessions: SessionRecord[]): WorkoutSession[] {
  return sessions.map(mapToWorkoutSession);
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
