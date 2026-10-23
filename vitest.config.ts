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
      'scripts/**/*.test.ts',
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
        // Type-only modules: they compile to no executable statements, so V8
        // reports them as 0% and distorts their package's line coverage.
        'packages/domain/src/types.ts',
        'packages/persistence/src/types.ts',
        'packages/app-core/src/commands/types.ts',
        'packages/app-core/src/state/types.ts',
        'apps/desktop/src/main/index.ts',
        'apps/desktop/src/preload/index.ts',
        'apps/desktop/src/renderer/main.tsx',
        // Worker entry: one `onmessage` forwarding call into the pure handler
        // in `table-io/handler.ts`; the E2E table scenario covers the wiring.
        'apps/desktop/src/renderer/workers/*.worker.ts',
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
