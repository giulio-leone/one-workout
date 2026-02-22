/**
 * Workout Template Helpers - Pure Functions
 *
 * Helper per gestione template workout (estrazione dati, re-ID, etc.)
 * Segue principi KISS, DRY, SOLID
 *
 * SSOT: Usa SOLO setGroups per le serie, non exercise.sets legacy.
 */

import type {
  WorkoutTemplate,
  WorkoutTemplateType,
  Exercise,
  WorkoutDay,
  WorkoutWeek,
  ExerciseSet,
  SetGroup,
} from '@giulio-leone/types';
import { createId } from '@giulio-leone/lib-shared';

/**
 * Estrae dati template in base al tipo
 */
export function extractTemplateData(
  template: WorkoutTemplate
): Exercise | WorkoutDay | WorkoutWeek {
  return template.data;
}

/**
 * Re-ID tutti gli esercizi, giorni e settimane in un template per evitare conflitti
 */
export function reIdTemplateData<T extends Exercise | WorkoutDay | WorkoutWeek>(
  data: T,
  type: WorkoutTemplateType
): T {
  switch (type) {
    case 'exercise': {
      const exercise = data as Exercise;
      // SSOT: Solo setGroups, non exercise.sets
      return {
        ...exercise,
        id: createId(),
        setGroups: exercise.setGroups?.map((group: SetGroup) => ({
          ...group,
          id: createId(),
          sets: group.sets.map((set: ExerciseSet) => ({ ...set })),
        })),
      } as T;
    }

    case 'day': {
      const day = data as WorkoutDay;
      return {
        ...day,
        exercises: day.exercises.map((exercise: Exercise) => ({
          ...exercise,
          id: createId(),
          setGroups: exercise.setGroups?.map((group: SetGroup) => ({
            ...group,
            id: createId(),
            sets: group.sets.map((set: ExerciseSet) => ({ ...set })),
          })),
        })),
      } as T;
    }

    case 'week': {
      const week = data as WorkoutWeek;
      return {
        ...week,
        days: week.days.map((day: WorkoutDay) => ({
          ...day,
          exercises: day.exercises.map((exercise: Exercise) => ({
            ...exercise,
            id: createId(),
            setGroups: exercise.setGroups?.map((group: SetGroup) => ({
              ...group,
              id: createId(),
              sets: group.sets.map((set: ExerciseSet) => ({ ...set })),
            })),
          })),
        })),
      } as T;
    }

    default:
      return data;
  }
}
