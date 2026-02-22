/**
 * Exercise Normalizer
 *
 * Funzioni per normalizzare dati esercizi da formati vari (JSON, AI, etc.)
 */

import type { Exercise, ExerciseSet, MuscleGroup, SetGroup, SetProgression } from '@giulio-leone/types';
import { DEFAULT_SET, ALLOWED_CATEGORIES } from '../constants';
import {
  ensureArray,
  ensureArrayOfStrings,
  ensureNumber,
  ensureString,
  parseFirstNumber,
} from '../utils/type-helpers';
import { getMuscleGroupFromName } from '../helpers/utils/muscle-group';
import { createId } from '@giulio-leone/lib-shared';
import { kgToLbs, lbsToKg } from '@giulio-leone/lib-shared';

type RawJson = Record<string, unknown>;

/**
 * Normalizza i gruppi muscolari da un valore sconosciuto
 */
export function normalizeMuscleGroups(value: unknown): Exercise['muscleGroups'] {
  const rawGroups = ensureArrayOfStrings(value).map((group: any) => group.toLowerCase());
  const filtered = rawGroups
    .map((group: any) => getMuscleGroupFromName(group as string))
    .filter((group): group is MuscleGroup => group !== null);
  return filtered.length > 0 ? filtered : [];
}

/**
 * Normalizza una categoria esercizio
 */
export function normalizeCategory(value: unknown): Exercise['category'] {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (ALLOWED_CATEGORIES.has(normalized)) {
      return normalized as Exercise['category'];
    }
  }
  return 'strength';
}

/**
 * Normalizza i set di un esercizio
 */
export function normalizeExerciseSets(value: unknown): ExerciseSet[] {
  if (!Array.isArray(value)) {
    return [{ ...DEFAULT_SET }];
  }

  const sets = value
    .map((entry: unknown) => {
      if (!entry || typeof entry !== 'object') {
        return { ...DEFAULT_SET };
      }

      const raw = entry as RawJson;
      const rest = ensureNumber(raw.rest, DEFAULT_SET.rest);

      const reps =
        raw.reps !== undefined
          ? ensureNumber(raw.reps)
          : raw.repRange
            ? ensureNumber(raw.repRange)
            : undefined;

      const duration =
        raw.duration !== undefined ? ensureNumber(raw.duration) : ensureNumber(raw.time, 0);

      const weight =
        raw.weight !== undefined
          ? ensureNumber(raw.weight)
          : raw.load !== undefined
            ? ensureNumber(raw.load)
            : undefined;

      // Supporto nuovi campi: intensityPercent, rpe, weightLbs e ranges
      const intensityPercent =
        raw.intensityPercent !== undefined ? ensureNumber(raw.intensityPercent) : undefined;
      const intensityPercentMax =
        raw.intensityPercentMax !== undefined ? ensureNumber(raw.intensityPercentMax) : undefined;
      const rpe = raw.rpe !== undefined ? ensureNumber(raw.rpe) : undefined;
      const rpeMax = raw.rpeMax !== undefined ? ensureNumber(raw.rpeMax) : undefined;
      const repsMax = raw.repsMax !== undefined ? ensureNumber(raw.repsMax) : undefined;
      const weightMax = raw.weightMax !== undefined ? ensureNumber(raw.weightMax) : undefined;
      let weightLbs = raw.weightLbs !== undefined ? ensureNumber(raw.weightLbs) : undefined;

      // Sincronizza sempre kg e lbs: se manca weightLbs ma c'è weight, calcolalo
      if (weight && !weightLbs) {
        weightLbs = kgToLbs(weight);
      } else if (weightLbs && !weight) {
        // Se abbiamo solo lbs, convertiamo in kg (caso raro ma possibile)
        const calculatedWeight = lbsToKg(weightLbs);
        return {
          reps,
          repsMax,
          duration: duration || undefined,
          weight: calculatedWeight,
          weightMax,
          weightLbs: weightLbs,
          rest,
          intensityPercent,
          intensityPercentMax,
          rpe,
          rpeMax,
        } as ExerciseSet;
      }

      return {
        reps,
        repsMax,
        duration: duration || undefined,
        weight: weight ?? null,
        weightMax,
        weightLbs: weightLbs ?? null,
        rest,
        intensityPercent: intensityPercent ?? null,
        intensityPercentMax,
        rpe: rpe ?? null,
        rpeMax,
      } as ExerciseSet;
    })
    .filter(Boolean);

  return sets.length > 0 ? sets : [{ ...DEFAULT_SET }];
}

/**
 * Normalizza una progressione di serie
 */
export function normalizeSetProgression(raw: unknown): SetProgression | undefined {
  if (!raw || typeof raw !== 'object') return undefined;

  const progression = raw as RawJson;
  const type = progression.type;
  if (type !== 'linear' && type !== 'percentage' && type !== 'rpe') return undefined;

  const steps = ensureArray(progression.steps)
    .map((step: unknown) => {
      if (!step || typeof step !== 'object') return null;
      const s = step as RawJson;
      return {
        fromSet: ensureNumber(s.fromSet, 1),
        toSet: ensureNumber(s.toSet, 1),
        adjustment: ensureNumber(s.adjustment, 0),
      };
    })
    .filter(Boolean) as Array<{ fromSet: number; toSet: number; adjustment: number }>;

  if (steps.length === 0) return undefined;

  return {
    type,
    steps,
  };
}

/**
 * Normalizza un gruppo di serie
 */
export function normalizeSetGroup(raw: unknown): SetGroup | null {
  if (!raw || typeof raw !== 'object') return null;

  const group = raw as RawJson;
  const id = typeof group.id === 'string' ? group.id : createId();
  const count = ensureNumber(group.count, 1);
  const baseSet = normalizeExerciseSets([group.baseSet])[0] || { ...DEFAULT_SET };
  const progression = normalizeSetProgression(group.progression);

  // Genera serie dal gruppo
  const sets =
    group.sets && Array.isArray(group.sets)
      ? normalizeExerciseSets(group.sets)
      : Array.from({ length: count }, () => ({ ...baseSet }));

  return {
    id,
    count,
    baseSet,
    progression,
    sets:
      sets.length === count
        ? sets
        : Array.from({ length: count }, (_, i) => sets[i] || { ...baseSet }),
  };
}

/**
 * Normalizza un esercizio completo
 * Se exerciseId è presente, viene preservato per risoluzione futura nel frontend
 */
export function normalizeExercise(
  rawExercise: unknown,
  _dayNumber: number,
  index: number
): Exercise {
  const raw =
    rawExercise && typeof rawExercise === 'object' ? (rawExercise as RawJson) : ({} as RawJson);

  const id = typeof raw.id === 'string' && raw.id.length > 0 ? raw.id : createId();

  // Il nome viene da raw.name o exerciseName (AI output) o risolto dal frontend se exerciseId è presente
  const name = ensureString(
    raw.name ?? raw.exerciseName ?? raw.title ?? raw.exercise ?? `Esercizio ${index + 1}`,
    `Esercizio ${index + 1}`
  );
  const description = ensureString(raw.description ?? raw.summary ?? raw.notes ?? '');

  const normalizeCategoryLabel = (value: unknown): Exercise['category'] => {
    if (typeof value !== 'string') {
      return 'strength';
    }
    const normalized = value.trim().toLowerCase();
    if (ALLOWED_CATEGORIES.has(normalized)) {
      return normalized as Exercise['category'];
    }
    if (normalized.includes('cardio')) return 'cardio';
    if (normalized.includes('balance')) return 'balance';
    if (normalized.includes('flex')) return 'flexibility';
    if (normalized.includes('endurance')) return 'endurance';
    return normalized === 'core' ? 'core' : 'strength';
  };

  const normalizeMuscleGroupLabel = (value: unknown): MuscleGroup => {
    const result = typeof value === 'string' ? getMuscleGroupFromName(value) : null;
    return result ?? 'full-body';
  };

  const ensureMuscleGroups = (value: unknown): MuscleGroup[] => {
    if (Array.isArray(value)) {
      const groups = value
        .map((entry: unknown) => normalizeMuscleGroupLabel(entry))
        .filter(Boolean);
      return groups.length > 0 ? groups : ['full-body'];
    }
    if (typeof value === 'string') {
      const group = normalizeMuscleGroupLabel(value);
      return group ? [group] : ['full-body'];
    }
    return ['full-body'];
  };

  const rawReps = raw.reps ?? raw.repRange ?? raw.repetitions;
  // Support restSeconds from AI output, and rest/restPeriod/recovery as fallbacks
  const rawRest = raw.restSeconds ?? raw.rest ?? raw.restPeriod ?? raw.recovery;
  const rawSets = raw.sets ?? raw.series ?? raw.scheme;

  // Parse rest seconds from exercise-level field (AI outputs restSeconds as number)
  const restSeconds = parseFirstNumber(rawRest) ?? DEFAULT_SET.rest;
  const repsNumber = parseFirstNumber(rawReps);

  // Parse range values from AI output (repsMax, weightMax, rpeMax, intensityPercentMax)
  const repsMaxNumber = parseFirstNumber(raw.repsMax);
  const rawWeight = parseFirstNumber(raw.weight);
  const rawWeightMax = parseFirstNumber(raw.weightMax);
  const rawRpe = parseFirstNumber(raw.rpe);
  const rawRpeMax = parseFirstNumber(raw.rpeMax);
  const rawIntensityPercent = parseFirstNumber(raw.intensityPercent);
  const rawIntensityPercentMax = parseFirstNumber(raw.intensityPercentMax);

  let sets: ExerciseSet[] = [];
  if (Array.isArray(rawSets)) {
    sets = normalizeExerciseSets(rawSets).map((set: ExerciseSet) => {
      // Sincronizza sempre kg e lbs quando normalizziamo
      const weight = set.weight ?? rawWeight ?? null;
      const syncedWeight =
        weight && !set.weightLbs
          ? { weight, weightLbs: kgToLbs(weight) }
          : set.weightLbs && !weight
            ? { weight: lbsToKg(set.weightLbs), weightLbs: set.weightLbs }
            : { weight, weightLbs: set.weightLbs };

      return {
        reps: set.reps ?? repsNumber,
        repsMax: set.repsMax ?? repsMaxNumber,
        duration: set.duration,
        weight: syncedWeight.weight,
        weightMax: set.weightMax ?? rawWeightMax,
        weightLbs: syncedWeight.weightLbs,
        rest: set.rest ?? restSeconds,
        intensityPercent: set.intensityPercent ?? rawIntensityPercent ?? null,
        intensityPercentMax: set.intensityPercentMax ?? rawIntensityPercentMax,
        rpe: set.rpe ?? rawRpe ?? null,
        rpeMax: set.rpeMax ?? rawRpeMax,
      };
    });
  } else if (typeof rawSets === 'number' && Number.isFinite(rawSets) && rawSets > 0) {
    // Se sets è un numero, crea array di sets con valori default
    // This handles AI output where sets is a count, not an array
    const weight = rawWeight ?? null;
    const weightLbs = weight ? kgToLbs(weight) : null;

    sets = Array.from({ length: Math.max(1, Math.floor(rawSets)) }, () => ({
      reps: repsNumber,
      repsMax: repsMaxNumber,
      rest: restSeconds,
      weight,
      weightMax: rawWeightMax,
      weightLbs,
      intensityPercent: rawIntensityPercent ?? null,
      intensityPercentMax: rawIntensityPercentMax,
      rpe: rawRpe ?? null,
      rpeMax: rawRpeMax,
    }));
  } else {
    sets = [{ ...DEFAULT_SET }];
  }

  return {
    id,
    name,
    description,
    category: normalizeCategoryLabel(raw.category ?? raw.type),
    muscleGroups: ensureMuscleGroups(raw.muscleGroups ?? raw.targetMuscles ?? raw.muscleGroup),
    // SSOT: Non più sets legacy, solo setGroups
    notes: ensureString(raw.coachingTips ?? raw.notes ?? raw.cues ?? ''),
    typeLabel: ensureString(raw.type ?? raw.exerciseType ?? ''),
    repRange:
      typeof rawReps === 'string' ? rawReps : repsNumber !== undefined ? `${repsNumber}` : '',
    formCues: Array.isArray(raw.formCues)
      ? raw.formCues.map((cue: unknown) => ensureString(cue)).filter(Boolean)
      : typeof raw.formCues === 'string'
        ? raw.formCues
            .split(/\r?\n|\./)
            .map((entry: unknown) => ensureString(entry).trim())
            .filter(Boolean)
        : [],
    equipment: Array.isArray(raw.equipment)
      ? raw.equipment.map((item: unknown) => ensureString(item)).filter(Boolean)
      : typeof raw.equipment === 'string'
        ? raw.equipment
            .split(/,|\//)
            .map((entry: unknown) => ensureString(entry).trim())
            .filter(Boolean)
        : [],
    // catalogExerciseId: ID dell'esercizio nel catalogo database
    // Legge da catalogExerciseId o exerciseId (legacy in JSON stored)
    catalogExerciseId:
      typeof raw.catalogExerciseId === 'string' && raw.catalogExerciseId.length > 0
        ? raw.catalogExerciseId
        : typeof raw.exerciseId === 'string' && raw.exerciseId.length > 0
          ? raw.exerciseId
          : '',
    setGroups: (() => {
      // Normalizza gruppi di serie se presenti
      if (raw.setGroups && Array.isArray(raw.setGroups)) {
        const groups = raw.setGroups
          .map((g: unknown) => normalizeSetGroup(g))
          .filter((g): g is SetGroup => g !== null);
        if (groups.length > 0) return groups;
      }

      // Fallback: se non ci sono gruppi ma ci sono serie, crea un gruppo di default
      // Questo gestisce legacy data e output AI che non producono setGroups
      if (sets.length > 0) {
        const baseSet = { ...sets[0] };
        // Ensure strictly typed properties for SetGroup baseSet
        const cleanBaseSet: ExerciseSet = {
          reps: baseSet.reps,
          repsMax: baseSet.repsMax,
          duration: baseSet.duration,
          weight: baseSet.weight ?? null,
          weightMax: baseSet.weightMax ?? null,
          weightLbs: baseSet.weightLbs ?? null,
          rest: baseSet.rest ?? DEFAULT_SET.rest,
          intensityPercent: baseSet.intensityPercent ?? null,
          intensityPercentMax: baseSet.intensityPercentMax,
          rpe: baseSet.rpe ?? null,
          rpeMax: baseSet.rpeMax,
          notes: baseSet.notes,
        };

        return [
          {
            id: createId(),
            count: sets.length,
            baseSet: cleanBaseSet,
            sets: sets,
          },
        ];
      }

      return [];
    })(),
    variation: (() => {
      // Gestisci variation come oggetto multilingue
      if (raw.variation && typeof raw.variation === 'object' && !Array.isArray(raw.variation)) {
        // Se è già un oggetto Record<string, string>, mantenerlo
        const variation = raw.variation as Record<string, unknown>;
        const result: Record<string, string> = {};
        for (const [locale, value] of Object.entries(variation)) {
          if (typeof value === 'string') {
            result[locale] = value;
          }
        }
        // Assicura presenza di almeno 'en' (fallback a stringa vuota se mancante)
        if (!result.en) {
          result.en = '';
        }
        return result;
      }
      // Se è una stringa, convertirla in oggetto
      if (typeof raw.variation === 'string' && raw.variation.trim().length > 0) {
        return { en: raw.variation.trim(), it: raw.variation.trim() };
      }
      // Default: oggetto vuoto con almeno 'en'
      return { en: '' };
    })(),
  };
}
