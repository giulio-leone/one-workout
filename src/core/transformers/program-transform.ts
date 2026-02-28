import { DifficultyLevel, WorkoutStatus } from '@prisma/client';
import type {
  Exercise,
  WorkoutDay,
  WorkoutProgram,
  WorkoutWeek,
  ExerciseSet,
  SetGroup,
} from '@giulio-leone/types';
import { createId } from '@giulio-leone/lib-shared';
import { DEFAULT_SET } from '../constants';
import { ensureArrayOfStrings, ensureNumber, ensureString } from '../utils/type-helpers';
import { syncWeightUnits } from '@giulio-leone/lib-shared';
import {
  normalizeDifficulty,
  normalizeStatus,
  normalizeWeek,
  normalizeMetadata,
} from '../normalizers/workout-normalizer';

export function createEmptyExercise(): Exercise {
  return {
    id: createId(),
    catalogExerciseId: '', // Will be set when selecting from catalog
    name: 'Nuovo esercizio',
    description: '',
    category: 'strength',
    muscleGroups: [],
    setGroups: [
      {
        id: createId(),
        count: 1,
        baseSet: { ...DEFAULT_SET },
        sets: [{ ...DEFAULT_SET }],
      },
    ],
    notes: '',
    typeLabel: '',
    repRange: '',
    formCues: [],
    equipment: [],
  };
}

export function createEmptyDay(_weekNumber: number, dayNumber: number): WorkoutDay {
  return {
    dayNumber,
    dayName: `Giorno ${dayNumber}`,
    name: `Giorno ${dayNumber}`,
    exercises: [],
    notes: '',
    totalDuration: undefined,
    targetMuscles: [],
    warmup: undefined,
    cooldown: '',
  };
}

export function createEmptyWeek(weekNumber: number): WorkoutWeek {
  return {
    weekNumber,
    notes: '',
    days: [createEmptyDay(weekNumber, 1)],
    focus: '',
  };
}

/**
 * Appiattisce i gruppi di serie in serie individuali
 * SSOT: Usa setGroups come fonte principale per le serie
 */
export function flattenSetGroups(exercise: Exercise): ExerciseSet[] {
  const allSets: ExerciseSet[] = [];

  // SSOT: Le serie sono in setGroups
  if (exercise.setGroups) {
    exercise.setGroups.forEach((group: SetGroup) => {
      allSets.push(...group.sets);
    });
  }

  return allSets;
}

/**
 * Ricostruisce i gruppi di serie quando possibile al caricamento
 * Nota: per ora non implementiamo logica automatica di raggruppamento,
 * manteniamo solo setGroups se già presenti. In futuro si potrebbe
 * implementare euristica per raggruppare serie identiche.
 */
export function reconstructSetGroups(exercise: Exercise): Exercise {
  // Per ora manteniamo setGroups se presenti, altrimenti usa solo sets
  // In futuro si potrebbe implementare logica per raggruppare automaticamente
  // serie con parametri identici o simili

  return exercise;
}

export function createEmptyProgram(): WorkoutProgram {
  const now = new Date().toISOString();
  return {
    id: createId(),
    name: 'Nuovo programma di allenamento',
    description: '',
    difficulty: DifficultyLevel.BEGINNER,
    durationWeeks: 1,
    weeks: [createEmptyWeek(1)],
    goals: [],
    status: WorkoutStatus.DRAFT,
    userId: undefined,
    metadata: {},
    createdAt: now,
    updatedAt: now,
    version: 1,
  };
}

// NOTE: normalizeWorkoutProgram has been removed from this file.
// Use the version from './normalizers/workout-normalizer' for server-side code.
// This file is used in client components and cannot import Prisma types.

export function prepareProgramForPersistence(program: WorkoutProgram) {
  return {
    name: program.name,
    description: program.description,
    difficulty: program.difficulty,
    durationWeeks: program.durationWeeks,
    goals: program.goals,
    status: program.status,
    weeks: program.weeks.map((week, weekIndex) => ({
      weekNumber: week.weekNumber || weekIndex + 1,
      notes: week.notes,
      focus: week.focus,
      days: week.days.map((day, dayIndex) => ({
        dayNumber: day.dayNumber || dayIndex + 1,
        name: day.name || `Giorno ${dayIndex + 1}`,
        notes: day.notes,
        totalDuration: day.totalDuration,
        targetMuscles: day.targetMuscles ?? [],
        warmup: day.warmup,
        cooldown: day.cooldown,
        exercises: day.exercises.map((exercise: any) => ({
          id: exercise.id || createId(),
          name: exercise.name,
          description: exercise.description,
          category: exercise.category,
          muscleGroups: exercise.muscleGroups,
          notes: exercise.notes,
          type: exercise.typeLabel,
          repRange:
            exercise.repRange && exercise.repRange.length > 0
              ? exercise.repRange
              : (() => {
                  // SSOT: Usa setGroups per trovare il primo set
                  const firstSet = exercise.setGroups?.[0]?.sets?.[0];
                  return firstSet && firstSet.reps !== undefined ? `${firstSet.reps}` : '';
                })(),
          formCues: exercise.formCues,
          equipment: exercise.equipment,
          // Salva sia sets (appiattiti) che setGroups
          sets: flattenSetGroups(exercise).map((set: ExerciseSet) => {
            // Sincronizza sempre kg e lbs prima di salvare
            const syncedWeight = syncWeightUnits(set.weight, set.weightLbs);

            return {
              reps: set.reps ?? null,
              duration: set.duration ?? null,
              weight: syncedWeight?.weightKg ?? set.weight ?? null,
              weightLbs: syncedWeight?.weightLbs ?? set.weightLbs ?? null,
              rest: set.rest ?? DEFAULT_SET.rest,
              intensityPercent: set.intensityPercent ?? null,
              rpe: set.rpe ?? null,
            };
          }),
          // Salva anche setGroups se presenti (per struttura futura)
          setGroups: exercise.setGroups
            ? exercise.setGroups.map((group: SetGroup) => ({
                id: group.id,
                count: group.count,
                baseSet: {
                  reps: group.baseSet.reps ?? null,
                  duration: group.baseSet.duration ?? null,
                  weight:
                    syncWeightUnits(group.baseSet.weight, group.baseSet.weightLbs)?.weightKg ??
                    group.baseSet.weight ??
                    null,
                  weightLbs:
                    syncWeightUnits(group.baseSet.weight, group.baseSet.weightLbs)?.weightLbs ??
                    group.baseSet.weightLbs ??
                    null,
                  rest: group.baseSet.rest ?? DEFAULT_SET.rest,
                  intensityPercent: group.baseSet.intensityPercent ?? null,
                  rpe: group.baseSet.rpe ?? null,
                },
                progression: group.progression || null,
                sets: group.sets.map((set: ExerciseSet) => {
                  const syncedWeight = syncWeightUnits(set.weight, set.weightLbs);
                  return {
                    reps: set.reps ?? null,
                    duration: set.duration ?? null,
                    weight: syncedWeight?.weightKg ?? set.weight ?? null,
                    weightLbs: syncedWeight?.weightLbs ?? set.weightLbs ?? null,
                    rest: set.rest ?? DEFAULT_SET.rest,
                    intensityPercent: set.intensityPercent ?? null,
                    rpe: set.rpe ?? null,
                  };
                }),
              }))
            : null,
          // Serialize catalogExerciseId to JSON (stored as exerciseId in JSON for DB compatibility)
          exerciseId: exercise.catalogExerciseId ?? null,
        })),
      })),
    })),
    metadata: program.metadata ?? {},
  };
}

type RawJson = Record<string, unknown>;

interface RawProgram {
  weeks?: unknown[];
}

/**
 * Normalize workout payload structure (synchronous version, no ID conversion)
 * Used in frontend where we don't need to convert goal names to IDs
 * The backend will handle the ID conversion when saving
 */
export function normalizeAgentWorkoutPayloadSync(
  payload: unknown,
  base?: Partial<WorkoutProgram>
): WorkoutProgram {
  const raw = payload && typeof payload === 'object' ? (payload as RawJson) : ({} as RawJson);

  const rawProgram = raw.program as RawProgram | undefined;
  const rawWeeks = Array.isArray(raw.weeks)
    ? raw.weeks
    : rawProgram && Array.isArray(rawProgram.weeks)
      ? rawProgram.weeks
      : [];

  const normalizedWeeksList =
    rawWeeks.length > 0
      ? rawWeeks.map((week: unknown, index: number) => normalizeWeek(week, index))
      : (base?.weeks ?? [createEmptyWeek(1)]);

  const normalizedWeeks =
    normalizedWeeksList.length > 0 ? normalizedWeeksList : [createEmptyWeek(1)];

  const status =
    raw.status !== undefined ? normalizeStatus(raw.status) : (base?.status ?? WorkoutStatus.DRAFT);

  const metadata =
    raw.metadata !== undefined ? normalizeMetadata(raw.metadata) : (base?.metadata ?? {});

  const now = new Date().toISOString();

  const fallbackDuration =
    base?.durationWeeks !== undefined && base?.durationWeeks !== null
      ? base.durationWeeks
      : normalizedWeeks.length || 1;

  // Normalize goals - handle both array and object formats
  // If goals is an object with 'primary' and/or 'targetMuscles', convert it to an array
  let rawGoals: string[] = [];
  if (raw.goals !== undefined) {
    if (Array.isArray(raw.goals)) {
      rawGoals = ensureArrayOfStrings(raw.goals);
    } else if (typeof raw.goals === 'object' && raw.goals !== null) {
      const goalsObj = raw.goals as {
        primary?: string;
        targetMuscles?: string[] | unknown;
        [key: string]: unknown;
      };
      const goalsArray: string[] = [];
      if (goalsObj.primary && typeof goalsObj.primary === 'string') {
        goalsArray.push(goalsObj.primary);
      }
      if (goalsObj.targetMuscles) {
        const targetMuscles = ensureArrayOfStrings(goalsObj.targetMuscles);
        goalsArray.push(...targetMuscles);
      }
      rawGoals = goalsArray.length > 0 ? goalsArray : ensureArrayOfStrings(raw.goals);
    } else {
      rawGoals = ensureArrayOfStrings(raw.goals);
    }
  } else if (base?.goals && Array.isArray(base.goals) && base.goals.length > 0) {
    rawGoals = base.goals;
  }

  return {
    id: base?.id ?? createId(),
    name: ensureString(raw.name ?? base?.name ?? 'Workout Program'),
    description: ensureString(raw.description ?? base?.description ?? ''),
    difficulty: raw.difficulty
      ? normalizeDifficulty(raw.difficulty)
      : (base?.difficulty ?? DifficultyLevel.BEGINNER),
    durationWeeks: Math.max(
      1,
      ensureNumber(raw.durationWeeks ?? base?.durationWeeks, fallbackDuration)
    ),
    weeks: normalizedWeeks,
    goals: rawGoals,
    status,
    userId: base?.userId,
    metadata,
    createdAt: base?.createdAt ?? now,
    updatedAt: now,
    version: base?.version ?? 1,
  };
}
