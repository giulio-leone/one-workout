/**
 * Workout Generation Mapper
 *
 * Provides strictly typed transformations from AI-generated schemas to canonical workout types.
 * This is a structural fix to ensure type safety without 'as any' casts.
 */

import crypto from 'node:crypto';
import {
  type AIWorkoutProgram,
  type AIWorkoutWeek,
  type AIWorkoutDay,
  type AIExercise,
  type AISetGroup,
} from '@giulio-leone/schemas';
import type {
  WorkoutProgram,
  WorkoutWeek,
  WorkoutDay,
  Exercise,
  SetGroup,
  ExerciseSet,
  DifficultyLevel,
} from '@giulio-leone/types/workout';

/**
 * Flexible base set type that allows array values for pyramid/variable sets.
 * AI output may contain arrays (e.g., reps: [8, 10, 12]) even though the schema
 * defines scalar values. This type captures that runtime variance.
 */
interface AIBaseSetFlexible {
  reps?: number | number[];
  repsMax?: number | number[];
  duration?: number | number[];
  weight?: number | number[] | null;
  weightMax?: number | number[] | null;
  weightLbs?: number | number[] | null;
  rest?: number | number[];
  intensityPercent?: number | number[] | null;
  intensityPercentMax?: number | number[] | null;
  rpe?: number | number[] | null;
  rpeMax?: number | number[] | null;
  notes?: string | string[];
}

/**
 * Maps DifficultyLevel from AI output to Database enum.
 * ELITE is mapped to ADVANCED for DB storage.
 */
export function mapDifficulty(difficulty: string | undefined | null): DifficultyLevel {
  if (!difficulty) {
    return 'BEGINNER';
  }
  const mapping: Record<string, DifficultyLevel> = {
    BEGINNER: 'BEGINNER',
    INTERMEDIATE: 'INTERMEDIATE',
    ADVANCED: 'ADVANCED',
    ELITE: 'ADVANCED',
  };
  return mapping[difficulty.toUpperCase()] || 'BEGINNER';
}

/**
 * Maps an AI-generated set group to the canonical SetGroup type.
 */
/**
 * Maps an AI-generated set group to the canonical SetGroup type.
 * Includes expansion logic to populate the sets[] array from baseSet + count.
 * Supports pyramid/variable sets where baseSet fields are arrays.
 */
export function mapAISetGroupToSetGroup(aiSetGroup: AISetGroup): SetGroup {
  const id = crypto.randomUUID();
  const count = aiSetGroup.count || 1;
  const aiBaseSet = aiSetGroup.baseSet as unknown as AIBaseSetFlexible;

  // 1. Create the canonical base set (take the first values if pyramid)
  const baseSet: ExerciseSet = {
    reps: Array.isArray(aiBaseSet.reps) ? aiBaseSet.reps[0] : (aiBaseSet.reps ?? undefined),
    repsMax: Array.isArray(aiBaseSet.repsMax)
      ? aiBaseSet.repsMax[0]
      : (aiBaseSet.repsMax ?? undefined),
    duration: Array.isArray(aiBaseSet.duration)
      ? aiBaseSet.duration[0]
      : (aiBaseSet.duration ?? undefined),
    weight: Array.isArray(aiBaseSet.weight)
      ? (aiBaseSet.weight[0] ?? null)
      : (aiBaseSet.weight ?? null),
    weightMax: Array.isArray(aiBaseSet.weightMax)
      ? (aiBaseSet.weightMax[0] ?? null)
      : (aiBaseSet.weightMax ?? null),
    weightLbs: Array.isArray(aiBaseSet.weightLbs)
      ? (aiBaseSet.weightLbs[0] ?? null)
      : (aiBaseSet.weightLbs ?? null),
    rest: Array.isArray(aiBaseSet.rest) ? (aiBaseSet.rest[0] ?? 60) : (aiBaseSet.rest ?? 60),
    intensityPercent: Array.isArray(aiBaseSet.intensityPercent)
      ? (aiBaseSet.intensityPercent[0] ?? null)
      : (aiBaseSet.intensityPercent ?? null),
    intensityPercentMax: Array.isArray(aiBaseSet.intensityPercentMax)
      ? (aiBaseSet.intensityPercentMax[0] ?? null)
      : (aiBaseSet.intensityPercentMax ?? null),
    rpe: Array.isArray(aiBaseSet.rpe) ? (aiBaseSet.rpe[0] ?? null) : (aiBaseSet.rpe ?? null),
    rpeMax: Array.isArray(aiBaseSet.rpeMax)
      ? (aiBaseSet.rpeMax[0] ?? null)
      : (aiBaseSet.rpeMax ?? null),
    notes: Array.isArray(aiBaseSet.notes) ? (aiBaseSet.notes[0] ?? '') : (aiBaseSet.notes ?? ''),
  };

  // 2. Expansion logic: Generate individual sets based on count
  // AI might provide explicit sets, or we generate them from baseSet (with pyramid support)
  const sets: ExerciseSet[] =
    aiSetGroup.sets?.map((s, index) => ({
      reps: s.reps ?? (Array.isArray(aiBaseSet.reps) ? aiBaseSet.reps[index] : baseSet.reps),
      repsMax:
        s.repsMax ??
        (Array.isArray(aiBaseSet.repsMax) ? aiBaseSet.repsMax[index] : baseSet.repsMax),
      duration:
        s.duration ??
        (Array.isArray(aiBaseSet.duration) ? aiBaseSet.duration[index] : baseSet.duration),
      weight:
        s.weight ?? (Array.isArray(aiBaseSet.weight) ? aiBaseSet.weight[index] : baseSet.weight),
      weightMax:
        s.weightMax ??
        (Array.isArray(aiBaseSet.weightMax) ? aiBaseSet.weightMax[index] : baseSet.weightMax),
      weightLbs:
        s.weightLbs ??
        (Array.isArray(aiBaseSet.weightLbs) ? aiBaseSet.weightLbs[index] : baseSet.weightLbs),
      rest: s.rest ?? (Array.isArray(aiBaseSet.rest) ? aiBaseSet.rest[index] : baseSet.rest),
      intensityPercent:
        s.intensityPercent ??
        (Array.isArray(aiBaseSet.intensityPercent)
          ? aiBaseSet.intensityPercent[index]
          : baseSet.intensityPercent),
      intensityPercentMax:
        s.intensityPercentMax ??
        (Array.isArray(aiBaseSet.intensityPercentMax)
          ? aiBaseSet.intensityPercentMax[index]
          : baseSet.intensityPercentMax),
      rpe: s.rpe ?? (Array.isArray(aiBaseSet.rpe) ? aiBaseSet.rpe[index] : baseSet.rpe),
      rpeMax:
        s.rpeMax ?? (Array.isArray(aiBaseSet.rpeMax) ? aiBaseSet.rpeMax[index] : baseSet.rpeMax),
      notes:
        (Array.isArray(s.notes) ? s.notes[0] : s.notes) ??
        (Array.isArray(aiBaseSet.notes) ? aiBaseSet.notes[index] : baseSet.notes),
    })) ||
    Array.from({ length: count }, (_, index) => ({
      reps: Array.isArray(aiBaseSet.reps) ? aiBaseSet.reps[index] : baseSet.reps,
      repsMax: Array.isArray(aiBaseSet.repsMax) ? aiBaseSet.repsMax[index] : baseSet.repsMax,
      duration: Array.isArray(aiBaseSet.duration) ? aiBaseSet.duration[index] : baseSet.duration,
      weight: Array.isArray(aiBaseSet.weight) ? aiBaseSet.weight[index] : baseSet.weight,
      weightMax: Array.isArray(aiBaseSet.weightMax)
        ? aiBaseSet.weightMax[index]
        : baseSet.weightMax,
      weightLbs: Array.isArray(aiBaseSet.weightLbs)
        ? aiBaseSet.weightLbs[index]
        : baseSet.weightLbs,
      rest: Array.isArray(aiBaseSet.rest) ? aiBaseSet.rest[index] : baseSet.rest,
      intensityPercent: Array.isArray(aiBaseSet.intensityPercent)
        ? aiBaseSet.intensityPercent[index]
        : baseSet.intensityPercent,
      intensityPercentMax: Array.isArray(aiBaseSet.intensityPercentMax)
        ? aiBaseSet.intensityPercentMax[index]
        : baseSet.intensityPercentMax,
      rpe: Array.isArray(aiBaseSet.rpe) ? aiBaseSet.rpe[index] : baseSet.rpe,
      rpeMax: Array.isArray(aiBaseSet.rpeMax) ? aiBaseSet.rpeMax[index] : baseSet.rpeMax,
      notes: baseSet.notes,
    }));

  return {
    id,
    count,
    baseSet,
    sets,
    progression: aiSetGroup.progression ?? undefined,
  };
}

/**
 * Maps an AI-generated exercise to the canonical Exercise type.
 */
/**
 * Maps an AI-generated exercise to the canonical Exercise type.
 */
export function mapAIExerciseToExercise(aiExercise: AIExercise): Exercise {
  const id = crypto.randomUUID();

  // Handle legacy 'sets' if present (AI might output it occasionally despite schema)
  const rawExercise = aiExercise as Record<string, unknown>;
  const legacySets = Array.isArray(rawExercise.sets)
    ? (rawExercise.sets as Array<Partial<ExerciseSet>>)
    : [];

  let setGroups: SetGroup[] = [];
  if (aiExercise.setGroups && aiExercise.setGroups.length > 0) {
    setGroups = aiExercise.setGroups.map(mapAISetGroupToSetGroup);
  } else if (legacySets.length > 0) {
    // Convert legacy sets to a default SetGroup
    const count = legacySets.length;
    const baseAIExSet = legacySets[0];
    if (!baseAIExSet) {
      // Should not happen since legacySets.length > 0, but guard for type safety
      setGroups = [];
    } else {
      const baseSet: ExerciseSet = {
        reps: baseAIExSet.reps,
        weight: baseAIExSet.weight ?? null,
        weightLbs:
          baseAIExSet.weightLbs ?? (baseAIExSet.weight ? baseAIExSet.weight * 2.20462 : null),
        rest: baseAIExSet.rest ?? 60,
        intensityPercent: baseAIExSet.intensityPercent ?? null,
        rpe: baseAIExSet.rpe ?? null,
        notes: baseAIExSet.notes ?? '',
      };

      setGroups = [
        {
          id: crypto.randomUUID(),
          count,
          baseSet,
          sets: legacySets.map(
            (s) =>
              ({
                ...baseSet,
                ...s,
                id: crypto.randomUUID(),
                weightLbs: s.weightLbs ?? (s.weight ? s.weight * 2.20462 : baseSet.weightLbs),
              }) as ExerciseSet
          ),
        },
      ];
    }
  }

  return {
    id,
    name:
      aiExercise.name ||
      ('exerciseName' in aiExercise
        ? String((aiExercise as Record<string, unknown>).exerciseName)
        : '') ||
      'Untitled Exercise',
    description: aiExercise.description || '',
    category: aiExercise.category || 'strength',
    muscleGroups: aiExercise.muscleGroups || [],
    notes: aiExercise.notes || '',
    typeLabel: aiExercise.typeLabel || aiExercise.type || '',
    repRange: aiExercise.repRange || '',
    formCues: aiExercise.formCues || [],
    equipment: aiExercise.equipment || [],
    catalogExerciseId:
      aiExercise.exerciseId ||
      ('catalogExerciseId' in aiExercise
        ? String((aiExercise as Record<string, unknown>).catalogExerciseId)
        : '') ||
      aiExercise.id ||
      '',
    setGroups,
    videoUrl: aiExercise.videoUrl,
    variation: aiExercise.variation,
  };
}

/**
 * Maps an AI-generated day to the canonical WorkoutDay type.
 */
export function mapAIDayToWorkoutDay(aiDay: AIWorkoutDay): WorkoutDay {
  return {
    dayNumber: aiDay.dayNumber,
    dayName: aiDay.dayName || aiDay.name || `Day ${aiDay.dayNumber}`,
    name: aiDay.name || aiDay.dayName || `Day ${aiDay.dayNumber}`,
    exercises: (aiDay.exercises ?? []).map(mapAIExerciseToExercise),
    notes: aiDay.notes || '',
    targetMuscles: aiDay.targetMuscles || [],
    warmup: aiDay.warmup,
    cooldown: aiDay.cooldown || '',
    totalDuration: aiDay.totalDuration,
  };
}

/**
 * Maps AI Week Data to WorkoutWeek.
 */
/**
 * Maps AI Week Data to WorkoutWeek.
 */
export function mapAIWeekToWorkoutWeek(
  aiWeek: AIWorkoutWeek,
  weekNumberOverride?: number
): WorkoutWeek {
  return {
    weekNumber: weekNumberOverride ?? aiWeek.weekNumber,
    focus: aiWeek.focus || '',
    notes: aiWeek.notes || '',
    days: aiWeek.days.map(mapAIDayToWorkoutDay),
    isDeload: 'isDeload' in aiWeek ? Boolean((aiWeek as Record<string, unknown>).isDeload) : false,
  };
}

/**
 * Maps an AI-generated program to the canonical WorkoutProgram type.
 */
/**
 * Maps an AI-generated program to the canonical WorkoutProgram type.
 */
export function mapAIProgramToWorkoutProgram(
  aiProgram: AIWorkoutProgram,
  durationWeeks?: number
): WorkoutProgram {
  const now = new Date().toISOString();
  const weeks = aiProgram.weeks?.map((w, i) => mapAIWeekToWorkoutWeek(w, i + 1)) ?? [];

  return {
    id: crypto.randomUUID(),
    name: aiProgram.name || 'Untitled Program',
    description: aiProgram.description || '',
    difficulty: mapDifficulty(aiProgram.difficulty),
    durationWeeks: durationWeeks || aiProgram.durationWeeks || weeks.length || 1,
    status: 'DRAFT',
    goals: aiProgram.goals || [],
    weeks,
    createdAt: now,
    updatedAt: now,
    version: 1,
    metadata: {},
  };
}

/**
 * SDK Output Structure:
 * - day.setGroups: Array of { exerciseId, exerciseName, sets[], technicalCues[] }
 *
 * Persistence Structure:
 * - day.exercises: Array of { id, name, setGroups[] }
 *
 * This function converts SDK format to persistence-compatible format.
 */

/** SDK set from AI generation output */
interface SdkSet {
  reps?: number;
  weight?: number | null;
  weightLbs?: number | null;
  restSeconds?: number;
  rest?: number;
  rpe?: number | null;
  intensityPercent?: number | null;
  notes?: string;
}

/** SDK set group from AI generation output */
interface SdkSetGroup {
  exerciseId?: string;
  exerciseName?: string;
  sets?: SdkSet[];
  technicalCues?: string[];
  notes?: string;
  order?: number;
}

/** SDK day from AI generation output */
interface SdkDay {
  dayNumber?: number;
  dayName?: string;
  name?: string;
  setGroups?: SdkSetGroup[];
  exercises?: unknown[];
  targetMuscles?: string[];
  focus?: string[];
  notes?: string;
  estimatedDuration?: number;
}

/** SDK week from AI generation output */
interface SdkWeek {
  weekNumber?: number;
  focus?: string;
  phase?: string;
  notes?: string;
  days?: SdkDay[];
}

/** SDK program from AI generation output */
interface SdkProgram {
  id?: string;
  name?: string;
  description?: string;
  difficulty?: string;
  durationWeeks?: number;
  goals?: string[];
  primaryGoal?: string;
  weeks?: SdkWeek[];
  createdAt?: string;
}

export function mapSdkProgramToWorkoutProgram(sdkProgram: SdkProgram): WorkoutProgram {
  const now = new Date().toISOString();

  // DEBUG: Log input structure to trace content loss

  // Map SDK weeks to WorkoutProgram weeks
  const weeks: WorkoutWeek[] = (sdkProgram.weeks ?? []).map((week: SdkWeek, weekIndex: number) => ({
    weekNumber: week.weekNumber ?? weekIndex + 1,
    focus: week.focus ?? week.phase ?? '',
    notes: week.notes ?? '',
    days: (week.days ?? []).map((day: SdkDay, dayIndex: number) => {
      // SDK uses day.setGroups, we need to convert to day.exercises
      const sdkSetGroups = day.setGroups ?? [];

      // DEBUG: Log setGroups being converted
      if (sdkSetGroups.length === 0 && (day.exercises?.length ?? 0) > 0) {
        console.warn(
          `[Mapper] WARNING: Day ${dayIndex + 1} has exercises but no setGroups - using exercises directly`
        );
      }

      // Convert each setGroup to an Exercise with its own setGroups array
      const exercises: Exercise[] = sdkSetGroups.map((sg: SdkSetGroup, sgIndex: number) => {
        // Create the sets array from SDK format
        const sets: ExerciseSet[] = (sg.sets ?? []).map((s: SdkSet) => ({
          reps: s.reps ?? undefined,
          weight: s.weight ?? null,
          weightLbs: s.weightLbs ?? (s.weight ? s.weight * 2.20462 : null),
          rest: s.restSeconds ?? s.rest ?? 60,
          rpe: s.rpe ?? null,
          intensityPercent: s.intensityPercent ?? null,
          notes: s.notes ?? '',
        }));

        // Create the Exercise with a single SetGroup containing all sets
        const setGroup: SetGroup = {
          id: crypto.randomUUID(),
          count: sets.length,
          baseSet: sets[0] ?? {
            reps: 8,
            weight: null,
            weightLbs: null,
            rest: 60,
            intensityPercent: null,
            rpe: null,
            notes: '',
          },
          sets,
        };

        return {
          id: crypto.randomUUID(),
          catalogExerciseId: sg.exerciseId ?? '',
          name: sg.exerciseName ?? 'Unknown Exercise',
          description: '',
          category: 'strength',
          muscleGroups: day.targetMuscles ?? [],
          setGroups: [setGroup],
          notes: sg.notes ?? '',
          typeLabel: '',
          repRange: sets[0]?.reps?.toString() ?? '',
          formCues: sg.technicalCues ?? [],
          equipment: [],
          order: sg.order ?? sgIndex + 1,
        } as Exercise;
      });

      return {
        dayNumber: day.dayNumber ?? dayIndex + 1,
        dayName: day.dayName ?? day.name ?? `Day ${dayIndex + 1}`,
        name: day.dayName ?? day.name ?? `Day ${dayIndex + 1}`,
        exercises,
        notes: day.notes ?? '',
        totalDuration: day.estimatedDuration,
        targetMuscles: day.targetMuscles ?? day.focus ?? [],
        warmup: undefined,
        cooldown: '',
      } as WorkoutDay;
    }),
    isDeload: week.phase === 'deload',
  }));

  return {
    id: sdkProgram.id ?? crypto.randomUUID(),
    name: sdkProgram.name ?? 'AI Generated Workout',
    description: sdkProgram.description ?? '',
    difficulty: mapDifficulty(sdkProgram.difficulty),
    durationWeeks: sdkProgram.durationWeeks ?? weeks.length,
    status: 'ACTIVE',
    goals: Array.isArray(sdkProgram.goals)
      ? sdkProgram.goals
      : [sdkProgram.primaryGoal].filter(Boolean),
    weeks,
    createdAt: sdkProgram.createdAt ?? now,
    updatedAt: now,
    version: 1,
    metadata: {},
  };
}
