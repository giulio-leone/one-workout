/**
 * Periodization ↔ AI Generation Integration (M2-I5)
 *
 * Bridges the periodization engine with the workout generation pipeline.
 * - Builds context for AI prompts
 * - Enriches AI-generated programs with periodization data
 * - Suggests the best periodization model based on user profile
 */

import type {
  PeriodizationModel,
  ExperienceLevel,
  MesocycleConfig,
  WeekPeriodization,
} from './types';

import {
  createMesocycle,
  getWeekPeriodization,
} from './periodization.service';

// ==================== TYPES ====================

export interface PeriodizationContext {
  model: PeriodizationModel;
  mesocycle: MesocycleConfig;
  weekConfigs: WeekPeriodization[];
  /** Human-readable instructions for the AI prompt */
  instructions: string;
}

export interface BuildPeriodizationContextParams {
  model?: PeriodizationModel;
  totalWeeks: number;
  goal: string;
  experienceLevel: ExperienceLevel;
  programId?: string;
  programName?: string;
}

/** Minimal week shape expected from AI-generated programs */
export interface GeneratedWeek {
  weekNumber: number;
  [key: string]: unknown;
}

export interface GeneratedProgram {
  weeks: GeneratedWeek[];
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface EnrichedProgram extends Omit<GeneratedProgram, 'weeks' | 'metadata'> {
  weeks: (GeneratedWeek & { periodization: WeekPeriodization })[];
  metadata: Record<string, unknown> & { periodization: MesocycleConfig };
}

// ==================== PUBLIC API ====================

/**
 * Build the periodization context that gets passed to AI generation.
 *
 * If no model is provided, one is auto-suggested based on the user profile.
 */
export function buildPeriodizationContext(
  params: BuildPeriodizationContextParams
): PeriodizationContext {
  const { totalWeeks, goal, experienceLevel, programId, programName } = params;

  const model = params.model ?? suggestPeriodizationModel({ experienceLevel, goal, totalWeeks });

  const mesocycle = createMesocycle({
    id: programId ?? `meso-${Date.now()}`,
    name: programName ?? `${goal} ${model} ${totalWeeks}w`,
    model,
    totalWeeks,
    goal,
    experienceLevel,
  });

  const weekConfigs: WeekPeriodization[] = [];
  for (let w = 1; w <= totalWeeks; w++) {
    weekConfigs.push(getWeekPeriodization(mesocycle, w));
  }

  const instructions = buildInstructions(mesocycle, weekConfigs);

  return { model, mesocycle, weekConfigs, instructions };
}

/**
 * Post-process an AI-generated program to embed periodization data.
 *
 * - Applies volume/intensity multipliers to each week
 * - Tags deload weeks
 * - Stores mesocycle config in program metadata
 */
export function enrichGeneratedProgram(
  program: GeneratedProgram,
  periodization: PeriodizationContext
): EnrichedProgram {
  const enrichedWeeks = program.weeks.map((week) => {
    const weekConfig = periodization.weekConfigs[week.weekNumber - 1];
    if (!weekConfig) {
      throw new RangeError(
        `No periodization config for week ${week.weekNumber} (program has ${periodization.weekConfigs.length} weeks)`
      );
    }
    return { ...week, periodization: weekConfig };
  });

  return {
    ...program,
    weeks: enrichedWeeks,
    metadata: {
      ...(program.metadata ?? {}),
      periodization: periodization.mesocycle,
    },
  };
}

/**
 * Suggest the best periodization model based on user profile.
 *
 * Rules:
 * - Beginner: always linear
 * - Intermediate + hypertrophy: block or undulating → block
 * - Advanced + strength: block
 * - Advanced + power: undulating
 * - Short programs (≤4 weeks): linear or undulating
 * - Long programs (≥8 weeks): block
 */
export function suggestPeriodizationModel(params: {
  experienceLevel: ExperienceLevel;
  goal: string;
  totalWeeks: number;
}): PeriodizationModel {
  const { experienceLevel, goal, totalWeeks } = params;

  // Beginners always get linear
  if (experienceLevel === 'beginner') {
    return 'linear';
  }

  // Short programs: prefer linear or undulating
  if (totalWeeks <= 4) {
    if (goal === 'power') return 'undulating';
    if (goal === 'hypertrophy') return 'undulating';
    return 'linear';
  }

  // Long programs: prefer block
  if (totalWeeks >= 8) {
    return 'block';
  }

  // Intermediate range (5-7 weeks)
  if (experienceLevel === 'intermediate') {
    if (goal === 'hypertrophy') return 'block';
    if (goal === 'power') return 'undulating';
    if (goal === 'strength') return 'linear';
    return 'linear';
  }

  // Advanced / Elite
  if (goal === 'strength') return 'block';
  if (goal === 'power') return 'undulating';
  if (goal === 'hypertrophy') return 'block';

  return 'block';
}

// ==================== INTERNAL ====================

/**
 * Build human-readable AI prompt instructions from a mesocycle config.
 */
function buildInstructions(
  mesocycle: MesocycleConfig,
  weekConfigs: WeekPeriodization[]
): string {
  const lines: string[] = [
    `Periodization model: ${mesocycle.model}`,
    `Goal: ${mesocycle.goal}`,
    `Total weeks: ${mesocycle.totalWeeks}`,
    `Deload frequency: every ${mesocycle.deloadFrequency} weeks`,
    '',
    'Week-by-week periodization:',
  ];

  for (const wc of weekConfigs) {
    const deloadTag = wc.isDeload ? ' [DELOAD]' : '';
    lines.push(
      `  Week ${wc.weekInPhase} of ${wc.phase}${deloadTag}: ` +
      `volume ×${wc.volumeMultiplier.toFixed(2)}, ` +
      `intensity ×${wc.intensityMultiplier.toFixed(2)}, ` +
      `target RPE ${wc.targetRPE}`
    );
  }

  lines.push('');
  lines.push('Phase descriptions:');
  for (const phase of mesocycle.phases) {
    lines.push(
      `  ${phase.phase} (${phase.durationWeeks}w): ${phase.focusDescription ?? 'N/A'}`
    );
  }

  return lines.join('\n');
}
