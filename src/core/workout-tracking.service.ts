/**
 * Workout Tracking Service
 *
 * Service layer for managing workout session tracking.
 * Handles CRUD operations for WorkoutSession entities.
 *
 * SSOT: Usa SOLO setGroups per le serie, non exercise.sets legacy.
 *
 * Follows SOLID principles:
 * - Single Responsibility: Only manages workout session data
 * - Open/Closed: Extendable without modification
 * - Dependency Inversion: Depends on Prisma abstraction
 */

import { prisma } from '@onecoach/lib-core';
import { createId } from '@onecoach/lib-shared/id-generator';
import { toPrismaJsonValue } from '@onecoach/lib-shared';
import { mapToWorkoutSession, mapToWorkoutSessions } from './mappers/workout-session.mapper';
import { hydrateSetGroups } from './helpers/utils/set-group-helpers';
import { logger } from '@onecoach/lib-core';
import type {
  WorkoutSession,
  CreateWorkoutSessionRequest,
  UpdateWorkoutSessionRequest,
  WorkoutProgramStats,
} from '@onecoach/types-workout';

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
  logger.warn('[createWorkoutSession] Starting', { userId, request });
  const { programId, weekNumber, dayNumber, notes } = request;

  try {
    // FIRST: Check if there's ANY session for this day (active or completed)
    // We enforce a strict "One Session Per Day" policy to prevent duplicates.
    const existingSession = await prisma.workout_sessions.findFirst({
      where: {
        userId,
        programId,
        weekNumber,
        dayNumber,
        // We do NOT filter by completedAt: null anymore.
        // If a session exists for this day, we return it.
      },
      orderBy: [
        { completedAt: 'asc' }, // Prefer incomplete (null) sessions first if duplicates exist
        { updatedAt: 'desc' }, // Then most recently updated
      ],
    });

    if (existingSession) {
      const status = existingSession.completedAt ? 'COMPLETED' : 'ACTIVE';
      logger.warn(
        `[createWorkoutSession] Found existing ${status} session, returning it (No Duplicates Policy):`,
        {
          sessionId: existingSession.id,
          startedAt: existingSession.startedAt,
          updatedAt: existingSession.updatedAt,
          completedAt: existingSession.completedAt,
        }
      );
      return mapToWorkoutSession(existingSession);
    }

    logger.warn('[createWorkoutSession] No existing session found, creating new one');

    // Fetch the workout program to get the exercises for this day
    const program = await prisma.workout_programs.findUnique({
      where: { id: programId },
    });

    logger.warn('[createWorkoutSession] Program found:', { found: !!program });

    if (!program) {
      throw new Error('Programma di allenamento non trovato');
    }

    if (program.userId !== userId) {
      throw new Error('Non hai i permessi per accedere a questo programma');
    }

    // Extract exercises from the program's week/day structure
    let weeks = program.weeks as any; // JSON from DB
    logger.warn('[createWorkoutSession] Weeks info:', {
      type: typeof weeks,
      isArray: Array.isArray(weeks),
    });

    if (typeof weeks === 'string') {
      try {
        weeks = JSON.parse(weeks);
        logger.warn('[createWorkoutSession] Parsed weeks from string');
      } catch (e) {
        logger.error('[createWorkoutSession] Failed to parse weeks JSON:', e);
        weeks = [];
      }
    }

    // Loose equality check for weekNumber to handle string/number mismatch in JSON
    const week = Array.isArray(weeks) ? weeks.find((w: any) => w.weekNumber == weekNumber) : null;

    if (!week) {
      logger.error('[createWorkoutSession] Week not found:', {
        weekNumber,
        available: Array.isArray(weeks) ? weeks.map((w: any) => w.weekNumber) : 'none',
      });
      throw new Error(`Settimana ${weekNumber} non trovata nel programma`);
    }

    // Loose equality check for dayNumber
    const day = week.days?.find((d: any) => d.dayNumber == dayNumber);

    if (!day) {
      logger.error('[createWorkoutSession] Day not found:', {
        dayNumber,
        available: week.days?.map((d: any) => d.dayNumber),
      });
      throw new Error(`Giorno ${dayNumber} non trovato nella settimana ${weekNumber}`);
    }

    logger.warn('[createWorkoutSession] Day found, exercises count:', day.exercises?.length);

    // Ensure exercises is a valid object for Prisma JSON
    // SSOT: setGroups è l'unica fonte di verità per le serie
    // Hydrate setGroups[].sets da baseSet + count usando helper centralizzato
    const exercises = day.exercises
      ? structuredClone(day.exercises).map((ex: any) => {
          if (ex.setGroups && ex.setGroups.length > 0) {
            logger.warn(
              `[createWorkoutSession] Hydrating setGroups for exercise ${ex.name || ex.id}`
            );
            // Usa helper SSOT per idratare i setGroups
            ex.setGroups = hydrateSetGroups(ex.setGroups);
          } else {
            // Se non ci sono setGroups, inizializza array vuoto
            ex.setGroups = [];
          }

          return ex;
        })
      : [];

    // Create session with exercises (tracking fields will be filled during workout)
    const session = await prisma.workout_sessions.create({
      data: {
        id: createId(),
        userId,
        programId,
        weekNumber,
        dayNumber,
        exercises: exercises,
        notes,
        updatedAt: new Date(),
      },
    });

    logger.warn('[createWorkoutSession] Session created:', { sessionId: session.id });

    // Map Prisma entity to domain type
    return mapToWorkoutSession(session);
  } catch (error) {
    logger.error('[createWorkoutSession] Error:', error);
    throw error;
  }
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
  const result = mapToWorkoutSession(session);

  // DEBUG: Log loaded session exercises structure
  const exercises = result.exercises as any[];
  logger.warn('[getWorkoutSession] Loaded session:', {
    sessionId,
    exerciseCount: exercises?.length,
    firstExerciseSetData: exercises?.[0]?.setGroups?.[0]?.sets?.[0]
      ? {
          done: exercises[0].setGroups[0].sets[0].done,
          repsDone: exercises[0].setGroups[0].sets[0].repsDone,
          weightDone: exercises[0].setGroups[0].sets[0].weightDone,
        }
      : 'no set data',
  });

  return result;
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

  // DEBUG: Log what we're saving
  if (updates.exercises) {
    const exercises = updates.exercises as any[];
    logger.warn('[updateWorkoutSession] Saving exercises sample:', {
      sessionId,
      exerciseCount: exercises?.length,
      firstExercise: exercises?.[0]
        ? {
            name: exercises[0].name,
            setGroupsCount: exercises[0].setGroups?.length,
            firstSetGroup: exercises[0].setGroups?.[0]
              ? {
                  setsCount: exercises[0].setGroups[0].sets?.length,
                  firstSet: exercises[0].setGroups[0].sets?.[0]
                    ? {
                        done: exercises[0].setGroups[0].sets[0].done,
                        repsDone: exercises[0].setGroups[0].sets[0].repsDone,
                        weightDone: exercises[0].setGroups[0].sets[0].weightDone,
                      }
                    : 'no sets',
                }
              : 'no setGroups',
          }
        : 'no exercises',
    });
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
  const completedSessions = sessions.filter((s: any) => s.completedAt !== null).length;
  const inProgressSessions = totalSessions - completedSessions;

  const lastSession = sessions.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())[0];

  // Calculate average duration for completed sessions
  const completedWithDuration = sessions.filter((s: any) => s.completedAt !== null && s.startedAt);
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
 * Get an active (incomplete) session for a specific program day
 *
 * Returns the session if it exists and is not completed, null otherwise.
 * Used to resume existing sessions instead of creating duplicates.
 */
export async function getActiveSessionForDay(
  userId: string,
  programId: string,
  weekNumber: number,
  dayNumber: number
): Promise<WorkoutSession | null> {
  const session = await prisma.workout_sessions.findFirst({
    where: {
      userId,
      programId,
      weekNumber,
      dayNumber,
      completedAt: null, // Only incomplete sessions
    },
    orderBy: {
      updatedAt: 'desc', // Most recently UPDATED first (active work)
    },
  });

  if (!session) {
    return null;
  }

  logger.warn('[getActiveSessionForDay] Found existing session:', {
    sessionId: session.id,
    programId,
    weekNumber,
    dayNumber,
    updatedAt: session.updatedAt,
  });

  return mapToWorkoutSession(session);
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
