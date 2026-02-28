import type { WorkoutProgram, ExerciseSet, SetGroup } from '@giulio-leone/types/workout';
import type { WorkoutChange } from '@giulio-leone/types';

import type { AIWorkoutProgram, ProgressionDiff } from '@giulio-leone/schemas';

/**
 * Type for pyramid/variable sets - fields can be arrays or single values
 *
 * IMPORTANT:
 * - If intensityPercent is array, weight should typically be array too (coherent progression)
 * - rpe can vary independently (AI can use RPE instead of intensityPercent)
 * - rest can vary per set (longer rest for heavier sets)
 */
export interface PyramidBaseSet {
  reps?: number | number[];
  repsMax?: number | number[];
  duration?: number | number[];
  weight?: number | null | (number | null)[]; // Should match intensityPercent if it's array
  weightMax?: number | null | (number | null)[];
  weightLbs?: number | null | (number | null)[]; // Should match weight if it's array
  intensityPercent?: number | null | (number | null)[]; // Can vary per set
  intensityPercentMax?: number | null | (number | null)[];
  rpe?: number | null | (number | null)[]; // Can vary independently, alternative to intensityPercent
  rpeMax?: number | null | (number | null)[];
  rest: number | number[]; // Can vary per set (e.g., longer rest for heavier sets)
}

/**
 * Expands pyramid/variable sets from compact notation
 *
 * IMPORTANT RULES:
 * - If intensityPercent is array, weight MUST also be array (or calculated)
 * - If rpe is array, weight/intensityPercent should be consistent
 * - rest can vary per set (array) or be constant (scalar)
 *
 * Input example:
 * {
 *   count: 6,
 *   baseSet: {
 *     reps: [10, 8, 6, 4, 4, 3],
 *     weight: [60, 70, 80, 85, 90, 95],     // MUST match intensity changes
 *     intensityPercent: [70, 75, 80, 82.5, 85, 87.5],
 *     rpe: [7, 8, 8, 9, 9, 9],              // Can vary independently
 *     rest: [120, 150, 180, 180, 180, 180]  // Can vary per set
 *   }
 * }
 *
 * Output: 6 individual sets with interpolated values
 */
function expandPyramidSet(
  baseSet: PyramidBaseSet,
  _count: number, // Used for validation, prefixed with _ to indicate intentional unused
  index: number
): ExerciseSet {
  const getValue = <T>(field: T | T[] | undefined | null, defaultValue: T): T => {
    if (field === undefined || field === null) return defaultValue;
    if (Array.isArray(field)) {
      const arrayValue = field[Math.min(index, field.length - 1)];
      // If array is empty or index is out of bounds, return default
      return arrayValue !== undefined ? arrayValue : defaultValue;
    }
    return field;
  };

  // Get values for this set index
  const reps = getValue(baseSet.reps, undefined);
  const intensityPercent = getValue(baseSet.intensityPercent, null);
  const rpe = getValue(baseSet.rpe, null);
  const rest = getValue(baseSet.rest, 120);

  // Weight handling: if intensityPercent is array, weight should be array too
  // If weight is scalar but intensityPercent is array, we keep weight as-is
  // (AI should provide both as arrays if they vary)
  let weight = getValue(baseSet.weight, null);
  let weightLbs = getValue(baseSet.weightLbs, null);

  // Calculate weightLbs if weight is provided but weightLbs is not
  if (weight !== null && weightLbs === null) {
    weightLbs = weight * 2.2;
  } else if (weightLbs !== null && weight === null) {
    // Calculate weight from weightLbs if needed
    weight = weightLbs / 2.2;
  }

  return {
    reps,
    repsMax: getValue(baseSet.repsMax, undefined),
    duration: getValue(baseSet.duration, undefined),
    weight,
    weightMax: getValue(baseSet.weightMax, undefined),
    weightLbs,
    intensityPercent,
    intensityPercentMax: getValue(baseSet.intensityPercentMax, undefined),
    rpe,
    rpeMax: getValue(baseSet.rpeMax, undefined),
    rest,
  } as ExerciseSet;
}

/**
 * Checks if baseSet contains any array fields (pyramid/variable)
 */
function isPyramidBaseSet(baseSet: unknown): boolean {
  if (!baseSet || typeof baseSet !== 'object') return false;
  const fields = [
    'reps',
    'repsMax',
    'duration',
    'weight',
    'weightMax',
    'weightLbs',
    'intensityPercent',
    'intensityPercentMax',
    'rpe',
    'rpeMax',
    'rest',
  ];
  return fields.some((field) => Array.isArray((baseSet as Record<string, unknown>)[field]));
}

/**
 * Compares two sets to check if they are identical
 */
function areSetsIdentical(set1: ExerciseSet, set2: ExerciseSet): boolean {
  const fields: (keyof ExerciseSet)[] = ['reps', 'weight', 'intensityPercent', 'rpe', 'rest'];
  return fields.every((field) => set1[field] === set2[field]);
}

/**
 * Groups consecutive identical sets into separate SetGroups
 *
 * Input: [Set1, Set2, Set2, Set3, Set4, Set4]
 * Output: [
 *   { count: 1, baseSet: Set1, sets: [Set1] },
 *   { count: 2, baseSet: Set2, sets: [Set2, Set2] },  // Grouped!
 *   { count: 1, baseSet: Set3, sets: [Set3] },
 *   { count: 2, baseSet: Set4, sets: [Set4, Set4] }   // Grouped!
 * ]
 */
export function groupIdenticalSets(sets: ExerciseSet[], baseId: string): SetGroup[] {
  if (sets.length === 0) return [];

  const groups: SetGroup[] = [];
  let currentGroup: ExerciseSet[] = [sets[0]!]; // sets[0] is guaranteed to exist (checked above)
  let groupIndex = 1;

  for (let i = 1; i < sets.length; i++) {
    const currentSet = sets[i]!; // Guaranteed to exist in loop
    const firstInGroup = currentGroup[0]!; // Guaranteed to exist (array always has at least one element)

    if (areSetsIdentical(currentSet, firstInGroup)) {
      currentGroup.push(currentSet);
    } else {
      // Save current group
      groups.push({
        id: `${baseId}_g${groupIndex}`,
        count: currentGroup.length,
        baseSet: firstInGroup,
        sets: currentGroup,
      });
      groupIndex++;
      currentGroup = [currentSet];
    }
  }

  // Save last group
  const lastGroupFirst = currentGroup[0]!; // Guaranteed to exist
  groups.push({
    id: `${baseId}_g${groupIndex}`,
    count: currentGroup.length,
    baseSet: lastGroupFirst,
    sets: currentGroup,
  });

  return groups;
}

/**
 * Expands sets[] array from baseSet + count for all SetGroups
 *
 * This function saves tokens by having AI generate only baseSet + count,
 * then programmatically building the full sets[] array.
 *
 * SUPPORTS PYRAMID/VARIABLE SETS:
 * - If baseSet fields are arrays (e.g., reps: [10, 8, 6, 4]), each set gets its value
 * - If baseSet fields are scalars, all sets get the same value
 *
 * Example pyramid:
 * {
 *   count: 6,
 *   baseSet: {
 *     reps: [10, 8, 6, 4, 4, 3],
 *     intensityPercent: [70, 75, 80, 82.5, 85, 87.5],
 *     rest: 120  // Same for all
 *   }
 * }
 *
 * @param aiProgram - Program with optional sets[] arrays (may contain pyramid notation)
 * @returns Program with all sets[] arrays fully populated
 */
export function expandSetGroups(aiProgram: AIWorkoutProgram): WorkoutProgram {
  const expanded = JSON.parse(JSON.stringify(aiProgram)) as WorkoutProgram;

  for (const week of expanded.weeks) {
    for (const day of week.days) {
      for (const exercise of day.exercises) {
        for (const setGroup of exercise.setGroups) {
          if (!setGroup.sets || setGroup.sets.length !== setGroup.count) {
            // Check if this is a pyramid/variable set
            if (isPyramidBaseSet(setGroup.baseSet)) {
              // Expand pyramid sets
              setGroup.sets = Array(setGroup.count)
                .fill(null)
                .map((_, index) =>
                  expandPyramidSet(
                    setGroup.baseSet as unknown as PyramidBaseSet,
                    setGroup.count,
                    index
                  )
                );

              // Normalize baseSet to first set for consistency
              const firstSet = setGroup.sets[0];
              if (firstSet) {
                setGroup.baseSet = firstSet;
              }
            } else {
              // Standard expansion - all sets identical
              setGroup.sets = Array(setGroup.count)
                .fill(null)
                .map(() => ({
                  ...setGroup.baseSet,
                })) as ExerciseSet[];
            }
          }
        }
      }
    }
  }

  return expanded;
}

/**
 * Expands sets and optionally groups identical consecutive sets
 *
 * This is useful when AI generates pyramid sets like:
 * reps: [10, 6, 6, 4, 3, 3]
 *
 * Where sets 2-3 and 5-6 are identical and should be grouped.
 *
 * @param aiProgram - Program with optional sets[] arrays
 * @param autoGroup - Whether to group identical consecutive sets (default: false)
 * @returns Program with all sets[] arrays fully populated and optionally grouped
 */
export function expandSetGroupsWithAutoGroup(
  aiProgram: AIWorkoutProgram,
  autoGroup: boolean = false
): WorkoutProgram {
  // First expand all sets
  const expanded = expandSetGroups(aiProgram);

  if (!autoGroup) return expanded;

  // Then group identical consecutive sets
  for (const week of expanded.weeks) {
    for (const day of week.days) {
      for (const exercise of day.exercises) {
        const newSetGroups: SetGroup[] = [];

        for (const setGroup of exercise.setGroups) {
          // Check if sets within this group can be further grouped
          const groups = groupIdenticalSets(setGroup.sets, setGroup.id);

          if (groups.length === 1) {
            // All sets identical, keep as is
            newSetGroups.push(setGroup);
          } else {
            // Split into multiple groups
            newSetGroups.push(...groups);
          }
        }

        exercise.setGroups = newSetGroups;
      }
    }
  }

  return expanded;
}

/**
 * Applies progression diff to Week 1 to generate subsequent weeks
 *
 * Takes Week 1 and a diff object containing only the changes to apply,
 * then generates a new week with those changes applied.
 *
 * @param week1 - The base week (week 1) to apply changes to
 * @param diff - The progression diff containing only changes
 * @param weekNumber - The target week number (2, 3, or 4)
 * @returns A new week with progression changes applied
 */
export function applyProgressionDiff(
  week1: WorkoutProgram['weeks'][0],
  diff: ProgressionDiff['week2'] | ProgressionDiff['week3'] | ProgressionDiff['week4'],
  weekNumber: number,
  logger?: {
    info: (message: string, data?: unknown) => void;
    warn: (message: string, data?: unknown) => void;
    error: (message: string, data?: unknown) => void;
  }
): WorkoutProgram['weeks'][0] {
  // Deep clone week1
  const newWeek = JSON.parse(JSON.stringify(week1)) as WorkoutProgram['weeks'][0];
  newWeek.weekNumber = weekNumber;

  const log = logger?.info || console.warn;
  const logWarn = logger?.warn || console.warn;

  // Check if diff exists (week3 and week4 are optional)
  if (!diff) {
    logWarn(`[PROGRESSION] Week ${weekNumber}: No progression diff provided, using week 1 as-is`, {
      step: 'STEP3',
    });
    return newWeek;
  }

  log(`[PROGRESSION] Week ${weekNumber}: Applying progression diff`, {
    step: 'STEP3',
    focus: diff.focus,
    notes: diff.notes,
    totalChanges: diff.changes.length,
    changesSummary: diff.changes.map((c: WorkoutChange) => ({
      day: c.dayNumber,
      exerciseIndex: c.exerciseIndex,
      setGroupIndex: c.setGroupIndex,
      reps: c.reps,
      weight: c.weight,
      intensityPercent: c.intensityPercent,
      rpe: c.rpe,
    })),
  });

  if (diff.focus) {
    newWeek.focus = diff.focus;
    log(`[PROGRESSION] Week ${weekNumber}: Updated focus: "${diff.focus}"`, { step: 'STEP3' });
  }
  if (diff.notes) {
    newWeek.notes = diff.notes;
    log(`[PROGRESSION] Week ${weekNumber}: Updated notes: "${diff.notes}"`, { step: 'STEP3' });
  }

  // Apply each change
  for (const change of diff.changes) {
    const day = newWeek.days.find((d: any) => d.dayNumber === change.dayNumber);
    if (!day) {
      logWarn(
        `[PROGRESSION] Week ${weekNumber}: Day ${change.dayNumber} not found, skipping change`,
        {
          step: 'STEP3',
          availableDays: newWeek.days.map((d: any) => d.dayNumber),
        }
      );
      continue;
    }

    const exercise = day.exercises[change.exerciseIndex];
    if (!exercise) {
      logWarn(
        `[PROGRESSION] Week ${weekNumber}: Exercise at index ${change.exerciseIndex} not found in day ${change.dayNumber}, skipping change`,
        {
          step: 'STEP3',
          availableExercises: day.exercises.map((e, i) => ({ index: i, name: e.name })),
        }
      );
      continue;
    }

    const setGroup = exercise.setGroups[change.setGroupIndex];
    if (!setGroup) {
      logWarn(
        `[PROGRESSION] Week ${weekNumber}: SetGroup at index ${change.setGroupIndex} not found for exercise "${exercise.name}", skipping change`,
        {
          step: 'STEP3',
          availableSetGroups: exercise.setGroups.map((sg, i) => ({
            index: i,
            id: sg.id,
            count: sg.count,
          })),
        }
      );
      continue;
    }

    // Log before state
    const beforeState = {
      exercise: exercise.name,
      day: change.dayNumber,
      setGroupIndex: change.setGroupIndex,
      reps: setGroup.baseSet.reps,
      weight: setGroup.baseSet.weight,
      weightLbs: setGroup.baseSet.weightLbs,
      intensityPercent: setGroup.baseSet.intensityPercent,
      rpe: setGroup.baseSet.rpe,
      rest: setGroup.baseSet.rest,
      count: setGroup.count,
    };

    // Apply changes to baseSet
    // reps is now REQUIRED in the schema, so it's always present
    const oldReps = setGroup.baseSet.reps;
    setGroup.baseSet.reps = change.reps;

    // Apply weight changes - prioritize weightLbs if both are provided
    if (change.weight !== undefined) {
      setGroup.baseSet.weight = change.weight;
      // Only auto-calculate weightLbs if weightLbs is not explicitly provided
      if (change.weightLbs === undefined) {
        setGroup.baseSet.weightLbs = change.weight * 2.2;
      }
    }
    if (change.weightLbs !== undefined) {
      setGroup.baseSet.weightLbs = change.weightLbs;
      // If weight was not provided but weightLbs was, calculate weight
      if (change.weight === undefined && setGroup.baseSet.weight !== null) {
        setGroup.baseSet.weight = change.weightLbs / 2.2;
      }
    }
    if (change.intensityPercent !== undefined) {
      setGroup.baseSet.intensityPercent = change.intensityPercent;
    }
    if (change.rpe !== undefined) {
      setGroup.baseSet.rpe = change.rpe;
    }
    if (change.rest !== undefined) {
      setGroup.baseSet.rest = change.rest;
    }
    if (change.count !== undefined) {
      setGroup.count = change.count;
      // Rebuild sets array with new count
      // If baseSet has array reps (pyramid), use expandPyramidSet, otherwise use baseSet
      if (isPyramidBaseSet(setGroup.baseSet)) {
        setGroup.sets = Array(setGroup.count)
          .fill(null)
          .map((_, index) =>
            expandPyramidSet(setGroup.baseSet as unknown as PyramidBaseSet, setGroup.count, index)
          );
      } else {
        setGroup.sets = Array(setGroup.count)
          .fill(null)
          .map(() => ({
            ...setGroup.baseSet,
          })) as ExerciseSet[];
      }
    } else {
      // Rebuild sets array with updated baseSet
      // If baseSet has array reps (pyramid), use expandPyramidSet, otherwise use baseSet
      if (isPyramidBaseSet(setGroup.baseSet)) {
        setGroup.sets = Array(setGroup.count)
          .fill(null)
          .map((_, index) =>
            expandPyramidSet(setGroup.baseSet as unknown as PyramidBaseSet, setGroup.count, index)
          );
      } else {
        setGroup.sets = Array(setGroup.count)
          .fill(null)
          .map(() => ({
            ...setGroup.baseSet,
          })) as ExerciseSet[];
      }
    }

    // Log after state and changes
    const afterState = {
      reps: setGroup.baseSet.reps,
      weight: setGroup.baseSet.weight,
      weightLbs: setGroup.baseSet.weightLbs,
      intensityPercent: setGroup.baseSet.intensityPercent,
      rpe: setGroup.baseSet.rpe,
      rest: setGroup.baseSet.rest,
      count: setGroup.count,
    };

    const changes = [];
    if (oldReps !== change.reps) changes.push(`reps: ${oldReps} → ${change.reps}`);
    if (change.weight !== undefined && beforeState.weight !== change.weight) {
      changes.push(`weight: ${beforeState.weight}kg → ${change.weight}kg`);
    }
    if (
      change.intensityPercent !== undefined &&
      beforeState.intensityPercent !== change.intensityPercent
    ) {
      changes.push(`intensity: ${beforeState.intensityPercent}% → ${change.intensityPercent}%`);
    }
    if (change.rpe !== undefined && beforeState.rpe !== change.rpe) {
      changes.push(`rpe: ${beforeState.rpe} → ${change.rpe}`);
    }
    if (change.rest !== undefined && beforeState.rest !== change.rest) {
      changes.push(`rest: ${beforeState.rest}s → ${change.rest}s`);
    }
    if (change.count !== undefined && beforeState.count !== change.count) {
      changes.push(`count: ${beforeState.count} → ${change.count}`);
    }

    // Verify that the change was applied correctly
    type VerificationEntry = {
      expected?: number | number[] | null;
      actual?: number | number[] | null;
      match?: boolean;
      skipped?: boolean;
    };

    const verification: Record<
      'reps' | 'weight' | 'intensityPercent' | 'rpe' | 'rest' | 'count',
      VerificationEntry
    > = {
      reps: {
        expected: change.reps,
        actual: afterState.reps ?? null,
        match: JSON.stringify(afterState.reps) === JSON.stringify(change.reps),
      },
      weight:
        change.weight !== undefined
          ? {
              expected: change.weight,
              actual: afterState.weight ?? null,
              match: JSON.stringify(afterState.weight) === JSON.stringify(change.weight),
            }
          : { skipped: true },
      intensityPercent:
        change.intensityPercent !== undefined
          ? {
              expected: change.intensityPercent,
              actual: afterState.intensityPercent ?? null,
              match:
                JSON.stringify(afterState.intensityPercent) ===
                JSON.stringify(change.intensityPercent),
            }
          : { skipped: true },
      rpe:
        change.rpe !== undefined
          ? {
              expected: change.rpe,
              actual: afterState.rpe ?? null,
              match: JSON.stringify(afterState.rpe) === JSON.stringify(change.rpe),
            }
          : { skipped: true },
      rest:
        change.rest !== undefined
          ? {
              expected: change.rest,
              actual: afterState.rest ?? null,
              match: JSON.stringify(afterState.rest) === JSON.stringify(change.rest),
            }
          : { skipped: true },
      count:
        change.count !== undefined
          ? {
              expected: change.count,
              actual: afterState.count ?? null,
              match: afterState.count === change.count,
            }
          : { skipped: true },
    };

    const allMatch = (Object.values(verification) as VerificationEntry[]).every(
      (v) => v.skipped || v.match
    );

    // Build a clear diff summary for this exercise
    const diffSummary: Record<
      string,
      {
        expected: number | number[] | undefined | null;
        actual: number | number[] | null | undefined;
        match: boolean;
        before?: number | number[] | null | undefined;
      }
    > = {};

    if (!verification.reps.skipped) {
      diffSummary.reps = {
        expected: verification.reps.expected,
        actual: verification.reps.actual,
        match: !!verification.reps.match,
        before: beforeState.reps,
      };
    }
    if (!verification.weight.skipped) {
      diffSummary.weight = {
        expected: verification.weight.expected as number,
        actual: verification.weight.actual,
        match: !!verification.weight.match,
        before: beforeState.weight,
      };
    }
    if (!verification.intensityPercent.skipped) {
      diffSummary.intensityPercent = {
        expected: verification.intensityPercent.expected as number,
        actual: verification.intensityPercent.actual,
        match: !!verification.intensityPercent.match,
        before: beforeState.intensityPercent,
      };
    }
    if (!verification.rpe.skipped) {
      diffSummary.rpe = {
        expected: verification.rpe.expected as number,
        actual: verification.rpe.actual,
        match: !!verification.rpe.match,
        before: beforeState.rpe,
      };
    }
    if (!verification.rest.skipped) {
      diffSummary.rest = {
        expected: verification.rest.expected as number,
        actual: verification.rest.actual,
        match: !!verification.rest.match,
        before: beforeState.rest,
      };
    }
    if (!verification.count.skipped) {
      diffSummary.count = {
        expected: verification.count.expected as number,
        actual: verification.count.actual,
        match: !!verification.count.match,
        before: beforeState.count,
      };
    }

    // Log with clear structure for script parsing
    log(
      `[PROGRESSION] Week ${weekNumber}: Exercise "${exercise.name}" (Day ${change.dayNumber}, Exercise ${change.exerciseIndex}, SetGroup ${change.setGroupIndex})`,
      {
        step: 'STEP3',
        exercise: exercise.name,
        day: change.dayNumber,
        exerciseIndex: change.exerciseIndex,
        setGroupIndex: change.setGroupIndex,
        diffApplied: diffSummary,
        verificationStatus: allMatch ? 'MATCH' : 'MISMATCH',
        before: beforeState,
        after: afterState,
        expected: {
          reps: change.reps,
          weight: change.weight,
          intensityPercent: change.intensityPercent,
          rpe: change.rpe,
          rest: change.rest,
          count: change.count,
        },
        actual: afterState,
        verification: verification,
        allMatch: allMatch,
      }
    );

    if (!allMatch) {
      const mismatches = Object.entries(verification)
        .filter(([_, v]) => !v.skipped && !v.match)
        .map(([key, v]) => ({ field: key, expected: v.expected, actual: v.actual }));

      logWarn(
        `[PROGRESSION] ⚠️ Week ${weekNumber}: Verification MISMATCH for "${exercise.name}" (Day ${change.dayNumber}, SetGroup ${change.setGroupIndex})`,
        {
          step: 'STEP3',
          exercise: exercise.name,
          day: change.dayNumber,
          exerciseIndex: change.exerciseIndex,
          setGroupIndex: change.setGroupIndex,
          mismatches: mismatches,
          expected: change,
          actual: afterState,
          diffSummary: diffSummary,
        }
      );
    } else {
      log(
        `[PROGRESSION] ✅ Week ${weekNumber}: Verification MATCH for "${exercise.name}" (Day ${change.dayNumber}, SetGroup ${change.setGroupIndex})`,
        {
          step: 'STEP3',
          exercise: exercise.name,
          day: change.dayNumber,
          exerciseIndex: change.exerciseIndex,
          setGroupIndex: change.setGroupIndex,
          diffSummary: diffSummary,
        }
      );
    }
  }

  log(`[PROGRESSION] Week ${weekNumber}: Progression applied successfully`, {
    step: 'STEP3',
    totalChanges: diff.changes.length,
    appliedChanges: diff.changes.length, // Will be updated if we track skipped changes
  });
  return newWeek;
}
