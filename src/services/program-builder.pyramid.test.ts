/**
 * Pyramid Sets Test with JSON Logging
 *
 * Test per serie piramidali con salvataggio JSON prima/dopo
 */

import { describe, it, expect } from 'vitest';
import { expandSetGroups, expandSetGroupsWithAutoGroup } from './program-builder';
import type { AIWorkoutProgram } from '@giulio-leone/schemas';
import type { PyramidBaseSet } from './program-builder';
import type { ExerciseSet } from '@giulio-leone/types/workout';
import * as fs from 'fs';
import * as path from 'path';

/** Test helper: creates a baseSet with pyramid (array) fields typed as ExerciseSet */
function makePyramidBaseSet(data: PyramidBaseSet): ExerciseSet {
  return data as unknown as ExerciseSet;
}

// Helper per salvare JSON
function saveJSON(filename: string, data: unknown) {
  const testDir = path.join(process.cwd(), 'test-outputs');
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }
  const filePath = path.join(testDir, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  console.warn(`\n💾 JSON salvato: ${filePath}\n`);
  return filePath;
}

describe('Pyramid Sets - Test con Logging e JSON', () => {
  it('test piramidale completo: reps, weight, intensity, rpe, rest variabili', () => {
    console.warn('\n' + '='.repeat(80));
    console.warn('🧪 TEST: Piramidale Completo con Tutti i Parametri Variabili');
    console.warn('='.repeat(80) + '\n');

    // INPUT: Piramidale completo
    const aiProgram: AIWorkoutProgram = {
      name: 'Pyramid Strength Program',
      description: 'Programma con serie piramidali complete',
      difficulty: 'ADVANCED',
      durationWeeks: 1,
      goals: ['strength'],
      weeks: [
        {
          weekNumber: 1,
          focus: 'Strength Pyramid',
          notes: 'Piramidale completo con tutti i parametri variabili',
          days: [
            {
              dayNumber: 1,
              dayName: 'Monday',
              name: 'Strength Day',
              targetMuscles: ['chest'],
              notes: 'Panca piramidale',
              cooldown: '5 min stretching',
              exercises: [
                {
                  name: 'Barbell Bench Press',
                  description: 'Panca piana piramidale',
                  type: 'compound',
                  category: 'strength',
                  setGroups: [
                    {
                      id: 'sg_w1d1e1',
                      count: 6,
                      baseSet: makePyramidBaseSet({
                        // Pattern: 10-8-6-4-4-3 reps
                        reps: [10, 8, 6, 4, 4, 3],
                        // Weight DEVE aumentare con l'intensità
                        weight: [60, 70, 80, 85, 90, 95],
                        weightLbs: null, // Verrà calcolato
                        // Intensità crescente
                        intensityPercent: [70, 75, 80, 82.5, 85, 87.5],
                        // RPE crescente (può variare indipendentemente)
                        rpe: [7, 8, 8, 9, 9, 9],
                        // Rest aumenta per serie più pesanti
                        rest: [120, 150, 180, 180, 180, 240],
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

    console.warn("📥 INPUT JSON (prima dell'espansione):");
    console.warn(JSON.stringify(aiProgram, null, 2));

    // Salva JSON input
    const inputPath = saveJSON('pyramid-input.json', aiProgram);

    console.warn('\n⚙️  Eseguendo expandSetGroups()...\n');

    // PROCESSING
    const result = expandSetGroups(aiProgram);

    console.warn("📤 OUTPUT JSON (dopo l'espansione):");
    console.warn(JSON.stringify(result, null, 2));

    // Salva JSON output
    const outputPath = saveJSON('pyramid-output.json', result);

    // Verifica coerenza
    const sets = result.weeks[0].days[0].exercises[0].setGroups[0].sets;

    console.warn('\n📊 VERIFICA COERENZA:\n');
    sets.forEach((set, i) => {
      console.warn(`Set ${i + 1}:`);
      console.warn(`  - reps: ${set.reps}`);
      console.warn(`  - weight: ${set.weight}kg (${set.weightLbs?.toFixed(1)}lbs)`);
      console.warn(`  - intensityPercent: ${set.intensityPercent}%`);
      console.warn(`  - rpe: ${set.rpe}`);
      console.warn(`  - rest: ${set.rest}s`);
      console.warn('');
    });

    // Assertions
    expect(sets.length).toBe(6);

    // Verifica che weight aumenti con intensityPercent
    for (let i = 1; i < sets.length; i++) {
      const prevIntensity = sets[i - 1].intensityPercent;
      const currIntensity = sets[i].intensityPercent;
      const prevWeight = sets[i - 1].weight;
      const currWeight = sets[i].weight;

      if (
        prevIntensity !== null &&
        currIntensity !== null &&
        prevWeight !== null &&
        currWeight !== null
      ) {
        if (currIntensity > prevIntensity) {
          expect(currWeight).toBeGreaterThanOrEqual(prevWeight);
          console.warn(
            `✅ Set ${i + 1}: intensity ${currIntensity}% > ${prevIntensity}%, weight ${currWeight}kg >= ${prevWeight}kg`
          );
        }
      }
    }

    // Verifica weightLbs calcolato
    sets.forEach((set, i) => {
      if (set.weight !== null) {
        const expectedLbs = set.weight * 2.2;
        expect(set.weightLbs).toBeCloseTo(expectedLbs, 1);
        console.warn(
          `✅ Set ${i + 1}: weightLbs ${set.weightLbs?.toFixed(1)} = weight ${set.weight} * 2.2`
        );
      }
    });

    console.warn('\n✅ Test completato! JSON salvati in test-outputs/');
    console.warn(`   Input: ${inputPath}`);
    console.warn(`   Output: ${outputPath}\n`);
  });

  it('test piramidale con raggruppamento automatico', () => {
    console.warn('\n' + '='.repeat(80));
    console.warn('🧪 TEST: Piramidale con Auto-Raggruppamento (10-6-6-4-3-3)');
    console.warn('='.repeat(80) + '\n');

    // INPUT: Pattern 10-6-6-4-3-3 (sets 2-3 e 5-6 identici)
    const aiProgram: AIWorkoutProgram = {
      name: 'Grouped Pyramid Test',
      description: 'Test raggruppamento automatico',
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
                        weight: [60, 80, 80, 85, 90, 90], // Coerente con pattern
                        weightLbs: null,
                        intensityPercent: [70, 80, 80, 82.5, 87.5, 87.5],
                        rpe: [7, 8, 8, 9, 9, 9],
                        rest: [120, 150, 150, 180, 180, 180], // Set 5-6 hanno stesso rest per raggruppamento
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

    console.warn("📥 INPUT JSON (prima dell'espansione):");
    console.warn(JSON.stringify(aiProgram, null, 2));

    const inputPath = saveJSON('pyramid-grouped-input.json', aiProgram);

    console.warn('\n⚙️  Eseguendo expandSetGroupsWithAutoGroup(autoGroup=true)...\n');

    // PROCESSING con auto-grouping
    const result = expandSetGroupsWithAutoGroup(aiProgram, true);

    console.warn('📤 OUTPUT JSON (dopo espansione e raggruppamento):');
    console.warn(JSON.stringify(result, null, 2));

    const outputPath = saveJSON('pyramid-grouped-output.json', result);

    const setGroups = result.weeks[0].days[0].exercises[0].setGroups;

    console.warn('\n📊 RISULTATO RAGGRUPPAMENTO:\n');
    console.warn(`Totale SetGroups: ${setGroups.length} (da 1 SetGroup originale)\n`);

    setGroups.forEach((group, i) => {
      const setsDesc =
        group.count > 1 ? `🔗 ${group.count} serie identiche raggruppate` : '1 serie singola';
      console.warn(`Gruppo ${i + 1} (${group.id}): ${setsDesc}`);
      console.warn(`  - reps: ${group.baseSet.reps}`);
      console.warn(`  - weight: ${group.baseSet.weight}kg`);
      console.warn(`  - intensityPercent: ${group.baseSet.intensityPercent}%`);
      console.warn(`  - rpe: ${group.baseSet.rpe}`);
      console.warn(`  - rest: ${group.baseSet.rest}s`);
      console.warn('');
    });

    // Assertions
    // Pattern: 10-6-6-4-3-3
    // Set 2-3: identici (6 reps, 80%, rest 150) → raggruppati
    // Set 5-6: identici (3 reps, 87.5%, rest 180) → raggruppati
    expect(setGroups.length).toBe(4);
    expect(setGroups[0].count).toBe(1); // Set 1: 10 reps
    expect(setGroups[1].count).toBe(2); // Sets 2-3 grouped: 6 reps
    expect(setGroups[2].count).toBe(1); // Set 4: 4 reps
    expect(setGroups[3].count).toBe(2); // Sets 5-6 grouped: 3 reps

    console.warn('✅ Test completato! JSON salvati in test-outputs/');
    console.warn(`   Input: ${inputPath}`);
    console.warn(`   Output: ${outputPath}\n`);
  });

  it('test con RPE invece di intensityPercent', () => {
    console.warn('\n' + '='.repeat(80));
    console.warn('🧪 TEST: Piramidale usando RPE invece di intensityPercent');
    console.warn('='.repeat(80) + '\n');

    const aiProgram: AIWorkoutProgram = {
      name: 'RPE Pyramid Test',
      description: 'Test con RPE',
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
              targetMuscles: ['back'],
              notes: 'Test',
              cooldown: '5 min',
              exercises: [
                {
                  name: 'Deadlift',
                  description: 'Stacco piramidale con RPE',
                  type: 'compound',
                  category: 'strength',
                  setGroups: [
                    {
                      id: 'sg_w1d1e1',
                      count: 5,
                      baseSet: makePyramidBaseSet({
                        reps: [5, 4, 3, 2, 1],
                        weight: [140, 150, 160, 170, 180],
                        weightLbs: null,
                        intensityPercent: null, // Non usato
                        rpe: [7, 8, 9, 9, 10], // Usa RPE invece
                        rest: [180, 240, 300, 300, 360],
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

    console.warn('📥 INPUT JSON:');
    console.warn(JSON.stringify(aiProgram, null, 2));

    const inputPath = saveJSON('rpe-pyramid-input.json', aiProgram);

    const result = expandSetGroups(aiProgram);
    const sets = result.weeks[0].days[0].exercises[0].setGroups[0].sets;

    console.warn('\n📤 OUTPUT JSON:');
    console.warn(JSON.stringify(result, null, 2));

    const outputPath = saveJSON('rpe-pyramid-output.json', result);

    console.warn('\n📊 VERIFICA:\n');
    sets.forEach((set, i) => {
      console.warn(`Set ${i + 1}:`);
      console.warn(`  - reps: ${set.reps}`);
      console.warn(`  - weight: ${set.weight}kg`);
      console.warn(`  - rpe: ${set.rpe} (intensityPercent: ${set.intensityPercent})`);
      console.warn(`  - rest: ${set.rest}s`);
      console.warn('');
    });

    // Assertions
    expect(sets.length).toBe(5);
    sets.forEach((set, i) => {
      expect(set.rpe).toBe([7, 8, 9, 9, 10][i]);
      expect(set.intensityPercent).toBeNull();
    });

    console.warn('✅ Test completato! JSON salvati in test-outputs/');
    console.warn(`   Input: ${inputPath}`);
    console.warn(`   Output: ${outputPath}\n`);
  });
});
