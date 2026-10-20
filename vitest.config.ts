import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [tsconfigPaths({ projects: ['tsconfig.base.json'] })],
  test: {
    environment: 'node',
    include: [
      'packages/*/src/**/*.test.{ts,tsx}',
      'packages/*/test/**/*.test.{ts,tsx}',
      'apps/*/src/**/*.test.{ts,tsx}',
      'apps/*/test/**/*.test.{ts,tsx}',
      'plugins/*/src/**/*.test.{ts,tsx}',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: [
        'packages/*/src/**/*.{ts,tsx}',
        'apps/*/src/**/*.{ts,tsx}',
        'plugins/*/src/**/*.{ts,tsx}',
      ],
      // Process entry points are wiring only; TESTPLAN E1 covers them end to end.
      exclude: [
        '**/*.test.{ts,tsx}',
        '**/*.d.ts',
        // Type-only module: it compiles to no executable statements, so V8
        // reports it as 0% and distorts the domain package's line coverage.
        'packages/domain/src/types.ts',
        'apps/desktop/src/main/index.ts',
        'apps/desktop/src/preload/index.ts',
        'apps/desktop/src/renderer/main.tsx',
      ],
      thresholds: {
        lines: 70,
        statements: 70,
        functions: 70,
        branches: 60,
      },
    },
  },
});
