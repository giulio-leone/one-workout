/**
 * Workout Mesh Data Service
 *
 * Handles database integration for the workout agent mesh.
 * Fetches existing profiles, body measurements, workout history, and exercise catalog.
 *
 * @module workout/agents/utils/data-service
 */

import { prisma } from '@giulio-leone/lib-core';
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
    const profile = await prisma.user_profiles.findUnique({
      where: { userId },
      select: {
        id: true,
        age: true,
        sex: true,
        heightCm: true,
        weightKg: true,
        activityLevel: true,
        trainingFrequency: true,
        dailyCalories: true,
        workoutGoal: true,
        workoutGoals: true,
        equipment: true,
        dietaryRestrictions: true,
        dietType: true,
        healthNotes: true,
        weightIncrement: true,
      },
    });

    if (!profile) return null;

    return {
      id: profile.id,
      userId,
      age: profile.age,
      sex: profile.sex as ExistingUserProfile['sex'],
      heightCm: profile.heightCm,
      weightKg: profile.weightKg ? Number(profile.weightKg) : null,
      activityLevel: profile.activityLevel as ExistingUserProfile['activityLevel'],
      trainingFrequency: profile.trainingFrequency,
      dailyCalories: profile.dailyCalories,
      workoutGoal: profile.workoutGoal,
      workoutGoals: profile.workoutGoals,
      equipment: profile.equipment,
      dietaryRestrictions: profile.dietaryRestrictions,
      dietType: profile.dietType,
      healthNotes: profile.healthNotes,
      weightIncrement: profile.weightIncrement ? Number(profile.weightIncrement) : null,
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
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - limitDays);

    const measurements = await prisma.body_measurements.findMany({
      where: {
        userId,
        date: { gte: cutoffDate },
      },
      select: {
        date: true,
        weight: true,
        bodyFat: true,
        muscleMass: true,
      },
      orderBy: { date: 'asc' },
      take: 100,
    });

    return {
      measurements: measurements.map((m) => ({
        date: m.date,
        weight: m.weight ? Number(m.weight) : null,
        bodyFat: m.bodyFat ? Number(m.bodyFat) : null,
        muscleMass: m.muscleMass ? Number(m.muscleMass) : null,
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
    const programs = await prisma.workout_programs.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        goals: true,
        durationWeeks: true,
        createdAt: true,
        status: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

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

// ============================================================================
// EXERCISE CATALOG (OPTIMIZED)
// ============================================================================

import { LRUCache } from 'lru-cache';
import { createHash } from 'crypto';

// Initialize LRU Cache for exercise catalog
// Key: userId + equipmentHash
// TTL: 5 minutes
/** Catalog exercise entry for LRU cache */
interface CatalogExerciseEntry {
  id: string;
  name: string;
  category: string;
  targetMuscles: string[];
  equipment: string[];
}

const exerciseCatalogCache = new LRUCache<string, CatalogExerciseEntry[]>({
  max: 100,
  ttl: 5 * 60 * 1000,
});

/**
 * Fetch exercise catalog, optimized with Raw SQL and caching.
 * Replaces the slow Prisma findMany with a single aggregated query.
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
  const equipmentHash = equipmentNames
    ? createHash('md5').update(equipmentNames.sort().join(',')).digest('hex')
    : 'all';
  const cacheKey = `${userId}:${equipmentHash}`;

  const cached = exerciseCatalogCache.get(cacheKey);
  if (cached) {
    serviceLogger.info('Exercise catalog cache hit', { userId, count: cached.length });
    return cached;
  }

  try {
    const ignoreEquipment = !equipmentNames || equipmentNames.length === 0;
    const safeEquipmentList = ignoreEquipment ? [] : equipmentNames;

    // OPTIMIZED RAW SQL QUERY
    // Uses LATERAL JOIN pattern (via array_agg in main select) to avoid N+1 and massive joins
    // Properly quotes mixed-case identifiers based on schema verification
    const rawExercises = await prisma.$queryRaw<
      Array<{
        id: string;
        slug: string;
        name: string | null;
        category: string | null;
        target_muscles: string[] | null;
        equipment: string[] | null;
      }>
    >`
      SELECT 
        e.id,
        e.slug,
        -- Prefer translated name, fallback to slug
        COALESCE(t.name, e.slug) as name,
        -- Category from exercise type
        et.name as category,
        -- Aggregate muscles
        (
          SELECT array_agg(DISTINCT m.name)
          FROM exercise_muscles em
          JOIN muscles m ON m.id = em."muscleId"
          WHERE em."exerciseId" = e.id
        ) as target_muscles,
        -- Aggregate equipment
        (
          SELECT array_agg(DISTINCT eq.name)
          FROM exercise_equipments ee
          JOIN equipments eq ON eq.id = ee."equipmentId"
          WHERE ee."exerciseId" = e.id
        ) as equipment
      FROM exercises e
      -- Join translations for Italian
      LEFT JOIN exercise_translations t ON t."exerciseId" = e.id AND t.locale = 'it'
      -- Join types
      LEFT JOIN exercise_types et ON et.id = e."exerciseTypeId"
      WHERE 
        -- Filter by approval or ownership
        (e."approvalStatus" = 'APPROVED' OR e."createdById"::text = ${userId})
        -- Filter by equipment availability (if provided)
        AND (
          ${ignoreEquipment}::boolean IS TRUE
          OR EXISTS (
             SELECT 1 
             FROM exercise_equipments ee_check 
             JOIN equipments eq_check ON eq_check.id = ee_check."equipmentId"
             WHERE ee_check."exerciseId" = e.id 
             AND eq_check.name = ANY(${safeEquipmentList})
          )
        )
      ORDER BY e."createdAt" DESC
      LIMIT ${limit};
    `;

    // If no results, try Prisma fallback silently or with minimal warn if unexpected
    if (rawExercises.length === 0) {
      // Fallback to Prisma ORM query
      const prismaExercises = await prisma.exercises.findMany({
        take: limit,
        include: {
          exercise_translations: {
            where: { locale: 'it' },
            take: 1,
          },
          exercise_types: true,
          exercise_muscles: {
            include: { muscles: true },
          },
          exercise_equipments: {
            include: { equipments: true },
          },
        },
      });

      serviceLogger.info('Prisma fallback returned', { count: prismaExercises.length });

      const mappedPrisma = prismaExercises.map((ex) => ({
        id: ex.id,
        name: ex.exercise_translations[0]?.name || ex.slug,
        category: mapCategory(ex.exercise_types?.name || null),
        targetMuscles: ex.exercise_muscles.map((em) => em.muscles.name),
        equipment: ex.exercise_equipments.map((ee) => ee.equipments.name),
      }));

      exerciseCatalogCache.set(cacheKey, mappedPrisma);
      return mappedPrisma;
    }

    const mappedExercises = rawExercises.map((ex) => ({
      id: ex.id,
      name: ex.name || ex.slug,
      category: mapCategory(ex.category),
      targetMuscles: ex.target_muscles || [],
      equipment: ex.equipment || [],
    }));

    // Cache the result
    exerciseCatalogCache.set(cacheKey, mappedExercises);

    return mappedExercises;
  } catch (error) {
    serviceLogger.error('Error fetching exercise catalog (raw)', error as Error);
    // Fallback to safe empty array or throw?
    // Throwing allows the agent to retry or fail visibly rather than hallucinating with empty data.
    throw new Error('Failed to fetch exercise catalog');
  }
}

/**
 * Map database category to agent category.
 */
function mapCategory(category: string | null): string {
  if (!category) return 'compound';

  const categoryMap: Record<string, string> = {
    STRENGTH: 'compound',
    COMPOUND: 'compound',
    ISOLATION: 'isolation',
    CARDIO: 'cardio',
    CORE: 'core',
    MOBILITY: 'mobility',
    STRETCHING: 'mobility',
  };

  return categoryMap[category.toUpperCase()] || 'compound';
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
    const maxes = await prisma.user_one_rep_max.findMany({
      where: { userId },
      include: {
        exercises: {
          include: {
            exercise_translations: {
              where: { locale: 'it' },
              take: 1,
            },
          },
        },
      },
    });

    return {
      maxes: maxes.map((m) => ({
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
    const program = await prisma.workout_programs.findFirst({
      where: { userId, status: 'COMPLETED' },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        goals: true,
        durationWeeks: true,
        createdAt: true,
        weeks: true,
      },
    });

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
    const plan = await prisma.nutrition_plans.findFirst({
      where: { userId, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        targetMacros: true,
        goals: true,
      },
    });

    if (!plan) return null;

    const macros = plan.targetMacros as { calories?: number; protein?: number } | null;
    const userProfile = await prisma.user_profiles.findUnique({
      where: { userId },
      select: { dailyCalories: true, weightKg: true },
    });

    const tdee = userProfile?.dailyCalories || 2000;
    const targetCalories = macros?.calories || tdee;
    const calorieBalance = targetCalories - tdee;
    const weightKg = userProfile?.weightKg ? Number(userProfile.weightKg) : 80;
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
    const memory = await prisma.user_memories.findUnique({
      where: { userId },
      select: { memory: true },
    });

    if (!memory) return null;

    const memoryData = memory.memory as Record<string, unknown> | null;
    if (!memoryData) return null;

    // Extract workout-relevant sections
    const workoutMemory = (memoryData.workout || {}) as Record<string, unknown>;
    const fitnessMemory = (memoryData.fitness || {}) as Record<string, unknown>;

    // Fetch recent timeline events
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 90);

    const recentEvents = await prisma.user_memory_timeline.findMany({
      where: {
        userId,
        domain: { in: ['workout', 'fitness', 'general'] },
        date: { gte: cutoffDate },
      },
      orderBy: { date: 'desc' },
      take: 10,
    });

    return {
      preferences: workoutMemory.preferences || {},
      injuries: workoutMemory.injuries || [],
      notes: workoutMemory.notes || [],
      fitnessLevel: fitnessMemory.level || null,
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
