/**
 * Utility pure per calcoli di intensità, peso e 1RM
 */
import { kgToLbs } from '@giulio-leone/lib-shared';
import { roundToPlateIncrement } from '../utils';

// =====================================================
// RPE to Intensity Lookup Table
// =====================================================

/**
 * Tabella RPE → % 1RM basata su reps
 * Fonte: Mike Tuchscherer / RTS (Reactive Training Systems)
 *
 * Formato: RPE_INTENSITY_TABLE[reps][rpe] = intensityPercent
 * RPE va da 6.5 a 10, reps da 1 a 12+
 */
const RPE_INTENSITY_TABLE: Record<number, Record<number, number>> = {
  1: { 10: 100, 9.5: 97.8, 9: 95.5, 8.5: 93.9, 8: 92.2, 7.5: 90.7, 7: 89.2, 6.5: 87.8 },
  2: { 10: 95.5, 9.5: 93.9, 9: 92.2, 8.5: 90.7, 8: 89.2, 7.5: 87.8, 7: 86.3, 6.5: 85.0 },
  3: { 10: 92.2, 9.5: 90.7, 9: 89.2, 8.5: 87.8, 8: 86.3, 7.5: 85.0, 7: 83.7, 6.5: 82.4 },
  4: { 10: 89.2, 9.5: 87.8, 9: 86.3, 8.5: 85.0, 8: 83.7, 7.5: 82.4, 7: 81.1, 6.5: 79.9 },
  5: { 10: 86.3, 9.5: 85.0, 9: 83.7, 8.5: 82.4, 8: 81.1, 7.5: 79.9, 7: 78.6, 6.5: 77.4 },
  6: { 10: 83.7, 9.5: 82.4, 9: 81.1, 8.5: 79.9, 8: 78.6, 7.5: 77.4, 7: 76.2, 6.5: 75.1 },
  7: { 10: 81.1, 9.5: 79.9, 9: 78.6, 8.5: 77.4, 8: 76.2, 7.5: 75.1, 7: 73.9, 6.5: 72.3 },
  8: { 10: 78.6, 9.5: 77.4, 9: 76.2, 8.5: 75.1, 8: 73.9, 7.5: 72.3, 7: 70.7, 6.5: 69.4 },
  9: { 10: 76.2, 9.5: 75.1, 9: 73.9, 8.5: 72.3, 8: 70.7, 7.5: 69.4, 7: 68.0, 6.5: 66.7 },
  10: { 10: 73.9, 9.5: 72.3, 9: 70.7, 8.5: 69.4, 8: 68.0, 7.5: 66.7, 7: 65.3, 6.5: 64.0 },
  11: { 10: 70.7, 9.5: 69.4, 9: 68.0, 8.5: 66.7, 8: 65.3, 7.5: 64.0, 7: 62.6, 6.5: 61.3 },
  12: { 10: 68.0, 9.5: 66.7, 9: 65.3, 8.5: 64.0, 8: 62.6, 7.5: 61.3, 7: 60.0, 6.5: 58.8 },
};

// =====================================================
// Core Functions
// =====================================================

/**
 * Calcola il peso (kg) da intensità percentuale e 1RM
 * @param oneRepMax - Massimale 1RM in kg
 * @param intensityPercent - Intensità percentuale (0-100)
 * @returns Peso calcolato in kg
 */
export function calculateWeightFromIntensity(oneRepMax: number, intensityPercent: number): number {
  if (oneRepMax <= 0 || intensityPercent < 0 || intensityPercent > 100) {
    throw new Error('Invalid parameters: oneRepMax must be > 0, intensityPercent must be 0-100');
  }
  return (intensityPercent / 100) * oneRepMax;
}

/**
 * Calcola l'intensità percentuale da peso e 1RM
 * @param weight - Peso sollevato in kg
 * @param oneRepMax - Massimale 1RM in kg
 * @returns Intensità percentuale (0-100)
 */
export function calculateIntensityFromWeight(weight: number, oneRepMax: number): number {
  if (oneRepMax <= 0 || weight < 0) {
    throw new Error('Invalid parameters: oneRepMax must be > 0, weight must be >= 0');
  }
  return (weight / oneRepMax) * 100;
}

/**
 * Calcola il peso (kg) da RPE e reps usando la tabella RTS
 *
 * @param oneRepMax - Massimale 1RM in kg
 * @param reps - Numero di ripetizioni target
 * @param rpe - Rate of Perceived Exertion (6.5-10)
 * @returns Peso calcolato in kg
 *
 * @example
 * // Per 5 reps a RPE 8 con 1RM di 100kg
 * calculateWeightFromRPE(100, 5, 8) // ~81.1kg
 */
export function calculateWeightFromRPE(oneRepMax: number, reps: number, rpe: number): number {
  if (oneRepMax <= 0) {
    throw new Error('Invalid oneRepMax: must be > 0');
  }
  if (reps < 1 || reps > 12) {
    // Per reps > 12, usa l'ultima riga disponibile
    reps = Math.min(12, Math.max(1, Math.round(reps)));
  }
  if (rpe < 6.5 || rpe > 10) {
    // Clamp RPE to valid range
    rpe = Math.min(10, Math.max(6.5, rpe));
  }

  // Round RPE to nearest 0.5
  const roundedRpe = Math.round(rpe * 2) / 2;

  // Get intensity from table
  const repsRow = RPE_INTENSITY_TABLE[reps];
  if (!repsRow) {
    throw new Error(`No data for ${reps} reps`);
  }

  const intensity = repsRow[roundedRpe];
  if (intensity === undefined) {
    // Interpolate if exact RPE not found
    const lowerRpe = Math.floor(rpe * 2) / 2;
    const upperRpe = Math.ceil(rpe * 2) / 2;
    const lowerIntensity = repsRow[lowerRpe] ?? repsRow[10]!;
    const upperIntensity = repsRow[upperRpe] ?? repsRow[6.5]!;
    const interpolated =
      lowerIntensity + (upperIntensity - lowerIntensity) * ((rpe - lowerRpe) / 0.5);
    return calculateWeightFromIntensity(oneRepMax, interpolated);
  }

  return calculateWeightFromIntensity(oneRepMax, intensity);
}

/**
 * Calcola l'intensità percentuale da RPE e reps
 *
 * @param reps - Numero di ripetizioni
 * @param rpe - Rate of Perceived Exertion (6.5-10)
 * @returns Intensità percentuale (0-100)
 */
export function calculateIntensityFromRPE(reps: number, rpe: number): number {
  if (reps < 1) reps = 1;
  if (reps > 12) reps = 12;
  if (rpe < 6.5) rpe = 6.5;
  if (rpe > 10) rpe = 10;

  const roundedRpe = Math.round(rpe * 2) / 2;
  const repsRow = RPE_INTENSITY_TABLE[Math.round(reps)];

  if (!repsRow) return 70; // Fallback

  return repsRow[roundedRpe] ?? 70;
}

/**
 * Calcola RPE da peso, 1RM e reps
 *
 * @param weight - Peso sollevato in kg
 * @param oneRepMax - Massimale 1RM in kg
 * @param reps - Numero di ripetizioni
 * @returns RPE stimato (6.5-10)
 */
export function calculateRPEFromWeight(weight: number, oneRepMax: number, reps: number): number {
  if (oneRepMax <= 0 || weight <= 0) return 8; // Fallback

  const intensity = calculateIntensityFromWeight(weight, oneRepMax);
  return calculateRPEFromIntensity(intensity, reps);
}

/**
 * Calcola RPE da intensità e reps
 *
 * @param intensityPercent - Intensità percentuale (0-100)
 * @param reps - Numero di ripetizioni
 * @returns RPE stimato (6.5-10)
 */
export function calculateRPEFromIntensity(intensityPercent: number, reps: number): number {
  if (reps < 1) reps = 1;
  if (reps > 12) reps = 12;

  const repsRow = RPE_INTENSITY_TABLE[Math.round(reps)];
  if (!repsRow) return 8;

  // Find closest RPE for given intensity
  let closestRpe = 8;
  let minDiff = Infinity;

  for (const [rpeStr, tableIntensity] of Object.entries(repsRow)) {
    const diff = Math.abs(tableIntensity - intensityPercent);
    if (diff < minDiff) {
      minDiff = diff;
      closestRpe = parseFloat(rpeStr);
    }
  }

  return closestRpe;
}

/**
 * Stima il 1RM da reps, peso e RPE usando la formula di Epley
 * Formula: 1RM = weight * (1 + reps / 30)
 * Con correzione RPE: se RPE < 10, aggiungi reps potenziali
 * @param reps - Numero di ripetizioni eseguite
 * @param weight - Peso sollevato in kg
 * @param rpe - Rate of Perceived Exertion (1-10, opzionale)
 * @returns Stima del 1RM in kg
 */
export function estimateOneRMFromReps(reps: number, weight: number, rpe: number = 10): number {
  if (weight <= 0 || reps <= 0 || reps > 30) {
    throw new Error('Invalid parameters: weight and reps must be > 0, reps <= 30');
  }
  if (rpe < 1 || rpe > 10) {
    throw new Error('Invalid RPE: must be between 1 and 10');
  }

  // Aggiungi reps potenziali in base a RPE
  // RPE 10 = 0 reps in riserva, RPE 9 = ~1 rep in riserva, etc.
  const repsInReserve = 10 - rpe;
  const effectiveReps = reps + repsInReserve;

  // Formula Epley: 1RM = weight * (1 + reps / 30)
  return weight * (1 + effectiveReps / 30);
}

// Note: kgToLbs and lbsToKg are now imported from @giulio-leone/lib-shared

// =====================================================
// Sync Helpers
// =====================================================

/**
 * Calcoli bidirezionali con priorità campo in focus
 * Ritorna i valori calcolati per weight, intensity, rpe
 */
export interface SyncedValues {
  weight?: number;
  weightMax?: number;
  weightLbs?: number;
  intensityPercent?: number;
  intensityPercentMax?: number;
  rpe?: number;
  rpeMax?: number;
}

export type FocusField = 'weight' | 'intensity' | 'rpe';

/**
 * Sincronizza i valori tra weight, intensity e RPE
 * Il campo in focus è il "master" e gli altri vengono calcolati
 *
 * @param focusField - Campo che l'utente sta modificando
 * @param values - Valori correnti
 * @param oneRepMax - 1RM per i calcoli
 * @param reps - Reps per calcolo RPE (opzionale)
 * @param weightIncrement - Plate increment for rounding weights (optional, default 2.5)
 */
export function syncSetValues(
  focusField: FocusField,
  values: {
    weight?: number | null;
    weightMax?: number | null;
    intensityPercent?: number | null;
    intensityPercentMax?: number | null;
    rpe?: number | null;
    rpeMax?: number | null;
  },
  oneRepMax?: number,
  reps?: number,
  weightIncrement?: number
): SyncedValues {
  const result: SyncedValues = {};

  if (!oneRepMax || oneRepMax <= 0) return result;

  // Use provided increment or default to 2.5
  const increment = weightIncrement ?? 2.5;

  switch (focusField) {
    case 'weight':
      // Weight → Intensity, RPE
      if (values.weight && values.weight > 0) {
        result.intensityPercent = roundTo(
          calculateIntensityFromWeight(values.weight, oneRepMax),
          1
        );
        result.weightLbs = roundTo(kgToLbs(values.weight), 1);
        if (reps) {
          result.rpe = calculateRPEFromWeight(values.weight, oneRepMax, reps);
        }
      }
      if (values.weightMax && values.weightMax > 0) {
        result.intensityPercentMax = roundTo(
          calculateIntensityFromWeight(values.weightMax, oneRepMax),
          1
        );
        if (reps) {
          result.rpeMax = calculateRPEFromWeight(values.weightMax, oneRepMax, reps);
        }
      }
      break;

    case 'intensity':
      // Intensity → Weight, RPE
      if (values.intensityPercent && values.intensityPercent > 0) {
        result.weight = roundToPlateIncrement(
          calculateWeightFromIntensity(oneRepMax, values.intensityPercent),
          increment
        );
        result.weightLbs = roundTo(kgToLbs(result.weight), 1);
        if (reps) {
          result.rpe = calculateRPEFromIntensity(values.intensityPercent, reps);
        }
      }
      if (values.intensityPercentMax && values.intensityPercentMax > 0) {
        result.weightMax = roundToPlateIncrement(
          calculateWeightFromIntensity(oneRepMax, values.intensityPercentMax),
          increment
        );
        if (reps) {
          result.rpeMax = calculateRPEFromIntensity(values.intensityPercentMax, reps);
        }
      }
      break;

    case 'rpe':
      // RPE → Intensity → Weight
      if (values.rpe && values.rpe >= 6.5 && reps) {
        const intensity = calculateIntensityFromRPE(reps, values.rpe);
        result.intensityPercent = roundTo(intensity, 1);
        result.weight = roundToPlateIncrement(
          calculateWeightFromIntensity(oneRepMax, intensity),
          increment
        );
        result.weightLbs = roundTo(kgToLbs(result.weight), 1);
      }
      if (values.rpeMax && values.rpeMax >= 6.5 && reps) {
        const intensityMax = calculateIntensityFromRPE(reps, values.rpeMax);
        result.intensityPercentMax = roundTo(intensityMax, 1);
        result.weightMax = roundToPlateIncrement(
          calculateWeightFromIntensity(oneRepMax, intensityMax),
          increment
        );
      }
      break;
  }

  return result;
}

function roundTo(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}
