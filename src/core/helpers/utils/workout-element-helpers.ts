/**
 * Workout Element Helpers
 *
 * Utilities for calculating duration, volume, and other metrics
 * for the new workout element types: warmup, cardio, superset, circuit.
 *
 * SSOT for workout element calculations.
 */

import type {
  WarmupSection,
  CardioExercise,
  Superset,
  Circuit,
  WorkoutElement,
  SetGroup,
} from '@giulio-leone/schemas';

/**
 * Minimal interface for exercise calculations.
 * Both SchemaExercise and ExerciseElement satisfy this via structural typing.
 */
interface ExerciseWithSetGroups {
  setGroups: SetGroup[];
}

// ============================================================================
// Local Helpers (for schema types)
// ============================================================================

/**
 * Count sets for a schema Exercise type
 */
function countSchemaExerciseSets(exercise: ExerciseWithSetGroups): number {
  if (!exercise.setGroups || exercise.setGroups.length === 0) {
    return 0;
  }
  return exercise.setGroups.reduce((total: any, group: any) => total + group.count, 0);
}

/**
 * Calculate volume for a schema Exercise type
 */
function calculateSchemaExerciseVolume(exercise: ExerciseWithSetGroups): number {
  if (!exercise.setGroups || exercise.setGroups.length === 0) {
    return 0;
  }

  let volume = 0;
  for (const group of exercise.setGroups) {
    const sets = group.sets.length > 0 ? group.sets : Array(group.count).fill(group.baseSet);
    for (const set of sets) {
      const reps = set.reps ?? 0;
      const weight = set.weight ?? 0;
      volume += reps * weight;
    }
  }
  return volume;
}

// ============================================================================
// Duration Calculations
// ============================================================================

/**
 * Calculate the total duration of a warmup section in seconds.
 *
 * @param warmup - WarmupSection element
 * @returns Duration in seconds
 */
export function calculateWarmupDuration(warmup: WarmupSection): number {
  // If exercises have specific durations, sum them
  const exercisesDuration = warmup.exercises.reduce((sum: any, ex: any) => {
    // Each exercise duration in seconds, or default 30s
    return sum + (ex.duration ?? 30);
  }, 0);

  // Use explicit durationMinutes if provided, otherwise sum exercise durations
  const explicitDuration = warmup.durationMinutes * 60;

  return Math.max(exercisesDuration, explicitDuration);
}

/**
 * Calculate cardio exercise duration.
 *
 * @param cardio - CardioExercise element
 * @returns Duration in seconds
 */
export function calculateCardioDuration(cardio: CardioExercise): number {
  // If intervals are defined, sum their durations
  if (cardio.intervals && cardio.intervals.length > 0) {
    return cardio.intervals.reduce((sum: any, interval: any) => sum + interval.duration, 0);
  }

  // Otherwise use the main duration
  return cardio.duration;
}

/**
 * Estimate exercise duration based on sets, reps, rest times.
 *
 * @param exercise - Exercise element
 * @returns Estimated duration in seconds
 */
export function calculateExerciseDuration(exercise: ExerciseWithSetGroups): number {
  if (!exercise.setGroups || exercise.setGroups.length === 0) {
    return 0;
  }

  let totalDuration = 0;

  for (const group of exercise.setGroups) {
    for (let i = 0; i < group.count; i++) {
      const set = group.sets?.[i] ?? group.baseSet;

      // Time per set: reps * 3s average per rep, or duration directly
      const setTime = set.duration ?? (set.reps ?? 0) * 3;
      totalDuration += setTime;

      // Add rest time (except after last set of last group)
      const isLastSetOfGroup = i === group.count - 1;
      const isLastGroup = exercise.setGroups.indexOf(group) === exercise.setGroups.length - 1;

      if (!(isLastSetOfGroup && isLastGroup)) {
        totalDuration += set.rest ?? 60;
      }
    }
  }

  return totalDuration;
}

/**
 * Calculate the total duration of a superset in seconds.
 * Includes all exercises performed back-to-back, rest, and rounds.
 *
 * @param superset - Superset element
 * @returns Duration in seconds
 */
export function calculateSupersetDuration(superset: Superset): number {
  // Calculate duration of one round
  const exerciseDurations = superset.exercises.map((ex: any) => calculateExerciseDuration(ex));
  const totalExerciseTime = exerciseDurations.reduce((a: any, b: any) => a + b, 0);

  // Rest between exercises within superset (minimal)
  const restBetween = superset.restBetweenExercises * (superset.exercises.length - 1);

  // One round = all exercises + rest between + rest after superset
  const oneRoundDuration = totalExerciseTime + restBetween + superset.restAfterSuperset;

  // Total = rounds * one round duration (minus rest after last round)
  const rounds = superset.rounds ?? 1;
  return oneRoundDuration * rounds - superset.restAfterSuperset;
}

/**
 * Calculate the total duration of a circuit in seconds.
 *
 * @param circuit - Circuit element
 * @returns Duration in seconds
 */
export function calculateCircuitDuration(circuit: Circuit): number {
  // Each exercise has reps (assume 3s/rep) or duration
  const exerciseTime = circuit.exercises.reduce((sum: any, ex: any) => {
    if (ex.duration) return sum + ex.duration;
    return sum + (ex.reps ?? 10) * 3; // default 10 reps at 3s each
  }, 0);

  // Rest between exercises within a round
  const restBetweenExercises = circuit.restBetweenExercises * (circuit.exercises.length - 1);

  // One round = all exercises + rest between
  const oneRoundTime = exerciseTime + restBetweenExercises;

  // Total rounds + rest between rounds (none after last round)
  const totalRoundTime = oneRoundTime * circuit.rounds;
  const totalRestBetweenRounds = circuit.restBetweenRounds * (circuit.rounds - 1);

  return totalRoundTime + totalRestBetweenRounds;
}

/**
 * Calculate duration for any workout element.
 *
 * @param element - WorkoutElement (exercise, warmup, cardio, superset, circuit)
 * @returns Duration in seconds
 */
export function calculateElementDuration(element: WorkoutElement): number {
  switch (element.type) {
    case 'warmup':
      return calculateWarmupDuration(element);
    case 'cardio':
      return calculateCardioDuration(element);
    case 'superset':
      return calculateSupersetDuration(element);
    case 'circuit':
      return calculateCircuitDuration(element);
    case 'exercise':
    default:
      return calculateExerciseDuration(element);
  }
}

// ============================================================================
// Volume Calculations
// ============================================================================

/**
 * Calculate volume for a superset (sum of all exercise volumes per round).
 *
 * @param superset - Superset element
 * @returns Total volume (reps × weight)
 */
export function calculateSupersetVolume(superset: Superset): number {
  const singleRoundVolume = superset.exercises.reduce((sum: any, ex: any) => sum + calculateSchemaExerciseVolume(ex),
    0
  );
  return singleRoundVolume * (superset.rounds ?? 1);
}

/**
 * Calculate volume for any workout element.
 * Note: Warmup and cardio have volume = 0 (no weighted work).
 *
 * @param element - WorkoutElement
 * @returns Total volume
 */
export function calculateElementVolume(element: WorkoutElement): number {
  switch (element.type) {
    case 'warmup':
    case 'cardio':
    case 'circuit':
      // These don't have traditional volume (reps × weight)
      return 0;
    case 'superset':
      return calculateSupersetVolume(element);
    case 'exercise':
    default:
      return calculateSchemaExerciseVolume(element);
  }
}

// ============================================================================
// Set Counting
// ============================================================================

/**
 * Count total sets in a superset (all exercises × rounds).
 *
 * @param superset - Superset element
 * @returns Total set count
 */
export function countSupersetSets(superset: Superset): number {
  const singleRoundSets = superset.exercises.reduce((sum: any, ex: any) => sum + countSchemaExerciseSets(ex),
    0
  );
  return singleRoundSets * (superset.rounds ?? 1);
}

/**
 * Count sets for a circuit (exercises × rounds).
 * Each exercise in a circuit is typically 1 "set" per round.
 *
 * @param circuit - Circuit element
 * @returns Total set count
 */
export function countCircuitSets(circuit: Circuit): number {
  return circuit.exercises.length * circuit.rounds;
}

/**
 * Count sets for any workout element.
 *
 * @param element - WorkoutElement
 * @returns Total set count
 */
export function countElementSets(element: WorkoutElement): number {
  switch (element.type) {
    case 'warmup':
      return element.exercises.length; // Each warmup exercise = 1 "set"
    case 'cardio':
      return 1; // Cardio is 1 continuous activity
    case 'superset':
      return countSupersetSets(element);
    case 'circuit':
      return countCircuitSets(element);
    case 'exercise':
    default:
      return countSchemaExerciseSets(element);
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get the display name for a workout element.
 *
 * @param element - WorkoutElement
 * @returns Display name
 */
export function getElementDisplayName(element: WorkoutElement): string {
  switch (element.type) {
    case 'warmup':
      return element.name ?? 'Riscaldamento';
    case 'cardio':
      return element.name ?? `Cardio (${element.machine})`;
    case 'superset':
      return element.name ?? `Superset: ${element.exercises.map((e: any) => e.name).join(' + ')}`;
    case 'circuit':
      return element.name ?? 'Circuit';
    case 'exercise':
    default:
      return element.name;
  }
}

/**
 * Check if an element is a compound element (contains multiple exercises).
 *
 * @param element - WorkoutElement
 * @returns True if superset or circuit
 */
export function isCompoundElement(element: WorkoutElement): boolean {
  return element.type === 'superset' || element.type === 'circuit';
}

/**
 * Get all exercise IDs from a workout element.
 * Useful for tracking which exercises are in the workout.
 *
 * @param element - WorkoutElement
 * @returns Array of exercise IDs
 */
export function getElementExerciseIds(element: WorkoutElement): string[] {
  switch (element.type) {
    case 'warmup':
      return []; // Warmup items don't have exerciseIds
    case 'cardio':
      return [element.id]; // Cardio uses its own ID
    case 'superset':
      return element.exercises.map((ex: any) => ex.exerciseId);
    case 'circuit':
      return element.exercises.map((ex: any) => ex.exerciseId);
    case 'exercise':
    default:
      return [element.exerciseId];
  }
}
