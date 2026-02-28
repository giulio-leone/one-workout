/**
 * Exercise Matcher Service
 *
 * Servizio SOTA per il matching intelligente tra nomi esercizi importati
 * e esercizi nel database. Features:
 *
 * - Algoritmo Levenshtein ottimizzato
 * - N-gram index per ricerche O(1)
 * - Multi-level cache (DB, matches, n-grams)
 * - Alias multilingua (IT/EN)
 * - Batch processing parallelo con concurrency limit
 * - Phonetic matching fallback (Soundex-like)
 *
 * @module lib-workout/services/exercise-matcher
 */

import { getExerciseRepo } from '@giulio-leone/core';
import { SimpleCache } from '@giulio-leone/lib-shared';
import { createId } from '@giulio-leone/lib-shared/utils';
import type { ImportedExercise } from '@giulio-leone/schemas';

// ==================== TYPES ====================

/**
 * Risultato del matching per un singolo esercizio
 */
export interface ExerciseMatchResult {
  /** Nome originale dall'import */
  originalName: string;
  /** ID esercizio matchato (null se non trovato) */
  matchedId: string | null;
  /** Nome esercizio matchato */
  matchedName: string | null;
  /** Slug esercizio matchato */
  matchedSlug: string | null;
  /** Confidence del match (0-1) */
  confidence: number;
  /** Flag se è stato trovato un match */
  found: boolean;
  /** Suggerimenti alternativi */
  suggestions: Array<{
    id: string;
    name: string;
    slug: string;
    confidence: number;
  }>;
  /** Metodo usato per il match */
  matchMethod?: 'exact' | 'alias' | 'ngram' | 'fuzzy' | 'phonetic';
}

/**
 * Esercizio dal database per il matching
 */
interface DbExercise {
  id: string;
  slug: string;
  translations: Array<{
    locale: string;
    name: string;
    searchTerms: string[];
  }>;
}

/**
 * Entry nell'indice N-gram
 */
interface NgramIndexEntry {
  exerciseId: string;
  name: string;
  slug: string;
  locale: string;
  normalizedName: string;
  ngrams: Set<string>;
}

// ==================== CACHES ====================

/**
 * Cache per gli esercizi dal database (30 min TTL)
 */
const exerciseCache = new SimpleCache<string, DbExercise[]>({
  max: 10,
  ttl: 1000 * 60 * 30,
});

/**
 * Cache per i risultati di matching individuali (5 min TTL)
 */
const matchCache = new SimpleCache<string, ExerciseMatchResult>({
  max: 1000,
  ttl: 1000 * 60 * 5,
});

/**
 * Cache per l'indice N-gram (30 min TTL, aligned con exerciseCache)
 */
const ngramIndexCache = new SimpleCache<string, Map<string, NgramIndexEntry[]>>({
  max: 5,
  ttl: 1000 * 60 * 30,
});

// ==================== N-GRAM INDEX ====================

/**
 * Genera n-grams da una stringa
 * @param str Stringa da processare
 * @param n Dimensione n-gram (default: 3)
 */
function generateNgrams(str: string, n: number = 3): Set<string> {
  const ngrams = new Set<string>();
  const padded = `$$${str}$$`; // Padding per catturare inizio/fine

  for (let i = 0; i <= padded.length - n; i++) {
    ngrams.add(padded.slice(i, i + n));
  }

  return ngrams;
}

/**
 * Calcola la similarità Jaccard tra due set di n-grams
 */
function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;

  let intersection = 0;
  for (const ngram of a) {
    if (b.has(ngram)) intersection++;
  }

  return intersection / (a.size + b.size - intersection);
}

/**
 * Costruisce l'indice N-gram per tutti gli esercizi
 */
function buildNgramIndex(exercises: DbExercise[]): Map<string, NgramIndexEntry[]> {
  const index = new Map<string, NgramIndexEntry[]>();

  for (const exercise of exercises) {
    for (const translation of exercise.translations) {
      const normalizedName = normalizeName(translation.name);
      const ngrams = generateNgrams(normalizedName);

      const entry: NgramIndexEntry = {
        exerciseId: exercise.id,
        name: translation.name,
        slug: exercise.slug,
        locale: translation.locale,
        normalizedName,
        ngrams,
      };

      // Indicizza ogni n-gram
      for (const ngram of ngrams) {
        if (!index.has(ngram)) {
          index.set(ngram, []);
        }
        index.get(ngram)!.push(entry);
      }

      // Indicizza anche i search terms
      for (const term of translation.searchTerms) {
        const termNormalized = normalizeName(term);
        const termNgrams = generateNgrams(termNormalized);

        for (const ngram of termNgrams) {
          if (!index.has(ngram)) {
            index.set(ngram, []);
          }
          // Evita duplicati
          const existing = index.get(ngram)!;
          if (!existing.some((e) => e.exerciseId === exercise.id && e.name === translation.name)) {
            index.get(ngram)!.push(entry);
          }
        }
      }
    }
  }

  return index;
}

// ==================== PHONETIC MATCHING ====================

/**
 * Genera codice fonetico semplificato (Soundex-like per italiano/inglese)
 */
function phoneticCode(str: string): string {
  const normalized = normalizeName(str).toLowerCase();

  // Mappatura consonanti -> codici
  const consonantMap: Record<string, string> = {
    b: '1',
    f: '1',
    p: '1',
    v: '1',
    c: '2',
    g: '2',
    j: '2',
    k: '2',
    q: '2',
    s: '2',
    x: '2',
    z: '2',
    d: '3',
    t: '3',
    l: '4',
    m: '5',
    n: '5',
    r: '6',
  };

  if (!normalized) return '';

  // Prima lettera + codici consonanti
  let code = normalized[0]!.toUpperCase();
  let lastCode = consonantMap[normalized[0]!] || '';

  for (let i = 1; i < normalized.length && code.length < 4; i++) {
    const char = normalized[i]!;
    const charCode = consonantMap[char];

    if (charCode && charCode !== lastCode) {
      code += charCode;
      lastCode = charCode;
    } else if (!charCode) {
      lastCode = ''; // Vocale resetta il tracking
    }
  }

  // Padding a 4 caratteri
  return (code + '000').slice(0, 4);
}

// ==================== STRING UTILITIES ====================

/**
 * Calcola la distanza di Levenshtein tra due stringhe
 * Ottimizzato con early exit e space optimization
 */
function levenshteinDistance(a: string, b: string): number {
  // Early exit per stringhe identiche
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Early exit se la differenza di lunghezza è troppo grande
  const lengthDiff = Math.abs(a.length - b.length);
  if (lengthDiff > Math.max(a.length, b.length) * 0.5) {
    return Math.max(a.length, b.length);
  }

  // Space-optimized: usa solo 2 righe invece di matrice completa
  let prevRow = new Array(a.length + 1);
  let currRow = new Array(a.length + 1);

  for (let j = 0; j <= a.length; j++) {
    prevRow[j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    currRow[0] = i;

    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        currRow[j] = prevRow[j - 1];
      } else {
        currRow[j] = Math.min(
          prevRow[j - 1] + 1, // substitution
          currRow[j - 1] + 1, // insertion
          prevRow[j] + 1 // deletion
        );
      }
    }

    // Swap rows
    [prevRow, currRow] = [currRow, prevRow];
  }

  return prevRow[a.length];
}

/**
 * Calcola la similarità tra due stringhe (0-1)
 */
function calculateSimilarity(a: string, b: string): number {
  const distance = levenshteinDistance(a.toLowerCase(), b.toLowerCase());
  const maxLength = Math.max(a.length, b.length);
  if (maxLength === 0) return 1;
  return 1 - distance / maxLength;
}

/**
 * Normalizza il nome di un esercizio per il matching
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '') // Rimuovi caratteri speciali
    .replace(/\s+/g, ' ') // Normalizza spazi
    .replace(/\b(con|with|using|su|on|at|per|for|di|of|alla|al|to|the|a|an|un|una|uno)\b/gi, '') // Rimuovi articoli e preposizioni comuni
    .trim();
}

/**
 * Alias comuni per esercizi (italiano -> inglese e viceversa)
 */
const EXERCISE_ALIASES: Record<string, string[]> = {
  // Petto
  'bench press': ['panca piana', 'distensioni su panca', 'panca'],
  'incline bench press': [
    'panca inclinata',
    'distensioni panca inclinata',
    'incline press',
    'panca 30',
    'panca 45',
  ],
  'decline bench press': ['panca declinata', 'distensioni panca declinata', 'decline press'],
  'dumbbell press': ['distensioni manubri', 'panca manubri', 'db press'],
  'chest fly': ['croci', 'aperture', 'fly', 'pectoral fly', 'croci panca'],
  pushup: ['piegamenti', 'flessioni', 'push up', 'push-up'],
  dips: ['parallele', 'dip'],

  // Schiena
  'pull up': ['trazioni', 'chin up', 'pullup', 'pull-up', 'trazioni sbarra'],
  'lat pulldown': ['lat machine', 'pulldown', 'tirare al petto', 'lat pull'],
  row: ['rematore', 'rowing', 'tirate'],
  'bent over row': ['rematore bilanciere', 'barbell row', 'rematore presa prona'],
  'cable row': ['pulley basso', 'seated row', 'seated cable row', 'pulley'],
  'single arm row': ['rematore singolo', 'one arm row', 'rematore manubrio'],
  deadlift: ['stacco', 'stacco da terra', 'dead lift'],

  // Spalle
  'overhead press': ['lento avanti', 'military press', 'shoulder press', 'press spalle'],
  'lateral raise': ['alzate laterali', 'side raise', 'laterali'],
  'front raise': ['alzate frontali', 'frontali'],
  'rear delt fly': ['alzate posteriori', 'reverse fly', 'rear delt'],
  shrugs: ['scrollate', 'shrug', 'scrollate trapezio'],

  // Braccia
  'bicep curl': ['curl bicipiti', 'curl', 'flessione bicipiti'],
  'hammer curl': ['curl martello', 'curl a martello'],
  'tricep extension': ['estensioni tricipiti', 'french press', 'tricep pushdown'],
  'skull crusher': ['french press', 'skull crushers'],

  // Gambe
  squat: ['accosciata', 'squat bilanciere', 'back squat'],
  'front squat': ['squat frontale', 'front squat'],
  'leg press': ['pressa', 'leg press 45', 'pressa gambe'],
  lunge: ['affondi', 'lunges'],
  'leg extension': ['leg extension', 'estensioni quadricipiti'],
  'leg curl': ['leg curl', 'flessioni gambe', 'curl femorali'],
  'romanian deadlift': ['stacco rumeno', 'rdl', 'stacco gambe tese'],
  'calf raise': ['polpacci', 'calf', 'alzate polpacci'],

  // Core
  plank: ['plank', 'tavola'],
  crunch: ['crunch', 'addominali'],
  'russian twist': ['twist russo', 'russian twists'],
  'leg raise': ['alzate gambe', 'leg raises'],
};

/**
 * Costruisce una mappa inversa degli alias
 */
function buildAliasMap(): Map<string, string> {
  const map = new Map<string, string>();

  for (const [canonical, aliases] of Object.entries(EXERCISE_ALIASES)) {
    map.set(normalizeName(canonical), canonical);
    for (const alias of aliases) {
      map.set(normalizeName(alias), canonical);
    }
  }

  return map;
}

const aliasMap = buildAliasMap();

/**
 * Trova il nome canonico di un esercizio usando gli alias
 */
function findCanonicalName(name: string): string | null {
  const normalized = normalizeName(name);
  return aliasMap.get(normalized) || null;
}

/**
 * Exercise Matcher Service
 *
 * SOTA matching engine con multi-level pipeline:
 * 1. Cache hit check
 * 2. Exact match
 * 3. Alias match
 * 4. N-gram index search
 * 5. Fuzzy Levenshtein
 * 6. Phonetic fallback
 */
export class ExerciseMatcherService {
  /** Concurrency limit per batch processing */
  private static readonly BATCH_CONCURRENCY = 10;

  /**
   * Carica tutti gli esercizi dal database per il matching
   */
  static async loadExercises(locale: string = 'en'): Promise<DbExercise[]> {
    const cacheKey = `exercises_${locale}`;
    const cached = exerciseCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const exercises = await getExerciseRepo().findApprovedExercisesWithTranslations();

    const result: DbExercise[] = exercises.map((e) => ({
      id: e.id,
      slug: e.slug,
      translations: e.exercise_translations.map((t) => ({
        locale: t.locale,
        name: t.name,
        searchTerms: t.searchTerms || [],
      })),
    }));

    exerciseCache.set(cacheKey, result);
    return result;
  }

  /**
   * Carica o costruisce l'indice N-gram
   */
  private static async getNgramIndex(locale: string): Promise<Map<string, NgramIndexEntry[]>> {
    const cacheKey = `ngram_${locale}`;
    const cached = ngramIndexCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const exercises = await this.loadExercises(locale);
    const index = buildNgramIndex(exercises);
    ngramIndexCache.set(cacheKey, index);
    return index;
  }

  /**
   * Trova candidati usando l'indice N-gram
   * Riduce drasticamente lo spazio di ricerca
   */
  private static async findCandidatesWithNgram(
    normalizedInput: string,
    locale: string,
    maxCandidates: number = 50
  ): Promise<Array<{ entry: NgramIndexEntry; score: number }>> {
    const index = await this.getNgramIndex(locale);
    const inputNgrams = generateNgrams(normalizedInput);

    // Conta occorrenze di ogni esercizio nei posting lists
    const candidateScores = new Map<string, { entry: NgramIndexEntry; hits: number }>();

    for (const ngram of inputNgrams) {
      const entries = index.get(ngram);
      if (entries) {
        for (const entry of entries) {
          const key = `${entry.exerciseId}_${entry.name}`;
          const existing = candidateScores.get(key);
          if (existing) {
            existing.hits++;
          } else {
            candidateScores.set(key, { entry, hits: 1 });
          }
        }
      }
    }

    // Converti in array e calcola score Jaccard
    const candidates = Array.from(candidateScores.values())
      .map(({ entry }) => ({
        entry,
        score: jaccardSimilarity(inputNgrams, entry.ngrams),
      }))
      .filter((c: any) => c.score > 0.1) // Filtra candidati con score troppo basso
      .sort((a, b) => b.score - a.score)
      .slice(0, maxCandidates);

    return candidates;
  }

  /**
   * Matcha un singolo nome esercizio con il database
   * Pipeline SOTA: cache -> exact -> alias -> ngram -> fuzzy -> phonetic
   */
  static async matchExercise(
    name: string,
    locale: string = 'en',
    threshold: number = 0.7
  ): Promise<ExerciseMatchResult> {
    const normalizedInput = normalizeName(name);

    // 0. Check cache
    const cacheKey = `match_${locale}_${normalizedInput}`;
    const cached = matchCache.get(cacheKey);
    if (cached) {
      return { ...cached, originalName: name };
    }

    const exercises = await this.loadExercises(locale);

    // 1. Match esatto (case-insensitive)
    for (const exercise of exercises) {
      for (const translation of exercise.translations) {
        if (normalizeName(translation.name) === normalizedInput) {
          const result: ExerciseMatchResult = {
            originalName: name,
            matchedId: exercise.id,
            matchedName: translation.name,
            matchedSlug: exercise.slug,
            confidence: 1.0,
            found: true,
            suggestions: [],
            matchMethod: 'exact',
          };
          matchCache.set(cacheKey, result);
          return result;
        }
      }
    }

    // 2. Match tramite alias canonici
    const canonical = findCanonicalName(name);
    if (canonical) {
      for (const exercise of exercises) {
        for (const translation of exercise.translations) {
          const translationCanonical = findCanonicalName(translation.name);
          if (translationCanonical === canonical) {
            const result: ExerciseMatchResult = {
              originalName: name,
              matchedId: exercise.id,
              matchedName: translation.name,
              matchedSlug: exercise.slug,
              confidence: 0.95,
              found: true,
              suggestions: [],
              matchMethod: 'alias',
            };
            matchCache.set(cacheKey, result);
            return result;
          }
        }
      }
    }

    // 3. N-gram index search - riduce candidati da O(n) a O(1)
    const ngramCandidates = await this.findCandidatesWithNgram(normalizedInput, locale);

    // 4. Fuzzy matching sui top candidati N-gram
    const scores: Array<{
      exercise: DbExercise;
      translation: DbExercise['translations'][0];
      similarity: number;
      method: 'ngram' | 'fuzzy';
    }> = [];

    // Prima prova i candidati N-gram (più veloci)
    for (const { entry, score } of ngramCandidates) {
      const exercise = exercises.find((e: any) => e.id === entry.exerciseId);
      if (!exercise) continue;

      const translation = exercise.translations.find((t: any) => t.name === entry.name);
      if (!translation) continue;

      // Affina con Levenshtein
      const levenshteinSim = calculateSimilarity(normalizedInput, entry.normalizedName);
      const combinedScore = score * 0.4 + levenshteinSim * 0.6;

      if (combinedScore >= threshold * 0.7) {
        scores.push({
          exercise,
          translation,
          similarity: combinedScore,
          method: 'ngram',
        });
      }
    }

    // Se non abbiamo abbastanza candidati, fallback a ricerca completa
    if (scores.length < 3) {
      for (const exercise of exercises) {
        for (const translation of exercise.translations) {
          // Skip se già processato via N-gram
          if (
            scores.some(
              (s) => s.exercise.id === exercise.id && s.translation.name === translation.name
            )
          ) {
            continue;
          }

          const nameSimilarity = calculateSimilarity(
            normalizedInput,
            normalizeName(translation.name)
          );

          let searchTermsSimilarity = 0;
          if (translation.searchTerms.length > 0) {
            const maxSearchTermSimilarity = Math.max(
              ...translation.searchTerms.map((term: any) =>
                calculateSimilarity(normalizedInput, normalizeName(term))
              )
            );
            searchTermsSimilarity = maxSearchTermSimilarity;
          }

          const finalSimilarity = Math.max(nameSimilarity, searchTermsSimilarity * 0.9);

          if (finalSimilarity >= threshold * 0.7) {
            scores.push({
              exercise,
              translation,
              similarity: finalSimilarity,
              method: 'fuzzy',
            });
          }
        }
      }
    }

    // 5. Phonetic fallback se nessun buon match
    if (scores.length === 0 || (scores[0] && scores[0].similarity < threshold)) {
      const inputPhonetic = phoneticCode(normalizedInput);

      for (const exercise of exercises) {
        for (const translation of exercise.translations) {
          const translationPhonetic = phoneticCode(normalizeName(translation.name));

          if (inputPhonetic === translationPhonetic && inputPhonetic.length >= 2) {
            // Match fonetico trovato
            const phoneticallyMatched = {
              exercise,
              translation,
              similarity: 0.75, // Confidence fissa per match fonetici
              method: 'fuzzy' as const,
            };

            // Inserisci solo se non già presente
            if (!scores.some((s) => s.exercise.id === exercise.id)) {
              scores.push(phoneticallyMatched);
            }
          }
        }
      }
    }

    // Ordina per similarità decrescente
    scores.sort((a, b) => b.similarity - a.similarity);

    // Prepara suggerimenti (top 5)
    const suggestions = scores.slice(0, 5).map((s: any) => ({
      id: s.exercise.id,
      name: s.translation.name,
      slug: s.exercise.slug,
      confidence: s.similarity,
    }));

    // Se il miglior match supera la soglia, è un match
    const bestMatch = scores[0];
    if (bestMatch && bestMatch.similarity >= threshold) {
      const result: ExerciseMatchResult = {
        originalName: name,
        matchedId: bestMatch.exercise.id,
        matchedName: bestMatch.translation.name,
        matchedSlug: bestMatch.exercise.slug,
        confidence: bestMatch.similarity,
        found: true,
        suggestions: suggestions.slice(1),
        matchMethod: bestMatch.method,
      };
      matchCache.set(cacheKey, result);
      return result;
    }

    // Nessun match trovato
    const result: ExerciseMatchResult = {
      originalName: name,
      matchedId: null,
      matchedName: null,
      matchedSlug: null,
      confidence: bestMatch?.similarity || 0,
      found: false,
      suggestions,
    };
    matchCache.set(cacheKey, result);
    return result;
  }

  /**
   * Matcha un batch di esercizi importati
   * Ottimizzato con concurrency limit e deduplicazione
   */
  static async matchExercises(
    exercises: ImportedExercise[],
    locale: string = 'en',
    threshold: number = 0.7
  ): Promise<Map<string, ExerciseMatchResult>> {
    // Pre-carica esercizi e indice N-gram
    await Promise.all([this.loadExercises(locale), this.getNgramIndex(locale)]);

    const results = new Map<string, ExerciseMatchResult>();
    const uniqueNames = [...new Set(exercises.map((e: any) => e.name))];

    // Batch processing con concurrency limit
    const batches: string[][] = [];
    for (let i = 0; i < uniqueNames.length; i += this.BATCH_CONCURRENCY) {
      batches.push(uniqueNames.slice(i, i + this.BATCH_CONCURRENCY));
    }

    for (const batch of batches) {
      const batchResults = await Promise.all(
        batch.map(async (name) => {
          const result = await this.matchExercise(name, locale, threshold);
          return { name, result };
        })
      );

      for (const { name, result } of batchResults) {
        results.set(name, result);
      }
    }

    return results;
  }

  /**
   * Applica i risultati del matching agli esercizi importati
   */
  static applyMatches(
    exercises: ImportedExercise[],
    matches: Map<string, ExerciseMatchResult>
  ): ImportedExercise[] {
    return exercises.map((exercise: any) => {
      const match = matches.get(exercise.name);
      if (!match) {
        return { ...exercise, notFound: true };
      }

      return {
        ...exercise,
        catalogExerciseId: match.matchedId || undefined,
        matchConfidence: match.confidence,
        notFound: !match.found,
      };
    });
  }

  /**
   * Crea un esercizio non trovato nel database
   * Usato in modalità auto quando createMissingExercises è true
   */
  static async createMissingExercise(
    name: string,
    _sourceFile: string,
    userId: string,
    locale: string = 'en'
  ): Promise<string> {
    // Verifica che non esista già (doppio check)
    const existing = await this.matchExercise(name, locale, 0.95);
    if (existing.found && existing.matchedId) {
      return existing.matchedId;
    }

    // Crea l'esercizio con flag isImported
    const exerciseId = createId();
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    await getExerciseRepo().createExerciseWithTranslation({
      id: exerciseId,
      slug: `imported-${slug}-${Date.now()}`,
      approvalStatus: 'PENDING',
      isUserGenerated: true,
      createdById: userId,
      translation: {
        id: createId(),
        locale: locale,
        name: name,
        searchTerms: [name.toLowerCase()],
      },
    });

    // Invalida tutte le cache
    exerciseCache.clear();
    matchCache.clear();
    ngramIndexCache.clear();

    return exerciseId;
  }

  /**
   * Invalida tutte le cache del matcher
   */
  static invalidateCache(): void {
    exerciseCache.clear();
    matchCache.clear();
    ngramIndexCache.clear();
  }
}
