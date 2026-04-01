import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
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
