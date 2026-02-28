/**
 * Workout Generation Service
 *
 * Service layer for executing workout generation via OneAgent SDK v3.0.
 * Handles initialization, execution, and streaming.
 */

import { execute, type ProgressCallback } from '@giulio-leone/one-agent/framework';
import { createLazyService } from '@giulio-leone/lib-shared';
import { initializeWorkoutSchemas } from '../registry';
import type {
  WorkoutGenerationInput,
  WorkoutGenerationOutput,
} from '../sdk-agents/workout-generation/schema';

// =============================================================================
// Types
// =============================================================================

export interface WorkoutGenerationResult {
  success: boolean;
  output?: WorkoutGenerationOutput;
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
  name: 'WorkoutGeneration',
  defaultSubpath: 'submodules/one-workout/src',
  setup: () => initializeWorkoutSchemas(),
});

/**
 * Get the basePath for the workout generation agent.
 * Call initializeWorkoutGeneration() first, or this will auto-initialize.
 */
export function getWorkoutBasePath(): string {
  return service.ensureInitialized();
}

/**
 * Initialize the workout generation service
 *
 * @param options.basePath - Path to one-workout/src directory
 */
export function initializeWorkoutGeneration(options: { basePath?: string } = {}): void {
  service.ensureInitialized(options);
}

// =============================================================================
// Main Function
// =============================================================================

/**
 * Execute workout program generation
 *
 * @param input - Workout generation input with user profile, goals, constraints
 * @param options - Generation options including onProgress callback
 * @returns Generated workout program
 */
export async function generateWorkoutProgram(
  input: WorkoutGenerationInput,
  options: GenerateOptions = {}
): Promise<WorkoutGenerationResult> {
  const basePath = service.ensureInitialized();

  const startTime = Date.now();

  try {
    // Execute via SDK with onProgress callback
    const result = await execute<WorkoutGenerationOutput>('sdk-agents/workout-generation', input, {
      userId: input.userId,
      basePath,
      onProgress: options.onProgress,
    });

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
      console.error('[WorkoutGeneration] Failed:', failedResult.error);
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
    console.error('[WorkoutGeneration] Exception:', error);
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

export type { WorkoutGenerationInput, WorkoutGenerationOutput };
