/**
 * Exercise Generation Service
 *
 * Service layer for executing exercise generation via OneAgent SDK v3.1.
 */

import { resolve } from 'path';
import { execute } from '@giulio-leone/one-agent/framework/engine';
import type { ProgressCallback } from '@giulio-leone/agent-contracts';
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

let isInitialized = false;
let basePath: string = '';

/**
 * Initialize the exercise generation service
 *
 * @param options.basePath - Path to one-workout/src directory
 */
export function initializeExerciseGeneration(options: { basePath?: string } = {}): void {
  if (isInitialized) return;

  // Register schemas with SDK registry
  initializeWorkoutSchemas();

  // Use provided basePath or construct from monorepo root
  basePath = options.basePath ?? resolve(process.cwd(), '../../submodules/one-workout/src');
  isInitialized = true;
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
  // Auto-initialize if needed
  if (!isInitialized) {
    initializeExerciseGeneration();
  }

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
      console.error('[ExerciseGeneration] Failed:', result.error);
      return {
        success: false,
        error: {
          message: result.error?.message ?? 'Unknown error',
          code: result.error?.code ?? 'GENERATION_ERROR',
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
