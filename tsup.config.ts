import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'core/transformers/program-transform': 'src/core/transformers/program-transform.ts',
    'core/transformers/program-server-transform': 'src/core/transformers/program-server-transform.ts',
    'core/normalizers/workout-normalizer': 'src/core/normalizers/workout-normalizer.ts',
    'core/calculators/weight-calculator': 'src/core/calculators/weight-calculator.ts',
    'core/calculators/progression-calculator': 'src/core/calculators/progression-calculator.ts',
  },
  format: ['esm', 'cjs'],
  dts: false,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  external: [
    /^@giulio-leone\/.*/,
    '@prisma/client',
    'ai',
    'xlsx',
    'zod',
  ],
});
