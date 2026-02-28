/**
 * Exercise Generation Service
 *
 * Service layer for executing exercise generation via OneAgent SDK v3.1.
 */

import { execute, type ProgressCallback } from '@giulio-leone/one-agent/framework';
import { createLazyService } from '@giulio-leone/lib-shared';
import { initializeWorkoutSchemas } from '../registry';
import type {
  ExerciseGenerationInput,
  ExerciseGenerationOutput,
} from '../sdk-agents/exercise-generation/schema';

// =============================================================================
// Types
// =============================================================================

export interface ExerciseGenerationResult {
  success: boolean;
  output?: ExerciseGenerationOutput;
  error?: {
    message: string;
    code: string;
  };
  meta: {
    durationMs: number;
    tokensUsed: number;
    costUSD: number;
  };
}

export interface GenerateOptions {
  /** Callback for real-time progress updates */
  onProgress?: ProgressCallback;
}

// =============================================================================
// Service State
// =============================================================================

const service = createLazyService({
  name: 'ExerciseGeneration',
  defaultSubpath: 'submodules/one-workout/src',
  setup: () => initializeWorkoutSchemas(),
});

/**
 * Initialize the exercise generation service
 *
 * @param options.basePath - Path to one-workout/src directory
 */
export function initializeExerciseGeneration(options: { basePath?: string } = {}): void {
  service.ensureInitialized(options);
}

// =============================================================================
// Main Function
// =============================================================================

/**
 * Execute exercise generation
 *
 * @param input - Exercise generation input
 * @param options - Generation options including onProgress callback
 * @returns Generated exercises
 */
export async function generateExercises(
  input: ExerciseGenerationInput,
  options: GenerateOptions = {}
): Promise<ExerciseGenerationResult> {
  const basePath = service.ensureInitialized();

  const startTime = Date.now();

  try {
    // Execute via SDK with onProgress callback
    const result = await execute<ExerciseGenerationOutput>(
      'sdk-agents/exercise-generation',
      input,
      {
        basePath,
        onProgress: options.onProgress,
      }
    );

    const durationMs = Date.now() - startTime;

    if (result.success && result.output) {
      return {
        success: true,
        output: result.output,
        meta: {
          durationMs,
          tokensUsed: result.meta.tokensUsed,
          costUSD: result.meta.costUSD,
        },
      };
    } else {
      const failedResult = result as { error?: { message: string; code: string; recoverable: boolean } };
      console.error('[ExerciseGeneration] Failed:', failedResult.error);
      return {
        success: false,
        error: {
          message: failedResult.error?.message ?? 'Unknown error',
          code: failedResult.error?.code ?? 'GENERATION_ERROR',
        },
        meta: {
          durationMs,
          tokensUsed: result.meta.tokensUsed,
          costUSD: result.meta.costUSD,
        },
      };
    }
  } catch (error) {
    const durationMs = Date.now() - startTime;
    console.error('[ExerciseGeneration] Exception:', error);
    return {
      success: false,
      error: {
        message: error instanceof Error ? error.message : String(error),
        code: 'EXCEPTION',
      },
      meta: {
        durationMs,
        tokensUsed: 0,
        costUSD: 0,
      },
    };
  }
}

// =============================================================================
// Re-exports
// =============================================================================

export type { ExerciseGenerationInput, ExerciseGenerationOutput };
