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
      '@giulio-leone/lib-shared': path.resolve(__dirname, '__mocks__/@giulio-leone/lib-shared.ts'),
      '@giulio-leone/lib-core': path.resolve(__dirname, '__mocks__/@giulio-leone/lib-core.ts'),
    },
  },
});
