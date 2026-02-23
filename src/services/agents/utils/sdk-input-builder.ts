/**
 * Workout SDK Input Builder
 *
 * Shared utility for building SDK input from request body and user data.
 * Used by both polling and streaming workout generation routes.
 *
 * DRY: Single source of truth for input building logic.
 */

import { initializeWorkoutGeneration, registerWorkoutTransforms } from '@giulio-leone/one-workout';
import { WorkoutMeshDataService } from './data-service';
import type { WorkoutGenerationInput } from '@giulio-leone/types/ai';

export interface WorkoutSdkInput {
  userId: string;
  userProfile: {
    name: string;
    weight: number;
    height: number;
    age: number;
    gender: 'male' | 'female' | 'other';
    experienceLevel: 'beginner' | 'intermediate' | 'advanced' | 'elite';
    fitnessLevel: 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
  };
  goals: {
    primary: 'strength' | 'hypertrophy' | 'endurance' | 'power' | 'general_fitness';
    targetMuscles: string[];
    daysPerWeek: number;
    duration: number;
    sessionDuration: number;
  };
  constraints: {
    equipment: string[];
    location: 'gym' | 'home' | 'outdoor';
    timePerSession: number;
  };
  additionalNotes: string;
  availableExercises: string[];
  exerciseCatalog: Array<{
    id: string;
    name: string;
    category: string;
    targetMuscles: string[];
    equipment: string[];
  }>;
  weekRange: number[];
  userOneRepMaxes: Array<{
    exerciseId: string;
    oneRepMax: number;
  }>;
  weightIncrement: number;
}

export interface BuildSdkInputOptions {
  /** Initialize SDK (default: true) */
  initializeSdk?: boolean;
}

/**
 * Build SDK input from request body and user data
 *
 * @param userId - User ID
 * @param body - Request body with partial workout generation input
 * @param options - Build options
 * @returns Complete SDK input for workout generation agent
 */
export async function buildWorkoutSdkInput(
  userId: string,
  body: Partial<WorkoutGenerationInput> & { model?: string },
  options: BuildSdkInputOptions = {}
): Promise<WorkoutSdkInput> {
  const { initializeSdk = true } = options;

  // Extract parameters with defaults
  const goal = body.goals?.primary ?? 'hypertrophy';
  const daysPerWeek = body.goals?.daysPerWeek ?? 4;
  const durationWeeks = Math.min(body.goals?.duration ?? 4, 8); // Cap at 8 weeks
  const experienceLevel = body.userProfile?.experienceLevel ?? 'intermediate';
  const equipment = body.constraints?.equipment ?? ['barbell', 'dumbbell', 'cable', 'machine'];
  const targetMuscles = body.goals?.targetMuscles ?? ['chest', 'back', 'shoulders', 'legs'];
  const sessionDuration = body.goals?.sessionDuration ?? 60;
  const location = body.constraints?.location ?? 'gym';
  const fitnessLevel = body.userProfile?.fitnessLevel ?? 'moderate';

  // Fetch user data
  const data = await WorkoutMeshDataService.fetchWorkoutMeshData(userId);

  // Initialize SDK if requested
  if (initializeSdk) {
    initializeWorkoutGeneration();
    registerWorkoutTransforms();
  }

  const weekRange = Array.from({ length: durationWeeks - 1 }, (_, i) => i + 2);

  return {
    userId,
    userProfile: {
      name: 'User',
      weight: data.existingProfile?.weightKg ?? 70,
      height: data.existingProfile?.heightCm ?? 175,
      age: data.existingProfile?.age ?? 30,
      gender: (data.existingProfile?.sex ?? 'MALE').toLowerCase() as 'male' | 'female' | 'other',
      experienceLevel: experienceLevel as 'beginner' | 'intermediate' | 'advanced' | 'elite',
      fitnessLevel: fitnessLevel as 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active',
    },
    goals: {
      primary: goal as 'strength' | 'hypertrophy' | 'endurance' | 'power' | 'general_fitness',
      targetMuscles,
      daysPerWeek,
      duration: durationWeeks,
      sessionDuration,
    },
    constraints: {
      equipment,
      location: location as 'gym' | 'home' | 'outdoor',
      timePerSession: sessionDuration,
    },
    additionalNotes: body.additionalNotes ?? '',
    availableExercises: data.exerciseCatalog?.map((e: { id: string }) => e.id) ?? [],
    exerciseCatalog:
      data.exerciseCatalog?.map(
        (e: {
          id: string;
          name: string;
          category?: string;
          targetMuscles?: string[];
          equipment?: string[];
        }) => ({
          id: e.id,
          name: e.name,
          category: e.category ?? 'general',
          targetMuscles: e.targetMuscles ?? [],
          equipment: e.equipment ?? [],
        })
      ) ?? [],
    weekRange,
    userOneRepMaxes:
      data.userMaxes?.maxes?.map((m: { exerciseId: string; value: number }) => ({
        exerciseId: m.exerciseId,
        oneRepMax: m.value,
      })) ?? [],
    weightIncrement: data.existingProfile?.weightIncrement ?? 2.5,
  };
}
