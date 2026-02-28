/**
 * Periodization Domain Types
 *
 * Core types for the periodization engine.
 * Storage: encoded in workout_programs.metadata JSON field.
 */

// ==================== ENUMS ====================

export type TrainingPhase = 'accumulation' | 'intensification' | 'realization' | 'deload';

export type PeriodizationModel = 'linear' | 'undulating' | 'block' | 'autoregulated';

export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced' | 'elite';

// ==================== PHASE & MESOCYCLE CONFIG ====================

export interface PhaseConfig {
  phase: TrainingPhase;
  durationWeeks: number;
  volumeMultiplier: number; // 1.0 = baseline
  intensityMultiplier: number; // 1.0 = baseline (% of 1RM)
  rpeRange: [number, number]; // e.g., [7, 8.5]
  focusDescription?: string;
}

export interface MesocycleConfig {
  id: string;
  name: string;
  model: PeriodizationModel;
  phases: PhaseConfig[];
  totalWeeks: number;
  deloadFrequency: number; // every N weeks (0 = no auto-deload)
  autoDeloadEnabled: boolean;
  goal: string; // e.g., 'strength', 'hypertrophy', 'power'
}

export interface MacrocycleConfig {
  id: string;
  name: string;
  mesocycles: MesocycleConfig[];
  totalWeeks: number;
  startDate?: string; // ISO date
}

// ==================== PROGRAM PERIODIZATION STATE ====================

/** Stored in workout_programs.metadata */
export interface ProgramPeriodization {
  mesocycle: MesocycleConfig;
  currentWeek: number; // 1-based
  currentPhaseIndex: number; // index into mesocycle.phases
  completedPhases: string[]; // phase names completed
  deloadHistory: number[]; // week numbers when deload happened
  performanceBaseline?: PerformanceBaseline;
}

export interface PerformanceBaseline {
  averageRPE: number;
  averageVolumePerSession: number;
  keyLifts: Record<string, number>; // exerciseId -> 1RM in kg
  recordedAt: string; // ISO date
}

// ==================== WEEK-LEVEL DATA ====================

/** Embedded in each week's JSON */
export interface WeekPeriodization {
  phase: TrainingPhase;
  weekInPhase: number; // 1-based
  volumeMultiplier: number;
  intensityMultiplier: number;
  isDeload: boolean;
  targetRPE: number;
}

// ==================== DELOAD ====================

export interface DeloadSignals {
  weeksSinceLastDeload: number;
  averageRPE: number;
  rpeDeviation: number; // vs target
  completionRate: number; // % of planned sessions completed (0–1)
  performanceTrend: 'improving' | 'stagnating' | 'declining';
}

export interface DeloadRecommendation {
  shouldDeload: boolean;
  urgency: 'suggested' | 'recommended' | 'mandatory';
  reason: string;
  strategies: DeloadStrategy[];
}

export type DeloadStrategy =
  | 'volume_reduction' // reduce sets by 40-50%
  | 'intensity_reduction' // reduce weight by 10-15%
  | 'frequency_reduction' // reduce training days
  | 'full_rest'; // skip training entirely
