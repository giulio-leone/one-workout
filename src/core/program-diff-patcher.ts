/**
 * Programmatic Diff Patching for Workout Programs
 *
 * This module implements the diff-based architecture where:
 * - AI generates Week 1 template + progression diffs
 * - This code PROGRAMMATICALLY clones Week 1 and applies diffs
 *
 * This guarantees zero data loss and structural consistency.
 */

import type { WorkoutWeek, ExerciseSet } from '../sdk-agents/workout-generation/schema';

/**
 * A single progression change from the AI
 */
export interface ProgressionChange {
  dayNumber: number;
  exerciseIndex: number;
  setGroupIndex: number;
  reps: number;
  weight?: number;
  weightLbs?: number;
  intensityPercent?: number;
  rpe?: number;
  rest?: number;
  count?: number; // Number of sets
}

/**
 * Diff for a single week
 */
export interface WeekDiff {
  focus: string;
  notes?: string;
  changes: ProgressionChange[];
}

/**
 * All progression diffs for the program
 */
export interface ProgressionDiffs {
  week2: WeekDiff;
  week3?: WeekDiff;
  week4?: WeekDiff;
}

export type TrainingPhase = 'accumulation' | 'intensification' | 'realization' | 'deload';

/**
 * Phase mapping for weeks
 */
const WEEK_PHASES: Record<number, TrainingPhase> = {
  1: 'accumulation',
  2: 'accumulation',
  3: 'intensification',
  4: 'realization',
};

/**
 * Deep clone an object using structured clone (or JSON fallback)
 */
function deepClone<T>(obj: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(obj);
  }
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Apply a single progression change to a week
 */
function applyChange(week: WorkoutWeek, change: ProgressionChange): void {
  const day = week.days.find((d: any) => d.dayNumber === change.dayNumber);
  if (!day) {
    console.warn(`[DiffPatcher] Day ${change.dayNumber} not found in week ${week.weekNumber}`);
    return;
  }

  const setGroup = day.setGroups[change.exerciseIndex];
  if (!setGroup) {
    console.warn(
      `[DiffPatcher] SetGroup ${change.exerciseIndex} not found in day ${change.dayNumber}`
    );
    return;
  }

  // Apply changes to all sets in the group
  setGroup.sets.forEach((set: ExerciseSet) => {
    // Reps is mandatory
    set.reps = change.reps;

    // Optional fields
    if (change.weight !== undefined) {
      set.weight = change.weight;
    }
    if (change.rpe !== undefined) {
      set.rpe = change.rpe;
    }
    if (change.rest !== undefined) {
      set.restSeconds = change.rest;
    }
  });

  // If count changed, adjust the number of sets
  if (change.count !== undefined && change.count !== setGroup.sets.length) {
    const baseSet = setGroup.sets[0] || {
      setNumber: 1,
      reps: change.reps,
      weight: change.weight || 0,
      weightUnit: 'kg' as const,
      restSeconds: change.rest || 60,
    };

    // Generate new sets array
    setGroup.sets = Array.from({ length: change.count }, (_, i) => ({
      ...deepClone(baseSet),
      setNumber: i + 1,
      reps: change.reps,
      ...(change.weight !== undefined && { weight: change.weight }),
      ...(change.rpe !== undefined && { rpe: change.rpe }),
      ...(change.rest !== undefined && { restSeconds: change.rest }),
    }));
  }
}

/**
 * Apply all changes in a diff to a week
 */
function applyWeekDiff(week: WorkoutWeek, diff: WeekDiff): void {
  for (const change of diff.changes) {
    applyChange(week, change);
  }

  // Update notes if provided
  if (diff.notes) {
    week.notes = diff.notes;
  }
}

/**
 * Assemble a complete multi-week program from Week 1 template and diffs
 *
 * This is the CORE function that guarantees structural consistency.
 *
 * @param week1Template - The complete Week 1 template from day-generator
 * @param progressionDiffs - Diffs for weeks 2-4 from progression-diff-generator
 * @param durationWeeks - Total number of weeks (usually 4)
 * @returns Array of assembled weeks
 */
export function assembleWeeksFromDiffs(
  week1Template: WorkoutWeek,
  progressionDiffs: ProgressionDiffs,
  durationWeeks: number
): WorkoutWeek[] {
  const weeks: WorkoutWeek[] = [];

  // Week 1 - use as-is (normalized)
  const week1: WorkoutWeek = {
    ...deepClone(week1Template),
    weekNumber: 1,
    phase: WEEK_PHASES[1]!,
  };
  weeks.push(week1);

  // Weeks 2-N - clone Week 1 and apply diffs
  for (let weekNum = 2; weekNum <= durationWeeks; weekNum++) {
    // Clone Week 1 structure
    const clonedWeek = deepClone(week1Template);
    clonedWeek.weekNumber = weekNum;
    clonedWeek.phase = WEEK_PHASES[weekNum] || 'accumulation';

    // Get and apply diff for this week
    const diffKey = `week${weekNum}` as keyof ProgressionDiffs;
    const diff = progressionDiffs[diffKey];

    if (diff) {
      applyWeekDiff(clonedWeek, diff);
    }

    weeks.push(clonedWeek);
  }

  return weeks;
}

/**
 * Validate that all weeks have consistent structure
 */
export function validateWeeksConsistency(weeks: WorkoutWeek[]): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (weeks.length === 0) {
    return { valid: false, errors: ['No weeks in program'] };
  }

  const week1 = weeks[0]!;
  const expectedDays = week1.days.length;
  const expectedExercisesPerDay = week1.days.map((d: any) => d.setGroups.length);

  for (let i = 1; i < weeks.length; i++) {
    const week = weeks[i]!;

    if (week.days.length !== expectedDays) {
      errors.push(`Week ${i + 1} has ${week.days.length} days, expected ${expectedDays}`);
    }

    week.days.forEach((day, dayIdx) => {
      const expected = expectedExercisesPerDay[dayIdx] ?? 0;
      if (day.setGroups.length !== expected) {
        errors.push(
          `Week ${i + 1} Day ${dayIdx + 1} has ${day.setGroups.length} exercises, expected ${expected}`
        );
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
