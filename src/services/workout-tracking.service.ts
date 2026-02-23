import 'server-only';
import { prisma } from '@giulio-leone/lib-core';
import { createId, toPrismaJsonValue, toWorkoutWeeks } from '@giulio-leone/lib-shared';
import { mapToWorkoutSession, mapToWorkoutSessions } from '@giulio-leone/one-workout';
import type {
  WorkoutSession,
  CreateWorkoutSessionRequest,
  UpdateWorkoutSessionRequest,
  WorkoutProgramStats,
} from '@giulio-leone/types/workout';
import type { WorkoutDay } from '@giulio-leone/types';

/**
 * Workout Tracking Service
 *
 * Service layer for managing workout session tracking.
 * Handles CRUD operations for WorkoutSession entities.
 *
 * Follows SOLID principles:
 * - Single Responsibility: Only manages workout session data
 * - Open/Closed: Extendable without modification
 * - Dependency Inversion: Depends on Prisma abstraction
 */

/**
 * Create a new workout session
 *
 * Initializes a workout session with the exercises from the specified program day.
 * Session starts with all tracking fields empty (to be filled by user).
 */
export async function createWorkoutSession(
  userId: string,
  request: CreateWorkoutSessionRequest
): Promise<WorkoutSession> {
  const { programId, weekNumber, dayNumber, notes } = request;

  // Fetch the workout program to get the exercises for this day
  const program = await prisma.workout_programs.findUnique({
    where: { id: programId },
  });

  if (!program) {
    throw new Error('Programma di allenamento non trovato');
  }

  if (program.userId !== userId) {
    throw new Error('Non hai i permessi per accedere a questo programma');
  }

  // Extract exercises from the program's week/day structure
  const weeks = toWorkoutWeeks(program.weeks);
  const week = weeks.find((w) => w.weekNumber === weekNumber);

  if (!week) {
    throw new Error(`Settimana ${weekNumber} non trovata nel programma`);
  }

  const day = week.days?.find((d: WorkoutDay) => d.dayNumber === dayNumber);

  if (!day) {
    throw new Error(`Giorno ${dayNumber} non trovato nella settimana ${weekNumber}`);
  }

  // Map setGroups (SDK 3.1) to exercises (Prisma storage)
  // Runtime data may have setGroups even though WorkoutDay type uses exercises
  const dayData = day as WorkoutDay & {
    setGroups?: Array<{
      exerciseId?: string;
      exerciseName?: string;
      sets?: Array<Record<string, unknown>>;
      notes?: string;
    }>;
  };
  const exercises =
    dayData.setGroups?.map(
      (g: {
        exerciseId?: string;
        exerciseName?: string;
        sets?: Array<Record<string, unknown>>;
        notes?: string;
      }) => ({
        id: g.exerciseId,
        name: g.exerciseName,
        sets: g.sets,
        restSeconds: g.sets?.[0]?.restSeconds || 60,
        notes: g.notes,
        targetMuscles: [],
      })
    ) || [];

  // Create session with exercises (tracking fields will be filled during workout)
  const session = await prisma.workout_sessions.create({
    data: {
      id: createId(),
      userId,
      programId,
      weekNumber,
      dayNumber,
      exercises: toPrismaJsonValue(exercises as unknown[]),
      notes,
      updatedAt: new Date(),
    },
  });

  // Map Prisma entity to domain type
  return mapToWorkoutSession(session);
}

/**
 * Get a workout session by ID
 */
export async function getWorkoutSession(
  sessionId: string,
  userId: string
): Promise<WorkoutSession | null> {
  const session = await prisma.workout_sessions.findUnique({
    where: { id: sessionId },
  });

  if (!session) {
    return null;
  }

  // Verify ownership
  if (session.userId !== userId) {
    throw new Error('Non hai i permessi per accedere a questa sessione');
  }

  // Map Prisma entity to domain type
  return mapToWorkoutSession(session);
}

/**
 * Get all workout sessions for a user
 *
 * @param userId - User ID
 * @param programId - Optional filter by program ID
 * @param limit - Max number of sessions to return
 */
export async function getWorkoutSessions(
  userId: string,
  programId?: string,
  limit?: number
): Promise<WorkoutSession[]> {
  const sessions = await prisma.workout_sessions.findMany({
    where: {
      userId,
      ...(programId && { programId }),
    },
    orderBy: {
      startedAt: 'desc',
    },
    ...(limit && { take: limit }),
  });

  // Map Prisma entities to domain types
  return mapToWorkoutSessions(sessions);
}

/**
 * Get all sessions for a specific program
 */
export async function getProgramSessions(
  programId: string,
  userId: string
): Promise<WorkoutSession[]> {
  return getWorkoutSessions(userId, programId);
}

/**
 * Update a workout session
 *
 * Typically called during or after a workout to update tracking data.
 */
export async function updateWorkoutSession(
  sessionId: string,
  userId: string,
  updates: UpdateWorkoutSessionRequest
): Promise<WorkoutSession> {
  const session = await getWorkoutSession(sessionId, userId);

  if (!session) {
    throw new Error('Sessione non trovata');
  }

  const updated = await prisma.workout_sessions.update({
    where: { id: sessionId },
    data: {
      ...(updates.exercises && {
        exercises: toPrismaJsonValue(updates.exercises as unknown[]),
      }),
      ...(updates.completedAt !== undefined && { completedAt: updates.completedAt }),
      ...(updates.notes !== undefined && { notes: updates.notes }),
      updatedAt: new Date(),
    },
  });

  // Map Prisma entity to domain type
  return mapToWorkoutSession(updated);
}

/**
 * Delete a workout session
 */
export async function deleteWorkoutSession(sessionId: string, userId: string): Promise<void> {
  const session = await getWorkoutSession(sessionId, userId);

  if (!session) {
    throw new Error('Sessione non trovata');
  }

  await prisma.workout_sessions.delete({
    where: { id: sessionId },
  });
}

/**
 * Get workout program statistics
 *
 * Calculates completion rate, total sessions, etc. for a program.
 */
export async function getWorkoutProgramStats(
  programId: string,
  userId: string
): Promise<WorkoutProgramStats> {
  const sessions = await prisma.workout_sessions.findMany({
    where: {
      programId,
      userId,
    },
  });

  const totalSessions = sessions.length;
  const completedSessions = sessions.filter((s) => s.completedAt !== null).length;
  const inProgressSessions = totalSessions - completedSessions;

  const lastSession = sessions.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())[0];

  // Calculate average duration for completed sessions
  const completedWithDuration = sessions.filter((s) => s.completedAt !== null && s.startedAt);
  const averageDuration =
    completedWithDuration.length > 0
      ? completedWithDuration.reduce((sum: number, s) => {
          const duration = (s.completedAt!.getTime() - s.startedAt.getTime()) / (1000 * 60); // minutes
          return sum + duration;
        }, 0) / completedWithDuration.length
      : undefined;

  return {
    programId,
    totalSessions,
    completedSessions,
    inProgressSessions,
    completionRate: totalSessions > 0 ? (completedSessions / totalSessions) * 100 : 0,
    averageDuration,
    lastSessionDate: lastSession?.startedAt,
  };
}

/**
 * Check if a session exists for a specific program day
 *
 * Useful for UI to show if user already tracked a specific day.
 */
export async function hasSessionForDay(
  userId: string,
  programId: string,
  weekNumber: number,
  dayNumber: number
): Promise<boolean> {
  const session = await prisma.workout_sessions.findFirst({
    where: {
      userId,
      programId,
      weekNumber,
      dayNumber,
    },
  });

  return session !== null;
}

/**
 * Get latest session for a program
 */
export async function getLatestProgramSession(
  programId: string,
  userId: string
): Promise<WorkoutSession | null> {
  const session = await prisma.workout_sessions.findFirst({
    where: {
      programId,
      userId,
    },
    orderBy: {
      startedAt: 'desc',
    },
  });

  if (!session) {
    return null;
  }

  // Map Prisma entity to domain type
  return mapToWorkoutSession(session);
}
