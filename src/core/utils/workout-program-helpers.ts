/**
 * Workout Program Helper Utilities
 *
 * Future-proof utility functions for accessing WorkoutProgram data.
 * Centralizes access patterns to avoid schema inconsistencies.
 * Part of Workout Core.
 */

import type { WorkoutProgram, WorkoutWeek, WorkoutDay } from '@giulio-leone/types';

/**
 * Get all goals from a workout program
 */
export function getWorkoutProgramGoals(program: WorkoutProgram): string[] {
  return program.goals || [];
}

/**
 * Get first goal (for display purposes)
 */
export function getWorkoutProgramFirstGoal(program: WorkoutProgram): string | null {
  return program.goals && program.goals.length > 0 ? (program.goals[0] ?? null) : null;
}

/**
 * Get all days from a workout program (flattened from weeks)
 */
export function getAllWorkoutProgramDays(program: WorkoutProgram): WorkoutDay[] {
  if (!program.weeks || program.weeks.length === 0) {
    return [];
  }
  return program.weeks.flatMap((week) => week.days || []);
}

/**
 * Get total number of days in a workout program
 */
export function getWorkoutProgramTotalDays(program: WorkoutProgram): number {
  return getAllWorkoutProgramDays(program).length;
}

/**
 * Get a specific day by day number (1-based)
 */
export function getWorkoutProgramDay(
  program: WorkoutProgram,
  dayNumber: number
): WorkoutDay | null {
  const days = getAllWorkoutProgramDays(program);
  return days.find((d) => d.dayNumber === dayNumber) || null;
}

/**
 * Get a specific day by week and day number
 */
export function getWorkoutProgramDayByWeek(
  program: WorkoutProgram,
  weekNumber: number,
  dayNumber: number
): WorkoutDay | null {
  const week = program.weeks?.find((w) => w.weekNumber === weekNumber);
  if (!week) {
    return null;
  }
  return week.days?.find((d) => d.dayNumber === dayNumber) || null;
}

/**
 * Get week by week number
 */
export function getWorkoutProgramWeek(
  program: WorkoutProgram,
  weekNumber: number
): WorkoutWeek | null {
  return program.weeks?.find((w) => w.weekNumber === weekNumber) || null;
}

/**
 * Iterate over all weeks in a program
 */
export function* iterateWorkoutProgramWeeks(program: WorkoutProgram): Generator<WorkoutWeek> {
  if (!program.weeks) {
    return;
  }
  for (const week of program.weeks) {
    yield week;
  }
}

/**
 * Iterate over all days in a program (across all weeks)
 */
export function* iterateWorkoutProgramDays(program: WorkoutProgram): Generator<WorkoutDay> {
  if (!program.weeks) {
    return;
  }
  for (const week of program.weeks) {
    if (week.days) {
      for (const day of week.days) {
        yield day;
      }
    }
  }
}

/**
 * Determine week and day number from date
 *
 * Calculates which day of the workout program should be displayed based on the target date.
 * The program cycles through all days, repeating from the beginning when the cycle completes.
 */
export function getWeekAndDayFromDate(
  program: WorkoutProgram,
  targetDate: Date
): { weekNumber: number; dayNumber: number } | null {
  if (!program.weeks || program.weeks.length === 0) {
    return { weekNumber: 1, dayNumber: 1 };
  }

  const daysFromStart = Math.floor(
    (targetDate.getTime() - new Date(program.createdAt || Date.now()).getTime()) /
      (1000 * 60 * 60 * 24)
  );

  const totalDays = program.weeks.reduce(
    (total: number, week) => total + (week.days?.length || 0),
    0
  );

  if (totalDays === 0) {
    const firstWeek = program.weeks[0];
    if (!firstWeek) return { weekNumber: 1, dayNumber: 1 };
    const firstDay = firstWeek.days?.[0];
    return {
      weekNumber: firstWeek.weekNumber,
      dayNumber: firstDay?.dayNumber || 1,
    };
  }

  const dayIndex = ((daysFromStart % totalDays) + totalDays) % totalDays;

  let currentDayIndex = 0;
  for (const week of program.weeks) {
    for (const day of week.days || []) {
      if (currentDayIndex === dayIndex) {
        return {
          weekNumber: week.weekNumber,
          dayNumber: day.dayNumber,
        };
      }
      currentDayIndex++;
    }
  }

  const firstWeek = program.weeks[0];
  if (!firstWeek) return { weekNumber: 1, dayNumber: 1 };
  const firstDay = firstWeek.days?.[0];
  return {
    weekNumber: firstWeek.weekNumber,
    dayNumber: firstDay?.dayNumber || 1,
  };
}
