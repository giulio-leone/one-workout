/**
 * Adaptation Pipeline Domain Types
 *
 * Shared types for the AI adaptation pipeline.
 * Pure domain types — no runtime dependencies.
 */

import type {
  ProgramPeriodization,
  DeloadRecommendation,
  WeekPeriodization,
} from '../periodization/types';

// ==================== PERFORMANCE ANALYSIS ====================

export interface WorkoutPerformanceAnalysis {
  programId: string;
  userId: string;
  completionRate: number;
  averageRPE: number;
  targetRPE: number;
  rpeDeviation: number;
  volumeTrend: 'increasing' | 'stable' | 'decreasing';
  sessionsCompleted: number;
  totalSessions: number;
  strengthChanges: StrengthChange[];
  plateaus: PlateauDetection[];
  overallTrend: 'improving' | 'stagnating' | 'declining';
}

export interface StrengthChange {
  exerciseId: string;
  exerciseName: string;
  startEstimated1RM: number;
  currentEstimated1RM: number;
  changePercent: number;
  trend: 'improving' | 'stable' | 'declining';
}

export interface StrengthProgressAnalysis {
  exerciseTrends: ExerciseTrend[];
  overallTrend: 'improving' | 'stable' | 'declining';
}

export interface ExerciseTrend {
  exerciseId: string;
  exerciseName: string;
  volumeTrend: 'increasing' | 'stable' | 'decreasing';
  estimated1RMStart: number;
  estimated1RMCurrent: number;
  changePercent: number;
}

export interface PlateauDetection {
  exerciseId: string;
  exerciseName: string;
  plateauWeeks: number;
  lastPRDate: string;
  suggestion: string;
}

// ==================== ADAPTATION SIGNALS ====================

export type AdaptationSignalType =
  | 'volume_increase'
  | 'volume_decrease'
  | 'intensity_increase'
  | 'intensity_decrease'
  | 'exercise_swap'
  | 'deload'
  | 'progression_change'
  | 'frequency_adjust';

export interface AdaptationSignal {
  type: AdaptationSignalType;
  priority: 'high' | 'medium' | 'low';
  reason: string;
  affectedExercises?: string[];
  suggestedChange?: string;
}

// ==================== HISTORY CONTEXT ====================

export interface WorkoutHistoryContext {
  userId: string;
  programId: string;
  performanceAnalysis: WorkoutPerformanceAnalysis;
  periodizationState: ProgramPeriodization | null;
  currentWeekPeriodization: WeekPeriodization | null;
  deloadRecommendation: DeloadRecommendation | null;
  adaptationSignals: AdaptationSignal[];
  feedbackSummary: FeedbackSummary | null;
}

export interface FeedbackSummary {
  overallRating: number;
  volumeRating: number | null;
  intensityRating: number | null;
  difficultyRating: number | null;
  whatWorked: string | null;
  whatDidntWork: string | null;
  suggestions: string | null;
}

// ==================== ADAPTATION PLAN ====================

export interface AdaptationPlan {
  id: string;
  programId: string;
  userId: string;
  signals: AdaptationSignal[];
  analysis: WorkoutPerformanceAnalysis;
  suggestedChanges: SuggestedChange[];
  periodizationAdjustment?: PeriodizationAdjustment;
  status: 'pending' | 'approved' | 'applied' | 'rejected';
  createdAt: string;
}

export interface SuggestedChange {
  type: 'modify_exercise' | 'swap_exercise' | 'adjust_volume' | 'adjust_intensity' | 'add_deload' | 'change_split';
  description: string;
  weekAffected?: number;
  exerciseId?: string;
  before?: string;
  after?: string;
}

export interface PeriodizationAdjustment {
  reason: string;
  phaseChange?: string;
  volumeMultiplierDelta?: number;
  intensityMultiplierDelta?: number;
  addDeloadWeek?: boolean;
}

// ==================== AUTO-TRIGGER ====================

export interface AutoTriggerResult {
  shouldTrigger: boolean;
  reason: string;
  urgency: 'high' | 'medium' | 'low';
  triggers: TriggerDetail[];
}

export interface TriggerDetail {
  type: 'program_complete' | 'low_completion' | 'multiple_plateaus' | 'mesocycle_end' | 'performance_decline';
  description: string;
  data?: Record<string, unknown>;
}

// ==================== INPUT TYPES (from repos) ====================

/** Minimal session data needed for performance analysis */
export interface SessionRecord {
  id: string;
  programId: string;
  weekNumber: number;
  dayNumber: number;
  completedAt: string | null;
  plannedAt?: string;
  rpe?: number | null;
  totalVolume?: number | null;
}

/** Minimal exercise performance record for strength analysis */
export interface ExercisePerformanceRecord {
  id: string;
  exerciseId: string;
  exerciseName?: string;
  sessionId: string;
  date: string;
  sets: number;
  reps: number;
  weight: number;
  volume: number;
  rpe: number | null;
}

/** Minimal feedback record */
export interface ProgramFeedbackRecord {
  id: string;
  programId: string;
  userId: string;
  overallRating: number;
  volumeRating: number | null;
  intensityRating: number | null;
  difficultyRating: number | null;
  whatWorked: string | null;
  whatDidntWork: string | null;
  suggestions: string | null;
}
