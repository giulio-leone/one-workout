/**
 * Workout Generation Service
 *
 * DEPRECATED: Legacy SDK v3.0 service. Workout generation now uses Gauss agents.
 * Kept for type exports only.
 */

// Legacy execute removed — use Gauss Agent.run() via gauss-agents package
type ProgressCallback = (event: { step: string; message: string; progress: number }) => void;
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
  _input: WorkoutGenerationInput,
  _options: GenerateOptions = {}
): Promise<WorkoutGenerationResult> {
  // Legacy SDK execute() removed — use Gauss Agent.run() via gauss-agents package
  throw new Error('Legacy generateWorkoutProgram() is deprecated. Use Gauss workout agent instead.');
}

// =============================================================================
// Re-exports
// =============================================================================

export type { WorkoutGenerationInput, WorkoutGenerationOutput };
