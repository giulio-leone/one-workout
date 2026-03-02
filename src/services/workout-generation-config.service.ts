/**
 * Workout Generation Config Service
 *
 * Handles model configuration, provider setup, and API key management
 * for workout generation.
 *
 * Single Responsibility: Configuration only
 */

import { AIModelService, AIFrameworkConfigService, FrameworkFeature } from '@giulio-leone/ai-config';
import type { LanguageModel } from 'ai';

export interface ModelConfig {
  modelId: string;
  model: LanguageModel;
  maxTokens?: number;
  providerOptions: Record<string, unknown>;
}

export class WorkoutGenerationConfigService {
  /**
   * Get model configuration with priority:
   * 1. Request body model
   * 2. DB Operation Config (PLAN_GENERATION)
   * 3. OpenRouter defaultModel from DB
   * 4. Fallback: error
   */
  static async getModelConfig(
    requestedModel?: string,
    logger?: {
      info: (step: string, message: string, data?: unknown) => void;
      warn: (step: string, message: string, data?: unknown) => void;
    }
  ): Promise<ModelConfig> {
    // Use unified Standardized Model Selection Service
    const standardizedConfig = await AIModelService.getStandardizedModelConfig(
      'PLAN_GENERATION', // operationType
      requestedModel,
      logger
    );

    return {
      modelId: standardizedConfig.modelId,
      model: standardizedConfig.model,
      maxTokens: standardizedConfig.maxTokens,
      providerOptions: standardizedConfig.providerOptions,
    };
  }

  /**
   * Get retry count from DB or default
   */
  static async getRetryCount(): Promise<number> {
    try {
      const { isEnabled, config } = await AIFrameworkConfigService.getConfig(
        FrameworkFeature.WORKOUT_GENERATION_RETRY
      );

      // Even if "disabled", we want at least 1 retry for transient network/provider errors
      // If enabled, we use the config count or default to 2
      const baseCount = 1;

      if (isEnabled && config && typeof config.count === 'number') {
        return Math.max(baseCount, config.count);
      }

      return 2; // Default for workout generation (more complex than nutrition)
    } catch (_error) {
      return 2;
    }
  }
}
