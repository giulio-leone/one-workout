/**
 * Unit Tests for Workout Program Builder
 *
 * Tests for programmatic functions:
 * - expandSetGroups: Builds sets[] array from baseSet + count
 * - applyProgressionDiff: Applies progression diff to generate subsequent weeks
 */

import { describe, it, expect } from 'vitest';
import {
  expandSetGroups,
  applyProgressionDiff,
  groupIdenticalSets,
  expandSetGroupsWithAutoGroup,
} from './program-builder';
import type {
  AIWorkoutProgram,
  WorkoutProgram,
  ProgressionDiff,
  ExerciseSet,
} from '@giulio-leone/schemas';
import type { PyramidBaseSet } from './program-builder';

/** Test helper: creates a baseSet with pyramid (array) fields typed as ExerciseSet */
function makePyramidBaseSet(data: PyramidBaseSet): ExerciseSet {
  return data as unknown as ExerciseSet;
}

describe('expandSetGroups', () => {
  it('should expand sets[] array from baseSet + count when sets is missing', () => {
    // Arrange
    const aiProgram: AIWorkoutProgram = {
      name: 'Test Program',
      description: 'Test',
      difficulty: 'INTERMEDIATE',
      durationWeeks: 1,
      goals: ['hypertrophy'],
      weeks: [
        {
          weekNumber: 1,
          focus: 'Test',
          notes: 'Test notes',
          days: [
            {
              dayNumber: 1,
              dayName: 'Monday',
              name: 'Push Day',
              targetMuscles: ['chest', 'shoulders'],
              notes: 'Test',
              cooldown: '5 min',
              exercises: [
                {
                  name: 'Bench Press',
                  description: 'Test',
                  type: 'compound',
                  category: 'strength',
                  setGroups: [
                    {
                      id: 'sg_w1d1e1',
                      count: 4,
                      baseSet: {
                        reps: 8,
                        weight: 100,
                        weightLbs: 220,
                        intensityPercent: 75,
                        rpe: 8,
                        rest: 120,
                      },
                      // sets is missing - should be built programmatically
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    // Act
    const result = expandSetGroups(aiProgram);

    // Assert
    expect(result.weeks[0].days[0].exercises[0].setGroups[0].sets).toBeDefined();
    expect(result.weeks[0].days[0].exercises[0].setGroups[0].sets.length).toBe(4);
    expect(result.weeks[0].days[0].exercises[0].setGroups[0].sets[0]).toEqual({
      reps: 8,
      weight: 100,
      weightLbs: 220,
      intensityPercent: 75,
      rpe: 8,
      rest: 120,
    });
    // All sets should be identical to baseSet
    result.weeks[0].days[0].exercises[0].setGroups[0].sets.forEach((set) => {
      expect(set).toEqual(aiProgram.weeks[0].days[0].exercises[0].setGroups[0].baseSet);
    });
  });

  it('should expand sets[] array when sets length does not match count', () => {
    // Arrange
    const aiProgram: AIWorkoutProgram = {
      name: 'Test Program',
      description: 'Test',
      difficulty: 'INTERMEDIATE',
      durationWeeks: 1,
      goals: ['hypertrophy'],
      weeks: [
        {
          weekNumber: 1,
          focus: 'Test',
          notes: 'Test notes',
          days: [
            {
              dayNumber: 1,
              dayName: 'Monday',
              name: 'Push Day',
              targetMuscles: ['chest'],
              notes: 'Test',
              cooldown: '5 min',
              exercises: [
                {
                  name: 'Bench Press',
                  description: 'Test',
                  type: 'compound',
                  category: 'strength',
                  setGroups: [
                    {
                      id: 'sg_w1d1e1',
                      count: 4,
                      baseSet: {
                        reps: 8,
                        weight: 100,
                        weightLbs: 220,
                        intensityPercent: 75,
                        rpe: 8,
                        rest: 120,
                      },
                      sets: [
                        // Only 2 sets but count is 4 - should be expanded
                        {
                          reps: 8,
                          weight: 100,
                          weightLbs: 220,
                          intensityPercent: 75,
                          rpe: 8,
                          rest: 120,
                        },
                        {
                          reps: 8,
                          weight: 100,
                          weightLbs: 220,
                          intensityPercent: 75,
                          rpe: 8,
                          rest: 120,
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    // Act
    const result = expandSetGroups(aiProgram);

    // Assert
    expect(result.weeks[0].days[0].exercises[0].setGroups[0].sets.length).toBe(4);
  });

  it('should not modify sets[] when already correct length', () => {
    // Arrange
    const aiProgram: AIWorkoutProgram = {
      name: 'Test Program',
      description: 'Test',
      difficulty: 'INTERMEDIATE',
      durationWeeks: 1,
      goals: ['hypertrophy'],
      weeks: [
        {
          weekNumber: 1,
          focus: 'Test',
          notes: 'Test notes',
          days: [
            {
              dayNumber: 1,
              dayName: 'Monday',
              name: 'Push Day',
              targetMuscles: ['chest'],
              notes: 'Test',
              cooldown: '5 min',
              exercises: [
                {
                  name: 'Bench Press',
                  description: 'Test',
                  type: 'compound',
                  category: 'strength',
                  setGroups: [
                    {
                      id: 'sg_w1d1e1',
                      count: 3,
                      baseSet: {
                        reps: 8,
                        weight: 100,
                        weightLbs: 220,
                        intensityPercent: 75,
                        rpe: 8,
                        rest: 120,
                      },
                      sets: [
                        {
                          reps: 8,
                          weight: 100,
                          weightLbs: 220,
                          intensityPercent: 75,
                          rpe: 8,
                          rest: 120,
                        },
                        {
                          reps: 8,
                          weight: 100,
                          weightLbs: 220,
                          intensityPercent: 75,
                          rpe: 8,
                          rest: 120,
                        },
                        {
                          reps: 8,
                          weight: 100,
                          weightLbs: 220,
                          intensityPercent: 75,
                          rpe: 8,
                          rest: 120,
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const originalSets = JSON.parse(
      JSON.stringify(aiProgram.weeks[0].days[0].exercises[0].setGroups[0].sets)
    );

    // Act
    const result = expandSetGroups(aiProgram);

    // Assert
    expect(result.weeks[0].days[0].exercises[0].setGroups[0].sets.length).toBe(3);
    expect(result.weeks[0].days[0].exercises[0].setGroups[0].sets).toEqual(originalSets);
  });

  it('should handle multiple exercises and setGroups', () => {
    // Arrange
    const aiProgram: AIWorkoutProgram = {
      name: 'Test Program',
      description: 'Test',
      difficulty: 'INTERMEDIATE',
      durationWeeks: 1,
      goals: ['hypertrophy'],
      weeks: [
        {
          weekNumber: 1,
          focus: 'Test',
          notes: 'Test notes',
          days: [
            {
              dayNumber: 1,
              dayName: 'Monday',
              name: 'Push Day',
              targetMuscles: ['chest', 'shoulders'],
              notes: 'Test',
              cooldown: '5 min',
              exercises: [
                {
                  name: 'Bench Press',
                  description: 'Test',
                  type: 'compound',
                  category: 'strength',
                  setGroups: [
                    {
                      id: 'sg_w1d1e1',
                      count: 4,
                      baseSet: {
                        reps: 8,
                        weight: 100,
                        weightLbs: 220,
                        intensityPercent: 75,
                        rpe: 8,
                        rest: 120,
                      },
                    },
                  ],
                },
                {
                  name: 'Shoulder Press',
                  description: 'Test',
                  type: 'compound',
                  category: 'strength',
                  setGroups: [
                    {
                      id: 'sg_w1d1e2',
                      count: 3,
                      baseSet: {
                        reps: 10,
                        weight: 50,
                        weightLbs: 110,
                        intensityPercent: 70,
                        rpe: 7,
                        rest: 90,
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    // Act
    const result = expandSetGroups(aiProgram);

    // Assert
    expect(result.weeks[0].days[0].exercises[0].setGroups[0].sets.length).toBe(4);
    expect(result.weeks[0].days[0].exercises[1].setGroups[0].sets.length).toBe(3);
  });
});

describe('applyProgressionDiff', () => {
  it('should apply progression diff to week 1 to generate week 2', () => {
    // Arrange
    const week1: WorkoutProgram['weeks'][0] = {
      weekNumber: 1,
      focus: 'Base Volume',
      notes: 'Week 1 notes',
      days: [
        {
          dayNumber: 1,
          dayName: 'Monday',
          name: 'Push Day',
          targetMuscles: ['chest', 'shoulders'],
          notes: 'Test',
          cooldown: '5 min',
          exercises: [
            {
              name: 'Bench Press',
              description: 'Test',
              type: 'compound',
              category: 'strength',
              setGroups: [
                {
                  id: 'sg_w1d1e1',
                  count: 4,
                  baseSet: {
                    reps: 8,
                    weight: 100,
                    weightLbs: 220,
                    intensityPercent: 75,
                    rpe: 8,
                    rest: 120,
                  },
                  sets: [
                    {
                      reps: 8,
                      weight: 100,
                      weightLbs: 220,
                      intensityPercent: 75,
                      rpe: 8,
                      rest: 120,
                    },
                    {
                      reps: 8,
                      weight: 100,
                      weightLbs: 220,
                      intensityPercent: 75,
                      rpe: 8,
                      rest: 120,
                    },
                    {
                      reps: 8,
                      weight: 100,
                      weightLbs: 220,
                      intensityPercent: 75,
                      rpe: 8,
                      rest: 120,
                    },
                    {
                      reps: 8,
                      weight: 100,
                      weightLbs: 220,
                      intensityPercent: 75,
                      rpe: 8,
                      rest: 120,
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const diff: ProgressionDiff['week2'] = {
      focus: 'Increased Volume',
      notes: 'Week 2 notes',
      changes: [
        {
          dayNumber: 1,
          exerciseIndex: 0,
          setGroupIndex: 0,
          reps: 10, // Changed from 8
          weight: 105, // Changed from 100
          rpe: 9, // Changed from 8
        },
      ],
    };

    // Act
    const week2 = applyProgressionDiff(week1, diff, 2);

    // Assert
    expect(week2.weekNumber).toBe(2);
    expect(week2.focus).toBe('Increased Volume');
    expect(week2.notes).toBe('Week 2 notes');
    expect(week2.days[0].exercises[0].setGroups[0].baseSet.reps).toBe(10);
    expect(week2.days[0].exercises[0].setGroups[0].baseSet.weight).toBe(105);
    expect(week2.days[0].exercises[0].setGroups[0].baseSet.weightLbs).toBeCloseTo(231, 2); // 105 * 2.2
    expect(week2.days[0].exercises[0].setGroups[0].baseSet.rpe).toBe(9);
    // All sets should be updated
    week2.days[0].exercises[0].setGroups[0].sets.forEach((set) => {
      expect(set.reps).toBe(10);
      expect(set.weight).toBe(105);
      expect(set.weightLbs).toBeCloseTo(231, 2);
      expect(set.rpe).toBe(9);
    });
  });

  it('should update count and rebuild sets array when count changes', () => {
    // Arrange
    const week1: WorkoutProgram['weeks'][0] = {
      weekNumber: 1,
      focus: 'Base Volume',
      notes: 'Week 1 notes',
      days: [
        {
          dayNumber: 1,
          dayName: 'Monday',
          name: 'Push Day',
          targetMuscles: ['chest'],
          notes: 'Test',
          cooldown: '5 min',
          exercises: [
            {
              name: 'Bench Press',
              description: 'Test',
              type: 'compound',
              category: 'strength',
              setGroups: [
                {
                  id: 'sg_w1d1e1',
                  count: 4,
                  baseSet: {
                    reps: 8,
                    weight: 100,
                    weightLbs: 220,
                    intensityPercent: 75,
                    rpe: 8,
                    rest: 120,
                  },
                  sets: Array(4).fill({
                    reps: 8,
                    weight: 100,
                    weightLbs: 220,
                    intensityPercent: 75,
                    rpe: 8,
                    rest: 120,
                  }),
                },
              ],
            },
          ],
        },
      ],
    };

    const diff: ProgressionDiff['week2'] = {
      focus: 'Increased Volume',
      notes: 'Week 2 notes',
      changes: [
        {
          dayNumber: 1,
          exerciseIndex: 0,
          setGroupIndex: 0,
          count: 5, // Increased from 4
          reps: 8,
          weight: 100,
        },
      ],
    };

    // Act
    const week2 = applyProgressionDiff(week1, diff, 2);

    // Assert
    expect(week2.days[0].exercises[0].setGroups[0].count).toBe(5);
    expect(week2.days[0].exercises[0].setGroups[0].sets.length).toBe(5);
  });

  it('should apply multiple changes to different exercises', () => {
    // Arrange
    const week1: WorkoutProgram['weeks'][0] = {
      weekNumber: 1,
      focus: 'Base Volume',
      notes: 'Week 1 notes',
      days: [
        {
          dayNumber: 1,
          dayName: 'Monday',
          name: 'Push Day',
          targetMuscles: ['chest', 'shoulders'],
          notes: 'Test',
          cooldown: '5 min',
          exercises: [
            {
              name: 'Bench Press',
              description: 'Test',
              type: 'compound',
              category: 'strength',
              setGroups: [
                {
                  id: 'sg_w1d1e1',
                  count: 4,
                  baseSet: {
                    reps: 8,
                    weight: 100,
                    weightLbs: 220,
                    intensityPercent: 75,
                    rpe: 8,
                    rest: 120,
                  },
                  sets: Array(4).fill({
                    reps: 8,
                    weight: 100,
                    weightLbs: 220,
                    intensityPercent: 75,
                    rpe: 8,
                    rest: 120,
                  }),
                },
              ],
            },
            {
              name: 'Shoulder Press',
              description: 'Test',
              type: 'compound',
              category: 'strength',
              setGroups: [
                {
                  id: 'sg_w1d1e2',
                  count: 3,
                  baseSet: {
                    reps: 10,
                    weight: 50,
                    weightLbs: 110,
                    intensityPercent: 70,
                    rpe: 7,
                    rest: 90,
                  },
                  sets: Array(3).fill({
                    reps: 10,
                    weight: 50,
                    weightLbs: 110,
                    intensityPercent: 70,
                    rpe: 7,
                    rest: 90,
                  }),
                },
              ],
            },
          ],
        },
      ],
    };

    const diff: ProgressionDiff['week2'] = {
      focus: 'Increased Volume',
      notes: 'Week 2 notes',
      changes: [
        {
          dayNumber: 1,
          exerciseIndex: 0,
          setGroupIndex: 0,
          weight: 105, // Bench Press: increase weight
        },
        {
          dayNumber: 1,
          exerciseIndex: 1,
          setGroupIndex: 0,
          reps: 12, // Shoulder Press: increase reps
        },
      ],
    };

    // Act
    const week2 = applyProgressionDiff(week1, diff, 2);

    // Assert
    // Bench Press should have increased weight
    expect(week2.days[0].exercises[0].setGroups[0].baseSet.weight).toBe(105);
    expect(week2.days[0].exercises[0].setGroups[0].baseSet.weightLbs).toBeCloseTo(231, 2);
    // Shoulder Press should have increased reps
    expect(week2.days[0].exercises[1].setGroups[0].baseSet.reps).toBe(12);
  });

  it('should not modify week1 when applying diff', () => {
    // Arrange
    const week1: WorkoutProgram['weeks'][0] = {
      weekNumber: 1,
      focus: 'Base Volume',
      notes: 'Week 1 notes',
      days: [
        {
          dayNumber: 1,
          dayName: 'Monday',
          name: 'Push Day',
          targetMuscles: ['chest'],
          notes: 'Test',
          cooldown: '5 min',
          exercises: [
            {
              name: 'Bench Press',
              description: 'Test',
              type: 'compound',
              category: 'strength',
              setGroups: [
                {
                  id: 'sg_w1d1e1',
                  count: 4,
                  baseSet: {
                    reps: 8,
                    weight: 100,
                    weightLbs: 220,
                    intensityPercent: 75,
                    rpe: 8,
                    rest: 120,
                  },
                  sets: Array(4).fill({
                    reps: 8,
                    weight: 100,
                    weightLbs: 220,
                    intensityPercent: 75,
                    rpe: 8,
                    rest: 120,
                  }),
                },
              ],
            },
          ],
        },
      ],
    };

    const week1Clone = JSON.parse(JSON.stringify(week1));

    const diff: ProgressionDiff['week2'] = {
      focus: 'Increased Volume',
      notes: 'Week 2 notes',
      changes: [
        {
          dayNumber: 1,
          exerciseIndex: 0,
          setGroupIndex: 0,
          weight: 105,
        },
      ],
    };

    // Act
    applyProgressionDiff(week1, diff, 2);

    // Assert - week1 should be unchanged
    expect(week1.weekNumber).toBe(1);
    expect(week1.days[0].exercises[0].setGroups[0].baseSet.weight).toBe(100);
    expect(week1).toEqual(week1Clone);
  });

  it('should handle changes to non-existent day/exercise gracefully', () => {
    // Arrange
    const week1: WorkoutProgram['weeks'][0] = {
      weekNumber: 1,
      focus: 'Base Volume',
      notes: 'Week 1 notes',
      days: [
        {
          dayNumber: 1,
          dayName: 'Monday',
          name: 'Push Day',
          targetMuscles: ['chest'],
          notes: 'Test',
          cooldown: '5 min',
          exercises: [
            {
              name: 'Bench Press',
              description: 'Test',
              type: 'compound',
              category: 'strength',
              setGroups: [
                {
                  id: 'sg_w1d1e1',
                  count: 4,
                  baseSet: {
                    reps: 8,
                    weight: 100,
                    weightLbs: 220,
                    intensityPercent: 75,
                    rpe: 8,
                    rest: 120,
                  },
                  sets: Array(4).fill({
                    reps: 8,
                    weight: 100,
                    weightLbs: 220,
                    intensityPercent: 75,
                    rpe: 8,
                    rest: 120,
                  }),
                },
              ],
            },
          ],
        },
      ],
    };

    const diff: ProgressionDiff['week2'] = {
      focus: 'Increased Volume',
      notes: 'Week 2 notes',
      changes: [
        {
          dayNumber: 99, // Non-existent day
          exerciseIndex: 0,
          setGroupIndex: 0,
          weight: 105,
        },
        {
          dayNumber: 1,
          exerciseIndex: 99, // Non-existent exercise
          setGroupIndex: 0,
          weight: 105,
        },
        {
          dayNumber: 1,
          exerciseIndex: 0,
          setGroupIndex: 99, // Non-existent setGroup
          weight: 105,
        },
      ],
    };

    // Act - should not throw
    const week2 = applyProgressionDiff(week1, diff, 2);

    // Assert - week2 should still be created, just without the invalid changes
    expect(week2.weekNumber).toBe(2);
    expect(week2.days[0].exercises[0].setGroups[0].baseSet.weight).toBe(100); // Unchanged
  });
});

describe('expandSetGroups with Pyramid/Variable Sets', () => {
  it('should expand pyramid sets with array values for reps', () => {
    // Arrange - Pyramid: 10-8-6-4-4-3 reps
    const aiProgram: AIWorkoutProgram = {
      name: 'Pyramid Test',
      description: 'Test',
      difficulty: 'ADVANCED',
      durationWeeks: 1,
      goals: ['strength'],
      weeks: [
        {
          weekNumber: 1,
          focus: 'Strength',
          notes: 'Test',
          days: [
            {
              dayNumber: 1,
              dayName: 'Monday',
              name: 'Strength Day',
              targetMuscles: ['chest'],
              notes: 'Test',
              cooldown: '5 min',
              exercises: [
                {
                  name: 'Bench Press Pyramid',
                  description: 'Test',
                  type: 'compound',
                  category: 'strength',
                  setGroups: [
                    {
                      id: 'sg_w1d1e1',
                      count: 6,
                      baseSet: makePyramidBaseSet({
                        reps: [10, 8, 6, 4, 4, 3], // Pyramid reps
                        weight: 100,
                        weightLbs: 220,
                        intensityPercent: [70, 75, 80, 82.5, 85, 87.5],
                        rpe: 8,
                        rest: 120,
                      }),
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    // Act
    const result = expandSetGroups(aiProgram);

    // Assert
    const sets = result.weeks[0].days[0].exercises[0].setGroups[0].sets;
    expect(sets.length).toBe(6);

    // Check each set has correct reps
    expect(sets[0].reps).toBe(10);
    expect(sets[1].reps).toBe(8);
    expect(sets[2].reps).toBe(6);
    expect(sets[3].reps).toBe(4);
    expect(sets[4].reps).toBe(4);
    expect(sets[5].reps).toBe(3);

    // Check each set has correct intensity
    expect(sets[0].intensityPercent).toBe(70);
    expect(sets[1].intensityPercent).toBe(75);
    expect(sets[2].intensityPercent).toBe(80);
    expect(sets[3].intensityPercent).toBe(82.5);
    expect(sets[4].intensityPercent).toBe(85);
    expect(sets[5].intensityPercent).toBe(87.5);

    // Weight should be same for all (scalar value)
    sets.forEach((set) => {
      expect(set.weight).toBe(100);
      expect(set.rest).toBe(120);
    });
  });

  it('should expand pyramid with mixed scalar and array values', () => {
    // Arrange
    const aiProgram: AIWorkoutProgram = {
      name: 'Mixed Pyramid Test',
      description: 'Test',
      difficulty: 'INTERMEDIATE',
      durationWeeks: 1,
      goals: ['hypertrophy'],
      weeks: [
        {
          weekNumber: 1,
          focus: 'Test',
          notes: 'Test',
          days: [
            {
              dayNumber: 1,
              dayName: 'Monday',
              name: 'Test Day',
              targetMuscles: ['back'],
              notes: 'Test',
              cooldown: '5 min',
              exercises: [
                {
                  name: 'Deadlift',
                  description: 'Test',
                  type: 'compound',
                  category: 'strength',
                  setGroups: [
                    {
                      id: 'sg_w1d1e1',
                      count: 4,
                      baseSet: makePyramidBaseSet({
                        reps: [5, 4, 3, 2], // Array
                        weight: [140, 150, 160, 170], // Array
                        weightLbs: null,
                        intensityPercent: 80, // Scalar - same for all
                        rpe: [7, 8, 9, 9], // Array
                        rest: [180, 180, 240, 240], // Array
                      }),
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    // Act
    const result = expandSetGroups(aiProgram);

    // Assert
    const sets = result.weeks[0].days[0].exercises[0].setGroups[0].sets;
    expect(sets.length).toBe(4);

    expect(sets[0]).toMatchObject({ reps: 5, weight: 140, rpe: 7, rest: 180 });
    expect(sets[1]).toMatchObject({ reps: 4, weight: 150, rpe: 8, rest: 180 });
    expect(sets[2]).toMatchObject({ reps: 3, weight: 160, rpe: 9, rest: 240 });
    expect(sets[3]).toMatchObject({ reps: 2, weight: 170, rpe: 9, rest: 240 });

    // intensityPercent should be scalar (same for all)
    sets.forEach((set) => {
      expect(set.intensityPercent).toBe(80);
    });
  });
});

describe('groupIdenticalSets', () => {
  it('should group consecutive identical sets', () => {
    // Arrange - Sets pattern: A, B, B, C, D, D (should become 4 groups)
    const sets: ExerciseSet[] = [
      { reps: 10, weight: 100, weightLbs: 220, intensityPercent: 70, rpe: 7, rest: 120 },
      { reps: 6, weight: 100, weightLbs: 220, intensityPercent: 80, rpe: 8, rest: 120 },
      { reps: 6, weight: 100, weightLbs: 220, intensityPercent: 80, rpe: 8, rest: 120 },
      { reps: 4, weight: 100, weightLbs: 220, intensityPercent: 82.5, rpe: 8, rest: 120 },
      { reps: 3, weight: 100, weightLbs: 220, intensityPercent: 87.5, rpe: 9, rest: 120 },
      { reps: 3, weight: 100, weightLbs: 220, intensityPercent: 87.5, rpe: 9, rest: 120 },
    ];

    // Act
    const groups = groupIdenticalSets(sets, 'sg_test');

    // Assert
    expect(groups.length).toBe(4);

    // Group 1: 1 set with 10 reps
    expect(groups[0].count).toBe(1);
    expect(groups[0].baseSet.reps).toBe(10);

    // Group 2: 2 sets with 6 reps
    expect(groups[1].count).toBe(2);
    expect(groups[1].baseSet.reps).toBe(6);
    expect(groups[1].sets.length).toBe(2);

    // Group 3: 1 set with 4 reps
    expect(groups[2].count).toBe(1);
    expect(groups[2].baseSet.reps).toBe(4);

    // Group 4: 2 sets with 3 reps
    expect(groups[3].count).toBe(2);
    expect(groups[3].baseSet.reps).toBe(3);
    expect(groups[3].sets.length).toBe(2);
  });

  it('should return single group when all sets are identical', () => {
    // Arrange
    const sets: ExerciseSet[] = [
      { reps: 8, weight: 100, weightLbs: 220, intensityPercent: 75, rpe: 8, rest: 120 },
      { reps: 8, weight: 100, weightLbs: 220, intensityPercent: 75, rpe: 8, rest: 120 },
      { reps: 8, weight: 100, weightLbs: 220, intensityPercent: 75, rpe: 8, rest: 120 },
    ];

    // Act
    const groups = groupIdenticalSets(sets, 'sg_test');

    // Assert
    expect(groups.length).toBe(1);
    expect(groups[0].count).toBe(3);
  });

  it('should return separate groups when all sets are different', () => {
    // Arrange
    const sets: ExerciseSet[] = [
      { reps: 10, weight: 100, weightLbs: 220, intensityPercent: 70, rpe: 7, rest: 120 },
      { reps: 8, weight: 105, weightLbs: 231, intensityPercent: 75, rpe: 8, rest: 120 },
      { reps: 6, weight: 110, weightLbs: 242, intensityPercent: 80, rpe: 9, rest: 120 },
    ];

    // Act
    const groups = groupIdenticalSets(sets, 'sg_test');

    // Assert
    expect(groups.length).toBe(3);
    groups.forEach((group) => {
      expect(group.count).toBe(1);
    });
  });
});

describe('expandSetGroupsWithAutoGroup', () => {
  it('should expand and auto-group pyramid sets', () => {
    // Arrange - reps: 10-6-6-4-3-3 (should create 4 groups after auto-grouping)
    const aiProgram: AIWorkoutProgram = {
      name: 'Auto Group Test',
      description: 'Test',
      difficulty: 'ADVANCED',
      durationWeeks: 1,
      goals: ['strength'],
      weeks: [
        {
          weekNumber: 1,
          focus: 'Test',
          notes: 'Test',
          days: [
            {
              dayNumber: 1,
              dayName: 'Monday',
              name: 'Test Day',
              targetMuscles: ['chest'],
              notes: 'Test',
              cooldown: '5 min',
              exercises: [
                {
                  name: 'Bench Press',
                  description: 'Test',
                  type: 'compound',
                  category: 'strength',
                  setGroups: [
                    {
                      id: 'sg_w1d1e1',
                      count: 6,
                      baseSet: makePyramidBaseSet({
                        reps: [10, 6, 6, 4, 3, 3],
                        weight: 100,
                        weightLbs: 220,
                        intensityPercent: [70, 80, 80, 82.5, 87.5, 87.5],
                        rpe: 8,
                        rest: 120,
                      }),
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    // Act with auto-grouping enabled
    const result = expandSetGroupsWithAutoGroup(aiProgram, true);

    // Assert - Should have 4 SetGroups now
    const setGroups = result.weeks[0].days[0].exercises[0].setGroups;
    expect(setGroups.length).toBe(4);

    // Group 1: 1 set with 10 reps
    expect(setGroups[0].count).toBe(1);
    expect(setGroups[0].baseSet.reps).toBe(10);

    // Group 2: 2 sets with 6 reps
    expect(setGroups[1].count).toBe(2);
    expect(setGroups[1].baseSet.reps).toBe(6);

    // Group 3: 1 set with 4 reps
    expect(setGroups[2].count).toBe(1);
    expect(setGroups[2].baseSet.reps).toBe(4);

    // Group 4: 2 sets with 3 reps
    expect(setGroups[3].count).toBe(2);
    expect(setGroups[3].baseSet.reps).toBe(3);
  });

  it('should not auto-group when autoGroup is false', () => {
    // Arrange
    const aiProgram: AIWorkoutProgram = {
      name: 'No Auto Group Test',
      description: 'Test',
      difficulty: 'ADVANCED',
      durationWeeks: 1,
      goals: ['strength'],
      weeks: [
        {
          weekNumber: 1,
          focus: 'Test',
          notes: 'Test',
          days: [
            {
              dayNumber: 1,
              dayName: 'Monday',
              name: 'Test Day',
              targetMuscles: ['chest'],
              notes: 'Test',
              cooldown: '5 min',
              exercises: [
                {
                  name: 'Bench Press',
                  description: 'Test',
                  type: 'compound',
                  category: 'strength',
                  setGroups: [
                    {
                      id: 'sg_w1d1e1',
                      count: 6,
                      baseSet: makePyramidBaseSet({
                        reps: [10, 6, 6, 4, 3, 3],
                        weight: 100,
                        weightLbs: 220,
                        intensityPercent: 70,
                        rpe: 8,
                        rest: 120,
                      }),
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    // Act without auto-grouping
    const result = expandSetGroupsWithAutoGroup(aiProgram, false);

    // Assert - Should still have 1 SetGroup with 6 sets
    const setGroups = result.weeks[0].days[0].exercises[0].setGroups;
    expect(setGroups.length).toBe(1);
    expect(setGroups[0].sets.length).toBe(6);
  });
});
