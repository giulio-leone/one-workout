/**
 * Visual Test for Workout Program Builder
 *
 * Mostra in tempo reale come vengono costruiti i JSON durante l'esecuzione
 */

import { describe, it, expect } from 'vitest';
import {
  expandSetGroups,
  applyProgressionDiff,
  expandSetGroupsWithAutoGroup,
} from './program-builder';
import type { AIWorkoutProgram, WorkoutProgram, ProgressionDiff } from '@giulio-leone/schemas';
import type { PyramidBaseSet } from './program-builder';
import type { ExerciseSet } from '@giulio-leone/types/workout';

/** Test helper: creates a baseSet with pyramid (array) fields typed as ExerciseSet */
function makePyramidBaseSet(data: PyramidBaseSet): ExerciseSet {
  return data as unknown as ExerciseSet;
}

// Helper per stampare JSON formattato
function printJSON(label: string, data: unknown) {
  console.warn(`\n${'='.repeat(60)}`);
  console.warn(`📋 ${label}`);
  console.warn('='.repeat(60));
  console.warn(JSON.stringify(data, null, 2));
  console.warn('='.repeat(60) + '\n');
}

describe('Visual Test - Costruzione JSON in Tempo Reale', () => {
  it('mostra come expandSetGroups costruisce sets[] da baseSet', () => {
    console.warn('\n🔍 TEST: expandSetGroups - Costruzione sets[]\n');

    // INPUT: Programma AI con baseSet ma senza sets[]
    const aiProgram: AIWorkoutProgram = {
      name: 'Programma Test',
      description: 'Test visuale',
      difficulty: 'INTERMEDIATE',
      durationWeeks: 1,
      goals: ['hypertrophy'],
      weeks: [
        {
          weekNumber: 1,
          focus: 'Base Volume',
          notes: 'Settimana di base',
          days: [
            {
              dayNumber: 1,
              dayName: 'Monday',
              name: 'Push Day',
              targetMuscles: ['chest', 'shoulders'],
              notes: 'Giorno di spinta',
              cooldown: '5 min stretching',
              exercises: [
                {
                  name: 'Bench Press',
                  description: 'Panca piana',
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
                      // ⚠️ sets[] MANCA - verrà costruito programmaticamente
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    printJSON('INPUT: Programma AI (senza sets[])', {
      exercise: aiProgram.weeks[0].days[0].exercises[0].name,
      setGroup: {
        id: aiProgram.weeks[0].days[0].exercises[0].setGroups[0].id,
        count: aiProgram.weeks[0].days[0].exercises[0].setGroups[0].count,
        baseSet: aiProgram.weeks[0].days[0].exercises[0].setGroups[0].baseSet,
        sets: aiProgram.weeks[0].days[0].exercises[0].setGroups[0].sets || '❌ MANCANTE',
      },
    });

    console.warn('⚙️  Eseguendo expandSetGroups()...\n');

    // PROCESSING
    const result = expandSetGroups(aiProgram);

    printJSON('OUTPUT: Programma Completo (con sets[] costruito)', {
      exercise: result.weeks[0].days[0].exercises[0].name,
      setGroup: {
        id: result.weeks[0].days[0].exercises[0].setGroups[0].id,
        count: result.weeks[0].days[0].exercises[0].setGroups[0].count,
        baseSet: result.weeks[0].days[0].exercises[0].setGroups[0].baseSet,
        sets: result.weeks[0].days[0].exercises[0].setGroups[0].sets,
      },
    });

    console.warn('✅ sets[] è stato costruito da baseSet + count');
    console.warn(`   - count: ${result.weeks[0].days[0].exercises[0].setGroups[0].count}`);
    console.warn(
      `   - sets.length: ${result.weeks[0].days[0].exercises[0].setGroups[0].sets.length}`
    );
    console.warn(`   - Tutti i sets sono identici a baseSet\n`);

    // Assert
    expect(result.weeks[0].days[0].exercises[0].setGroups[0].sets).toBeDefined();
    expect(result.weeks[0].days[0].exercises[0].setGroups[0].sets.length).toBe(4);
  });

  it('mostra come applyProgressionDiff applica modifiche per generare week 2', () => {
    console.warn('\n🔍 TEST: applyProgressionDiff - Generazione Week 2\n');

    // INPUT: Week 1 completa
    const week1: WorkoutProgram['weeks'][0] = {
      weekNumber: 1,
      focus: 'Base Volume',
      notes: 'Settimana di base - volume moderato',
      days: [
        {
          dayNumber: 1,
          dayName: 'Monday',
          name: 'Push Day',
          targetMuscles: ['chest', 'shoulders'],
          notes: 'Giorno di spinta',
          cooldown: '5 min stretching',
          exercises: [
            {
              name: 'Bench Press',
              description: 'Panca piana',
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

    printJSON('INPUT: Week 1 (Base)', {
      weekNumber: week1.weekNumber,
      focus: week1.focus,
      exercise: week1.days[0].exercises[0].name,
      setGroup: {
        id: week1.days[0].exercises[0].setGroups[0].id,
        count: week1.days[0].exercises[0].setGroups[0].count,
        baseSet: week1.days[0].exercises[0].setGroups[0].baseSet,
      },
    });

    // INPUT: Diff di progressione
    const diff: ProgressionDiff['week2'] = {
      focus: 'Increased Volume',
      notes: 'Settimana 2 - aumento volume e intensità',
      changes: [
        {
          dayNumber: 1,
          exerciseIndex: 0,
          setGroupIndex: 0,
          reps: 10, // ⬆️ Aumentato da 8 a 10
          weight: 105, // ⬆️ Aumentato da 100 a 105
          rpe: 9, // ⬆️ Aumentato da 8 a 9
        },
      ],
    };

    printJSON('INPUT: Progression Diff (solo modifiche)', {
      week: 2,
      focus: diff.focus,
      changes: diff.changes.map((c) => ({
        day: c.dayNumber,
        exerciseIndex: c.exerciseIndex,
        setGroupIndex: c.setGroupIndex,
        modifiche: {
          reps: c.reps ? `8 → ${c.reps}` : 'nessuna',
          weight: c.weight ? `100 → ${c.weight}` : 'nessuna',
          rpe: c.rpe ? `8 → ${c.rpe}` : 'nessuna',
        },
      })),
    });

    console.warn('⚙️  Eseguendo applyProgressionDiff()...\n');

    // PROCESSING
    const week2 = applyProgressionDiff(week1, diff, 2);

    printJSON('OUTPUT: Week 2 (con progressione applicata)', {
      weekNumber: week2.weekNumber,
      focus: week2.focus,
      exercise: week2.days[0].exercises[0].name,
      setGroup: {
        id: week2.days[0].exercises[0].setGroups[0].id,
        count: week2.days[0].exercises[0].setGroups[0].count,
        baseSet: week2.days[0].exercises[0].setGroups[0].baseSet,
        sets: week2.days[0].exercises[0].setGroups[0].sets.slice(0, 2), // Mostra solo primi 2 sets
      },
    });

    console.warn('📊 Confronto Week 1 vs Week 2:');
    console.warn('   Week 1:');
    console.warn(`     - reps: ${week1.days[0].exercises[0].setGroups[0].baseSet.reps}`);
    console.warn(`     - weight: ${week1.days[0].exercises[0].setGroups[0].baseSet.weight}kg`);
    console.warn(`     - rpe: ${week1.days[0].exercises[0].setGroups[0].baseSet.rpe}`);
    console.warn('   Week 2:');
    console.warn(`     - reps: ${week2.days[0].exercises[0].setGroups[0].baseSet.reps} ⬆️`);
    console.warn(`     - weight: ${week2.days[0].exercises[0].setGroups[0].baseSet.weight}kg ⬆️`);
    console.warn(`     - rpe: ${week2.days[0].exercises[0].setGroups[0].baseSet.rpe} ⬆️`);
    console.warn(
      `     - weightLbs: ${week2.days[0].exercises[0].setGroups[0].baseSet.weightLbs}lbs (calcolato: ${week2.days[0].exercises[0].setGroups[0].baseSet.weight} * 2.2)\n`
    );

    // Assert
    expect(week2.weekNumber).toBe(2);
    expect(week2.days[0].exercises[0].setGroups[0].baseSet.reps).toBe(10);
    expect(week2.days[0].exercises[0].setGroups[0].baseSet.weight).toBe(105);
    expect(week2.days[0].exercises[0].setGroups[0].baseSet.rpe).toBe(9);
  });

  it('mostra come viene aggiornato count e ricostruito sets[]', () => {
    console.warn('\n🔍 TEST: applyProgressionDiff - Aggiornamento count\n');

    const week1: WorkoutProgram['weeks'][0] = {
      weekNumber: 1,
      focus: 'Base Volume',
      notes: 'Settimana di base',
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

    printJSON('INPUT: Week 1 (count = 4)', {
      count: week1.days[0].exercises[0].setGroups[0].count,
      setsLength: week1.days[0].exercises[0].setGroups[0].sets.length,
    });

    const diff: ProgressionDiff['week2'] = {
      focus: 'Increased Volume',
      notes: 'Aumento volume aggiungendo 1 serie',
      changes: [
        {
          dayNumber: 1,
          exerciseIndex: 0,
          setGroupIndex: 0,
          count: 5, // ⬆️ Aumentato da 4 a 5
        },
      ],
    };

    printJSON('INPUT: Diff (count: 4 → 5)', diff.changes[0]);

    console.warn('⚙️  Eseguendo applyProgressionDiff()...\n');

    const week2 = applyProgressionDiff(week1, diff, 2);

    printJSON('OUTPUT: Week 2 (count = 5, sets[] ricostruito)', {
      count: week2.days[0].exercises[0].setGroups[0].count,
      setsLength: week2.days[0].exercises[0].setGroups[0].sets.length,
      sets: week2.days[0].exercises[0].setGroups[0].sets,
    });

    console.warn('✅ count aggiornato e sets[] ricostruito automaticamente');
    console.warn(`   - Week 1: ${week1.days[0].exercises[0].setGroups[0].count} serie`);
    console.warn(`   - Week 2: ${week2.days[0].exercises[0].setGroups[0].count} serie\n`);

    expect(week2.days[0].exercises[0].setGroups[0].count).toBe(5);
    expect(week2.days[0].exercises[0].setGroups[0].sets.length).toBe(5);
  });

  it('mostra come serie piramidali vengono espanse e raggruppate', () => {
    console.warn('\n🔍 TEST: Serie Piramidali con Auto-Raggruppamento\n');

    // INPUT: Serie piramidale con pattern 10-6-6-4-3-3
    const aiProgram: AIWorkoutProgram = {
      name: 'Pyramid Test',
      description: 'Test piramidale',
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
                  description: 'Panca piramidale',
                  type: 'compound',
                  category: 'strength',
                  setGroups: [
                    {
                      id: 'sg_w1d1e1',
                      count: 6,
                      baseSet: makePyramidBaseSet({
                        // Pattern: 10-6-6-4-3-3 (sets 2-3 e 5-6 sono identici!)
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

    printJSON('INPUT: Notazione Compatta (Array per valori variabili)', {
      exercise: aiProgram.weeks[0].days[0].exercises[0].name,
      count: aiProgram.weeks[0].days[0].exercises[0].setGroups[0].count,
      baseSet: {
        reps: '[10, 6, 6, 4, 3, 3]  ← Array = valori diversi per ogni set',
        weight: '100  ← Scalare = uguale per tutti',
        intensityPercent: '[70, 80, 80, 82.5, 87.5, 87.5]  ← Array',
        rest: '120  ← Scalare',
      },
    });

    console.warn('⚙️  STEP 1: Espansione serie piramidali...\n');

    const expanded = expandSetGroups(aiProgram);
    const sets = expanded.weeks[0].days[0].exercises[0].setGroups[0].sets;

    printJSON('STEP 1 OUTPUT: 6 serie individuali espanse', {
      sets: sets.map((s, i) => ({
        [`Set ${i + 1}`]: {
          reps: s.reps,
          intensityPercent: s.intensityPercent,
          weight: s.weight,
        },
      })),
    });

    console.warn('⚙️  STEP 2: Auto-raggruppamento serie identiche consecutive...\n');

    const grouped = expandSetGroupsWithAutoGroup(aiProgram, true);
    const setGroups = grouped.weeks[0].days[0].exercises[0].setGroups;

    console.warn('📊 RISULTATO: 6 serie → 4 gruppi:\n');
    setGroups.forEach((group, i) => {
      const setsDesc =
        group.count > 1 ? `${group.count} serie identiche raggruppate! 🔗` : '1 serie singola';
      console.warn(`   Gruppo ${i + 1}: ${setsDesc}`);
      console.warn(`     - reps: ${group.baseSet.reps}`);
      console.warn(`     - intensityPercent: ${group.baseSet.intensityPercent}`);
      console.warn(`     - count: ${group.count}`);
      console.warn('');
    });

    printJSON('STEP 2 OUTPUT: SetGroups ottimizzati', {
      totalGroups: setGroups.length,
      groups: setGroups.map((g, i) => ({
        [`Gruppo ${i + 1}`]: {
          id: g.id,
          count: g.count,
          baseSet: {
            reps: g.baseSet.reps,
            intensityPercent: g.baseSet.intensityPercent,
          },
        },
      })),
    });

    console.warn('✅ Serie 2-3 (6 reps, 80%) raggruppate automaticamente');
    console.warn('✅ Serie 5-6 (3 reps, 87.5%) raggruppate automaticamente\n');

    expect(setGroups.length).toBe(4);
    expect(setGroups[1].count).toBe(2); // Sets 2-3 grouped
    expect(setGroups[3].count).toBe(2); // Sets 5-6 grouped
  });
});
