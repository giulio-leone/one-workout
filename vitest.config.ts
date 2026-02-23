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
      '@giulio-leone/schemas': path.resolve(__dirname, '../onecoach-schemas/src/index.ts'),
      '@giulio-leone/constants': path.resolve(__dirname, '../onecoach-constants/src/index.ts'),
      '@giulio-leone/types': path.resolve(__dirname, '../onecoach-types/src/index.ts'),
    },
  },
});
