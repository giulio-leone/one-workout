import type { WorkoutProgram } from '@giulio-leone/types';

export interface WeeklyStats {
  week: number;
  volumeLoad: number;
  totalSets: number;
  totalLifts: number;
  avgIntensity: number;
  avgRpe: number;
}

export interface ExerciseStats {
  id: string;
  name: string;
  totalSets: number;
  totalReps: number;
  totalLifts: number; // Alias for totalReps for consistency
  volumeLoad: number;
  avgIntensity: number;
  avgRpe: number;
  maxWeight: number;
  frequency: number;
}

export interface MuscleStats {
  name: string;
  sets: number;
  volumeLoad: number;
  totalLifts: number;
  frequency: number;
}

export interface WorkoutStatisticsResult {
  totalSets: number;
  totalVolumeLoad: number;
  totalLifts: number;
  avgIntensity: number;
  avgRpe: number;
  muscleChartData: MuscleStats[];
  weeklyStats: WeeklyStats[];
  exerciseStats: ExerciseStats[];
}

export class WorkoutStatisticsService {
  static calculate(program: WorkoutProgram): WorkoutStatisticsResult {
    const muscleData: Record<string, MuscleStats> = {};
    const exerciseData: Record<string, ExerciseStats> = {};
    const weeklyStats: WeeklyStats[] = [];

    let totalSets = 0;
    let totalVolumeLoad = 0;
    let totalLifts = 0;
    let totalIntensityPoints = 0;
    let totalRpePoints = 0;
    let setsWithIntensity = 0;
    let setsWithRpe = 0;

    program.weeks.forEach((week: any) => {
      let weekVolumeLoad = 0;
      let weekSets = 0;
      let weekLifts = 0;
      let weekIntensityPoints = 0;
      let weekRpePoints = 0;
      let weekSetsWithIntensity = 0;
      let weekSetsWithRpe = 0;

      week.days.forEach((day: any) => {
        day.exercises.forEach((exercise: any) => {
          // --- Exercise Stats Aggregation ---
          const exerciseKey = exercise.name;
          if (!exerciseData[exerciseKey]) {
            exerciseData[exerciseKey] = {
              id: exercise.id,
              name: exercise.name,
              totalSets: 0,
              totalReps: 0,
              totalLifts: 0,
              volumeLoad: 0,
              avgIntensity: 0,
              avgRpe: 0,
              maxWeight: 0,
              frequency: 0,
            };
          }
          const exStat = exerciseData[exerciseKey]!;
          exStat.frequency += 1;

          let exIntensityPoints = 0;
          let exRpePoints = 0;

          exercise.setGroups.forEach((group: any) => {
            group.sets.forEach((set: any) => {
              const reps = set.reps || 0;
              const weight = set.weight || 0;
              const volume = reps * weight;

              // Global & Weekly Totals
              totalSets++;
              totalVolumeLoad += volume;
              totalLifts += reps;

              weekSets++;
              weekVolumeLoad += volume;
              weekLifts += reps;

              // Exercise Totals
              exStat.totalSets++;
              exStat.totalReps += reps;
              exStat.totalLifts += reps;
              exStat.volumeLoad += volume;
              if (weight > exStat.maxWeight) exStat.maxWeight = weight;

              // Intensity & RPE
              if (set.intensityPercent) {
                totalIntensityPoints += set.intensityPercent;
                setsWithIntensity++;
                weekIntensityPoints += set.intensityPercent;
                weekSetsWithIntensity++;

                exIntensityPoints += set.intensityPercent;
              }

              if (set.rpe) {
                totalRpePoints += set.rpe;
                setsWithRpe++;
                weekRpePoints += set.rpe;
                weekSetsWithRpe++;

                exRpePoints += set.rpe;
              }

              // --- Muscle Stats ---
              exercise.muscleGroups.forEach((muscleName: any) => {
                const key = muscleName;
                if (!muscleData[key]) {
                  muscleData[key] = {
                    name: muscleName.charAt(0).toUpperCase() + muscleName.slice(1),
                    sets: 0,
                    volumeLoad: 0,
                    totalLifts: 0,
                    frequency: 0,
                  };
                }
                muscleData[key]!.sets += 1;
                muscleData[key]!.volumeLoad += volume;
                muscleData[key]!.totalLifts += reps;
              });
            });
          });

          // Update average intensity/RPE accumulators for exercise
          exStat.avgIntensity += exIntensityPoints;
          exStat.avgRpe += exRpePoints;
        });
      });

      weeklyStats.push({
        week: week.weekNumber,
        volumeLoad: weekVolumeLoad,
        totalSets: weekSets,
        totalLifts: weekLifts,
        avgIntensity: weekSetsWithIntensity > 0 ? weekIntensityPoints / weekSetsWithIntensity : 0,
        avgRpe: weekSetsWithRpe > 0 ? weekRpePoints / weekSetsWithRpe : 0,
      });
    });

    // Finalize Calculations
    const avgIntensity = setsWithIntensity > 0 ? totalIntensityPoints / setsWithIntensity : 0;
    const avgRpe = setsWithRpe > 0 ? totalRpePoints / setsWithRpe : 0;

    const muscleChartData = Object.values(muscleData).sort((a, b) => b.sets - a.sets);

    const exerciseStats = Object.values(exerciseData)
      .map((e: any) => ({
        ...e,
        avgIntensity: e.totalSets > 0 ? e.avgIntensity / e.totalSets : 0,
        avgRpe: e.totalSets > 0 ? e.avgRpe / e.totalSets : 0,
      }))
      .sort((a, b) => b.volumeLoad - a.volumeLoad);

    return {
      totalSets,
      totalVolumeLoad,
      totalLifts,
      avgIntensity,
      avgRpe,
      muscleChartData,
      weeklyStats,
      exerciseStats,
    };
  }
}
