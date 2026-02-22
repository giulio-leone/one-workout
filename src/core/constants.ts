/**
 * Workout Constants
 *
 * Constants condivise per workout programs
 */

import type { ExerciseSet, MuscleGroup } from '@giulio-leone/types';

/**
 * Default values per ExerciseSet
 * Tutti i campi required sono presenti anche se null (per allineamento con tipo)
 */
export const DEFAULT_SET: ExerciseSet = {
  reps: 10,
  rest: 60,
  weight: null,
  weightLbs: null,
  intensityPercent: null,
  rpe: null,
};

/**
 * Categorie esercizio consentite
 */
export const ALLOWED_CATEGORIES = new Set([
  'strength',
  'cardio',
  'flexibility',
  'balance',
  'endurance',
]);

/**
 * Gruppi muscolari consentiti
 */
export const ALLOWED_MUSCLE_GROUPS = new Set<MuscleGroup>([
  'chest',
  'back',
  'shoulders',
  'arms',
  'legs',
  'core',
  'full-body',
]);

/**
 * Alias per mappare nomi di gruppi muscolari a valori standard
 * Consolidato per eliminare duplicazioni (Area 3 refactoring)
 */
export const MUSCLE_GROUP_ALIASES: Record<string, MuscleGroup> = {
  // Chest
  chest: 'chest',
  pectoral: 'chest',
  pectorals: 'chest',
  // Back
  back: 'back',
  lats: 'back',
  posterior: 'back',
  'posterior chain': 'back',
  traps: 'back',
  // Shoulders
  shoulders: 'shoulders',
  delts: 'shoulders',
  // Arms
  arms: 'arms',
  biceps: 'arms',
  triceps: 'arms',
  forearms: 'arms',
  // Legs
  legs: 'legs',
  hamstrings: 'legs',
  'hamstrings/glutes': 'legs',
  glutes: 'legs',
  quads: 'legs',
  quadriceps: 'legs',
  calves: 'legs',
  // Core
  core: 'core',
  abs: 'core',
  abdominals: 'core',
};
