/**
 * Workout Generation Local Tools
 *
 * AI SDK v6 format tools for workout calculations.
 * These tools allow the AI to perform precise calculations
 * that would be error-prone if done by the LLM.
 *
 * Format: { description, inputSchema, execute }
 */

import { z } from 'zod';

// =============================================================================
// Calculate Volume
// =============================================================================

export const calculateVolume = {
  description: 'Calculate total weekly volume (sets) per muscle group from a list of exercises.',
  inputSchema: z.object({
    sets: z.array(
      z.object({
        exerciseName: z.string(),
        targetMuscles: z.array(z.string()),
        numSets: z.number(),
      })
    ),
  }),
  execute: async ({
    sets,
  }: {
    sets: Array<{ exerciseName: string; targetMuscles: string[]; numSets: number }>;
  }) => {
    const volumeByMuscle: Record<string, number> = {};

    for (const exercise of sets) {
      for (const muscle of exercise.targetMuscles) {
        const normalized = muscle.toLowerCase();
        volumeByMuscle[normalized] = (volumeByMuscle[normalized] ?? 0) + exercise.numSets;
      }
    }

    return volumeByMuscle;
  },
};

// =============================================================================
// Calculate Progression Multiplier
// =============================================================================

export const calculateProgression = {
  description: 'Calculate volume and intensity multipliers based on training phase.',
  inputSchema: z.object({
    weekNumber: z.number(),
    phase: z.enum(['accumulation', 'intensification', 'realization', 'deload']),
    baseVolume: z.number().optional().default(100),
    baseIntensity: z.number().optional().default(100),
  }),
  execute: async ({
    phase,
    baseVolume = 100,
    baseIntensity = 100,
  }: {
    weekNumber: number;
    phase: 'accumulation' | 'intensification' | 'realization' | 'deload';
    baseVolume?: number;
    baseIntensity?: number;
  }) => {
    const phaseMultipliers = {
      accumulation: { volume: 1.0, intensity: 0.75 },
      intensification: { volume: 0.85, intensity: 0.9 },
      realization: { volume: 0.65, intensity: 0.97 },
      deload: { volume: 0.5, intensity: 0.6 },
    };

    const multipliers = phaseMultipliers[phase];

    return {
      volumeMultiplier: (baseVolume / 100) * multipliers.volume,
      intensityMultiplier: (baseIntensity / 100) * multipliers.intensity,
    };
  },
};

// =============================================================================
// Estimate 1RM
// =============================================================================

export const estimateOneRepMax = {
  description: 'Estimate 1RM from a weight and rep performance, optionally with RPE.',
  inputSchema: z.object({
    weight: z.number().describe('Weight lifted'),
    reps: z.number().describe('Reps performed'),
    rpe: z.number().optional().describe('RPE if available'),
  }),
  execute: async ({ weight, reps, rpe }: { weight: number; reps: number; rpe?: number }) => {
    // Epley formula (most accurate for 1-10 reps)
    if (reps <= 10) {
      const e1rm = weight * (1 + reps / 30);

      // Adjust for RPE if provided (each RPE point ≈ 3%)
      const rpeAdjustment = rpe ? 1 + (10 - rpe) * 0.03 : 1;

      return {
        estimated1RM: Math.round(e1rm * rpeAdjustment * 10) / 10,
        formula: 'Epley' + (rpe ? ' + RPE adjustment' : ''),
      };
    }

    // Brzycki formula (better for higher reps)
    const b1rm = weight / (1.0278 - 0.0278 * reps);
    return {
      estimated1RM: Math.round(b1rm * 10) / 10,
      formula: 'Brzycki',
    };
  },
};

// =============================================================================
// Calculate Working Weight
// =============================================================================

export const calculateWorkingWeight = {
  description: 'Calculate appropriate working weight given 1RM, target reps, and target RPE.',
  inputSchema: z.object({
    oneRepMax: z.number(),
    targetReps: z.number(),
    targetRPE: z.number().optional().default(8),
  }),
  execute: async ({
    oneRepMax,
    targetReps,
    targetRPE = 8,
  }: {
    oneRepMax: number;
    targetReps: number;
    targetRPE?: number;
  }) => {
    // Base percentage from rep target (Epley inverse)
    const basePercent = 1 / (1 + targetReps / 30);

    // RPE adjustment (target RPE 10 = no adjustment)
    const rpeAdjustment = 1 - (10 - targetRPE) * 0.03;

    const percentOf1RM = basePercent * rpeAdjustment;
    const weight = Math.round((oneRepMax * percentOf1RM) / 2.5) * 2.5; // Round to 2.5kg

    return {
      weight,
      percentOf1RM: Math.round(percentOf1RM * 100),
    };
  },
};

// =============================================================================
// Exercise Match (Fuzzy ID Matching)
// =============================================================================

export const exerciseMatch = {
  description:
    'Find the correct exercise ID from catalog by fuzzy matching name. Returns best match with confidence.',
  inputSchema: z.object({
    searchName: z.string().describe('Exercise name to search for'),
    catalog: z
      .array(
        z.object({
          id: z.string(),
          name: z.string(),
        })
      )
      .describe('Available exercises catalog'),
  }),
  execute: async ({
    searchName,
    catalog,
  }: {
    searchName: string;
    catalog: Array<{ id: string; name: string }>;
  }) => {
    const normalized = searchName.toLowerCase().trim();

    // Exact match first
    const exactMatch = catalog.find((e: any) => e.name.toLowerCase() === normalized);
    if (exactMatch) {
      return { match: exactMatch, confidence: 1.0, method: 'exact' };
    }

    // Contains match
    const containsMatch = catalog.find((e: any) => e.name.toLowerCase().includes(normalized) || normalized.includes(e.name.toLowerCase())
    );
    if (containsMatch) {
      return { match: containsMatch, confidence: 0.8, method: 'contains' };
    }

    // Word overlap match
    const searchWords = normalized.split(/\s+/);
    let bestMatch = null;
    let bestScore = 0;

    for (const exercise of catalog) {
      const exerciseWords = exercise.name.toLowerCase().split(/\s+/);
      const overlap = searchWords.filter((w: any) =>
        exerciseWords.some((ew) => ew.includes(w) || w.includes(ew))
      );
      const score = overlap.length / Math.max(searchWords.length, exerciseWords.length);

      if (score > bestScore) {
        bestScore = score;
        bestMatch = exercise;
      }
    }

    if (bestMatch && bestScore >= 0.5) {
      return { match: bestMatch, confidence: bestScore, method: 'fuzzy' };
    }

    return { match: null, confidence: 0, method: 'not_found' };
  },
};

// =============================================================================
// Analyze Weekly Volume
// =============================================================================

export const analyzeWeeklyVolume = {
  description: 'Analyze volume distribution across muscle groups for a full week.',
  inputSchema: z.object({
    days: z.array(
      z.object({
        dayName: z.string(),
        exercises: z.array(
          z.object({
            name: z.string(),
            targetMuscles: z.array(z.string()),
            sets: z.number(),
          })
        ),
      })
    ),
    // Changed from z.record() to z.array() for Gemini API compatibility
    targetVolume: z
      .array(
        z.object({
          muscle: z.string().describe('Muscle group name'),
          targetSets: z.number().describe('Target sets per week'),
        })
      )
      .optional()
      .describe('Target sets per muscle group'),
  }),
  execute: async ({
    days,
    targetVolume,
  }: {
    days: Array<{
      dayName: string;
      exercises: Array<{ name: string; targetMuscles: string[]; sets: number }>;
    }>;
    targetVolume?: Array<{ muscle: string; targetSets: number }>;
  }) => {
    const volumeByMuscle: Record<string, number> = {};
    const frequencyByMuscle: Record<string, number> = {};

    for (const day of days) {
      const musclesThisDay = new Set<string>();

      for (const exercise of day.exercises) {
        for (const muscle of exercise.targetMuscles) {
          const normalized = muscle.toLowerCase();
          volumeByMuscle[normalized] = (volumeByMuscle[normalized] ?? 0) + exercise.sets;
          musclesThisDay.add(normalized);
        }
      }

      for (const muscle of musclesThisDay) {
        frequencyByMuscle[muscle] = (frequencyByMuscle[muscle] ?? 0) + 1;
      }
    }

    // Calculate deficits/surpluses if target volume provided
    // Convert array format to record for lookup
    const targetVolumeMap: Record<string, number> = {};
    if (targetVolume) {
      for (const t of targetVolume) {
        targetVolumeMap[t.muscle.toLowerCase()] = t.targetSets;
      }
    }

    const analysis: Record<
      string,
      { actual: number; target?: number; frequency: number; status: string }
    > = {};

    for (const [muscle, volume] of Object.entries(volumeByMuscle)) {
      const target = targetVolumeMap[muscle];
      const frequency = frequencyByMuscle[muscle] ?? 0;

      let status = 'adequate';
      if (target) {
        if (volume < target * 0.8) status = 'deficit';
        else if (volume > target * 1.2) status = 'surplus';
      }

      analysis[muscle] = { actual: volume, target, frequency, status };
    }

    return {
      volumeByMuscle,
      frequencyByMuscle,
      analysis,
      totalSets: Object.values(volumeByMuscle).reduce((a: any, b: any) => a + b, 0),
    };
  },
};

// =============================================================================
// All local tools exported for registration
// =============================================================================

export const workoutTools = {
  calculateVolume,
  calculateProgression,
  estimateOneRepMax,
  calculateWorkingWeight,
  exerciseMatch,
  analyzeWeeklyVolume,
};

export default workoutTools;
