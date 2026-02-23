/**
 * Workout Weight Calculator Service
 *
 * Servizio per calcolare e aggiornare i pesi nei programmi di allenamento
 * basandosi sugli 1RM dell'utente e le percentuali di intensità
 */

import type {
  WorkoutProgram,
  WorkoutWeek,
  WorkoutDay,
  Exercise,
  ExerciseSet,
  SetGroup,
} from '@giulio-leone/types';
import { OneRepMaxService } from '../exercise/one-rep-max.service';
import { prisma } from '@giulio-leone/lib-core';
import { userProfileService } from '@giulio-leone/lib-core/user-profile.service';
import { prepareProgramForPersistence } from './transformers/program-transform';
import { normalizeWorkoutProgram } from './normalizers/workout-normalizer';
import { calculateSetWeights } from './calculators/weight-calculator';
import { toPrismaJsonValue } from '@giulio-leone/lib-shared';

import { logger } from '@giulio-leone/lib-core';

/**
 * Calcola i pesi in un programma basandosi sugli 1RM dell'utente
 * @param userId - ID dell'utente
 * @param program - Programma di allenamento
 * @returns Programma con pesi calcolati
 */
export async function calculateWeightsInProgram(
  userId: string,
  program: WorkoutProgram
): Promise<WorkoutProgram> {
  // Raccogli tutti i catalogExerciseId presenti nel programma
  const exerciseIds = new Set<string>();
  program.weeks.forEach((week: WorkoutWeek) =>
    week.days.forEach((day: WorkoutDay) =>
      day.exercises.forEach((exercise: Exercise) => {
        if (exercise.catalogExerciseId) {
          exerciseIds.add(exercise.catalogExerciseId);
        }
      })
    )
  );

  // Carica gli 1RM solo per gli esercizi nel programma
  const userMaxesMap = new Map<string, number>();
  if (exerciseIds.size > 0) {
    const maxesResult = await OneRepMaxService.getBatchByExercises(userId, Array.from(exerciseIds));
    if (maxesResult.success && maxesResult.data) {
      // maxesResult.data è una Map<string, UserOneRepMax>
      maxesResult.data.forEach((max, catalogExerciseId) => {
        const oneRM = typeof max.oneRepMax === 'number' ? max.oneRepMax : Number(max.oneRepMax);
        userMaxesMap.set(catalogExerciseId, oneRM);
      });
    }
  }

  // Fetch user profile to get weightIncrement preference
  const userProfile = await userProfileService.getOrCreate(userId);
  const weightIncrement =
    userProfile.weightIncrement !== null && userProfile.weightIncrement !== undefined
      ? typeof userProfile.weightIncrement === 'object' && 'toNumber' in userProfile.weightIncrement
        ? (userProfile.weightIncrement as { toNumber: () => number }).toNumber()
        : Number(userProfile.weightIncrement)
      : 2.5;

  const updatedProgram: WorkoutProgram = {
    ...program,
    weeks: program.weeks.map((week: WorkoutWeek) => ({
      ...week,
      days: week.days.map((day: WorkoutDay) => ({
        ...day,
        exercises: day.exercises.map((exercise: Exercise) => {
          // Se l'esercizio non ha catalogExerciseId, non possiamo calcolare i pesi
          if (!exercise.catalogExerciseId) {
            return exercise;
          }

          // Trova l'1RM per questo esercizio
          const oneRepMaxKg = userMaxesMap.get(exercise.catalogExerciseId);
          if (!oneRepMaxKg || oneRepMaxKg <= 0) {
            return exercise;
          }

          // SSOT: Update setGroups with calculated weights
          const updatedSetGroups = exercise.setGroups?.map((group: SetGroup) => ({
            ...group,
            baseSet: calculateSetWeights(group.baseSet, oneRepMaxKg, weightIncrement),
            sets: group.sets.map((set: ExerciseSet) =>
              calculateSetWeights(set, oneRepMaxKg, weightIncrement)
            ),
          }));

          return {
            ...exercise,
            setGroups: updatedSetGroups,
          };
        }),
      })),
    })),
  };

  return updatedProgram;
}

/**
 * Aggiorna tutti i programmi attivi dell'utente quando viene inserito/aggiornato un 1RM
 * @param userId - ID dell'utente
 * @param catalogExerciseId - ID dell'esercizio nel catalogo per cui è stato inserito/aggiornato l'1RM
 */
export async function updateProgramWeightsForExerciseId(
  userId: string,
  catalogExerciseId: string
): Promise<void> {
  try {
    // Trova tutti i programmi ACTIVE dell'utente
    const programs = await prisma.workout_programs.findMany({
      where: {
        userId,
        status: {
          in: ['ACTIVE', 'DRAFT'],
        },
      },
    });

    // Per ogni programma, aggiorna i pesi se necessario
    for (const program of programs) {
      const normalizedProgram = normalizeWorkoutProgram(program);
      let hasChanges = false;

      // Controlla se il programma contiene esercizi con questo catalogExerciseId
      const needsUpdate = normalizedProgram.weeks.some((week) =>
        week.days.some((day) =>
          day.exercises.some((exercise) => exercise.catalogExerciseId === catalogExerciseId)
        )
      );

      if (!needsUpdate) {
        continue;
      }

      // Calcola i pesi aggiornati
      const updatedProgram = await calculateWeightsInProgram(userId, normalizedProgram);

      // Verifica se ci sono cambiamenti
      hasChanges = JSON.stringify(normalizedProgram.weeks) !== JSON.stringify(updatedProgram.weeks);

      if (hasChanges) {
        // Prepara per persistenza
        const persistence = prepareProgramForPersistence(updatedProgram);

        // Aggiorna il programma nel database
        await prisma.workout_programs.update({
          where: { id: program.id },
          data: {
            weeks: toPrismaJsonValue(persistence.weeks as unknown[]),
            updatedAt: new Date(),
          },
        });
      }
    }
  } catch (error: unknown) {
    logger.error('[WorkoutWeightCalculatorService.updateProgramWeightsForExerciseId]', error);
    // Non propagare l'errore: l'aggiornamento dei programmi è best-effort
    // Se fallisce, l'utente può sempre ricalcolare manualmente
  }
}
