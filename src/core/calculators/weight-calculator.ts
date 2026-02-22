/**
 * Workout Weight Calculator (Pure)
 *
 * Pure functions for calculating weights based on 1RM and intensity.
 * This file contains no database or external service calls.
 */

import type { ExerciseSet } from '@giulio-leone/types';
import { calculateWeightFromIntensity, calculateIntensityFromWeight } from './intensity-calculator';
import { kgToLbs } from '@giulio-leone/lib-shared';
import { roundToPlateIncrement } from '../utils';

/**
 * Calculate weights for a single set based on 1RM
 * @param set - Exercise set to calculate weights for
 * @param oneRepMaxKg - User's 1RM for the exercise in kg
 * @param weightIncrement - Plate increment for rounding (default 2.5)
 * @returns Updated set with calculated weight, weightLbs, and intensityPercent
 */
export function calculateSetWeights(
  set: ExerciseSet,
  oneRepMaxKg: number,
  weightIncrement: number = 2.5
): ExerciseSet {
  let newWeight: number | null = set.weight ?? null;
  let newWeightLbs: number | null = set.weightLbs ?? null;
  let newIntensityPercent: number | null = set.intensityPercent ?? null;

  // Priority: use intensityPercent to calculate weight if available
  if (set.intensityPercent !== null && set.intensityPercent !== undefined && oneRepMaxKg > 0) {
    newWeight = calculateWeightFromIntensity(oneRepMaxKg, set.intensityPercent);
    // Apply plate rounding
    newWeight = roundToPlateIncrement(newWeight, weightIncrement);
    newWeightLbs = kgToLbs(newWeight);
  }
  // Fallback: calculate intensityPercent from weight
  else if (
    set.weight !== null &&
    set.weight !== undefined &&
    (newIntensityPercent === null || newIntensityPercent === undefined) &&
    oneRepMaxKg > 0
  ) {
    newIntensityPercent = calculateIntensityFromWeight(set.weight, oneRepMaxKg);
    if ((newWeightLbs === null || newWeightLbs === undefined) && newWeight !== null) {
      newWeightLbs = kgToLbs(newWeight);
    }
  }
  // Ensure weightLbs is calculated if weight exists
  else if (
    set.weight !== null &&
    set.weight !== undefined &&
    (newWeightLbs === null || newWeightLbs === undefined)
  ) {
    newWeightLbs = kgToLbs(set.weight);
  }

  return {
    ...set,
    weight: newWeight,
    weightLbs: newWeightLbs,
    intensityPercent: newIntensityPercent,
    rpe: set.rpe ?? null,
  };
}
