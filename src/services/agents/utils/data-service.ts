/**
 * Workout Mesh Data Service
 *
 * Handles database integration for the workout agent mesh.
 * Fetches existing profiles, body measurements, workout history, and exercise catalog.
 *
 * @module workout/agents/utils/data-service
 */

import {
  getWorkoutRepo,
  getExerciseRepo,
  getNutritionRepo,
  getUserRepo,
  getBodyMeasurementRepo,
  getUserMemoryRepo,
} from '@giulio-leone/core';
import { logger as sharedLogger } from '@giulio-leone/lib-shared';
import type {
  ExistingUserProfile,
  BodyMeasurementHistory,
  WorkoutHistory,
} from '@giulio-leone/types/workout';

const serviceLogger = sharedLogger.child('WorkoutMeshData');

// ============================================================================
// USER PROFILE
// ============================================================================

/**
 * Fetch existing user profile from database.
 */
export async function fetchExistingProfile(userId: string): Promise<ExistingUserProfile | null> {
  try {
    const profile = await getUserRepo().findUserProfile(userId);

    if (!profile) return null;

    return {
      id: profile.id,
      userId: profile.userId,
      age: profile.age,
      sex: profile.sex as ExistingUserProfile['sex'],
      heightCm: profile.heightCm,
      weightKg: profile.weightKg,
      activityLevel: profile.activityLevel as ExistingUserProfile['activityLevel'],
      trainingFrequency: profile.trainingFrequency,
      dailyCalories: profile.dailyCalories,
      workoutGoal: profile.workoutGoal,
      workoutGoals: profile.workoutGoals,
      equipment: profile.equipment,
      dietaryRestrictions: profile.dietaryRestrictions,
      dietType: profile.dietType,
      healthNotes: profile.healthNotes,
      weightIncrement: profile.weightIncrement,
    };
  } catch (error) {
    serviceLogger.error('Error fetching profile', error as Error);
    return null;
  }
}

// ============================================================================
// BODY MEASUREMENTS
// ============================================================================

/**
 * Fetch body measurement history for the user.
 */
export async function fetchBodyMeasurementHistory(
  userId: string,
  limitDays = 90
): Promise<BodyMeasurementHistory> {
  try {
    const measurements = await getBodyMeasurementRepo().findByUserId(userId, {
      limitDays,
      take: 100,
    });

    return {
      measurements: measurements.map((m) => ({
        date: m.date,
        weight: m.weight,
        bodyFat: m.bodyFat,
        muscleMass: m.muscleMass,
      })),
    };
  } catch (error) {
    serviceLogger.error('Error fetching body measurements', error as Error);
    return { measurements: [] };
  }
}

// ============================================================================
// WORKOUT HISTORY
// ============================================================================

/**
 * Fetch previous workout programs for the user.
 */
export async function fetchWorkoutHistory(userId: string, limit = 10): Promise<WorkoutHistory> {
  try {
    const programs = await getWorkoutRepo().findMany(
      { userId },
      { orderBy: { createdAt: 'desc' }, take: limit }
    );

    return {
      programs: programs.map((p) => ({
        id: p.id,
        name: p.name || 'Untitled Program',
        goal: (p.goals as string[])?.[0] || 'general_fitness',
        durationWeeks: p.durationWeeks || 4,
        completedWeeks: p.status === 'COMPLETED' ? p.durationWeeks : undefined,
        createdAt: p.createdAt,
      })),
    };
  } catch (error) {
    serviceLogger.error('Error fetching workout history', error as Error);
    return { programs: [] };
  }
}

// ============================================================================
// EXERCISE CATALOG
// ============================================================================

/**
 * Fetch exercise catalog, delegated to the exercise repository adapter.
 * LRU caching and raw SQL are handled inside the Prisma adapter.
 */
export async function fetchExerciseCatalog(
  userId: string,
  equipmentNames?: string[],
  limit = 300
): Promise<
  Array<{
    id: string;
    name: string;
    category: string;
    targetMuscles: string[];
    equipment: string[];
  }>
> {
  try {
    return await getExerciseRepo().findCatalogExercises(userId, { equipmentNames, limit });
  } catch (error) {
    serviceLogger.error('Error fetching exercise catalog', error as Error);
    throw new Error('Failed to fetch exercise catalog');
  }
}

// ============================================================================
// USER MAXES (1RM RECORDS)
// ============================================================================

import type {
  UserMaxes,
  LastProgramContext,
  NutritionContext,
  UserMemoryContext,
  WorkoutMeshContext,
} from '@giulio-leone/types/workout';

/**
 * Fetch user's tested 1RM records from database.
 */
export async function fetchUserMaxes(userId: string): Promise<UserMaxes> {
  try {
    const maxes = await getExerciseRepo().findUserMaxesWithExercises({ userId });

    return {
      maxes: maxes.map((m: any) => ({
        exerciseId: m.exerciseId,
        exerciseName: m.exercises.exercise_translations[0]?.name || m.exercises.slug,
        value: Number(m.oneRepMax),
        unit: 'kg' as const,
        confidence: 'tested' as const,
        lastUpdated: m.lastUpdated,
      })),
    };
  } catch (error) {
    serviceLogger.error('Error fetching user maxes', error as Error);
    return { maxes: [] };
  }
}

// ============================================================================
// LAST PROGRAM DETAILS (PHASE CONTINUITY)
// ============================================================================

/**
 * Fetch last completed program details for phase continuity.
 */
export async function fetchLastProgramDetails(userId: string): Promise<LastProgramContext | null> {
  try {
    const programs = await getWorkoutRepo().findMany(
      { userId, status: 'COMPLETED' },
      { orderBy: { createdAt: 'desc' }, take: 1 }
    );
    const program = programs[0] ?? null;

    if (!program) return null;

    // Extract last phase from weeks JSON
    const weeks = program.weeks as Array<Record<string, unknown>> | null;
    let lastPhase: LastProgramContext['lastPhase'] = 'unknown';

    if (weeks && weeks.length > 0) {
      const lastWeek = weeks[weeks.length - 1];
      // Try to infer phase from week data
      const phase = lastWeek?.phase;
      if (typeof phase === 'string') {
        lastPhase = phase.toLowerCase() as LastProgramContext['lastPhase'];
      } else if (lastWeek?.focus) {
        // Infer from focus
        const focus = (lastWeek.focus as string[])?.join(' ').toLowerCase() || '';
        if (focus.includes('volume') || focus.includes('accumulation')) {
          lastPhase = 'accumulation';
        } else if (focus.includes('intensity') || focus.includes('strength')) {
          lastPhase = 'intensification';
        } else if (focus.includes('peak') || focus.includes('realization')) {
          lastPhase = 'realization';
        } else if (focus.includes('deload') || focus.includes('recovery')) {
          lastPhase = 'deload';
        }
      }
    }

    const now = new Date();
    const daysSinceCompletion = Math.floor(
      (now.getTime() - program.createdAt.getTime()) / (1000 * 60 * 60 * 24)
    );

    return {
      id: program.id,
      name: program.name || 'Programma precedente',
      goal: (program.goals as string[])?.[0] || 'general_fitness',
      durationWeeks: program.durationWeeks || 4,
      completedAt: program.createdAt,
      lastPhase,
      daysSinceCompletion,
    };
  } catch (error) {
    serviceLogger.error('Error fetching last program', error as Error);
    return null;
  }
}

// ============================================================================
// NUTRITION CONTEXT
// ============================================================================

/**
 * Fetch active nutrition plan for recovery inference.
 */
export async function fetchNutritionContext(userId: string): Promise<NutritionContext | null> {
  try {
    const plans = await getNutritionRepo().findMany(
      { userId, status: 'ACTIVE' },
      { orderBy: { createdAt: 'desc' }, take: 1 }
    );
    const plan = plans[0] ?? null;

    if (!plan) return null;

    const macros = plan.targetMacros as { calories?: number; protein?: number } | null;
    const userProfile = await getUserRepo().findUserProfile(userId);

    const tdee = userProfile?.dailyCalories || 2000;
    const targetCalories = macros?.calories || tdee;
    const calorieBalance = targetCalories - tdee;
    const weightKg = userProfile?.weightKg ?? 80;
    const proteinPerKg = macros?.protein ? macros.protein / weightKg : null;

    let implication: NutritionContext['implication'] = 'maintenance';
    if (calorieBalance > 200) implication = 'surplus';
    else if (calorieBalance < -200) implication = 'deficit';

    return {
      hasActivePlan: true,
      nutritionGoal: (plan.goals as string[])?.[0] || 'maintenance',
      calorieBalance,
      proteinPerKg,
      implication,
    };
  } catch (error) {
    serviceLogger.error('Error fetching nutrition context', error as Error);
    return null;
  }
}

// ============================================================================
// USER MEMORY CONTEXT
// ============================================================================

/**
 * Fetch user memory for personalization.
 */
export async function fetchUserMemoryContext(userId: string): Promise<UserMemoryContext | null> {
  try {
    const memoryRepo = getUserMemoryRepo();
    const memory = await memoryRepo.findMemory(userId);

    if (!memory) return null;

    const memoryData = memory.memory as Record<string, unknown> | null;
    if (!memoryData) return null;

    // Extract workout-relevant sections
    const workoutMemory = (memoryData.workout || {}) as Record<string, unknown>;
    const fitnessMemory = (memoryData.fitness || {}) as Record<string, unknown>;

    // Fetch recent timeline events
    const recentEvents = await memoryRepo.findRecentTimeline(userId, {
      domains: ['workout', 'fitness', 'general'],
      limitDays: 90,
      take: 10,
    });

    return {
      preferences: (workoutMemory.preferences as Record<string, unknown>) || {},
      injuries: (workoutMemory.injuries as string[]) || [],
      notes: (workoutMemory.notes as string[]) || [],
      fitnessLevel: (fitnessMemory.level as string | null) || null,
      recentEvents: recentEvents.map((e) => ({
        type: e.eventType,
        title: e.title,
        date: e.date,
        data: e.data,
      })),
    };
  } catch (error) {
    serviceLogger.error('Error fetching user memory', error as Error);
    return null;
  }
}

// ============================================================================
// COMBINED DATA FETCH (EXTENDED)
// ============================================================================

/**
 * Fetch all data needed for workout mesh orchestration.
 * Includes extended context: maxes, last program, nutrition, memory.
 */
export async function fetchWorkoutMeshData(userId: string): Promise<WorkoutMeshContext> {
  // Fetch existing profile first (needed for equipment filter)
  const existingProfile = await fetchExistingProfile(userId);

  // Fetch all data in parallel for efficiency
  const [
    bodyHistory,
    workoutHistory,
    exerciseCatalog,
    userMaxes,
    lastProgram,
    nutritionContext,
    memoryContext,
  ] = await Promise.all([
    fetchBodyMeasurementHistory(userId),
    fetchWorkoutHistory(userId),
    fetchExerciseCatalog(userId, existingProfile?.equipment),
    fetchUserMaxes(userId),
    fetchLastProgramDetails(userId),
    fetchNutritionContext(userId),
    fetchUserMemoryContext(userId),
  ]);

  return {
    existingProfile,
    bodyHistory,
    workoutHistory,
    exerciseCatalog,
    userMaxes,
    lastProgram,
    nutritionContext,
    memoryContext,
  };
}

// ============================================================================
// EXPORT
// ============================================================================

export const WorkoutMeshDataService = {
  fetchExistingProfile,
  fetchBodyMeasurementHistory,
  fetchWorkoutHistory,
  fetchExerciseCatalog,
  fetchUserMaxes,
  fetchLastProgramDetails,
  fetchNutritionContext,
  fetchUserMemoryContext,
  fetchWorkoutMeshData,
};

export default WorkoutMeshDataService;
