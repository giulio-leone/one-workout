/**
 * Workout Generation Service
 *
 * Service layer for executing workout generation via OneAgent SDK v3.0.
 * Handles initialization, execution, and streaming.
 */

import { resolve } from 'path';
import { execute } from '@giulio-leone/one-agent/framework/engine';
import type { ProgressCallback } from '@giulio-leone/agent-contracts';
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

let isInitialized = false;
let basePath: string = '';

/**
 * Get the basePath for the workout generation agent.
 * Call initializeWorkoutGeneration() first, or this will auto-initialize.
 */
export function getWorkoutBasePath(): string {
  if (!isInitialized) {
    initializeWorkoutGeneration();
  }
  return basePath;
}

/**
 * Initialize the workout generation service
 *
 * @param options.basePath - Path to one-workout/src directory
 */
export function initializeWorkoutGeneration(options: { basePath?: string } = {}): void {
  if (isInitialized) return;

  // Register schemas with SDK registry
  initializeWorkoutSchemas();

  // Use provided basePath or construct from monorepo root
  // process.cwd() in Next.js = /path/to/CoachOne/apps/next
  // We need: /path/to/CoachOne/submodules/one-workout/src
  basePath = options.basePath ?? resolve(process.cwd(), '../../submodules/one-workout/src');
  isInitialized = true;
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
  // Auto-initialize if needed
  if (!isInitialized) {
    initializeWorkoutGeneration();
  }

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
      console.error('[WorkoutGeneration] Failed:', result.error);
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
