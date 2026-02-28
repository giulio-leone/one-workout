/**
 * Workout Generation Persistence Service
 *
 * Handles saving workout programs to the database.
 * Includes weight calculation and data preparation.
 *
 * Single Responsibility: Database persistence only
 */

import { ServiceRegistry, REPO_TOKENS } from '@giulio-leone/core';
import type { IWorkoutRepository } from '@giulio-leone/core/repositories';
import {
  createId,
  toWorkoutProgram,
} from '@giulio-leone/lib-shared';
import { mapDifficulty } from './workout-generation-mapper';
import { prepareProgramForPersistence } from '@giulio-leone/one-workout';
import { calculateWeightsInProgram } from '@giulio-leone/one-workout';
import type { WorkoutProgram } from '@giulio-leone/schemas';

export interface SaveWorkoutProgramParams {
  program: WorkoutProgram;
  userId: string;
  logger?: {
    info: (step: string, message: string, data?: unknown) => void;
    error: (step: string, message: string, data?: unknown) => void;
  };
}

export interface SaveWorkoutProgramResult {
  programId: string;
  success: boolean;
  error?: string;
}

export class WorkoutGenerationPersistenceService {
  private static getWorkoutRepo() {
    return ServiceRegistry.getInstance().resolve<IWorkoutRepository>(REPO_TOKENS.WORKOUT);
  }

  /**
   * Save workout program to database
   * Includes weight calculation and data preparation
   */
  static async saveWorkoutProgram(
    params: SaveWorkoutProgramParams
  ): Promise<SaveWorkoutProgramResult> {
    const { program, userId, logger } = params;

    try {
      const now = new Date();
      const nowIso = now.toISOString();
      const programId = createId();
      logger?.info('STEP4', 'Generated program ID', { programId });

      // Build full program with required fields for persistence
      const fullProgram = {
        ...program,
        difficulty: mapDifficulty(program.difficulty),
        id: programId,
        status: 'ACTIVE' as const,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      // Calculate weights if user has profile with 1RM
      logger?.info('STEP4', 'Calculating weights for user', { userId });
      const programWithWeights = await calculateWeightsInProgram(
        userId,
        toWorkoutProgram(fullProgram)!
      );
      logger?.info('STEP4', '✅ Weights calculated');

      // Prepare for persistence
      logger?.info('STEP4', 'Preparing for persistence...');
      const persistence = prepareProgramForPersistence(programWithWeights);
      logger?.info('STEP4', '✅ Persistence data prepared');

      // Save to database
      logger?.info('STEP4', 'Saving to database...');
      await WorkoutGenerationPersistenceService.getWorkoutRepo().create({
        id: programId,
        userId,
        name: persistence.name,
        description: persistence.description,
        difficulty: fullProgram.difficulty,
        durationWeeks: persistence.durationWeeks,
        goals: persistence.goals,
        weeks: persistence.weeks,
        status: persistence.status,
        metadata: persistence.metadata ?? {},
      });

      logger?.info('STEP4', '✅ Program saved successfully', { programId });
      logger?.info('STEP4', 'STEP 4 COMPLETED');

      return {
        programId,
        success: true,
      };
    } catch (saveError) {
      logger?.error('STEP4', '❌ Failed to save program', {
        error: saveError instanceof Error ? saveError.message : String(saveError),
        stack: saveError instanceof Error ? saveError.stack : undefined,
      });

      return {
        programId: '',
        success: false,
        error: saveError instanceof Error ? saveError.message : 'Unknown error',
      };
    }
  }
}
