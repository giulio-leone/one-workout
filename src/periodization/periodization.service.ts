/**
 * Periodization Engine Service
 *
 * Pure domain service — NO database access.
 * Computes phase sequences, week-level periodization data, deload evaluation,
 * and applies volume/intensity multipliers to raw week structures.
 *
 * Other services (workout-generation, persistence) call this and handle storage.
 */

import type {
  TrainingPhase,
  PeriodizationModel,
  ExperienceLevel,
  PhaseConfig,
  MesocycleConfig,
  ProgramPeriodization,
  WeekPeriodization,
  DeloadSignals,
  DeloadRecommendation,
  DeloadStrategy,
} from './types';

// ==================== CONSTANTS ====================

/** Recommended deload frequency by experience level (weeks between deloads) */
const DELOAD_FREQUENCY: Record<ExperienceLevel, number> = {
  beginner: 6,
  intermediate: 5,
  advanced: 4,
  elite: 3,
};

/** RPE thresholds that trigger deload evaluation */
const RPE_DEVIATION_THRESHOLD = 1.0;
const RPE_FATIGUE_THRESHOLD = 9.0;

/** Default volume/intensity modifiers per phase */
const PHASE_DEFAULTS: Record<TrainingPhase, Pick<PhaseConfig, 'volumeMultiplier' | 'intensityMultiplier' | 'rpeRange'>> = {
  accumulation: { volumeMultiplier: 1.1, intensityMultiplier: 0.7, rpeRange: [6, 7.5] },
  intensification: { volumeMultiplier: 0.9, intensityMultiplier: 0.85, rpeRange: [7.5, 8.5] },
  realization: { volumeMultiplier: 0.7, intensityMultiplier: 0.95, rpeRange: [8.5, 9.5] },
  deload: { volumeMultiplier: 0.5, intensityMultiplier: 0.6, rpeRange: [5, 6] },
};

// ==================== PUBLIC API ====================

/**
 * Create a mesocycle configuration from user inputs.
 *
 * If no explicit phases are provided, they are generated via `generatePhaseSequence`.
 */
export function createMesocycle(params: {
  id: string;
  name: string;
  model: PeriodizationModel;
  totalWeeks: number;
  goal: string;
  experienceLevel: ExperienceLevel;
  phases?: PhaseConfig[];
  autoDeloadEnabled?: boolean;
}): MesocycleConfig {
  const {
    id,
    name,
    model,
    totalWeeks,
    goal,
    experienceLevel,
    phases,
    autoDeloadEnabled = true,
  } = params;

  const deloadFrequency = DELOAD_FREQUENCY[experienceLevel];
  const resolvedPhases = phases ?? generatePhaseSequence(model, totalWeeks, goal);

  // Validate that phase durations sum to totalWeeks
  const phaseDurationSum = resolvedPhases.reduce((s, p) => s + p.durationWeeks, 0);
  if (phaseDurationSum !== totalWeeks) {
    throw new Error(
      `Phase durations (${phaseDurationSum}w) do not match totalWeeks (${totalWeeks}w)`
    );
  }

  return {
    id,
    name,
    model,
    phases: resolvedPhases,
    totalWeeks,
    deloadFrequency,
    autoDeloadEnabled,
    goal,
  };
}

/**
 * Determine which phase a given week belongs to.
 * Week numbers are 1-based.
 */
export function getPhaseForWeek(
  mesocycle: MesocycleConfig,
  weekNumber: number
): { phase: PhaseConfig; phaseIndex: number; weekInPhase: number } {
  if (weekNumber < 1 || weekNumber > mesocycle.totalWeeks) {
    throw new RangeError(
      `weekNumber ${weekNumber} out of range [1, ${mesocycle.totalWeeks}]`
    );
  }

  let cumulativeWeeks = 0;
  for (let i = 0; i < mesocycle.phases.length; i++) {
    const phase = mesocycle.phases[i]!;
    if (weekNumber <= cumulativeWeeks + phase.durationWeeks) {
      return {
        phase,
        phaseIndex: i,
        weekInPhase: weekNumber - cumulativeWeeks,
      };
    }
    cumulativeWeeks += phase.durationWeeks;
  }

  // Should never reach here if validation passed
  if (mesocycle.phases.length === 0) {
    throw new Error('Mesocycle has no phases');
  }
  const lastPhase = mesocycle.phases[mesocycle.phases.length - 1]!;
  return {
    phase: lastPhase,
    phaseIndex: mesocycle.phases.length - 1,
    weekInPhase: weekNumber - (mesocycle.totalWeeks - lastPhase.durationWeeks),
  };
}

/**
 * Get full week periodization data for a specific week.
 */
export function getWeekPeriodization(
  mesocycle: MesocycleConfig,
  weekNumber: number
): WeekPeriodization {
  const { phase, weekInPhase } = getPhaseForWeek(mesocycle, weekNumber);
  const [rpeMin, rpeMax] = phase.rpeRange;

  // Linearly interpolate RPE across weeks within the phase
  const rpeProgress = phase.durationWeeks > 1
    ? (weekInPhase - 1) / (phase.durationWeeks - 1)
    : 1.0;
  const targetRPE = Math.round((rpeMin + rpeProgress * (rpeMax - rpeMin)) * 10) / 10;

  return {
    phase: phase.phase,
    weekInPhase,
    volumeMultiplier: phase.volumeMultiplier,
    intensityMultiplier: phase.intensityMultiplier,
    isDeload: phase.phase === 'deload',
    targetRPE,
  };
}

/**
 * Advance program periodization state to the next week.
 * Returns a new state object (immutable).
 */
export function advanceWeek(state: ProgramPeriodization): ProgramPeriodization {
  const { mesocycle, currentWeek } = state;

  if (currentWeek >= mesocycle.totalWeeks) {
    // Program complete — return unchanged
    return { ...state };
  }

  const nextWeek = currentWeek + 1;
  const currentInfo = getPhaseForWeek(mesocycle, currentWeek);
  const nextInfo = getPhaseForWeek(mesocycle, nextWeek);

  const completedPhases = [...state.completedPhases];
  if (nextInfo.phaseIndex !== currentInfo.phaseIndex) {
    // Phase transition — mark current phase as completed
    completedPhases.push(currentInfo.phase.phase);
  }

  const deloadHistory = [...state.deloadHistory];
  if (nextInfo.phase.phase === 'deload' && nextInfo.weekInPhase === 1) {
    deloadHistory.push(nextWeek);
  }

  return {
    ...state,
    currentWeek: nextWeek,
    currentPhaseIndex: nextInfo.phaseIndex,
    completedPhases,
    deloadHistory,
  };
}

/**
 * Evaluate whether a deload is needed based on performance signals.
 */
export function evaluateDeload(
  signals: DeloadSignals,
  config: { deloadFrequency: number; autoDeloadEnabled: boolean }
): DeloadRecommendation {
  if (!config.autoDeloadEnabled) {
    return {
      shouldDeload: false,
      urgency: 'suggested',
      reason: 'Auto-deload is disabled.',
      strategies: [],
    };
  }

  const reasons: string[] = [];
  const strategies: DeloadStrategy[] = [];
  let urgencyScore = 0;

  // 1. Scheduled deload check
  if (config.deloadFrequency > 0 && signals.weeksSinceLastDeload >= config.deloadFrequency) {
    reasons.push(
      `Scheduled deload: ${signals.weeksSinceLastDeload} weeks since last deload ` +
      `(frequency: every ${config.deloadFrequency} weeks).`
    );
    strategies.push('volume_reduction');
    urgencyScore += 2;
  }

  // 2. RPE deviation (fatigue accumulation)
  if (signals.rpeDeviation > RPE_DEVIATION_THRESHOLD) {
    reasons.push(
      `RPE deviation of ${signals.rpeDeviation.toFixed(1)} exceeds threshold (${RPE_DEVIATION_THRESHOLD}).`
    );
    strategies.push('intensity_reduction');
    urgencyScore += 2;
  }

  // 3. Absolute RPE ceiling
  if (signals.averageRPE >= RPE_FATIGUE_THRESHOLD) {
    reasons.push(
      `Average RPE (${signals.averageRPE.toFixed(1)}) at or above fatigue ceiling (${RPE_FATIGUE_THRESHOLD}).`
    );
    strategies.push('volume_reduction', 'intensity_reduction');
    urgencyScore += 3;
  }

  // 4. Low completion rate (possible overreaching)
  if (signals.completionRate < 0.75) {
    reasons.push(
      `Session completion rate (${(signals.completionRate * 100).toFixed(0)}%) is below 75%.`
    );
    strategies.push('frequency_reduction');
    urgencyScore += 1;
  }

  // 5. Performance decline
  if (signals.performanceTrend === 'declining') {
    reasons.push('Performance trend is declining.');
    strategies.push('volume_reduction');
    urgencyScore += 2;
  } else if (signals.performanceTrend === 'stagnating') {
    reasons.push('Performance has stagnated.');
    urgencyScore += 1;
  }

  // Determine urgency
  const shouldDeload = urgencyScore >= 2;
  let urgency: DeloadRecommendation['urgency'];
  if (urgencyScore >= 5) {
    urgency = 'mandatory';
  } else if (urgencyScore >= 3) {
    urgency = 'recommended';
  } else {
    urgency = 'suggested';
  }

  // Deduplicate strategies
  const uniqueStrategies = [...new Set(strategies)] as DeloadStrategy[];

  return {
    shouldDeload,
    urgency,
    reason: reasons.length > 0 ? reasons.join(' ') : 'No deload signals detected.',
    strategies: uniqueStrategies,
  };
}

/**
 * Generate a phase sequence for a given periodization model.
 *
 * Business rules:
 * - Linear:       progressive intensity increase, slight volume decrease each phase
 * - Undulating:   alternating high/low volume/intensity weekly
 * - Block:        distinct blocks (accumulation → intensification → realization)
 * - Autoregulated: moderate baseline; adjusts via deload signals at runtime
 */
export function generatePhaseSequence(
  model: PeriodizationModel,
  totalWeeks: number,
  goal: string
): PhaseConfig[] {
  switch (model) {
    case 'linear':
      return generateLinearSequence(totalWeeks, goal);
    case 'undulating':
      return generateUndulatingSequence(totalWeeks, goal);
    case 'block':
      return generateBlockSequence(totalWeeks, goal);
    case 'autoregulated':
      return generateAutoregulatedSequence(totalWeeks, goal);
    default:
      throw new Error(`Unknown periodization model: ${model}`);
  }
}

/**
 * Apply periodization multipliers to raw week data.
 *
 * Expects an array of week objects with a `weekNumber` field.
 * Returns a new array with `periodization` embedded in each week.
 */
export function applyPeriodizationToWeeks<T extends { weekNumber: number }>(
  weeks: T[],
  mesocycle: MesocycleConfig
): (T & { periodization: WeekPeriodization })[] {
  return weeks.map((week) => {
    const periodization = getWeekPeriodization(mesocycle, week.weekNumber);
    return { ...week, periodization };
  });
}

// ==================== INTERNAL GENERATORS ====================

/**
 * Linear periodization: progressive intensity, decreasing volume.
 * Ends with a 1-week deload if ≥ 4 weeks.
 */
function generateLinearSequence(totalWeeks: number, goal: string): PhaseConfig[] {
  const hasDeload = totalWeeks >= 4;
  const trainingWeeks = hasDeload ? totalWeeks - 1 : totalWeeks;
  const phases: PhaseConfig[] = [];

  if (trainingWeeks <= 2) {
    phases.push(buildPhase('accumulation', trainingWeeks, goal));
  } else if (trainingWeeks <= 4) {
    const accWeeks = Math.ceil(trainingWeeks * 0.6);
    const intWeeks = trainingWeeks - accWeeks;
    phases.push(buildPhase('accumulation', accWeeks, goal));
    phases.push(buildPhase('intensification', intWeeks, goal));
  } else {
    // 3-phase split: ~40% accumulation, ~35% intensification, ~25% realization
    const accWeeks = Math.ceil(trainingWeeks * 0.4);
    const intWeeks = Math.ceil(trainingWeeks * 0.35);
    const realWeeks = trainingWeeks - accWeeks - intWeeks;
    phases.push(buildPhase('accumulation', accWeeks, goal));
    phases.push(buildPhase('intensification', intWeeks, goal));
    if (realWeeks > 0) {
      phases.push(buildPhase('realization', realWeeks, goal));
    }
  }

  if (hasDeload) {
    phases.push(buildPhase('deload', 1, goal));
  }

  return phases;
}

/**
 * Undulating (DUP): alternates volume/intensity emphasis each week.
 * Phases are 1-week micro-cycles: accumulation ↔ intensification.
 */
function generateUndulatingSequence(totalWeeks: number, goal: string): PhaseConfig[] {
  const hasDeload = totalWeeks >= 4;
  const trainingWeeks = hasDeload ? totalWeeks - 1 : totalWeeks;
  const phases: PhaseConfig[] = [];

  for (let w = 0; w < trainingWeeks; w++) {
    const isHighVolume = w % 2 === 0;
    const phase: TrainingPhase = isHighVolume ? 'accumulation' : 'intensification';

    const defaults = PHASE_DEFAULTS[phase];
    phases.push({
      phase,
      durationWeeks: 1,
      volumeMultiplier: defaults.volumeMultiplier,
      intensityMultiplier: defaults.intensityMultiplier,
      rpeRange: defaults.rpeRange,
      focusDescription: isHighVolume
        ? `Week ${w + 1}: High-volume ${goal} focus`
        : `Week ${w + 1}: High-intensity ${goal} focus`,
    });
  }

  if (hasDeload) {
    phases.push(buildPhase('deload', 1, goal));
  }

  return phases;
}

/**
 * Block periodization: distinct blocks focusing on different qualities.
 * accumulation → intensification → realization, with optional deload.
 */
function generateBlockSequence(totalWeeks: number, goal: string): PhaseConfig[] {
  const hasDeload = totalWeeks >= 4;
  const trainingWeeks = hasDeload ? totalWeeks - 1 : totalWeeks;
  const phases: PhaseConfig[] = [];

  if (trainingWeeks <= 2) {
    phases.push(buildPhase('accumulation', trainingWeeks, goal));
  } else if (trainingWeeks <= 4) {
    const accWeeks = Math.ceil(trainingWeeks / 2);
    const intWeeks = trainingWeeks - accWeeks;
    phases.push(buildPhase('accumulation', accWeeks, goal));
    phases.push(buildPhase('intensification', intWeeks, goal));
  } else {
    // Even three-way split
    const accWeeks = Math.ceil(trainingWeeks / 3);
    const intWeeks = Math.ceil((trainingWeeks - accWeeks) / 2);
    const realWeeks = trainingWeeks - accWeeks - intWeeks;
    phases.push(buildPhase('accumulation', accWeeks, goal));
    phases.push(buildPhase('intensification', intWeeks, goal));
    if (realWeeks > 0) {
      phases.push(buildPhase('realization', realWeeks, goal));
    }
  }

  if (hasDeload) {
    phases.push(buildPhase('deload', 1, goal));
  }

  return phases;
}

/**
 * Autoregulated: moderate baseline across all weeks.
 * Real adjustments happen at runtime via deload evaluation.
 * Starts with accumulation, optional deload at the end.
 */
function generateAutoregulatedSequence(totalWeeks: number, goal: string): PhaseConfig[] {
  const hasDeload = totalWeeks >= 4;
  const trainingWeeks = hasDeload ? totalWeeks - 1 : totalWeeks;
  const phases: PhaseConfig[] = [];

  // Single accumulation block with moderate defaults
  phases.push({
    phase: 'accumulation',
    durationWeeks: trainingWeeks,
    volumeMultiplier: 1.0,
    intensityMultiplier: 0.75,
    rpeRange: [6.5, 8],
    focusDescription: `Autoregulated ${goal} training — adapts based on RPE feedback`,
  });

  if (hasDeload) {
    phases.push(buildPhase('deload', 1, goal));
  }

  return phases;
}

// ==================== HELPERS ====================

const PHASE_FOCUS: Record<string, Record<TrainingPhase, string>> = {
  strength: {
    accumulation: 'Build work capacity with moderate loads',
    intensification: 'Increase loads toward competition intensity',
    realization: 'Peak strength — low volume, maximal loads',
    deload: 'Recovery week — light loads, reduced volume',
  },
  hypertrophy: {
    accumulation: 'High-volume training for muscle growth',
    intensification: 'Moderate volume with heavier loads for strength adaptation',
    realization: 'Low-volume, high-intensity peak',
    deload: 'Recovery week — maintain stimulus, reduce fatigue',
  },
  power: {
    accumulation: 'Build strength base with moderate volume',
    intensification: 'Explosive movements with increasing load',
    realization: 'Peak power output — sport-specific intensity',
    deload: 'Active recovery — low-intensity movement',
  },
  default: {
    accumulation: 'General preparatory phase — build volume',
    intensification: 'Progressive overload — increasing intensity',
    realization: 'Performance peak — reduced volume, high intensity',
    deload: 'Recovery and regeneration',
  },
};

function buildPhase(phase: TrainingPhase, durationWeeks: number, goal: string): PhaseConfig {
  const defaults = PHASE_DEFAULTS[phase];
  const focusMap = PHASE_FOCUS[goal] ?? PHASE_FOCUS['default']!;

  return {
    phase,
    durationWeeks,
    volumeMultiplier: defaults.volumeMultiplier,
    intensityMultiplier: defaults.intensityMultiplier,
    rpeRange: defaults.rpeRange,
    focusDescription: focusMap[phase],
  };
}
