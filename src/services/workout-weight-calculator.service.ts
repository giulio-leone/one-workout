import {
  prepareProgramForPersistence,
  normalizeWorkoutProgram,
  calculateWeightFromIntensity,
  calculateIntensityFromWeight,
  calculateWeightFromRPE,
  calculateIntensityFromRPE,
} from '@giulio-leone/one-workout';
import { kgToLbs, logger } from '@giulio-leone/lib-shared';
import { ServiceRegistry, REPO_TOKENS } from '@giulio-leone/core';
import type { IWorkoutRepository, Workout } from '@giulio-leone/core/repositories';
import { OneRepMaxService } from './one-rep-max.service';
import type { WorkoutProgram, ExerciseSet, SetGroup } from '@giulio-leone/types/workout';

const log = logger.child('WorkoutWeightCalculatorService');

function getWorkoutRepo() {
  return ServiceRegistry.getInstance().resolve<IWorkoutRepository>(REPO_TOKENS.WORKOUT);
}

/**
 * Workout Weight Calculator Service
 *
 * Servizio per calcolare e aggiornare i pesi nei programmi di allenamento
 * basandosi sugli 1RM dell'utente e le percentuali di intensità.
 *
 * SSOT: Usa SOLO setGroups per le serie, non exercise.sets legacy.
 */

/**
 * Calculate weights for a single set based on 1RM
 * Extracted common logic for reuse (DRY principle)
 * @param set - Exercise set to calculate weights for
 * @param oneRepMaxKg - User's 1RM for the exercise in kg
 * @returns Updated set with calculated weight, weightLbs, and intensityPercent
 */
export function calculateSetWeights(set: ExerciseSet, oneRepMaxKg: number): ExerciseSet {
  let newWeight: number | null = set.weight ?? null;
  let newWeightLbs: number | null = set.weightLbs ?? null;
  let newIntensityPercent: number | null = set.intensityPercent ?? null;

  // Priority 1: use intensityPercent to calculate weight if available AND > 0
  // (intensityPercent of 0 is treated as empty/missing)
  if (
    set.intensityPercent !== null &&
    set.intensityPercent !== undefined &&
    set.intensityPercent > 0 &&
    oneRepMaxKg > 0
  ) {
    newWeight = calculateWeightFromIntensity(oneRepMaxKg, set.intensityPercent);
    newWeightLbs = kgToLbs(newWeight);
  }
  // Priority 2: calculate intensityPercent from weight if weight exists AND > 0
  // (weight of 0 is treated as empty/missing)
  else if (set.weight !== null && set.weight !== undefined && set.weight > 0 && oneRepMaxKg > 0) {
    // Only calculate intensity if missing
    if (
      newIntensityPercent === null ||
      newIntensityPercent === undefined ||
      newIntensityPercent <= 0
    ) {
      newIntensityPercent = calculateIntensityFromWeight(set.weight, oneRepMaxKg);
    }
    // Ensure lbs calculated
    if ((newWeightLbs === null || newWeightLbs === undefined) && newWeight !== null) {
      newWeightLbs = kgToLbs(newWeight);
    }
  }
  // Priority 3: RPE fallback (if weight is missing or 0)
  else if (
    (newWeight === null || newWeight === undefined || newWeight <= 0) &&
    set.rpe !== null &&
    set.rpe !== undefined &&
    set.reps !== null &&
    set.reps !== undefined &&
    oneRepMaxKg > 0
  ) {
    const targetReps = typeof set.reps === 'number' ? set.reps : parseInt(set.reps, 10);

    if (!isNaN(targetReps) && targetReps > 0) {
      try {
        newWeight = calculateWeightFromRPE(oneRepMaxKg, targetReps, set.rpe);
        newWeightLbs = kgToLbs(newWeight);
        // Also derive the implicit intensity percent for completeness
        newIntensityPercent = calculateIntensityFromRPE(targetReps, set.rpe);
      } catch (e) {
        // Ignore calculation errors (e.g. invalid RPE/Reps) and leave weight as null
      }
    }
  }

  return {
    ...set,
    weight: newWeight,
    weightLbs: newWeightLbs,
    intensityPercent: newIntensityPercent,
    rpe: set.rpe ?? null,
  };
}

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
  const weeks = program.weeks ?? [];
  const exerciseIds = new Set<string>();
  weeks.forEach((week: any) =>
    week.days.forEach((day: any) =>
      day.exercises.forEach((exercise: any) => {
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

  const updatedProgram: WorkoutProgram = {
    ...program,
    weeks: weeks.map((week: any) => ({
      ...week,
      days: week.days.map((day: any) => ({
        ...day,
        exercises: day.exercises.map((exercise: any) => {
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
          const updatedSetGroups: SetGroup[] = (exercise.setGroups || []).map((group: any) => ({
            ...group,
            baseSet: calculateSetWeights(group.baseSet, oneRepMaxKg),
            sets: (group.sets || []).map((set: any) => calculateSetWeights(set, oneRepMaxKg)),
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
 *
 * OTTIMIZZAZIONI:
 * - Carica il 1RM una sola volta all'inizio
 * - Filtra i programmi direttamente con query JSONB (evita di caricare tutti i programmi)
 * - Ricalcola solo gli esercizi che usano questo catalogExerciseId
 * - Usa Promise.all per aggiornamenti paralleli
 *
 * @param userId - ID dell'utente
 * @param catalogExerciseId - ID dell'esercizio nel catalogo per cui è stato inserito/aggiornato l'1RM
 */
export async function updateProgramWeightsForExerciseId(
  userId: string,
  catalogExerciseId: string
): Promise<void> {
  log.debug('[updateProgramWeightsForExerciseId] START', { userId, catalogExerciseId });

  try {
    // 1. Carica il 1RM dell'esercizio UNA SOLA VOLTA
    const maxResult = await OneRepMaxService.getByExercise(userId, catalogExerciseId);
    log.debug('[updateProgramWeightsForExerciseId] 1RM result:', {
      success: maxResult.success,
      hasData: !!maxResult.data,
      oneRepMax: maxResult.data?.oneRepMax,
    });

    if (!maxResult.success || !maxResult.data) {
      log.debug('[updateProgramWeightsForExerciseId] No 1RM found, exiting');
      return; // Nessun 1RM trovato, niente da fare
    }
    const oneRepMaxKg = Number(maxResult.data.oneRepMax);
    if (oneRepMaxKg <= 0) {
      log.debug('[updateProgramWeightsForExerciseId] Invalid 1RM <= 0, exiting');
      return;
    }
    log.debug(`[updateProgramWeightsForExerciseId] 1RM loaded: ${oneRepMaxKg} kg`);

    // 2. Trova SOLO i programmi ACTIVE che contengono questo esercizio
    log.debug(`[updateProgramWeightsForExerciseId] Searching ACTIVE programs for user`);

    const allPrograms = await getWorkoutRepo().findMany({ userId, status: 'ACTIVE' });
    const programs = allPrograms.filter((p: Workout) => {
      const weeksStr = JSON.stringify(p.weeks);
      return weeksStr.includes(`"catalogExerciseId":"${catalogExerciseId}"`);
    });

    log.debug(`[updateProgramWeightsForExerciseId] Programs found: ${programs.length}`);

    if (programs.length === 0) {
      log.debug('[updateProgramWeightsForExerciseId] No programs contain this exercise, exiting');
      return; // Nessun programma contiene questo esercizio
    }

    // 3. Aggiorna i programmi in parallelo
    const updatePromises = programs.map(async (program: any) => {
      log.debug(`[updateProgramWeightsForExerciseId] Processing program: ${program.id}`);

      const normalizedProgram = normalizeWorkoutProgram(program);
      let hasChanges = false;
      let exercisesUpdated = 0;

      // Aggiorna SOLO gli esercizi che usano questo catalogExerciseId
      const updatedWeeks = normalizedProgram.weeks.map((week: any) => ({
        ...week,
        days: week.days.map((day: any) => ({
          ...day,
          exercises: day.exercises.map((exercise: any) => {
            if (exercise.catalogExerciseId !== catalogExerciseId) {
              return exercise; // Salta esercizi che non usiamo
            }

            exercisesUpdated++;
            log.debug('[updateProgramWeightsForExerciseId] Found exercise:', {
              name: exercise.name,
              catalogExerciseId: exercise.catalogExerciseId,
              setGroupsCount: exercise.setGroups?.length || 0,
            });

            // Ricalcola i pesi per questo esercizio
            const updatedSetGroups: SetGroup[] = (exercise.setGroups || []).map(
              (group: any, groupIdx: any) => {
                const updatedBaseSet = calculateSetWeights(group.baseSet, oneRepMaxKg);
                const updatedSets = (group.sets || []).map((set: any) =>
                  calculateSetWeights(set, oneRepMaxKg)
                );

                log.debug(`[updateProgramWeightsForExerciseId] SetGroup ${groupIdx}:`, {
                  oldBaseWeight: group.baseSet.weight,
                  newBaseWeight: updatedBaseSet.weight,
                  intensityPercent: group.baseSet.intensityPercent,
                });

                // Verifica se c'è un cambiamento nei pesi
                if (
                  updatedBaseSet.weight !== group.baseSet.weight ||
                  updatedSets.some((s: any, i: any) => s.weight !== group.sets?.[i]?.weight)
                ) {
                  hasChanges = true;
                }

                return {
                  ...group,
                  baseSet: updatedBaseSet,
                  sets: updatedSets,
                };
              }
            );

            return {
              ...exercise,
              setGroups: updatedSetGroups,
            };
          }),
        })),
      }));

      log.debug(`[updateProgramWeightsForExerciseId] Program ${program.id} summary:`, {
        exercisesUpdated,
        hasChanges,
      });

      if (!hasChanges) {
        log.debug('[updateProgramWeightsForExerciseId] No changes detected, skipping update');
        return; // Nessun cambiamento, skip update
      }

      // Prepara e salva
      const persistence = prepareProgramForPersistence({
        ...normalizedProgram,
        weeks: updatedWeeks,
      });

      log.debug(`[updateProgramWeightsForExerciseId] Saving program: ${program.id}`);

      await getWorkoutRepo().update(program.id, {
        weeks: persistence.weeks as unknown[],
        updatedAt: new Date(),
      });

      log.debug(`[updateProgramWeightsForExerciseId] Program saved successfully: ${program.id}`);
    });

    await Promise.all(updatePromises);
    log.debug('[updateProgramWeightsForExerciseId] END - All updates completed');
  } catch (error: unknown) {
    log.error('[updateProgramWeightsForExerciseId] ERROR:', error);
    // Non propagare l'errore: l'aggiornamento dei programmi è best-effort
  }
}
