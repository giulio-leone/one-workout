/**
 * Workout Operations
 *
 * Funzioni pure per operazioni CRUD su workout programs
 * Segue il pattern di lib/nutrition/plan-operations.ts
 */

import type {
  WorkoutProgram,
  WorkoutWeek,
  WorkoutDay,
  Exercise,
  SetGroup,
  ExerciseSet,
} from '@giulio-leone/types';
import {
  createEmptyWeek,
  createEmptyDay,
  createEmptyExercise,
} from '../transformers/program-transform';
import { createId } from '@giulio-leone/lib-shared';
import { DEFAULT_SET } from '../constants';
import { kgToLbs } from '@giulio-leone/lib-shared';
import {
  getWorkoutProgramWeek,
  getWorkoutProgramDayByWeek,
} from '../utils/workout-program-helpers';

/**
 * Aggiunge una nuova settimana al programma
 */
export function addWorkoutWeek(program: WorkoutProgram): {
  program: WorkoutProgram;
  weekNumber: number;
} {
  const nextWeekNumber = program.weeks.length + 1;
  const newWeek = createEmptyWeek(nextWeekNumber);
  const updatedWeeks = [...program.weeks, newWeek];

  return {
    program: {
      ...program,
      weeks: updatedWeeks,
      durationWeeks: updatedWeeks.length,
    },
    weekNumber: nextWeekNumber,
  };
}

/**
 * Rimuove una settimana dal programma e riindicizza le settimane rimanenti
 */
export function removeWeek(program: WorkoutProgram, weekNumber: number): WorkoutProgram {
  const filteredWeeks = program.weeks.filter((week: WorkoutWeek) => week.weekNumber !== weekNumber);
  const reindexed = filteredWeeks.map((week, index) => ({
    ...week,
    weekNumber: index + 1,
  }));

  return {
    ...program,
    weeks: reindexed,
    durationWeeks: reindexed.length || program.durationWeeks,
  };
}

/**
 * Aggiunge un nuovo giorno alla settimana specificata
 */
export function addDay(
  program: WorkoutProgram,
  weekNumber: number
): {
  program: WorkoutProgram;
  weekNumber: number;
  dayNumber: number;
} {
  const targetWeek = getWorkoutProgramWeek(program, weekNumber);
  if (!targetWeek) {
    throw new Error(`Settimana ${weekNumber} non trovata`);
  }

  const nextDayNumber = targetWeek.days.length + 1;
  const newDay = createEmptyDay(weekNumber, nextDayNumber);

  const updatedWeeks = program.weeks.map((week: WorkoutWeek) =>
    week.weekNumber === weekNumber
      ? {
          ...week,
          days: [...week.days, newDay],
        }
      : week
  );

  return {
    program: {
      ...program,
      weeks: updatedWeeks,
    },
    weekNumber,
    dayNumber: nextDayNumber,
  };
}

/**
 * Rimuove un giorno dalla settimana specificata e riindicizza i giorni rimanenti
 */
export function removeDay(
  program: WorkoutProgram,
  weekNumber: number,
  dayNumber: number
): WorkoutProgram {
  const updatedWeeks = program.weeks.map((week: WorkoutWeek) => {
    if (week.weekNumber !== weekNumber) {
      return week;
    }

    const remainingDays = week.days.filter((day: WorkoutDay) => day.dayNumber !== dayNumber);
    const reindexedDays = remainingDays.map((day: WorkoutDay, index: number) => ({
      ...day,
      dayNumber: index + 1,
    }));

    return {
      ...week,
      days: reindexedDays,
    };
  });

  return {
    ...program,
    weeks: updatedWeeks,
  };
}

/**
 * Aggiunge un esercizio al giorno specificato
 */
export function addExercise(
  program: WorkoutProgram,
  weekNumber: number,
  dayNumber: number,
  exercise?: Exercise
): WorkoutProgram {
  const newExercise = exercise || createEmptyExercise();

  const updatedWeeks = program.weeks.map((week: WorkoutWeek) =>
    week.weekNumber === weekNumber
      ? {
          ...week,
          days: week.days.map((day: WorkoutDay) =>
            day.dayNumber === dayNumber
              ? { ...day, exercises: [...day.exercises, newExercise] }
              : day
          ),
        }
      : week
  );

  return {
    ...program,
    weeks: updatedWeeks,
  };
}

/**
 * Rimuove un esercizio dal giorno specificato
 */
export function removeExercise(
  program: WorkoutProgram,
  weekNumber: number,
  dayNumber: number,
  exerciseId: string
): WorkoutProgram {
  const updatedWeeks = program.weeks.map((week: WorkoutWeek) =>
    week.weekNumber === weekNumber
      ? {
          ...week,
          days: week.days.map((day: WorkoutDay) =>
            day.dayNumber === dayNumber
              ? {
                  ...day,
                  exercises: day.exercises.filter((ex: Exercise) => ex.id !== exerciseId),
                }
              : day
          ),
        }
      : week
  );

  return {
    ...program,
    weeks: updatedWeeks,
  };
}

/**
 * Aggiorna un esercizio esistente
 */
export function updateExercise(
  program: WorkoutProgram,
  weekNumber: number,
  dayNumber: number,
  exerciseId: string,
  updates: Partial<Exercise>
): WorkoutProgram {
  const updatedWeeks = program.weeks.map((week: WorkoutWeek) =>
    week.weekNumber === weekNumber
      ? {
          ...week,
          days: week.days.map((day: WorkoutDay) =>
            day.dayNumber === dayNumber
              ? {
                  ...day,
                  exercises: day.exercises.map((ex: Exercise) =>
                    ex.id === exerciseId ? { ...ex, ...updates } : ex
                  ),
                }
              : day
          ),
        }
      : week
  );

  return {
    ...program,
    weeks: updatedWeeks,
  };
}

/**
 * Aggiorna un giorno esistente
 */
export function updateDay(
  program: WorkoutProgram,
  weekNumber: number,
  dayNumber: number,
  updates: Partial<WorkoutDay>
): WorkoutProgram {
  const updatedWeeks = program.weeks.map((week: WorkoutWeek) =>
    week.weekNumber === weekNumber
      ? {
          ...week,
          days: week.days.map((day: WorkoutDay) =>
            day.dayNumber === dayNumber ? { ...day, ...updates } : day
          ),
        }
      : week
  );

  return {
    ...program,
    weeks: updatedWeeks,
  };
}

/**
 * Aggiorna una settimana esistente
 */
export function updateWeek(
  program: WorkoutProgram,
  weekNumber: number,
  updates: Partial<WorkoutWeek>
): WorkoutProgram {
  const updatedWeeks = program.weeks.map((week: WorkoutWeek) =>
    week.weekNumber === weekNumber ? { ...week, ...updates } : week
  );

  return {
    ...program,
    weeks: updatedWeeks,
  };
}

/**
 * Aggiunge un nuovo gruppo di serie a un esercizio nel programma
 * (Operation: modifica il programma)
 */
export function addSetGroupToExercise(
  program: WorkoutProgram,
  weekNumber: number,
  dayNumber: number,
  exerciseId: string,
  baseSet: ExerciseSet,
  count: number
): WorkoutProgram {
  const newGroup: SetGroup = {
    id: createId(),
    count,
    baseSet,
    sets: Array.from({ length: count }, () => ({ ...baseSet })),
  };

  const day = getWorkoutProgramDayByWeek(program, weekNumber, dayNumber);
  const exercise = day?.exercises.find((e: Exercise) => e.id === exerciseId);

  return updateExercise(program, weekNumber, dayNumber, exerciseId, {
    setGroups: [...(exercise?.setGroups || []), newGroup],
  });
}

/**
 * Alias ergonomico per creare e aggiungere un nuovo SetGroup a un esercizio.
 */
export function createSetGroup(
  program: WorkoutProgram,
  weekNumber: number,
  dayNumber: number,
  exerciseId: string,
  baseSet: ExerciseSet,
  count: number
): WorkoutProgram {
  return addSetGroupToExercise(program, weekNumber, dayNumber, exerciseId, baseSet, count);
}

/**
 * Raggruppa serie selezionate in un gruppo
 * SSOT: Usa setGroups per accedere alle serie, non exercise.sets legacy
 */
export function groupSelectedSets(
  program: WorkoutProgram,
  weekNumber: number,
  dayNumber: number,
  exerciseId: string,
  setIndices: number[]
): WorkoutProgram {
  if (setIndices.length < 2) {
    return program;
  }

  const day = getWorkoutProgramDayByWeek(program, weekNumber, dayNumber);
  const exercise = day?.exercises.find((e: Exercise) => e.id === exerciseId);

  if (!exercise) {
    return program;
  }

  // SSOT: Usa setGroups per accedere a tutte le serie
  const allSets: ExerciseSet[] = [];
  (exercise.setGroups || []).forEach((group: SetGroup) => {
    allSets.push(...group.sets);
  });

  // Calcola parametri medi per il baseSet
  const selectedSets = setIndices
    .map((idx: number) => allSets[idx])
    .filter((s): s is ExerciseSet => s !== undefined);

  if (selectedSets.length === 0) {
    return program;
  }

  const avgReps =
    selectedSets.reduce((sum: number, s: ExerciseSet) => sum + (s.reps ?? 0), 0) /
    selectedSets.length;
  const avgWeight =
    selectedSets.reduce((sum: number, s: ExerciseSet) => sum + (s.weight ?? 0), 0) /
    selectedSets.length;
  const avgIntensity =
    selectedSets.reduce((sum: number, s: ExerciseSet) => sum + (s.intensityPercent ?? 0), 0) /
    selectedSets.length;
  const avgRest =
    selectedSets.reduce((sum: number, s: ExerciseSet) => sum + (s.rest ?? 0), 0) /
    selectedSets.length;

  const baseSet: ExerciseSet = {
    reps: Math.round(avgReps) || undefined,
    weight: avgWeight > 0 ? avgWeight : null,
    weightLbs: avgWeight > 0 ? kgToLbs(avgWeight) : null,
    intensityPercent: avgIntensity > 0 ? avgIntensity : null,
    rpe: null,
    rest: Math.round(avgRest) || DEFAULT_SET.rest,
  };

  const newGroup: SetGroup = {
    id: createId(),
    count: setIndices.length,
    baseSet,
    sets: selectedSets,
  };

  // SSOT: Rimuovi serie selezionate dai setGroups esistenti e aggiungi nuovo gruppo
  const remainingSets = allSets.filter((_, idx) => !setIndices.includes(idx));

  // Ricostruisci setGroups con le serie rimanenti + nuovo gruppo
  const updatedSetGroups: SetGroup[] = [];
  if (remainingSets.length > 0) {
    // Crea un gruppo per le serie rimanenti
    updatedSetGroups.push({
      id: createId(),
      count: remainingSets.length,
      baseSet: remainingSets[0] || DEFAULT_SET,
      sets: remainingSets,
    });
  }
  updatedSetGroups.push(newGroup);

  return updateExercise(program, weekNumber, dayNumber, exerciseId, {
    setGroups: updatedSetGroups,
  });
}

/**
 * Separa un gruppo di serie tornando le serie individuali
 */
export function splitSetGroup(
  program: WorkoutProgram,
  weekNumber: number,
  dayNumber: number,
  exerciseId: string,
  groupId: string
): WorkoutProgram {
  const day = getWorkoutProgramDayByWeek(program, weekNumber, dayNumber);
  const exercise = day?.exercises.find((e: Exercise) => e.id === exerciseId);

  if (!exercise || !exercise.setGroups) {
    return program;
  }

  const group = exercise.setGroups.find((g: SetGroup) => g.id === groupId);
  if (!group) {
    return program;
  }

  // SSOT: Unisci le serie del gruppo agli altri setGroups esistenti
  // Creiamo un nuovo setGroup con tutte le serie "libere" del gruppo eliminato
  const otherGroups = exercise.setGroups.filter((g: SetGroup) => g.id !== groupId);
  const freedSets = group.sets;

  // Se ci sono altri gruppi, aggiungi le serie libere come nuovo gruppo
  let newGroups: SetGroup[];
  if (freedSets.length > 0) {
    const freedGroup: SetGroup = {
      id: createId(),
      count: freedSets.length,
      baseSet: freedSets[0] || DEFAULT_SET,
      sets: freedSets,
    };
    newGroups = [...otherGroups, freedGroup];
  } else {
    newGroups = otherGroups;
  }

  return updateExercise(program, weekNumber, dayNumber, exerciseId, {
    setGroups: newGroups.length > 0 ? newGroups : undefined,
  });
}

/**
 * Rimuove un gruppo di serie
 */
export function removeSetGroup(
  program: WorkoutProgram,
  weekNumber: number,
  dayNumber: number,
  exerciseId: string,
  groupId: string
): WorkoutProgram {
  const day = getWorkoutProgramDayByWeek(program, weekNumber, dayNumber);
  const exercise = day?.exercises.find((e: Exercise) => e.id === exerciseId);

  if (!exercise || !exercise.setGroups) {
    return program;
  }

  const newGroups = exercise.setGroups.filter((g: SetGroup) => g.id !== groupId);

  return updateExercise(program, weekNumber, dayNumber, exerciseId, {
    setGroups: newGroups.length > 0 ? newGroups : undefined,
  });
}

/**
 * Duplica un gruppo di serie
 */
export function duplicateSetGroup(
  program: WorkoutProgram,
  weekNumber: number,
  dayNumber: number,
  exerciseId: string,
  groupId: string
): WorkoutProgram {
  const day = getWorkoutProgramDayByWeek(program, weekNumber, dayNumber);
  const exercise = day?.exercises.find((e: Exercise) => e.id === exerciseId);

  if (!exercise || !exercise.setGroups) {
    return program;
  }

  const group = exercise.setGroups.find((g: SetGroup) => g.id === groupId);
  if (!group) {
    return program;
  }

  const duplicatedGroup: SetGroup = {
    ...group,
    id: createId(),
    sets: group.sets.map((s: ExerciseSet) => ({ ...s })),
  };

  if (duplicatedGroup.progression) {
    duplicatedGroup.progression = {
      ...duplicatedGroup.progression,
      steps: duplicatedGroup.progression.steps.map((s) => ({ ...s })),
    };
  }

  return updateExercise(program, weekNumber, dayNumber, exerciseId, {
    setGroups: [...(exercise.setGroups || []), duplicatedGroup],
  });
}
