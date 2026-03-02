/**
 * Exercise Generation Service
 *
 * DEPRECATED: Legacy SDK v3.1 service. Exercise generation now uses Gauss agents.
 * Kept for type exports only.
 */

// Legacy execute removed — use Gauss Agent.run() via gauss-agents package
type ProgressCallback = (event: { step: string; message: string; progress: number }) => void;
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
  // Legacy SDK execute() removed — use Gauss Agent.run() via gauss-agents package
  throw new Error('Legacy generateExercises() is deprecated. Use Gauss exercise agent instead.');
}

// =============================================================================
// Re-exports
// =============================================================================

export type { ExerciseGenerationInput, ExerciseGenerationOutput };
