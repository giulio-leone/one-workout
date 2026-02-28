/**
 * Element Normalizer
 *
 * Normalizes workout days between legacy `exercises[]` format
 * and new `elements[]` format with typed workout blocks.
 *
 * This provides backward compatibility for existing programs
 * while enabling the new element-based architecture.
 */

import type { WorkoutDay, WorkoutElement, Exercise, ExerciseElement } from '@giulio-leone/schemas';

// ============================================================================
// Legacy to Elements Conversion
// ============================================================================

/**
 * Convert a standard exercise to an exercise element.
 * Adds the required `type` discriminator.
 *
 * @param exercise - Standard Exercise object
 * @returns ExerciseElement with type = 'exercise'
 */
export function exerciseToElement(exercise: Exercise): ExerciseElement {
  return {
    ...exercise,
    type: 'exercise' as const,
  } as ExerciseElement;
}

/**
 * Normalize a workout day to use elements[].
 *
 * If the day already has elements[], returns as-is.
 * If the day has legacy exercises[], converts them to exercise elements.
 *
 * @param day - WorkoutDay with exercises[] or elements[]
 * @returns WorkoutDay with elements[] populated
 */
export function normalizeToElements(day: WorkoutDay): WorkoutDay {
  // Already has elements - return as-is
  if (day.elements && day.elements.length > 0) {
    return day;
  }

  // Convert legacy exercises to elements
  const elements: WorkoutElement[] = [];

  // If there's a legacy warmup text, create a simple warmup element
  if (day.warmup && day.warmup.trim()) {
    elements.push({
      id: `warmup_${generateId()}`,
      type: 'warmup' as const,
      name: 'Riscaldamento',
      durationMinutes: 10,
      exercises: [
        {
          name: day.warmup,
          duration: 300, // 5 minutes default
        },
      ],
    });
  }

  // Convert exercises to exercise elements
  if (day.exercises && day.exercises.length > 0) {
    for (const exercise of day.exercises) {
      elements.push(exerciseToElement(exercise));
    }
  }

  return {
    ...day,
    elements,
    // Keep legacy fields for backward compatibility
    exercises: day.exercises,
  };
}

/**
 * Normalize all days in a program to use elements[].
 *
 * @param weeks - Array of workout weeks
 * @returns Weeks with all days normalized to elements[]
 */
export function normalizeWeeksToElements<T extends { days: WorkoutDay[] }>(weeks: T[]): T[] {
  return weeks.map((week: any) => ({
    ...week,
    days: week.days.map(normalizeToElements),
  }));
}

// ============================================================================
// Elements to Legacy Conversion (for compatibility)
// ============================================================================

/**
 * Extract exercises from elements for legacy compatibility.
 * Flattens supersets and circuits into individual exercises.
 *
 * @param elements - Array of workout elements
 * @returns Array of exercises
 */
export function elementsToExercises(elements: WorkoutElement[]): Exercise[] {
  const exercises: Exercise[] = [];

  for (const element of elements) {
    switch (element.type) {
      case 'exercise':
        // Remove the type field for legacy format
        const { type: _type, ...exercise } = element;
        exercises.push(exercise as Exercise);
        break;

      case 'superset':
        // Flatten superset exercises
        exercises.push(...element.exercises);
        break;

      case 'circuit':
        // Circuits don't contain full exercises, skip for legacy
        break;

      case 'warmup':
      case 'cardio':
        // These don't translate to legacy exercises
        break;
    }
  }

  return exercises;
}

/**
 * Convert a workout day with elements back to legacy format.
 * Useful for APIs/integrations that expect the old format.
 *
 * @param day - WorkoutDay with elements[]
 * @returns WorkoutDay with exercises[]
 */
export function normalizeToLegacy(day: WorkoutDay): WorkoutDay {
  if (!day.elements || day.elements.length === 0) {
    return day;
  }

  const exercises = elementsToExercises(day.elements);

  // Extract warmup text if there's a warmup element
  const warmupElement = day.elements.find((e: any) => e.type === 'warmup');
  const warmupText = warmupElement
    ? (warmupElement as any).exercises.map((e: any) => e.name).join(', ')
    : day.warmup;

  return {
    ...day,
    exercises,
    warmup: warmupText,
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate a unique ID for elements.
 */
function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Check if a workout day uses the new elements format.
 *
 * @param day - WorkoutDay to check
 * @returns True if day has elements[]
 */
export function usesElementsFormat(day: WorkoutDay): boolean {
  return !!(day.elements && day.elements.length > 0);
}

/**
 * Get all exercises from a workout day, regardless of format.
 * Flattens nested exercises from supersets/circuits.
 *
 * @param day - WorkoutDay (elements or legacy format)
 * @returns Array of all exercises
 */
export function getAllExercisesFromDay(day: WorkoutDay): Exercise[] {
  if (usesElementsFormat(day)) {
    return elementsToExercises(day.elements!);
  }

  return day.exercises ?? [];
}
