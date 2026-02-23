/**
 * Exercise Matcher Utility
 *
 * Deterministic algorithm to match exercise names to catalog IDs.
 * Acts as a correction layer when AI generates incorrect or invented IDs.
 *
 * @module workout/agents/utils/exercise-matcher
 */

// Logger interface to avoid circular dependencies
interface MatcherLogger {
  info: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
}

export interface CatalogExercise {
  id: string;
  name: string;
  category: string;
  targetMuscles: string[];
  equipment: string[];
}

export interface MatchResult {
  exerciseId: string;
  exerciseName: string;
  matchType: 'exact' | 'normalized' | 'fuzzy' | 'partial' | 'category_fallback';
  confidence: number; // 0-1
  originalId?: string; // The ID the AI provided (for logging)
  wasCorrection: boolean;
}

/**
 * Calculate Levenshtein distance between two strings.
 * Used for fuzzy matching.
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0]![j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i]![j] = matrix[i - 1]![j - 1]!;
      } else {
        matrix[i]![j] = Math.min(
          matrix[i - 1]![j - 1]! + 1, // substitution
          matrix[i]![j - 1]! + 1, // insertion
          matrix[i - 1]![j]! + 1 // deletion
        );
      }
    }
  }

  return matrix[b.length]![a.length]!;
}

/**
 * Normalize exercise name for comparison.
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\(.*?\)/g, '') // Remove parenthetical content
    .replace(/[^a-z0-9\s]/g, '') // Remove special characters
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

/**
 * ExerciseMatcher - Deterministic exercise ID resolution
 */
export class ExerciseMatcher {
  private catalog: CatalogExercise[];
  private catalogByName: Map<string, CatalogExercise>;
  private catalogByNormalizedName: Map<string, CatalogExercise>;
  private catalogById: Map<string, CatalogExercise>;
  private logger?: MatcherLogger;

  constructor(catalog: CatalogExercise[], logger?: MatcherLogger) {
    this.catalog = catalog;
    this.logger = logger;
    this.catalogByName = new Map();
    this.catalogByNormalizedName = new Map();
    this.catalogById = new Map();

    // Build lookup maps
    for (const ex of catalog) {
      this.catalogByName.set(ex.name.toLowerCase(), ex);
      this.catalogByNormalizedName.set(normalizeName(ex.name), ex);
      this.catalogById.set(ex.id, ex);
    }

    // 📊 DIAGNOSTIC: Log matcher initialization
    this.logger?.info('📊 Matcher initialized', {
      step: 'ExerciseMatcher',
      catalogSize: catalog.length,
      uniqueNames: this.catalogByName.size,
      uniqueNormalizedNames: this.catalogByNormalizedName.size,
    });
  }

  /**
   * Check if an exerciseId is valid (exists in catalog)
   */
  isValidId(exerciseId: string): boolean {
    return this.catalogById.has(exerciseId);
  }

  /**
   * Match an exercise name to the catalog and return the correct ID.
   *
   * @param name - The exercise name from AI output
   * @param providedId - The ID the AI provided (may be invented)
   * @param category - Optional category hint for fallback matching
   * @param targetMuscles - Optional muscle hints for fallback matching
   */
  match(
    name: string,
    providedId?: string,
    category?: string,
    targetMuscles?: string[]
  ): MatchResult {
    // 1. First, check if the provided ID is actually valid
    if (providedId && this.catalogById.has(providedId)) {
      const catalogEx = this.catalogById.get(providedId)!;
      return {
        exerciseId: providedId,
        exerciseName: catalogEx.name,
        matchType: 'exact',
        confidence: 1.0,
        originalId: providedId,
        wasCorrection: false,
      };
    }

    // 2. Exact name match (case-insensitive)
    const lowerName = name.toLowerCase();
    if (this.catalogByName.has(lowerName)) {
      const catalogEx = this.catalogByName.get(lowerName)!;
      return {
        exerciseId: catalogEx.id,
        exerciseName: catalogEx.name,
        matchType: 'exact',
        confidence: 1.0,
        originalId: providedId,
        wasCorrection: !!providedId,
      };
    }

    // 3. Normalized name match
    const normalizedName = normalizeName(name);
    if (this.catalogByNormalizedName.has(normalizedName)) {
      const catalogEx = this.catalogByNormalizedName.get(normalizedName)!;
      return {
        exerciseId: catalogEx.id,
        exerciseName: catalogEx.name,
        matchType: 'normalized',
        confidence: 0.95,
        originalId: providedId,
        wasCorrection: !!providedId,
      };
    }

    // 4. Fuzzy match by Levenshtein distance
    let bestFuzzyMatch: CatalogExercise | null = null;
    let bestDistance = Infinity;

    for (const ex of this.catalog) {
      const distance = levenshteinDistance(normalizedName, normalizeName(ex.name));
      if (distance < bestDistance) {
        bestDistance = distance;
        bestFuzzyMatch = ex;
      }
    }

    // Accept fuzzy match if distance is small enough (< 5 chars different)
    if (bestFuzzyMatch && bestDistance <= 5) {
      return {
        exerciseId: bestFuzzyMatch.id,
        exerciseName: bestFuzzyMatch.name,
        matchType: 'fuzzy',
        confidence: Math.max(0.5, 1 - bestDistance * 0.1),
        originalId: providedId,
        wasCorrection: !!providedId,
      };
    }

    // 5. Partial match (one contains the other)
    for (const ex of this.catalog) {
      const exNorm = normalizeName(ex.name);
      if (normalizedName.includes(exNorm) || exNorm.includes(normalizedName)) {
        return {
          exerciseId: ex.id,
          exerciseName: ex.name,
          matchType: 'partial',
          confidence: 0.7,
          originalId: providedId,
          wasCorrection: !!providedId,
        };
      }
    }

    // 6. Category + muscle fallback
    if (category || targetMuscles?.length) {
      const candidates = this.catalog.filter((ex) => {
        const categoryMatch = !category || ex.category === category;
        const muscleMatch =
          !targetMuscles?.length ||
          targetMuscles.some((m) =>
            ex.targetMuscles.some((tm) => tm.toLowerCase().includes(m.toLowerCase()))
          );
        return categoryMatch && muscleMatch;
      });

      if (candidates.length > 0) {
        // Pick the first one as fallback
        const fallback = candidates[0]!;
        return {
          exerciseId: fallback.id,
          exerciseName: fallback.name,
          matchType: 'category_fallback',
          confidence: 0.3,
          originalId: providedId,
          wasCorrection: true,
        };
      }
    }

    // 7. Last resort: return first exercise in catalog (should never happen)
    const lastResort = this.catalog[0]!;
    return {
      exerciseId: lastResort.id,
      exerciseName: lastResort.name,
      matchType: 'category_fallback',
      confidence: 0.1,
      originalId: providedId,
      wasCorrection: true,
    };
  }

  /**
   * Process an array of exercises and correct any invalid IDs.
   * Returns the corrected exercises and a summary of corrections.
   */
  processExercises(
    exercises: Array<{
      exerciseId?: string;
      name: string;
      category?: string;
      targetMuscles?: string[];
      [key: string]: unknown;
    }>
  ): {
    correctedExercises: Array<{ exerciseId: string; name: string; [key: string]: unknown }>;
    corrections: MatchResult[];
    stats: { total: number; valid: number; corrected: number };
  } {
    const correctedExercises: Array<{ exerciseId: string; name: string; [key: string]: unknown }> =
      [];
    const corrections: MatchResult[] = [];
    let validCount = 0;
    let correctedCount = 0;

    for (const exercise of exercises) {
      const matchResult = this.match(
        exercise.name,
        exercise.exerciseId,
        exercise.category,
        exercise.targetMuscles
      );

      if (matchResult.wasCorrection) {
        correctedCount++;
        corrections.push(matchResult);
      } else {
        validCount++;
      }

      correctedExercises.push({
        ...exercise,
        exerciseId: matchResult.exerciseId,
        name: matchResult.exerciseName, // Use canonical name from catalog
      });
    }

    return {
      correctedExercises,
      corrections,
      stats: {
        total: exercises.length,
        valid: validCount,
        corrected: correctedCount,
      },
    };
  }
}

/**
 * Factory function to create an ExerciseMatcher from orchestrator input
 */
export function createExerciseMatcher(
  catalog: Array<{
    id: string;
    name: string;
    category: string;
    targetMuscles: string[];
    equipment: string[];
  }>,
  logger?: MatcherLogger
): ExerciseMatcher {
  return new ExerciseMatcher(catalog, logger);
}
