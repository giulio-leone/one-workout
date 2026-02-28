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
 * - Dependency Inversion: Depends on repository abstractions (Hexagonal)
 */

import { ServiceRegistry, REPO_TOKENS } from '@giulio-leone/core';
import type { IWorkoutSessionRepository } from '@giulio-leone/core/repositories';
import type { IWorkoutRepository } from '@giulio-leone/core/repositories';
import { createId } from '@giulio-leone/lib-shared/id-generator';
import { deepClone } from '@giulio-leone/lib-shared';
import { mapToWorkoutSession, mapToWorkoutSessions } from './mappers/workout-session.mapper';
import { hydrateSetGroups } from './helpers/utils/set-group-helpers';
import { logger } from '@giulio-leone/lib-core';
import type {
  WorkoutSession,
  CreateWorkoutSessionRequest,
  UpdateWorkoutSessionRequest,
  WorkoutProgramStats,
} from '@giulio-leone/types/workout';
import type { Exercise, SetGroup } from '@giulio-leone/types';

/** Resolve repositories from the service registry */
function getSessionRepo(): IWorkoutSessionRepository {
  return ServiceRegistry.getInstance().resolve<IWorkoutSessionRepository>(REPO_TOKENS.WORKOUT_SESSION);
}

function getWorkoutRepo(): IWorkoutRepository {
  return ServiceRegistry.getInstance().resolve<IWorkoutRepository>(REPO_TOKENS.WORKOUT);
}

/** Loose JSON structure for workout week from DB */
interface JsonWeek {
  weekNumber: number;
  days?: JsonDay[];
  [key: string]: unknown;
}

/** Loose JSON structure for workout day from DB */
interface JsonDay {
  dayNumber: number;
  exercises?: JsonExercise[];
  [key: string]: unknown;
}

/** Loose JSON structure for exercise from DB */
interface JsonExercise {
  id?: string;
  name?: string;
  setGroups?: SetGroup[];
  [key: string]: unknown;
}

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
    const sessionRepo = getSessionRepo();
    const existingSession = await sessionRepo.findForDay(userId, programId, weekNumber, dayNumber);

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
    const workoutRepo = getWorkoutRepo();
    const program = await workoutRepo.findById(programId);

    logger.warn('[createWorkoutSession] Program found:', { found: !!program });

    if (!program) {
      throw new Error('Programma di allenamento non trovato');
    }

    if (program.userId !== userId) {
      throw new Error('Non hai i permessi per accedere a questo programma');
    }

    // Extract exercises from the program's week/day structure
    let weeks = program.weeks as unknown as JsonWeek[]; // JSON from DB
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
    const week = Array.isArray(weeks)
      ? weeks.find((w: JsonWeek) => w.weekNumber == weekNumber)
      : null;

    if (!week) {
      logger.error('[createWorkoutSession] Week not found:', {
        weekNumber,
        available: Array.isArray(weeks) ? weeks.map((w: JsonWeek) => w.weekNumber) : 'none',
      });
      throw new Error(`Settimana ${weekNumber} non trovata nel programma`);
    }

    // Loose equality check for dayNumber
    const day = week.days?.find((d: JsonDay) => d.dayNumber == dayNumber);

    if (!day) {
      logger.error('[createWorkoutSession] Day not found:', {
        dayNumber,
        available: week.days?.map((d: JsonDay) => d.dayNumber),
      });
      throw new Error(`Giorno ${dayNumber} non trovato nella settimana ${weekNumber}`);
    }

    logger.warn('[createWorkoutSession] Day found, exercises count:', {
      count: day.exercises?.length,
    });

    // Ensure exercises is a valid object for Prisma JSON
    // SSOT: setGroups è l'unica fonte di verità per le serie
    // Hydrate setGroups[].sets da baseSet + count usando helper centralizzato
    const exercises = day.exercises
      ? deepClone(day.exercises).map((ex: JsonExercise) => {
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
    const session = await sessionRepo.create({
      id: createId(),
      userId,
      programId,
      weekNumber,
      dayNumber,
      exercises,
      notes,
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
  const sessionRepo = getSessionRepo();
  const session = await sessionRepo.findById(sessionId);

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
  const exercises = result.exercises as Exercise[];
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
  const sessionRepo = getSessionRepo();
  const sessions = await sessionRepo.findByUser(userId, programId, limit);

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
    const exercises = updates.exercises as Exercise[];
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

  const updated = await getSessionRepo().update(sessionId, {
    ...(updates.exercises && { exercises: updates.exercises }),
    ...(updates.completedAt !== undefined && { completedAt: updates.completedAt }),
    ...(updates.notes !== undefined && { notes: updates.notes }),
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

  await getSessionRepo().delete(sessionId);
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
  const sessions = await getSessionRepo().findByUser(userId, programId);

  const totalSessions = sessions.length;
  const completedSessions = sessions.filter((s: any) => s.completedAt !== null).length;
  const inProgressSessions = totalSessions - completedSessions;

  const lastSession = sessions.sort((a: any, b: any) => b.startedAt.getTime() - a.startedAt.getTime())[0];

  // Calculate average duration for completed sessions
  const completedWithDuration = sessions.filter((s: any) => s.completedAt !== null && s.startedAt);
  const averageDuration =
    completedWithDuration.length > 0
      ? completedWithDuration.reduce((sum: number, s: any) => {
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
  const session = await getSessionRepo().findForDay(userId, programId, weekNumber, dayNumber);

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
  const session = await getSessionRepo().findActiveForDay(userId, programId, weekNumber, dayNumber);

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
  const session = await getSessionRepo().findLatest(programId, userId);

  if (!session) {
    return null;
  }

  // Map Prisma entity to domain type
  return mapToWorkoutSession(session);
}
