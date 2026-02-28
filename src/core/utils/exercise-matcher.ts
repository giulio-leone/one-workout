/**
 * Exercise Matcher Utility (Lightweight)
 *
 * Deterministic algorithm to match exercise names to catalog IDs.
 * Acts as a correction layer when AI generates incorrect or invented IDs.
 *
 * Features:
 * - Levenshtein distance for fuzzy matching
 * - Multi-level matching: exact -> normalized -> fuzzy -> partial -> category fallback
 * - No database access required (works with in-memory catalog)
 *
 * @module one-workout/core/utils/exercise-matcher
 * @since v5.1
 */

// ==================== CONSTANTS ====================

/**
 * Maximum Levenshtein distance for fuzzy matching.
 * A lower value means stricter matching (fewer false positives).
 * A higher value means more lenient matching (may match unrelated exercises).
 */
const FUZZY_MATCH_MAX_DISTANCE = 5;

/**
 * Confidence score reduction per Levenshtein distance unit.
 * At max distance (5), confidence will be: 1 - (5 * 0.1) = 0.5
 */
const CONFIDENCE_REDUCTION_PER_DISTANCE = 0.1;

/**
 * Minimum confidence score for fuzzy matches.
 */
const FUZZY_MATCH_MIN_CONFIDENCE = 0.5;

/**
 * Logger interface to avoid dependencies
 */
export interface MatcherLogger {
  info: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
}

/**
 * Exercise from the catalog with minimal required fields
 */
export interface CatalogExercise {
  id: string;
  name: string;
  category?: string;
  targetMuscles?: string[];
  equipment?: string[];
}

/**
 * Result of matching an exercise
 */
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
 *
 * Matching pipeline:
 * 1. Validate provided ID (if any)
 * 2. Exact name match (case-insensitive)
 * 3. Normalized name match
 * 4. Fuzzy match (Levenshtein distance <= FUZZY_MATCH_MAX_DISTANCE)
 * 5. Partial match (substring)
 * 6. Category + muscle fallback
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

    this.logger?.info('ExerciseMatcher initialized', {
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
   * Get exercise by ID
   */
  getById(exerciseId: string): CatalogExercise | undefined {
    return this.catalogById.get(exerciseId);
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

    // Accept fuzzy match if distance is small enough
    if (bestFuzzyMatch && bestDistance <= FUZZY_MATCH_MAX_DISTANCE) {
      return {
        exerciseId: bestFuzzyMatch.id,
        exerciseName: bestFuzzyMatch.name,
        matchType: 'fuzzy',
        confidence: Math.max(
          FUZZY_MATCH_MIN_CONFIDENCE,
          1 - bestDistance * CONFIDENCE_REDUCTION_PER_DISTANCE
        ),
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
      const candidates = this.catalog.filter((ex: any) => {
        const categoryMatch = !category || ex.category === category;
        const muscleMatch =
          !targetMuscles?.length ||
          targetMuscles.some((m) =>
            ex.targetMuscles?.some((tm: string) => tm.toLowerCase().includes(m.toLowerCase()))
          );
        return categoryMatch && muscleMatch;
      });

      if (candidates.length > 0) {
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

    // 7. Last resort: return first exercise in catalog (should never happen in production)
    if (this.catalog.length > 0) {
      const lastResort = this.catalog[0]!;
      this.logger?.warn('ExerciseMatcher: Using last resort fallback', {
        originalName: name,
        providedId,
        fallbackExercise: lastResort.name,
      });
      return {
        exerciseId: lastResort.id,
        exerciseName: lastResort.name,
        matchType: 'category_fallback',
        confidence: 0.1,
        originalId: providedId,
        wasCorrection: true,
      };
    }

    // Empty catalog - this is a critical error
    throw new Error('ExerciseMatcher: Empty catalog, cannot match exercises');
  }

  /**
   * Process an array of set groups and correct any invalid exercise IDs.
   * Returns the corrected set groups and correction stats.
   */
  processSetGroups<
    T extends {
      exerciseId: string;
      exerciseName?: string;
      [key: string]: unknown;
    },
  >(
    setGroups: T[]
  ): {
    correctedSetGroups: T[];
    stats: { total: number; valid: number; corrected: number; failed: number };
  } {
    const correctedSetGroups: T[] = [];
    let validCount = 0;
    let correctedCount = 0;

    for (const setGroup of setGroups) {
      const matchResult = this.match(
        setGroup.exerciseName || '',
        setGroup.exerciseId,
        undefined,
        undefined
      );

      if (matchResult.wasCorrection) {
        correctedCount++;
        this.logger?.info('Exercise ID corrected', {
          originalId: setGroup.exerciseId,
          originalName: setGroup.exerciseName,
          newId: matchResult.exerciseId,
          newName: matchResult.exerciseName,
          matchType: matchResult.matchType,
          confidence: matchResult.confidence,
        });
      } else {
        validCount++;
      }

      correctedSetGroups.push({
        ...setGroup,
        exerciseId: matchResult.exerciseId,
        exerciseName: matchResult.exerciseName,
      });
    }

    return {
      correctedSetGroups,
      stats: {
        total: setGroups.length,
        valid: validCount,
        corrected: correctedCount,
        failed: 0, // With fallback, we never truly fail
      },
    };
  }
}

/**
 * Factory function to create an ExerciseMatcher from catalog array
 */
export function createExerciseMatcher(
  catalog: CatalogExercise[],
  logger?: MatcherLogger
): ExerciseMatcher {
  return new ExerciseMatcher(catalog, logger);
}
