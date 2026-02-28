import { describe, it, expect } from 'vitest';

import {
  createMesocycle,
  getPhaseForWeek,
  getWeekPeriodization,
  advanceWeek,
  evaluateDeload,
  generatePhaseSequence,
  applyPeriodizationToWeeks,
} from '../periodization.service';

import {
  PRESET_MESOCYCLES,
  PRESET_IDS,
  getPresetMesocycle,
  listPresets,
  LINEAR_STRENGTH_8W,
  HYPERTROPHY_BLOCK_6W,
  POWER_PEAK_4W,
  GENERAL_FITNESS_4W,
  DUP_4W,
} from '../presets';

import type {
  MesocycleConfig,
  ProgramPeriodization,
  DeloadSignals,
  PhaseConfig,
  TrainingPhase,
} from '../types';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeMesocycle(overrides: Partial<Parameters<typeof createMesocycle>[0]> = {}) {
  return createMesocycle({
    id: 'test-meso',
    name: 'Test',
    model: 'linear',
    totalWeeks: 8,
    goal: 'strength',
    experienceLevel: 'intermediate',
    ...overrides,
  });
}

function makeState(mesocycle: MesocycleConfig, currentWeek = 1): ProgramPeriodization {
  const info = getPhaseForWeek(mesocycle, currentWeek);
  return {
    mesocycle,
    currentWeek,
    currentPhaseIndex: info.phaseIndex,
    completedPhases: [],
    deloadHistory: [],
  };
}

function baseSignals(overrides: Partial<DeloadSignals> = {}): DeloadSignals {
  return {
    weeksSinceLastDeload: 2,
    averageRPE: 7.0,
    rpeDeviation: 0.5,
    completionRate: 0.95,
    performanceTrend: 'improving',
    ...overrides,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. createMesocycle
// ═════════════════════════════════════════════════════════════════════════════

describe('createMesocycle', () => {
  it('generates phases when none are provided', () => {
    const meso = makeMesocycle();
    expect(meso.phases.length).toBeGreaterThan(0);
    const totalPhaseDuration = meso.phases.reduce((s, p) => s + p.durationWeeks, 0);
    expect(totalPhaseDuration).toBe(meso.totalWeeks);
  });

  it('uses provided phases when given', () => {
    const customPhases: PhaseConfig[] = [
      { phase: 'accumulation', durationWeeks: 5, volumeMultiplier: 1, intensityMultiplier: 0.7, rpeRange: [6, 7] },
      { phase: 'deload', durationWeeks: 1, volumeMultiplier: 0.5, intensityMultiplier: 0.6, rpeRange: [5, 6] },
    ];
    const meso = makeMesocycle({ totalWeeks: 6, phases: customPhases });
    expect(meso.phases).toEqual(customPhases);
  });

  it('throws when phase durations do not match totalWeeks', () => {
    const badPhases: PhaseConfig[] = [
      { phase: 'accumulation', durationWeeks: 3, volumeMultiplier: 1, intensityMultiplier: 0.7, rpeRange: [6, 7] },
    ];
    expect(() => makeMesocycle({ totalWeeks: 8, phases: badPhases })).toThrow(
      /Phase durations.*do not match totalWeeks/
    );
  });

  it('sets autoDeloadEnabled=true by default', () => {
    const meso = makeMesocycle();
    expect(meso.autoDeloadEnabled).toBe(true);
  });

  it('respects autoDeloadEnabled=false', () => {
    const meso = makeMesocycle({ autoDeloadEnabled: false });
    expect(meso.autoDeloadEnabled).toBe(false);
  });

  it.each([
    ['beginner', 6],
    ['intermediate', 5],
    ['advanced', 4],
    ['elite', 3],
  ] as const)('sets deloadFrequency for %s to %d', (level, expected) => {
    const meso = makeMesocycle({ experienceLevel: level });
    expect(meso.deloadFrequency).toBe(expected);
  });

  it('stores goal and model correctly', () => {
    const meso = makeMesocycle({ model: 'block', goal: 'hypertrophy' });
    expect(meso.model).toBe('block');
    expect(meso.goal).toBe('hypertrophy');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. getPhaseForWeek
// ═════════════════════════════════════════════════════════════════════════════

describe('getPhaseForWeek', () => {
  const meso = LINEAR_STRENGTH_8W; // acc(3) → int(3) → real(1) → deload(1)

  it('returns first phase for week 1', () => {
    const result = getPhaseForWeek(meso, 1);
    expect(result.phase.phase).toBe('accumulation');
    expect(result.phaseIndex).toBe(0);
    expect(result.weekInPhase).toBe(1);
  });

  it('returns correct weekInPhase within a multi-week phase', () => {
    const result = getPhaseForWeek(meso, 3);
    expect(result.phase.phase).toBe('accumulation');
    expect(result.weekInPhase).toBe(3);
  });

  it('detects phase transition at boundary (week 4 → intensification)', () => {
    const result = getPhaseForWeek(meso, 4);
    expect(result.phase.phase).toBe('intensification');
    expect(result.phaseIndex).toBe(1);
    expect(result.weekInPhase).toBe(1);
  });

  it('returns realization for week 7', () => {
    const result = getPhaseForWeek(meso, 7);
    expect(result.phase.phase).toBe('realization');
    expect(result.phaseIndex).toBe(2);
    expect(result.weekInPhase).toBe(1);
  });

  it('returns deload for last week', () => {
    const result = getPhaseForWeek(meso, 8);
    expect(result.phase.phase).toBe('deload');
    expect(result.phaseIndex).toBe(3);
    expect(result.weekInPhase).toBe(1);
  });

  it('throws RangeError for week 0', () => {
    expect(() => getPhaseForWeek(meso, 0)).toThrow(RangeError);
  });

  it('throws RangeError for week beyond totalWeeks', () => {
    expect(() => getPhaseForWeek(meso, 9)).toThrow(RangeError);
  });

  it('handles 1-week mesocycle', () => {
    const tiny = makeMesocycle({
      totalWeeks: 1,
      phases: [{ phase: 'accumulation', durationWeeks: 1, volumeMultiplier: 1, intensityMultiplier: 0.7, rpeRange: [6, 7] }],
    });
    const result = getPhaseForWeek(tiny, 1);
    expect(result.phase.phase).toBe('accumulation');
    expect(result.weekInPhase).toBe(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. getWeekPeriodization
// ═════════════════════════════════════════════════════════════════════════════

describe('getWeekPeriodization', () => {
  const meso = LINEAR_STRENGTH_8W;

  it('returns correct phase and multipliers for accumulation week', () => {
    const wp = getWeekPeriodization(meso, 1);
    expect(wp.phase).toBe('accumulation');
    expect(wp.volumeMultiplier).toBe(1.1);
    expect(wp.intensityMultiplier).toBe(0.7);
    expect(wp.isDeload).toBe(false);
  });

  it('marks deload week correctly', () => {
    const wp = getWeekPeriodization(meso, 8);
    expect(wp.phase).toBe('deload');
    expect(wp.isDeload).toBe(true);
  });

  it('interpolates RPE linearly across a multi-week phase', () => {
    // accumulation: rpeRange [6, 7.5], 3 weeks
    const w1 = getWeekPeriodization(meso, 1);
    const w2 = getWeekPeriodization(meso, 2);
    const w3 = getWeekPeriodization(meso, 3);
    expect(w1.targetRPE).toBe(6.0); // first week → rpeMin
    expect(w3.targetRPE).toBe(7.5); // last week → rpeMax
    expect(w2.targetRPE).toBeGreaterThan(w1.targetRPE);
    expect(w2.targetRPE).toBeLessThan(w3.targetRPE);
  });

  it('uses end-of-range RPE for single-week phase', () => {
    // realization: 1 week, rpeRange [8.5, 9.5], progress=1.0
    const wp = getWeekPeriodization(meso, 7);
    expect(wp.targetRPE).toBe(9.5); // end of range
  });

  it('weekInPhase resets when phase changes', () => {
    const w3 = getWeekPeriodization(meso, 3);
    const w4 = getWeekPeriodization(meso, 4);
    expect(w3.weekInPhase).toBe(3);
    expect(w4.weekInPhase).toBe(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. advanceWeek
// ═════════════════════════════════════════════════════════════════════════════

describe('advanceWeek', () => {
  it('increments currentWeek by 1', () => {
    const meso = LINEAR_STRENGTH_8W;
    const state = makeState(meso, 1);
    const next = advanceWeek(state);
    expect(next.currentWeek).toBe(2);
  });

  it('updates currentPhaseIndex on phase transition', () => {
    const meso = LINEAR_STRENGTH_8W; // acc(3) → int(3)
    const state = makeState(meso, 3);
    const next = advanceWeek(state);
    expect(next.currentPhaseIndex).toBe(1); // moved to intensification
  });

  it('records completed phase on transition', () => {
    const meso = LINEAR_STRENGTH_8W;
    const state = makeState(meso, 3);
    const next = advanceWeek(state);
    expect(next.completedPhases).toContain('accumulation');
  });

  it('records deload in deloadHistory when entering deload phase', () => {
    const meso = LINEAR_STRENGTH_8W;
    // week 7 is realization, week 8 is deload
    const state = makeState(meso, 7);
    const next = advanceWeek(state);
    expect(next.deloadHistory).toContain(8);
  });

  it('returns unchanged state when at last week (program complete)', () => {
    const meso = LINEAR_STRENGTH_8W;
    const state = makeState(meso, 8);
    const next = advanceWeek(state);
    expect(next.currentWeek).toBe(8); // unchanged
  });

  it('is immutable — does not mutate original state', () => {
    const meso = LINEAR_STRENGTH_8W;
    const state = makeState(meso, 3);
    const originalWeek = state.currentWeek;
    advanceWeek(state);
    expect(state.currentWeek).toBe(originalWeek);
  });

  it('walks through entire mesocycle correctly', () => {
    const meso = LINEAR_STRENGTH_8W;
    let state = makeState(meso, 1);
    for (let w = 1; w < meso.totalWeeks; w++) {
      state = advanceWeek(state);
    }
    expect(state.currentWeek).toBe(meso.totalWeeks);
    // Should have completed accumulation, intensification, realization (deload is current)
    expect(state.completedPhases).toContain('accumulation');
    expect(state.completedPhases).toContain('intensification');
    expect(state.completedPhases).toContain('realization');
    expect(state.deloadHistory.length).toBeGreaterThan(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. evaluateDeload
// ═════════════════════════════════════════════════════════════════════════════

describe('evaluateDeload', () => {
  const defaultConfig = { deloadFrequency: 4, autoDeloadEnabled: true };

  it('returns shouldDeload=false when auto-deload is disabled', () => {
    const result = evaluateDeload(
      baseSignals({ averageRPE: 9.5, rpeDeviation: 2.0, performanceTrend: 'declining' }),
      { deloadFrequency: 4, autoDeloadEnabled: false }
    );
    expect(result.shouldDeload).toBe(false);
    expect(result.reason).toMatch(/disabled/i);
    expect(result.strategies).toHaveLength(0);
  });

  it('recommends deload when scheduled (weeksSinceLastDeload >= deloadFrequency)', () => {
    const result = evaluateDeload(
      baseSignals({ weeksSinceLastDeload: 5 }),
      defaultConfig
    );
    expect(result.shouldDeload).toBe(true);
    expect(result.reason).toMatch(/scheduled/i);
    expect(result.strategies).toContain('volume_reduction');
  });

  it('recommends deload on high RPE deviation (> 1.0)', () => {
    const result = evaluateDeload(
      baseSignals({ rpeDeviation: 1.5 }),
      defaultConfig
    );
    expect(result.shouldDeload).toBe(true);
    expect(result.reason).toMatch(/RPE deviation/i);
    expect(result.strategies).toContain('intensity_reduction');
  });

  it('recommends deload on high absolute RPE (>= 9.0)', () => {
    const result = evaluateDeload(
      baseSignals({ averageRPE: 9.2 }),
      defaultConfig
    );
    expect(result.shouldDeload).toBe(true);
    expect(result.reason).toMatch(/fatigue ceiling/i);
    expect(result.strategies).toContain('volume_reduction');
    expect(result.strategies).toContain('intensity_reduction');
  });

  it('flags low completion rate', () => {
    const result = evaluateDeload(
      baseSignals({ completionRate: 0.6 }),
      defaultConfig
    );
    expect(result.reason).toMatch(/completion rate/i);
    expect(result.strategies).toContain('frequency_reduction');
  });

  it('flags declining performance', () => {
    const result = evaluateDeload(
      baseSignals({ performanceTrend: 'declining' }),
      defaultConfig
    );
    expect(result.shouldDeload).toBe(true);
    expect(result.reason).toMatch(/declining/i);
    expect(result.strategies).toContain('volume_reduction');
  });

  it('returns mandatory urgency when many signals fire', () => {
    const result = evaluateDeload(
      baseSignals({
        weeksSinceLastDeload: 5,
        averageRPE: 9.5,
        rpeDeviation: 1.5,
        completionRate: 0.5,
        performanceTrend: 'declining',
      }),
      defaultConfig
    );
    expect(result.shouldDeload).toBe(true);
    expect(result.urgency).toBe('mandatory');
  });

  it('returns "suggested" when only stagnating performance (score=1)', () => {
    const result = evaluateDeload(
      baseSignals({ performanceTrend: 'stagnating' }),
      defaultConfig
    );
    expect(result.shouldDeload).toBe(false);
    expect(result.urgency).toBe('suggested');
  });

  it('returns no deload when all signals are healthy', () => {
    const result = evaluateDeload(baseSignals(), defaultConfig);
    expect(result.shouldDeload).toBe(false);
    expect(result.reason).toMatch(/No deload signals/i);
  });

  it('deduplicates strategies', () => {
    // high RPE triggers both volume_reduction and intensity_reduction;
    // scheduled also adds volume_reduction → should appear only once
    const result = evaluateDeload(
      baseSignals({ weeksSinceLastDeload: 5, averageRPE: 9.5 }),
      defaultConfig
    );
    const volumeReductions = result.strategies.filter((s) => s === 'volume_reduction');
    expect(volumeReductions.length).toBe(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6. generatePhaseSequence
// ═════════════════════════════════════════════════════════════════════════════

describe('generatePhaseSequence', () => {
  function totalDuration(phases: PhaseConfig[]) {
    return phases.reduce((s, p) => s + p.durationWeeks, 0);
  }

  function phaseNames(phases: PhaseConfig[]): TrainingPhase[] {
    return phases.map((p) => p.phase);
  }

  describe('linear', () => {
    it('8-week: has accumulation → intensification → realization → deload', () => {
      const phases = generatePhaseSequence('linear', 8, 'strength');
      expect(totalDuration(phases)).toBe(8);
      const names = phaseNames(phases);
      expect(names).toContain('accumulation');
      expect(names).toContain('intensification');
      expect(names[names.length - 1]).toBe('deload');
    });

    it('3-week: no deload (< 4 weeks)', () => {
      const phases = generatePhaseSequence('linear', 3, 'strength');
      expect(totalDuration(phases)).toBe(3);
      expect(phaseNames(phases)).not.toContain('deload');
    });

    it('4-week: includes deload', () => {
      const phases = generatePhaseSequence('linear', 4, 'strength');
      expect(totalDuration(phases)).toBe(4);
      expect(phases[phases.length - 1]!.phase).toBe('deload');
    });

    it('2-week: single accumulation phase', () => {
      const phases = generatePhaseSequence('linear', 2, 'strength');
      expect(totalDuration(phases)).toBe(2);
      expect(phases.length).toBe(1);
      expect(phases[0]!.phase).toBe('accumulation');
    });

    it('1-week: single accumulation phase', () => {
      const phases = generatePhaseSequence('linear', 1, 'strength');
      expect(totalDuration(phases)).toBe(1);
      expect(phases[0]!.phase).toBe('accumulation');
    });

    it('12-week: all phases sum correctly', () => {
      const phases = generatePhaseSequence('linear', 12, 'hypertrophy');
      expect(totalDuration(phases)).toBe(12);
      expect(phases[phases.length - 1]!.phase).toBe('deload');
    });
  });

  describe('undulating', () => {
    it('4-week: alternates accumulation/intensification + deload', () => {
      const phases = generatePhaseSequence('undulating', 4, 'strength');
      expect(totalDuration(phases)).toBe(4);
      // 3 training weeks + 1 deload
      expect(phases[0]!.phase).toBe('accumulation');
      expect(phases[1]!.phase).toBe('intensification');
      expect(phases[2]!.phase).toBe('accumulation');
      expect(phases[3]!.phase).toBe('deload');
    });

    it('each training phase is exactly 1 week', () => {
      const phases = generatePhaseSequence('undulating', 6, 'strength');
      const trainingPhases = phases.filter((p) => p.phase !== 'deload');
      trainingPhases.forEach((p) => {
        expect(p.durationWeeks).toBe(1);
      });
    });

    it('3-week: no deload', () => {
      const phases = generatePhaseSequence('undulating', 3, 'strength');
      expect(totalDuration(phases)).toBe(3);
      expect(phaseNames(phases)).not.toContain('deload');
    });
  });

  describe('block', () => {
    it('6-week: has accumulation → intensification → realization → deload', () => {
      const phases = generatePhaseSequence('block', 6, 'strength');
      expect(totalDuration(phases)).toBe(6);
      const names = phaseNames(phases);
      expect(names).toContain('accumulation');
      expect(names[names.length - 1]).toBe('deload');
    });

    it('3-week: no deload', () => {
      const phases = generatePhaseSequence('block', 3, 'strength');
      expect(totalDuration(phases)).toBe(3);
      expect(phaseNames(phases)).not.toContain('deload');
    });

    it('2-week: single accumulation block', () => {
      const phases = generatePhaseSequence('block', 2, 'strength');
      expect(phases.length).toBe(1);
      expect(phases[0]!.phase).toBe('accumulation');
    });
  });

  describe('autoregulated', () => {
    it('single accumulation block + deload for >= 4 weeks', () => {
      const phases = generatePhaseSequence('autoregulated', 6, 'strength');
      expect(totalDuration(phases)).toBe(6);
      expect(phases[0]!.phase).toBe('accumulation');
      expect(phases[0]!.durationWeeks).toBe(5);
      expect(phases[1]!.phase).toBe('deload');
    });

    it('no deload for < 4 weeks', () => {
      const phases = generatePhaseSequence('autoregulated', 3, 'strength');
      expect(phases.length).toBe(1);
      expect(phases[0]!.phase).toBe('accumulation');
      expect(phases[0]!.durationWeeks).toBe(3);
    });

    it('uses moderate multipliers', () => {
      const phases = generatePhaseSequence('autoregulated', 5, 'strength');
      const acc = phases[0]!;
      expect(acc.volumeMultiplier).toBe(1.0);
      expect(acc.intensityMultiplier).toBe(0.75);
    });
  });

  it('throws on unknown model', () => {
    expect(() => generatePhaseSequence('foo' as any, 4, 'strength')).toThrow(/Unknown periodization model/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 7. applyPeriodizationToWeeks
// ═════════════════════════════════════════════════════════════════════════════

describe('applyPeriodizationToWeeks', () => {
  const meso = LINEAR_STRENGTH_8W;

  it('embeds periodization data into each week object', () => {
    const weeks = [{ weekNumber: 1 }, { weekNumber: 2 }, { weekNumber: 3 }];
    const result = applyPeriodizationToWeeks(weeks, meso);
    expect(result).toHaveLength(3);
    result.forEach((w) => {
      expect(w.periodization).toBeDefined();
      expect(w.periodization.phase).toBeDefined();
      expect(typeof w.periodization.targetRPE).toBe('number');
    });
  });

  it('preserves original week fields', () => {
    const weeks = [{ weekNumber: 1, custom: 'data' }];
    const result = applyPeriodizationToWeeks(weeks, meso);
    expect(result[0]!.custom).toBe('data');
    expect(result[0]!.weekNumber).toBe(1);
  });

  it('correctly maps phase for deload week', () => {
    const weeks = [{ weekNumber: 8 }];
    const result = applyPeriodizationToWeeks(weeks, meso);
    expect(result[0]!.periodization.isDeload).toBe(true);
    expect(result[0]!.periodization.phase).toBe('deload');
  });

  it('returns empty array for empty input', () => {
    const result = applyPeriodizationToWeeks([], meso);
    expect(result).toEqual([]);
  });

  it('produces correct periodization across all 8 weeks', () => {
    const weeks = Array.from({ length: 8 }, (_, i) => ({ weekNumber: i + 1 }));
    const result = applyPeriodizationToWeeks(weeks, meso);
    // weeks 1-3 accumulation, 4-6 intensification, 7 realization, 8 deload
    expect(result[0]!.periodization.phase).toBe('accumulation');
    expect(result[3]!.periodization.phase).toBe('intensification');
    expect(result[6]!.periodization.phase).toBe('realization');
    expect(result[7]!.periodization.phase).toBe('deload');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 8. Presets
// ═════════════════════════════════════════════════════════════════════════════

describe('PRESET_MESOCYCLES', () => {
  it('contains exactly 5 presets', () => {
    expect(Object.keys(PRESET_MESOCYCLES)).toHaveLength(5);
  });

  it.each(Object.entries(PRESET_MESOCYCLES))('preset %s has valid config', (id, preset) => {
    expect(preset.id).toBe(id);
    expect(preset.name).toBeTruthy();
    expect(preset.model).toBeTruthy();
    expect(preset.totalWeeks).toBeGreaterThan(0);
    expect(preset.goal).toBeTruthy();
    expect(preset.phases.length).toBeGreaterThan(0);

    const totalDuration = preset.phases.reduce((s, p) => s + p.durationWeeks, 0);
    expect(totalDuration).toBe(preset.totalWeeks);
  });

  it.each(Object.values(PRESET_MESOCYCLES))('$name: all phases have valid RPE ranges', (preset) => {
    preset.phases.forEach((phase) => {
      expect(phase.rpeRange[0]).toBeLessThanOrEqual(phase.rpeRange[1]);
      expect(phase.rpeRange[0]).toBeGreaterThanOrEqual(0);
      expect(phase.rpeRange[1]).toBeLessThanOrEqual(10);
    });
  });

  it.each(Object.values(PRESET_MESOCYCLES))('$name: multipliers are positive', (preset) => {
    preset.phases.forEach((phase) => {
      expect(phase.volumeMultiplier).toBeGreaterThan(0);
      expect(phase.intensityMultiplier).toBeGreaterThan(0);
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 9. Preset lookup helpers
// ═════════════════════════════════════════════════════════════════════════════

describe('getPresetMesocycle', () => {
  it('returns preset by valid ID', () => {
    const result = getPresetMesocycle(PRESET_IDS.LINEAR_STRENGTH_8W);
    expect(result).toBeDefined();
    expect(result!.id).toBe(PRESET_IDS.LINEAR_STRENGTH_8W);
  });

  it('returns undefined for unknown ID', () => {
    expect(getPresetMesocycle('nonexistent')).toBeUndefined();
  });
});

describe('listPresets', () => {
  it('returns all 5 presets as summaries', () => {
    const list = listPresets();
    expect(list).toHaveLength(5);
    list.forEach((item) => {
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('name');
      expect(item).toHaveProperty('model');
      expect(item).toHaveProperty('totalWeeks');
      expect(item).toHaveProperty('goal');
    });
  });

  it('includes the linear strength preset', () => {
    const list = listPresets();
    const linear = list.find((p) => p.id === PRESET_IDS.LINEAR_STRENGTH_8W);
    expect(linear).toBeDefined();
    expect(linear!.model).toBe('linear');
    expect(linear!.goal).toBe('strength');
    expect(linear!.totalWeeks).toBe(8);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Integration-style: preset mesocycles work with engine functions
// ═════════════════════════════════════════════════════════════════════════════

describe('preset integration', () => {
  it.each([
    LINEAR_STRENGTH_8W,
    HYPERTROPHY_BLOCK_6W,
    POWER_PEAK_4W,
    GENERAL_FITNESS_4W,
    DUP_4W,
  ])('$name: getWeekPeriodization works for every week', (preset) => {
    for (let w = 1; w <= preset.totalWeeks; w++) {
      const wp = getWeekPeriodization(preset, w);
      expect(wp.phase).toBeTruthy();
      expect(wp.targetRPE).toBeGreaterThanOrEqual(0);
      expect(wp.targetRPE).toBeLessThanOrEqual(10);
    }
  });

  it.each([
    LINEAR_STRENGTH_8W,
    HYPERTROPHY_BLOCK_6W,
    POWER_PEAK_4W,
    GENERAL_FITNESS_4W,
    DUP_4W,
  ])('$name: advanceWeek walks through all weeks without error', (preset) => {
    let state = makeState(preset, 1);
    for (let w = 1; w < preset.totalWeeks; w++) {
      state = advanceWeek(state);
    }
    expect(state.currentWeek).toBe(preset.totalWeeks);
  });
});
