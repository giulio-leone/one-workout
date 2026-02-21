import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    globals: true,
  },
  resolve: {
    alias: {
      '@onecoach/lib-shared': path.resolve(__dirname, '__mocks__/@onecoach/lib-shared.ts'),
      '@onecoach/lib-core': path.resolve(__dirname, '__mocks__/@onecoach/lib-core.ts'),
    },
  },
});
