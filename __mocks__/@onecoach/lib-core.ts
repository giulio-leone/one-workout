/**
 * Mock for @onecoach/lib-core used in tests.
 * Provides a no-op logger to avoid transitive prisma/next-auth imports.
 */

const noop = () => {};

export const logger = {
  info: noop,
  warn: noop,
  error: noop,
  debug: noop,
  log: noop,
};
