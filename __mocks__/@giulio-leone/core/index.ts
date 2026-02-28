/**
 * Mock for @giulio-leone/core used in tests.
 * Provides a mockable ServiceRegistry to inject fake repositories.
 */

const registryStore = new Map<string, unknown>();

export const ServiceRegistry = {
  resolve: <T>(token: string): T => {
    const service = registryStore.get(token);
    if (!service) {
      throw new Error(`[MockServiceRegistry] No service registered for token: ${token}`);
    }
    return service as T;
  },
  register: (token: string, factory: () => unknown) => {
    registryStore.set(token, factory());
  },
  /** Test helper: directly set a mock instance */
  __setMock: (token: string, instance: unknown) => {
    registryStore.set(token, instance);
  },
  /** Test helper: clear all mocks */
  __clearAll: () => {
    registryStore.clear();
  },
};

export const REPO_TOKENS = {
  WORKOUT: 'WORKOUT_REPOSITORY',
  WORKOUT_SESSION: 'WORKOUT_SESSION_REPOSITORY',
  WORKOUT_TEMPLATE: 'WORKOUT_TEMPLATE_REPOSITORY',
  NUTRITION_PLAN: 'NUTRITION_PLAN_REPOSITORY',
  NUTRITION_DAY_LOG: 'NUTRITION_DAY_LOG_REPOSITORY',
  NUTRITION_TEMPLATE: 'NUTRITION_TEMPLATE_REPOSITORY',
  EXERCISE: 'EXERCISE_REPOSITORY',
  EXERCISE_PERFORMANCE: 'EXERCISE_PERFORMANCE_REPOSITORY',
  FOOD: 'FOOD_REPOSITORY',
  USER: 'USER_REPOSITORY',
  PROFILE: 'PROFILE_REPOSITORY',
  CONVERSATION: 'CONVERSATION_REPOSITORY',
  ANALYTICS: 'ANALYTICS_REPOSITORY',
  FLIGHT: 'FLIGHT_REPOSITORY',
  COMMERCE: 'COMMERCE_REPOSITORY',
  AGENDA: 'AGENDA_REPOSITORY',
  AI_MODEL: 'AI_MODEL_REPOSITORY',
  ADMIN: 'ADMIN_REPOSITORY',
};
