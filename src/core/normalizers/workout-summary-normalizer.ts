/**
 * Workout Summary Normalizer
 *
 * Normalizer leggero per le liste di programmi.
 * NON parsa il campo `weeks` JSON per evitare overhead.
 */

import type { DifficultyLevel, WorkoutStatus } from '@giulio-leone/types';
import { normalizeDifficulty, normalizeStatus } from './workout-normalizer';
import { ensureArrayOfStrings, ensureNumber, ensureString } from '../utils/type-helpers';

/**
 * Tipo ridotto per la lista programmi (senza weeks)
 */
export interface WorkoutProgramSummary {
  id: string;
  name: string;
  description: string;
  difficulty: DifficultyLevel;
  durationWeeks: number;
  goals: string[];
  status: WorkoutStatus;
  createdAt: string;
  updatedAt: string;
  userId?: string;
}

/**
 * Tipo minimo Prisma per summary (ottimizzato con select)
 */
export interface PrismaWorkoutProgramSummary {
  id: string;
  name: string;
  description: string;
  difficulty: string;
  durationWeeks: number;
  goals: string[];
  status: string;
  createdAt: Date;
  updatedAt: Date;
  userId?: string | null;
}

/**
 * Normalizza un programma per la visualizzazione in lista.
 * NON effettua parsing del campo weeks per performance ottimale.
 */
export function normalizeWorkoutProgramSummary(
  program: PrismaWorkoutProgramSummary
): WorkoutProgramSummary {
  const createdAtDate =
    program.createdAt instanceof Date ? program.createdAt : new Date(program.createdAt);
  const updatedAtDate =
    program.updatedAt instanceof Date ? program.updatedAt : new Date(program.updatedAt);

  return {
    id: program.id,
    name: ensureString(program.name),
    description: ensureString(program.description),
    difficulty: normalizeDifficulty(program.difficulty),
    durationWeeks: Math.max(1, ensureNumber(program.durationWeeks, 1)),
    goals: ensureArrayOfStrings(program.goals),
    status: normalizeStatus(program.status),
    createdAt: createdAtDate.toISOString(),
    updatedAt: updatedAtDate.toISOString(),
    userId: program.userId ?? undefined,
  };
}
