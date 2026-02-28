/**
 * Preset Mesocycle Templates
 *
 * Common periodization configurations that can be used out-of-the-box
 * or as starting points for custom mesocycles.
 */

import type { MesocycleConfig } from './types';

// ==================== PRESET IDS ====================

export const PRESET_IDS = {
  LINEAR_STRENGTH_8W: 'preset-linear-strength-8w',
  HYPERTROPHY_BLOCK_6W: 'preset-hypertrophy-block-6w',
  POWER_PEAK_4W: 'preset-power-peak-4w',
  GENERAL_FITNESS_4W: 'preset-general-fitness-4w',
  DUP_4W: 'preset-dup-4w',
} as const;

// ==================== PRESETS ====================

/**
 * Linear Strength (8 weeks)
 * accumulation(3w) → intensification(3w) → realization(1w) → deload(1w)
 *
 * Classic linear progression for intermediate lifters targeting 1RM improvements.
 */
export const LINEAR_STRENGTH_8W: MesocycleConfig = {
  id: PRESET_IDS.LINEAR_STRENGTH_8W,
  name: 'Linear Strength – 8 Weeks',
  model: 'linear',
  totalWeeks: 8,
  deloadFrequency: 4,
  autoDeloadEnabled: true,
  goal: 'strength',
  phases: [
    {
      phase: 'accumulation',
      durationWeeks: 3,
      volumeMultiplier: 1.1,
      intensityMultiplier: 0.7,
      rpeRange: [6, 7.5],
      focusDescription: 'Build work capacity with moderate loads (65-75% 1RM)',
    },
    {
      phase: 'intensification',
      durationWeeks: 3,
      volumeMultiplier: 0.9,
      intensityMultiplier: 0.85,
      rpeRange: [7.5, 8.5],
      focusDescription: 'Increase loads toward competition intensity (80-88% 1RM)',
    },
    {
      phase: 'realization',
      durationWeeks: 1,
      volumeMultiplier: 0.7,
      intensityMultiplier: 0.95,
      rpeRange: [8.5, 9.5],
      focusDescription: 'Peak strength — low volume, maximal loads (90-97% 1RM)',
    },
    {
      phase: 'deload',
      durationWeeks: 1,
      volumeMultiplier: 0.5,
      intensityMultiplier: 0.6,
      rpeRange: [5, 6],
      focusDescription: 'Recovery week — light loads, reduced volume',
    },
  ],
};

/**
 * Hypertrophy Block (6 weeks)
 * accumulation(4w) → deload(1w) → intensification(1w)
 *
 * Volume-focused block for muscle growth, ending with a strength test week.
 */
export const HYPERTROPHY_BLOCK_6W: MesocycleConfig = {
  id: PRESET_IDS.HYPERTROPHY_BLOCK_6W,
  name: 'Hypertrophy Block – 6 Weeks',
  model: 'block',
  totalWeeks: 6,
  deloadFrequency: 5,
  autoDeloadEnabled: true,
  goal: 'hypertrophy',
  phases: [
    {
      phase: 'accumulation',
      durationWeeks: 4,
      volumeMultiplier: 1.2,
      intensityMultiplier: 0.65,
      rpeRange: [6.5, 8],
      focusDescription: 'High-volume training for muscle growth (60-72% 1RM, 10-15 reps)',
    },
    {
      phase: 'deload',
      durationWeeks: 1,
      volumeMultiplier: 0.5,
      intensityMultiplier: 0.6,
      rpeRange: [5, 6],
      focusDescription: 'Recovery — maintain stimulus, reduce fatigue',
    },
    {
      phase: 'intensification',
      durationWeeks: 1,
      volumeMultiplier: 0.8,
      intensityMultiplier: 0.8,
      rpeRange: [7.5, 8.5],
      focusDescription: 'Strength consolidation — moderate volume, heavier loads',
    },
  ],
};

/**
 * Power Peak (4 weeks)
 * intensification(2w) → realization(1w) → deload(1w)
 *
 * Short peaking cycle for athletes approaching competition.
 */
export const POWER_PEAK_4W: MesocycleConfig = {
  id: PRESET_IDS.POWER_PEAK_4W,
  name: 'Power Peak – 4 Weeks',
  model: 'block',
  totalWeeks: 4,
  deloadFrequency: 0, // no auto-deload; deload is built into the plan
  autoDeloadEnabled: false,
  goal: 'power',
  phases: [
    {
      phase: 'intensification',
      durationWeeks: 2,
      volumeMultiplier: 0.85,
      intensityMultiplier: 0.88,
      rpeRange: [8, 9],
      focusDescription: 'Explosive movements with heavy loads (85-92% 1RM)',
    },
    {
      phase: 'realization',
      durationWeeks: 1,
      volumeMultiplier: 0.6,
      intensityMultiplier: 0.95,
      rpeRange: [9, 9.5],
      focusDescription: 'Peak power output — minimal volume, maximal intent',
    },
    {
      phase: 'deload',
      durationWeeks: 1,
      volumeMultiplier: 0.4,
      intensityMultiplier: 0.55,
      rpeRange: [4, 5.5],
      focusDescription: 'Active recovery — light movement, CNS recovery',
    },
  ],
};

/**
 * General Fitness (4 weeks)
 * accumulation(3w) → deload(1w)
 *
 * Simple template for general fitness or beginners.
 */
export const GENERAL_FITNESS_4W: MesocycleConfig = {
  id: PRESET_IDS.GENERAL_FITNESS_4W,
  name: 'General Fitness – 4 Weeks',
  model: 'linear',
  totalWeeks: 4,
  deloadFrequency: 4,
  autoDeloadEnabled: true,
  goal: 'general_fitness',
  phases: [
    {
      phase: 'accumulation',
      durationWeeks: 3,
      volumeMultiplier: 1.0,
      intensityMultiplier: 0.65,
      rpeRange: [5.5, 7],
      focusDescription: 'Build general work capacity with moderate effort',
    },
    {
      phase: 'deload',
      durationWeeks: 1,
      volumeMultiplier: 0.5,
      intensityMultiplier: 0.55,
      rpeRange: [4, 5.5],
      focusDescription: 'Light recovery week — active rest',
    },
  ],
};

/**
 * DUP – Daily Undulating Periodization (4 weeks)
 * Alternating volume/intensity emphasis each week, ending with deload.
 *
 * Week 1: accumulation (high-volume)
 * Week 2: intensification (high-intensity)
 * Week 3: accumulation (high-volume)
 * Week 4: deload
 */
export const DUP_4W: MesocycleConfig = {
  id: PRESET_IDS.DUP_4W,
  name: 'Daily Undulating – 4 Weeks',
  model: 'undulating',
  totalWeeks: 4,
  deloadFrequency: 4,
  autoDeloadEnabled: true,
  goal: 'strength',
  phases: [
    {
      phase: 'accumulation',
      durationWeeks: 1,
      volumeMultiplier: 1.15,
      intensityMultiplier: 0.7,
      rpeRange: [6, 7],
      focusDescription: 'Week 1: High-volume strength focus',
    },
    {
      phase: 'intensification',
      durationWeeks: 1,
      volumeMultiplier: 0.85,
      intensityMultiplier: 0.87,
      rpeRange: [7.5, 8.5],
      focusDescription: 'Week 2: High-intensity strength focus',
    },
    {
      phase: 'accumulation',
      durationWeeks: 1,
      volumeMultiplier: 1.1,
      intensityMultiplier: 0.72,
      rpeRange: [6.5, 7.5],
      focusDescription: 'Week 3: High-volume strength focus (slight progression)',
    },
    {
      phase: 'deload',
      durationWeeks: 1,
      volumeMultiplier: 0.5,
      intensityMultiplier: 0.6,
      rpeRange: [5, 6],
      focusDescription: 'Week 4: Recovery and supercompensation',
    },
  ],
};

// ==================== REGISTRY ====================

/** All preset mesocycles, keyed by their ID */
export const PRESET_MESOCYCLES: Record<string, MesocycleConfig> = {
  [PRESET_IDS.LINEAR_STRENGTH_8W]: LINEAR_STRENGTH_8W,
  [PRESET_IDS.HYPERTROPHY_BLOCK_6W]: HYPERTROPHY_BLOCK_6W,
  [PRESET_IDS.POWER_PEAK_4W]: POWER_PEAK_4W,
  [PRESET_IDS.GENERAL_FITNESS_4W]: GENERAL_FITNESS_4W,
  [PRESET_IDS.DUP_4W]: DUP_4W,
};

/** Get a preset mesocycle by ID. Returns undefined if not found. */
export function getPresetMesocycle(id: string): MesocycleConfig | undefined {
  return PRESET_MESOCYCLES[id];
}

/** List all available preset mesocycle summaries. */
export function listPresets(): Array<{ id: string; name: string; model: string; totalWeeks: number; goal: string }> {
  return Object.values(PRESET_MESOCYCLES).map((m) => ({
    id: m.id,
    name: m.name,
    model: m.model,
    totalWeeks: m.totalWeeks,
    goal: m.goal,
  }));
}
