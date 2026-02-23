import { DEFAULT_SET, ALLOWED_CATEGORIES, generateSetGroupId } from '@giulio-leone/one-workout';
import {
  ensureArray,
  ensureArrayOfStrings,
  ensureNumber,
  ensureString,
  parseFirstNumber,
} from '@giulio-leone/one-workout/core/utils/type-helpers';
import { getMuscleGroupFromName } from '@giulio-leone/one-workout/core/helpers/utils/muscle-group';
import { kgToLbs, lbsToKg } from '@giulio-leone/lib-shared';
import type {
  Exercise,
  ExerciseSet,
  MuscleGroup,
  SetGroup,
  SetProgression,
} from '@giulio-leone/types/workout';

// Helper per generare ID se mancante
function generateId(base: string): string {
  return `${base}_${Math.random().toString(36).substring(2, 9)}`;
}

type RawJson = Record<string, unknown>;

/**
 * Normalizza i gruppi muscolari da un valore sconosciuto
 */
export function normalizeMuscleGroups(value: unknown): Exercise['muscleGroups'] {
  const rawGroups = ensureArrayOfStrings(value).map((group: string) => group.toLowerCase());
  const filtered = rawGroups
    .map((group) => getMuscleGroupFromName(group))
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
    .map((entry) => {
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

      // Supporto nuovi campi: intensityPercent, rpe, weightLbs
      const intensityPercent =
        raw.intensityPercent !== undefined ? ensureNumber(raw.intensityPercent) : undefined;
      const rpe = raw.rpe !== undefined ? ensureNumber(raw.rpe) : undefined;
      let weightLbs = raw.weightLbs !== undefined ? ensureNumber(raw.weightLbs) : undefined;

      // Sincronizza sempre kg e lbs: se manca weightLbs ma c'è weight, calcolalo
      if (weight !== undefined && weight !== null && weight >= 0 && !weightLbs) {
        weightLbs = kgToLbs(weight);
      } else if (weightLbs && !weight) {
        // Se abbiamo solo lbs, convertiamo in kg (caso raro ma possibile)
        const calculatedWeight = lbsToKg(weightLbs);
        return {
          reps,
          duration: duration || undefined,
          weight: calculatedWeight,
          weightLbs: weightLbs,
          rest,
          intensityPercent,
          rpe,
        } as ExerciseSet;
      }

      return {
        reps,
        duration: duration || undefined,
        weight: weight ?? null,
        weightLbs: weightLbs ?? null,
        rest,
        intensityPercent: intensityPercent ?? null,
        rpe: rpe ?? null,
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
    .map((step) => {
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
 * SSOT: Usa generateSetGroupId per ID coerenti
 */
export function normalizeSetGroup(raw: unknown): SetGroup | null {
  if (!raw || typeof raw !== 'object') return null;

  const group = raw as RawJson;
  const id = typeof group.id === 'string' ? group.id : generateSetGroupId();
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
 * SSOT: Genera sempre setGroups, mai sets flat
 * Se exerciseId è presente, viene preservato per risoluzione futura nel frontend
 */
export function normalizeExercise(
  rawExercise: unknown,
  dayNumber: number,
  index: number
): Exercise {
  const raw =
    rawExercise && typeof rawExercise === 'object' ? (rawExercise as RawJson) : ({} as RawJson);

  const baseId = `exercise_${dayNumber}_${index + 1}`;
  const id = typeof raw.id === 'string' && raw.id.length > 0 ? raw.id : generateId(baseId);

  // Il nome viene da raw.name o risolto dal frontend se exerciseId è presente
  const name = ensureString(
    raw.name ?? raw.title ?? raw.exercise ?? `Esercizio ${index + 1}`,
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
      const groups = value.map((entry) => normalizeMuscleGroupLabel(entry)).filter(Boolean);
      return groups.length > 0 ? groups : ['full-body'];
    }
    if (typeof value === 'string') {
      const group = normalizeMuscleGroupLabel(value);
      return group ? [group] : ['full-body'];
    }
    return ['full-body'];
  };

  const rawReps = raw.reps ?? raw.repRange ?? raw.repetitions;
  const rawRest = raw.rest ?? raw.restPeriod ?? raw.recovery;
  const rawSets = raw.sets ?? raw.series ?? raw.scheme;

  const restSeconds = parseFirstNumber(rawRest) ?? DEFAULT_SET.rest;
  const repsNumber = parseFirstNumber(rawReps);

  // SSOT: Normalizza sempre a setGroups
  let setGroups: SetGroup[] = [];

  // Prima controlla se ci sono già setGroups definiti
  if (raw.setGroups && Array.isArray(raw.setGroups) && raw.setGroups.length > 0) {
    const groups = raw.setGroups
      .map((g) => normalizeSetGroup(g))
      .filter((g): g is SetGroup => g !== null);
    if (groups.length > 0) {
      setGroups = groups;
    }
  }

  // Se non ci sono setGroups, crea da sets legacy o default
  if (setGroups.length === 0) {
    let normalizedSets: ExerciseSet[] = [];

    if (Array.isArray(rawSets)) {
      normalizedSets = normalizeExerciseSets(rawSets).map((set: ExerciseSet) => {
        // Sincronizza sempre kg e lbs quando normalizziamo
        const syncedWeight =
          set.weight !== undefined && set.weight !== null && set.weight >= 0 && !set.weightLbs
            ? { weight: set.weight, weightLbs: kgToLbs(set.weight) }
            : set.weightLbs !== undefined &&
                set.weightLbs !== null &&
                set.weightLbs >= 0 &&
                !set.weight
              ? { weight: lbsToKg(set.weightLbs), weightLbs: set.weightLbs }
              : { weight: set.weight ?? null, weightLbs: set.weightLbs ?? null };

        return {
          reps: set.reps ?? repsNumber,
          duration: set.duration,
          weight: syncedWeight.weight ?? null,
          weightLbs: syncedWeight.weightLbs ?? null,
          rest: set.rest ?? restSeconds,
          intensityPercent: set.intensityPercent ?? null,
          rpe: set.rpe ?? null,
        };
      });
    }

    if (normalizedSets.length === 0) {
      normalizedSets = [{ ...DEFAULT_SET }];
    }

    // Raggruppa serie identiche in SetGroup
    // Per semplicità, crea un singolo SetGroup con tutte le serie
    const baseSet = normalizedSets[0] || { ...DEFAULT_SET };
    setGroups = [
      {
        id: generateSetGroupId(),
        count: normalizedSets.length,
        baseSet,
        sets: normalizedSets,
      },
    ];
  }

  return {
    id,
    name,
    description,
    category: normalizeCategoryLabel(raw.category ?? raw.type),
    muscleGroups: ensureMuscleGroups(raw.muscleGroups ?? raw.targetMuscles ?? raw.muscleGroup),
    setGroups,
    notes: ensureString(raw.coachingTips ?? raw.notes ?? raw.cues ?? ''),
    typeLabel: ensureString(raw.type ?? raw.exerciseType ?? ''),
    repRange:
      typeof rawReps === 'string' ? rawReps : repsNumber !== undefined ? `${repsNumber}` : '',
    formCues: Array.isArray(raw.formCues)
      ? raw.formCues.map((cue) => ensureString(cue)).filter(Boolean)
      : typeof raw.formCues === 'string'
        ? raw.formCues
            .split(/\r?\n|\./)
            .map((entry) => ensureString(entry).trim())
            .filter(Boolean)
        : [],
    equipment: Array.isArray(raw.equipment)
      ? raw.equipment.map((item) => ensureString(item)).filter(Boolean)
      : typeof raw.equipment === 'string'
        ? raw.equipment
            .split(/,|\//)
            .map((entry) => ensureString(entry).trim())
            .filter(Boolean)
        : [],
    catalogExerciseId:
      typeof raw.exerciseId === 'string' && raw.exerciseId.length > 0
        ? raw.exerciseId
        : typeof raw.catalogExerciseId === 'string' && raw.catalogExerciseId.length > 0
          ? raw.catalogExerciseId
          : '',
    variation: (() => {
      // Gestisci variation come oggetto multilingue (solo oggetti supportati)
      if (raw.variation && typeof raw.variation === 'object' && !Array.isArray(raw.variation)) {
        const variation = raw.variation as Record<string, unknown>;
        const result: Record<string, string> = {};
        for (const [locale, value] of Object.entries(variation)) {
          if (typeof value === 'string') {
            result[locale] = value;
          }
        }
        // Assicura presenza di almeno 'en'
        if (!result.en) {
          result.en = '';
        }
        return result;
      }
      // Default: oggetto vuoto con almeno 'en'
      return { en: '' };
    })(),
  };
}
