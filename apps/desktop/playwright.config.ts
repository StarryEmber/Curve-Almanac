import { defineConfig } from '@playwright/test';

/**
 * Minimal Electron E2E setup for T0.2 (E1 smoke).
 * T0.5 owns the CI integration, trace policy and visual gates.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
});
