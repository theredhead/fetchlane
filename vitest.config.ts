import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'lcov', 'clover'],
      include: ['src/**/*.ts'],
      exclude: [
        'integrationtests/**',
        'test/**',
        'vitest*.config.ts',
        'src/data/database.ts',
        'src/data/database-metadata.ts',
        'src/data/fetch-predicate.types.ts',
        'src/types/**',
      ],
    },
    projects: [
      {
        test: {
          name: 'unit',
          globals: true,
          root: './',
          include: ['src/**/*.spec.ts'],
        },
      },
      {
        test: {
          name: 'integration',
          globals: true,
          root: './',
          include: ['integrationtests/**/*.spec.ts'],
        },
      },
    ],
  },
  plugins: [swc.vite()],
});
