import type { WorkoutProgram, Exercise, ExerciseSet, SetGroup } from '@giulio-leone/types';
import {
  calculateWeightFromIntensity,
  calculateIntensityFromWeight,
} from '../calculators/intensity-calculator';
import { kgToLbs } from '@giulio-leone/lib-shared';
import { deepClone } from '../helpers/utils';

export type ProgressionType =
  | 'linear_weight'
  | 'linear_reps'
  | 'linear_sets'
  | 'percentage'
  | 'rpe';

export interface ProgressionParams {
  type: ProgressionType;
  startValue: number; // Peso iniziale, RPE iniziale, o % iniziale
  increment: number; // Quanto aggiungere per step (es. +2.5kg, +1 rep, +2%)
  frequency: number; // Ogni quante sessioni applicare l'incremento (1 = ogni sessione, 2 = ogni 2, etc.)
  targetSetIndex?: number; // Se undefined applica a tutte le serie, altrimenti solo a specifica serie
}

export interface ExerciseOccurrence {
  weekIndex: number;
  dayIndex: number;
  exerciseIndex: number;
  weekNumber: number;
  dayNumber: number;
  dayName: string;
  exercise: Exercise;
  programId: string;
}

export interface GroupedExercise {
  exerciseId: string; // Catalog ID or Name if custom
  name: string;
  occurrences: ExerciseOccurrence[];
}

export class WorkoutProgressionService {
  /**
   * Raggruppa tutti gli esercizi del programma per identificarne le occorrenze
   */
  static groupExercises(program: WorkoutProgram): GroupedExercise[] {
    const groups: Record<string, GroupedExercise> = {};

    program.weeks.forEach((week, wIdx) => {
      week.days.forEach((day, dIdx) => {
        day.exercises.forEach((exercise, eIdx) => {
          // Usa catalogId se disponibile, altrimenti fallback sul nome normalizzato
          const key = exercise.catalogExerciseId || exercise.name.toLowerCase().trim();

          if (!groups[key]) {
            groups[key] = {
              exerciseId: key,
              name: exercise.name,
              occurrences: [],
            };
          }

          groups[key]!.occurrences.push({
            weekIndex: wIdx,
            dayIndex: dIdx,
            exerciseIndex: eIdx,
            weekNumber: week.weekNumber,
            dayNumber: day.dayNumber,
            dayName: day.name,
            exercise: deepClone(exercise), // DRY: using centralized deepClone
            programId: program.id,
          });
        });
      });
    });

    return Object.values(groups).sort((a, b) => b.occurrences.length - a.occurrences.length);
  }

  /**
   * Ridimensiona un gruppo di serie (SetGroup)
   * Aggiunge o rimuove serie mantenendo i dati esistenti
   */
  static resizeSetGroup(group: SetGroup, newCount: number): void {
    const count = Math.max(1, Math.round(newCount));
    group.count = count;

    if (count > group.sets.length) {
      // Aggiungi serie copiando l'ultima o il baseSet
      const template = group.sets[group.sets.length - 1] || group.baseSet;
      const toAdd = count - group.sets.length;
      for (let i = 0; i < toAdd; i++) {
        group.sets.push(deepClone(template));
      }
    } else if (count < group.sets.length) {
      // Rimuovi le eccedenti
      group.sets = group.sets.slice(0, count);
    }
  }

  /**
   * Sincronizza i valori di un'occorrenza con un nuovo 1RM
   * Se c'è intensity, ricalcola weight. Se c'è weight, ricalcola intensity.
   */
  static syncOccurrenceWithOneRepMax(
    occ: ExerciseOccurrence,
    oneRepMax: number
  ): ExerciseOccurrence {
    // Deep copy per immutabilità
    const newOcc = deepClone(occ);

    if (!oneRepMax || oneRepMax <= 0) return newOcc;

    newOcc.exercise.setGroups.forEach((group: any) => {
      // Helper interno per sync singolo set
      const syncSet = (s: ExerciseSet) => {
        if (s.intensityPercent && s.intensityPercent > 0) {
          // Master: Intensity -> Slave: Weight
          s.weight = Number(calculateWeightFromIntensity(oneRepMax, s.intensityPercent).toFixed(1));
          s.weightLbs = Number(kgToLbs(s.weight).toFixed(1));

          if (s.intensityPercentMax) {
            const wMax = calculateWeightFromIntensity(oneRepMax, s.intensityPercentMax);
            s.weightMax = Number(wMax.toFixed(1));
          }
        } else if (s.weight && s.weight > 0) {
          // Master: Weight -> Slave: Intensity
          s.intensityPercent = Number(calculateIntensityFromWeight(s.weight, oneRepMax).toFixed(1));
          if (s.weightMax) {
            s.intensityPercentMax = Number(
              calculateIntensityFromWeight(s.weightMax, oneRepMax).toFixed(1)
            );
          }
        }
      };

      syncSet(group.baseSet);
      group.sets.forEach(syncSet);
    });

    return newOcc;
  }

  /**
   * Calcola l'anteprima della progressione senza modificare il programma originale
   * Restituisce le occorrenze con i valori aggiornati
   */
  static previewProgression(
    occurrences: ExerciseOccurrence[],
    params: ProgressionParams,
    selectedIndices: number[],
    oneRepMax?: number
  ): ExerciseOccurrence[] {
    // Deep copy per lavorare in isolamento
    let updatedOccurrences = deepClone(occurrences);

    let stepsApplied = 0;

    updatedOccurrences.forEach((occ, idx) => {
      // Salta se non selezionato
      if (!selectedIndices.includes(idx)) return;

      // Calcola il valore target per questo step
      const incrementsCount = Math.floor(stepsApplied / params.frequency);
      const delta = incrementsCount * params.increment;
      const currentValue = params.startValue + delta;

      // Applica a tutti i SetGroups dell'esercizio
      occ.exercise.setGroups.forEach((group: any) => {
        if (params.type === 'linear_sets') {
          this.resizeSetGroup(group, currentValue);
        } else {
          this.updateSet(group.baseSet, params.type, currentValue, oneRepMax);
          group.sets.forEach((set: any) => {
            this.updateSet(set, params.type, currentValue, oneRepMax);
          });
        }
      });

      stepsApplied++;
    });

    // Se 1RM è fornito, facciamo un passaggio finale di sync per assicurare coerenza
    if (oneRepMax) {
      updatedOccurrences = updatedOccurrences.map((occ: any) =>
        this.syncOccurrenceWithOneRepMax(occ, oneRepMax)
      );
    }

    return updatedOccurrences;
  }

  private static updateSet(
    set: ExerciseSet,

    type: ProgressionType,

    value: number,

    oneRepMax?: number
  ) {
    switch (type) {
      case 'linear_weight': {
        const currentWeight = set.weight || 0;

        const delta = value - currentWeight; // Calculate the shift amount based on target value

        // Apply to base weight

        set.weight = value;

        set.weightLbs = Number(kgToLbs(value).toFixed(1));

        // Handle Range: Shift weightMax by the same delta if it exists

        if (set.weightMax !== null && set.weightMax !== undefined) {
          set.weightMax = Number((set.weightMax + delta).toFixed(1));
        }

        // Recalculate Intensity if 1RM exists

        if (oneRepMax && oneRepMax > 0) {
          set.intensityPercent = Number(calculateIntensityFromWeight(value, oneRepMax).toFixed(1));

          if (set.weightMax) {
            set.intensityPercentMax = Number(
              calculateIntensityFromWeight(set.weightMax, oneRepMax).toFixed(1)
            );
          }
        }

        break;
      }

      case 'linear_reps': {
        const targetReps = Math.round(value);

        const currentReps = set.reps || 0;

        const delta = targetReps - currentReps;

        set.reps = targetReps;

        // Handle Range

        if (set.repsMax !== null && set.repsMax !== undefined) {
          set.repsMax = Math.round(set.repsMax + delta);
        }

        break;
      }

      case 'percentage': {
        const targetPct = Number(value.toFixed(1));

        const currentPct = set.intensityPercent || 0;

        const delta = targetPct - currentPct;

        set.intensityPercent = targetPct;

        // Handle Range

        if (set.intensityPercentMax !== null && set.intensityPercentMax !== undefined) {
          set.intensityPercentMax = Number((set.intensityPercentMax + delta).toFixed(1));
        }

        // Recalculate Weight if 1RM exists

        if (oneRepMax && oneRepMax > 0) {
          const weight = calculateWeightFromIntensity(oneRepMax, targetPct);

          set.weight = Number(weight.toFixed(1));

          set.weightLbs = Number(kgToLbs(weight).toFixed(1));

          if (set.intensityPercentMax) {
            const weightMax = calculateWeightFromIntensity(oneRepMax, set.intensityPercentMax);

            set.weightMax = Number(weightMax.toFixed(1));
          }
        }

        break;
      }

      case 'rpe': {
        const targetRpe = Math.min(10, Math.max(1, value));

        const currentRpe = set.rpe || 0;

        const delta = targetRpe - currentRpe;

        set.rpe = Number(targetRpe.toFixed(1));

        // Handle Range

        if (set.rpeMax !== null && set.rpeMax !== undefined) {
          let newMax = set.rpeMax + delta;

          newMax = Math.min(10, Math.max(1, newMax)); // Clamp

          set.rpeMax = Number(newMax.toFixed(1));
        }

        break;
      }
    }
  }

  /**
   * Applica le modifiche al programma completo
   */
  static applyToProgram(program: WorkoutProgram, updates: ExerciseOccurrence[]): WorkoutProgram {
    const newProgram = deepClone(program);

    updates.forEach((update: any) => {
      const { weekIndex, dayIndex, exerciseIndex, exercise } = update;

      if (
        newProgram.weeks[weekIndex] &&
        newProgram.weeks[weekIndex]!.days[dayIndex] &&
        newProgram.weeks[weekIndex]!.days[dayIndex]!.exercises[exerciseIndex]
      ) {
        newProgram.weeks[weekIndex]!.days[dayIndex]!.exercises[exerciseIndex] = exercise;
      }
    });

    return newProgram;
  }
}
