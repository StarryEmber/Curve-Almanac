import { defineConfig } from '@playwright/test';

import type { ReporterDescription } from '@playwright/test';

/**
 * Electron E2E setup (TESTPLAN §1, layer L4; ADR-014 keeps E2E Windows-only).
 *
 * `pnpm e2e` builds the app first, then drives the built output through
 * Playwright's `_electron` launcher (see `e2e/fixtures.ts`).
 *
 * Artifact policy: a trace and a screenshot are kept only for failing tests and
 * are uploaded by `.github/workflows/ci.yml`. The app is launched manually, so
 * Playwright's `context`/`page` fixtures are not in play; `e2e/fixtures.ts`
 * applies the same policy explicitly. The `use` block below keeps the policy in
 * one place for any future browser-context based specs.
 */
const reporters: ReporterDescription[] = [
  ['list'],
  ['html', { outputFolder: 'playwright-report', open: 'never' }],
];
if (process.env['GITHUB_ACTIONS']) {
  // Emit `::error file=...` annotations so CI failures point at the failing
  // spec/assertion without downloading the job log.
  reporters.push(['github']);
}

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env['CI']),
  reporter: reporters,
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
