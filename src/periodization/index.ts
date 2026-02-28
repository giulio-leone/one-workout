/**
 * Periodization Module
 *
 * Domain model and pure engine for workout periodization.
 * No database dependencies — operates on in-memory types only.
 */

// Domain types
export type {
  TrainingPhase,
  PeriodizationModel,
  ExperienceLevel,
  PhaseConfig,
  MesocycleConfig,
  MacrocycleConfig,
  ProgramPeriodization,
  PerformanceBaseline,
  WeekPeriodization,
  DeloadSignals,
  DeloadRecommendation,
  DeloadStrategy,
} from './types';

// Engine service
export {
  createMesocycle,
  getPhaseForWeek,
  getWeekPeriodization,
  advanceWeek,
  evaluateDeload,
  generatePhaseSequence,
  applyPeriodizationToWeeks,
} from './periodization.service';

// AI generation integration
export {
  buildPeriodizationContext,
  enrichGeneratedProgram,
  suggestPeriodizationModel,
} from './integration';

export type {
  PeriodizationContext,
  BuildPeriodizationContextParams,
  GeneratedWeek,
  GeneratedProgram,
  EnrichedProgram,
} from './integration';

// Preset templates
export {
  PRESET_IDS,
  LINEAR_STRENGTH_8W,
  HYPERTROPHY_BLOCK_6W,
  POWER_PEAK_4W,
  GENERAL_FITNESS_4W,
  DUP_4W,
  PRESET_MESOCYCLES,
  getPresetMesocycle,
  listPresets,
} from './presets';
