/**
 * Exercise Builder
 *
 * Utilities per costruire esercizi workout da varie fonti
 *
 * NOMENCLATURA:
 * - catalogExerciseId: ID dell'esercizio nel catalogo database (unico standard)
 * - id: ID temporaneo dell'istanza dell'esercizio nel workout
 */

import type { Exercise, SetGroup, LocalizedExercise } from '@giulio-leone/types';
import { createId } from '@giulio-leone/lib-shared';
import { getMuscleGroupFromName } from './utils/muscle-group';
import { DEFAULT_SET } from '../constants';

/**
 * Costruisce un Exercise da un LocalizedExercise del catalogo
 */
export function buildWorkoutExerciseFromCatalog(exercise: LocalizedExercise): Exercise {
  const muscleGroups = Array.from(
    new Set(
      exercise.muscles
        .map((muscle: { id: string; name: string; slug: string }) =>
          getMuscleGroupFromName(muscle.name)
        )
        .filter((group): group is Exercise['muscleGroups'][number] => group !== null)
    )
  );

  const fallbackGroup =
    exercise.bodyParts
      .map((bodyPart: { id: string; name: string; slug: string }) =>
        getMuscleGroupFromName(bodyPart.name)
      )
      .find(
        (
          group: Exercise['muscleGroups'][number] | null
        ): group is Exercise['muscleGroups'][number] => group !== null
      ) ?? 'full-body';

  // Crea un setGroup di default
  const defaultSetGroup: SetGroup = {
    id: createId(),
    count: 3,
    baseSet: { ...DEFAULT_SET },
    sets: [{ ...DEFAULT_SET }, { ...DEFAULT_SET }, { ...DEFAULT_SET }],
  };

  return {
    id: createId(),
    name: exercise.translation?.name ?? exercise.slug,
    description: exercise.translation?.description ?? exercise.overview ?? '',
    category: 'strength',
    muscleGroups: muscleGroups.length > 0 ? muscleGroups : [fallbackGroup],
    setGroups: [defaultSetGroup],
    notes: exercise.overview ?? '',
    typeLabel: exercise.exerciseTypeName ?? 'strength',
    repRange: '8-12',
    formCues: exercise.exerciseTips ?? [],
    equipment: exercise.equipments.map(
      (equipment: { id: string; name: string; slug: string }) => equipment.name
    ),
    catalogExerciseId: exercise.id, // ID catalogo per lookup 1RM
    variation: {}, // Variante multilingue (vuota di default)
  };
}
