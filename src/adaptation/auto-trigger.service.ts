/**
 * Auto-Trigger Service
 *
 * Evaluates whether to automatically suggest program adaptation.
 * Checks multiple signals to determine if the user should be prompted.
 *
 * Pure domain service — receives data as parameters.
 */

import type {
  AutoTriggerResult,
  TriggerDetail,
  SessionRecord,
  ExercisePerformanceRecord,
} from './types';
import type { ProgramPeriodization } from '../periodization/types';
import {
  analyzeWorkoutPerformance,
  detectPlateaus,
} from './performance-analysis.service';

// ==================== CONSTANTS ====================

const COMPLETION_RATE_THRESHOLD = 0.6;
const PLATEAU_COUNT_THRESHOLD = 3;
const PERFORMANCE_DECLINE_WEEKS = 2;

// ==================== PUBLIC API ====================

/**
 * Evaluate whether to automatically trigger an adaptation suggestion.
 *
 * Checks:
 * 1. Program completed (all weeks done)
 * 2. Completion rate dropped below threshold (< 60%)
 * 3. Multiple plateaus detected (≥ 3 exercises stagnating)
 * 4. Scheduled trigger (end of mesocycle/phase)
 * 5. Performance declining
 */
export function evaluateAutoTrigger(params: {
  userId: string;
  programId: string;
  sessions: SessionRecord[];
  totalPlannedSessions: number;
  targetRPE: number;
  performanceRecords: ExercisePerformanceRecord[];
  periodizationState: ProgramPeriodization | null;
}): AutoTriggerResult {
  const {
    sessions,
    totalPlannedSessions,
    targetRPE,
    performanceRecords,
    periodizationState,
  } = params;

  const triggers: TriggerDetail[] = [];

  // 1. Program completion check
  if (periodizationState) {
    const { mesocycle, currentWeek } = periodizationState;
    if (currentWeek >= mesocycle.totalWeeks) {
      triggers.push({
        type: 'program_complete',
        description: `Program completed: ${currentWeek}/${mesocycle.totalWeeks} weeks done`,
        data: { currentWeek, totalWeeks: mesocycle.totalWeeks },
      });
    }
  }

  // 2. Low completion rate
  const analysis = analyzeWorkoutPerformance({
    userId: params.userId,
    programId: params.programId,
    sessions,
    totalPlannedSessions,
    targetRPE,
    performanceRecords,
  });

  if (analysis.completionRate < COMPLETION_RATE_THRESHOLD && analysis.totalSessions >= 4) {
    triggers.push({
      type: 'low_completion',
      description: `Completion rate ${(analysis.completionRate * 100).toFixed(0)}% is below ${COMPLETION_RATE_THRESHOLD * 100}% threshold`,
      data: { completionRate: analysis.completionRate },
    });
  }

  // 3. Multiple plateaus
  const plateaus = detectPlateaus(performanceRecords);
  if (plateaus.length >= PLATEAU_COUNT_THRESHOLD) {
    triggers.push({
      type: 'multiple_plateaus',
      description: `${plateaus.length} exercises stagnating: ${plateaus.map((p) => p.exerciseName).join(', ')}`,
      data: { plateauCount: plateaus.length, exercises: plateaus.map((p) => p.exerciseId) },
    });
  }

  // 4. End of mesocycle / phase transition
  if (periodizationState) {
    const { mesocycle, currentWeek, currentPhaseIndex } = periodizationState;
    const currentPhase = mesocycle.phases[currentPhaseIndex];

    if (currentPhase) {
      // Check if we're at the last week of a phase
      let weeksBeforePhase = 0;
      for (let i = 0; i < currentPhaseIndex; i++) {
        weeksBeforePhase += mesocycle.phases[i]!.durationWeeks;
      }
      const weekInPhase = currentWeek - weeksBeforePhase;

      if (weekInPhase >= currentPhase.durationWeeks) {
        triggers.push({
          type: 'mesocycle_end',
          description: `End of ${currentPhase.phase} phase (week ${weekInPhase}/${currentPhase.durationWeeks})`,
          data: { phase: currentPhase.phase, weekInPhase },
        });
      }
    }
  }

  // 5. Performance decline
  if (analysis.overallTrend === 'declining' && analysis.sessionsCompleted >= PERFORMANCE_DECLINE_WEEKS) {
    triggers.push({
      type: 'performance_decline',
      description: 'Overall performance trend is declining',
      data: { trend: analysis.overallTrend, sessionsCompleted: analysis.sessionsCompleted },
    });
  }

  // Determine result
  const shouldTrigger = triggers.length > 0;
  const urgency = determineUrgency(triggers);
  const reason = triggers.length > 0
    ? triggers.map((t) => t.description).join('; ')
    : 'No adaptation triggers detected';

  return {
    shouldTrigger,
    reason,
    urgency,
    triggers,
  };
}

// ==================== INTERNAL HELPERS ====================

function determineUrgency(triggers: TriggerDetail[]): 'high' | 'medium' | 'low' {
  const highPriority: TriggerDetail['type'][] = [
    'program_complete',
    'performance_decline',
    'low_completion',
  ];
  const mediumPriority: TriggerDetail['type'][] = [
    'multiple_plateaus',
    'mesocycle_end',
  ];

  const hasHigh = triggers.some((t) => highPriority.includes(t.type));
  const hasMedium = triggers.some((t) => mediumPriority.includes(t.type));

  if (hasHigh) return 'high';
  if (hasMedium || triggers.length >= 2) return 'medium';
  return 'low';
}
