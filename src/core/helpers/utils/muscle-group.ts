/**
 * Muscle Group Utilities
 *
 * Utility functions per normalizzazione gruppi muscolari
 */

import type { MuscleGroup } from '@giulio-leone/types';
import { ALLOWED_MUSCLE_GROUPS, MUSCLE_GROUP_ALIASES } from '../../constants';

/**
 * Normalizza un nome di gruppo muscolare al valore standard
 */
export function getMuscleGroupFromName(name: string): MuscleGroup | null {
  const normalized = name.trim().toLowerCase();

  // Controlla se è già un valore valido
  if (ALLOWED_MUSCLE_GROUPS.has(normalized as MuscleGroup)) {
    return normalized as MuscleGroup;
  }

  // Controlla aliases diretti
  if (MUSCLE_GROUP_ALIASES[normalized]) {
    return MUSCLE_GROUP_ALIASES[normalized];
  }

  // Controlla aliases parziali
  const aliasKey = Object.keys(MUSCLE_GROUP_ALIASES).find((key: string) =>
    normalized.includes(key)
  );
  if (aliasKey) {
    const result = MUSCLE_GROUP_ALIASES[aliasKey];
    return result ?? null;
  }

  // Fallback per pattern comuni
  if (normalized.includes('upper')) {
    return 'chest';
  }
  if (normalized.includes('lower')) {
    return 'legs';
  }
  if (normalized.includes('full')) {
    return 'full-body';
  }

  return null;
}
