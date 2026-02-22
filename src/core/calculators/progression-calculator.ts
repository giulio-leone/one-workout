/**
 * Progression Calculator
 *
 * Utility per calcolare progressioni nei gruppi di serie
 */

import type { ExerciseSet, SetProgression, SetGroup } from '@giulio-leone/types';

interface ProgressionStep {
  fromSet: number;
  toSet: number;
  adjustment: number;
}

/**
 * Applica una progressione a una serie base in base al numero della serie
 */
export function applyProgression(
  baseSet: ExerciseSet,
  progression: SetProgression,
  setNumber: number // 1-based
): ExerciseSet {
  const result: ExerciseSet = { ...baseSet };

  // Trova lo step di progressione che si applica a questa serie
  const applicableStep = progression.steps.find(
    (step: ProgressionStep) => setNumber >= step.fromSet && setNumber <= step.toSet
  );

  if (!applicableStep) {
    return result; // Nessuna progressione per questa serie
  }

  switch (progression.type) {
    case 'linear': {
      // Aggiunge valore fisso (es. +2.5kg ogni serie)
      // Calcola quante serie sono passate dall'inizio dello step
      const stepsSinceStart = setNumber - applicableStep.fromSet + 1;
      const totalAdjustment = applicableStep.adjustment * stepsSinceStart;

      if (result.weight !== null && result.weight !== undefined) {
        result.weight = (result.weight ?? 0) + totalAdjustment;
        // Aggiorna anche weightLbs se presente
        if (result.weightLbs !== null && result.weightLbs !== undefined) {
          result.weightLbs = (result.weightLbs ?? 0) + totalAdjustment * 2.20462; // kg to lbs
        }
      } else if (result.intensityPercent !== null && result.intensityPercent !== undefined) {
        // Se usa intensityPercent, non modifica (la progressione lineare è per weight)
        // Potremmo voler aggiungere logica per calcolare weight da intensityPercent
      }
      break;
    }

    case 'percentage': {
      // Aumenta percentuale 1RM (es. 70% → 72% → 75%)
      const stepsSinceStart = setNumber - applicableStep.fromSet + 1;
      const totalAdjustment = applicableStep.adjustment * stepsSinceStart;

      if (result.intensityPercent !== null && result.intensityPercent !== undefined) {
        result.intensityPercent = Math.min(
          100,
          Math.max(0, (result.intensityPercent ?? 0) + totalAdjustment)
        );
      }
      break;
    }

    case 'rpe': {
      // Aumenta RPE punti (es. RPE 7 → 8 → 9)
      const stepsSinceStart = setNumber - applicableStep.fromSet + 1;
      const totalAdjustment = applicableStep.adjustment * stepsSinceStart;

      if (result.rpe !== null && result.rpe !== undefined) {
        result.rpe = Math.min(10, Math.max(1, Math.round((result.rpe ?? 7) + totalAdjustment)));
      }
      break;
    }

    default:
      // Tipo progressione non supportato
      return result;
  }

  return result;
}

/**
 * Genera tutte le serie da un gruppo applicando la progressione se presente
 */
export function generateSetsFromGroup(group: SetGroup): ExerciseSet[] {
  const sets: ExerciseSet[] = [];

  for (let i = 1; i <= group.count; i++) {
    let set: ExerciseSet;

    if (group.progression) {
      // Applica progressione
      set = applyProgression(group.baseSet, group.progression, i);
    } else {
      // Tutte le serie identiche
      set = { ...group.baseSet };
    }

    sets.push(set);
  }

  return sets;
}

/**
 * Calcola una stringa riassuntiva per un gruppo (per badge compatta)
 * Es. "5x10 @ 70% 1RM" o "5x10-12 @ 70-75% 1RM"
 */
export function calculateGroupSummary(group: SetGroup): string {
  const parts: string[] = [];
  const sets = group.sets.length > 0 ? group.sets : generateSetsFromGroup(group);

  // Numero serie
  parts.push(`${group.count}x`);

  // Ripetizioni
  const reps = sets
    .map((s: ExerciseSet) => s.reps)
    .filter((r): r is number => r !== undefined && r !== null);
  if (reps.length > 0) {
    const minReps = Math.min(...reps);
    const maxReps = Math.max(...reps);
    if (minReps === maxReps) {
      parts.push(`${minReps}`);
    } else {
      parts.push(`${minReps}-${maxReps}`);
    }
  }

  // Peso/Intensity
  const hasWeight = sets.some((s: ExerciseSet) => s.weight !== null && s.weight !== undefined);
  const hasIntensity = sets.some(
    (s: ExerciseSet) => s.intensityPercent !== null && s.intensityPercent !== undefined
  );

  if (hasIntensity) {
    const intensities = sets
      .map((s: ExerciseSet) => s.intensityPercent)
      .filter((i): i is number => i !== null && i !== undefined);
    const minIntensity = Math.min(...intensities);
    const maxIntensity = Math.max(...intensities);
    if (minIntensity === maxIntensity) {
      parts.push(`@ ${minIntensity}% 1RM`);
    } else {
      parts.push(`@ ${minIntensity}-${maxIntensity}% 1RM`);
    }
  } else if (hasWeight) {
    const weights = sets
      .map((s: ExerciseSet) => s.weight)
      .filter((w): w is number => w !== null && w !== undefined);
    const minWeight = Math.min(...weights);
    const maxWeight = Math.max(...weights);
    if (minWeight === maxWeight) {
      parts.push(`@ ${minWeight}kg`);
    } else {
      parts.push(`@ ${minWeight}-${maxWeight}kg`);
    }
  }

  // Rest (se tutte hanno lo stesso rest)
  const rests = sets.map((s: ExerciseSet) => s.rest);
  if (rests.length > 0 && rests.every((r) => r === rests[0])) {
    parts.push(`, rest ${rests[0]}s`);
  }

  return parts.join(' ');
}

/**
 * Verifica se un gruppo ha tutti i parametri identici (nessuna progressione effettiva)
 */
export function isUniformGroup(group: SetGroup): boolean {
  if (!group.progression || group.sets.length < 2) {
    return true;
  }

  const firstSet = group.sets[0];
  if (!firstSet) {
    return true;
  }
  return group.sets.every((set) => {
    return (
      set.reps === firstSet.reps &&
      set.weight === firstSet.weight &&
      set.intensityPercent === firstSet.intensityPercent &&
      set.rpe === firstSet.rpe &&
      set.rest === firstSet.rest
    );
  });
}
