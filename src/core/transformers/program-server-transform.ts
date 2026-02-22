/**
 * Workout Program Server-Side Transform Utilities
 *
 * Functions that require server-only services (database access, etc.)
 * These functions are only executed server-side when called from API routes
 * or server components, even if imported in files that may be used in client components.
 *
 * NOTE: This file does not use 'server-only' because it's imported by chat-tools.ts
 * which may be used in client components. The functions themselves are only executed
 * server-side when called.
 */

import { DifficultyLevel, WorkoutStatus } from '@prisma/client';
import type { WorkoutProgram } from '@giulio-leone/types';
import { createId } from '@giulio-leone/lib-shared';
import { ensureArrayOfStrings, ensureNumber, ensureString } from '../utils';
import { convertWorkoutGoalNamesToIds } from '@giulio-leone/lib-metadata';
import {
  normalizeDifficulty,
  normalizeStatus,
  normalizeWeek,
  normalizeMetadata,
} from '../normalizers';
import { createEmptyWeek } from './program-transform';

type RawJson = Record<string, unknown>;

interface RawProgram {
  weeks?: unknown[];
}

/**
 * Normalize workout payload and convert goal names to IDs (async version)
 * Used in backend where we need to ensure goals are saved as IDs
 *
 * IMPORTANT: This function is server-only and should only be called from API routes
 */
export async function normalizeAgentWorkoutPayload(
  payload: unknown,
  base?: Partial<WorkoutProgram>
): Promise<WorkoutProgram> {
  const raw = payload && typeof payload === 'object' ? (payload as RawJson) : ({} as RawJson);

  const rawProgram = raw.program as RawProgram | undefined;
  const rawWeeks = Array.isArray(raw.weeks)
    ? raw.weeks
    : rawProgram && Array.isArray(rawProgram.weeks)
      ? rawProgram.weeks
      : [];

  const normalizedWeeksList =
    rawWeeks.length > 0
      ? rawWeeks.map((week: unknown, index: number) => normalizeWeek(week, index))
      : (base?.weeks ?? [createEmptyWeek(1)]);

  const normalizedWeeks =
    normalizedWeeksList.length > 0 ? normalizedWeeksList : [createEmptyWeek(1)];

  const status =
    raw.status !== undefined ? normalizeStatus(raw.status) : (base?.status ?? WorkoutStatus.DRAFT);

  const metadata =
    raw.metadata !== undefined ? normalizeMetadata(raw.metadata) : (base?.metadata ?? {});

  const now = new Date().toISOString();

  const fallbackDuration =
    base?.durationWeeks !== undefined && base?.durationWeeks !== null
      ? base.durationWeeks
      : normalizedWeeks.length || 1;

  // Normalize goals - handle both array and object formats
  // If goals is an object with 'primary' and/or 'targetMuscles', convert it to an array
  let normalizedGoals: string[] = [];
  if (raw.goals !== undefined) {
    if (Array.isArray(raw.goals)) {
      normalizedGoals = ensureArrayOfStrings(raw.goals);
    } else if (typeof raw.goals === 'object' && raw.goals !== null) {
      const goalsObj = raw.goals as {
        primary?: string;
        targetMuscles?: string[] | unknown;
        [key: string]: unknown;
      };
      const goalsArray: string[] = [];
      if (goalsObj.primary && typeof goalsObj.primary === 'string') {
        goalsArray.push(goalsObj.primary);
      }
      if (goalsObj.targetMuscles) {
        const targetMuscles = ensureArrayOfStrings(goalsObj.targetMuscles);
        goalsArray.push(...targetMuscles);
      }
      normalizedGoals = goalsArray.length > 0 ? goalsArray : ensureArrayOfStrings(raw.goals);
    } else {
      normalizedGoals = ensureArrayOfStrings(raw.goals);
    }
  } else if (base?.goals && Array.isArray(base.goals) && base.goals.length > 0) {
    normalizedGoals = base.goals;
  }

  // Converti goal names → IDs se necessario
  const goalIds = await convertWorkoutGoalNamesToIds(normalizedGoals);

  return {
    id: base?.id ?? createId(),
    name: ensureString(raw.name ?? base?.name ?? 'Workout Program'),
    description: ensureString(raw.description ?? base?.description ?? ''),
    difficulty: raw.difficulty
      ? normalizeDifficulty(raw.difficulty)
      : (base?.difficulty ?? DifficultyLevel.BEGINNER),
    durationWeeks: Math.max(
      1,
      ensureNumber(raw.durationWeeks ?? base?.durationWeeks, fallbackDuration)
    ),
    weeks: normalizedWeeks,
    goals: goalIds,
    status,
    userId: base?.userId,
    metadata,
    createdAt: base?.createdAt ?? now,
    updatedAt: now,
    version: base?.version ?? 1,
  };
}
