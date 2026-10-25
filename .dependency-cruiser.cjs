/** @type {import('dependency-cruiser').IConfiguration} */

// Rule 7 (SPEC §4.3.7) is generated per package: aliases resolve to source
// files, so a single "all packages" rule cannot tell a cross-package deep
// import from a package's own internal imports. For each package we forbid
// deep imports from *outside* that package.
const workspacePackages = [
  'domain',
  'table-engine',
  'chart-model',
  'chart-echarts',
  'persistence',
  'plugin-sdk',
  'ui',
  'app-core',
];

module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Circular dependencies break the allowed layer direction (SPEC §4.3.1).',
      from: {},
      to: { circular: true },
    },
    {
      name: 'domain-stays-pure',
      severity: 'error',
      comment: 'domain may not import React / Electron / ECharts / Zustand (SPEC §4.2, §4.3.2).',
      from: { path: '^packages/domain/' },
      to: { path: '(^|/)(react|react-dom|electron|echarts|zustand)(/|$)' },
    },
    {
      name: 'domain-no-node-core',
      severity: 'error',
      comment:
        'domain is pure logic and may not import Node builtins such as node:fs (SPEC §4.3.2).',
      from: { path: '^packages/domain/' },
      to: { dependencyTypes: ['core'] },
    },
    {
      name: 'chart-model-no-echarts',
      severity: 'error',
      comment: 'Only chart-echarts may import ECharts (SPEC §4.3.3, ADR-004).',
      from: { path: '^packages/chart-model/' },
      to: { path: '(^|/)echarts(/|$)' },
    },
    {
      name: 'only-chart-echarts-imports-echarts',
      severity: 'error',
      comment:
        'Only chart-echarts may import ECharts at all; everything else consumes RenderModel (SPEC §4.2, ADR-042).',
      from: { path: '^(?!packages/chart-echarts/)' },
      to: { path: '(^|/)echarts(/|$)' },
    },
    {
      name: 'persistence-no-electron',
      severity: 'error',
      comment:
        'persistence is Electron-free; the Electron adapter lives in apps/desktop (SPEC §4.3.4).',
      from: { path: '^packages/persistence/' },
      to: { path: '(^|/)electron(/|$)' },
    },
    {
      name: 'app-core-no-react-electron-echarts',
      severity: 'error',
      comment:
        'app-core uses the vanilla Zustand store and may not import React, Electron or ECharts (SPEC §4.2).',
      from: { path: '^packages/app-core/' },
      to: { path: '(^|/)(react|react-dom|electron|echarts)(/|$)' },
    },
    {
      name: 'ui-no-app-core-or-persistence',
      severity: 'error',
      comment: 'ui only renders; use cases live in app-core (SPEC §4.3.5).',
      from: { path: '^packages/ui/' },
      to: { path: '(packages/(app-core|persistence)|@curve/(app-core|persistence))(/|$)' },
    },
    {
      name: 'plugins-only-sdk-and-domain',
      severity: 'error',
      comment:
        'Plugins may import only @curve/plugin-sdk and @curve/domain public entries (SPEC §4.3.6).',
      from: { path: '^plugins/' },
      to: { path: '^packages/(?!plugin-sdk/|domain/)' },
    },
    {
      name: 'plugins-no-alias-to-app-internals',
      severity: 'error',
      comment: 'Plugins may not alias into app internals either (SPEC §4.3.6).',
      from: { path: '^plugins/' },
      to: {
        path: '(^|/)@curve/(app-core|table-engine|chart-model|chart-echarts|persistence|ui)(/|$)',
      },
    },
    ...workspacePackages.map((pkg) => ({
      name: `no-deep-import-into-${pkg}`,
      severity: 'error',
      comment: 'Import workspace packages from their public package entry (SPEC §4.3.7).',
      from: { path: `^(?!packages/${pkg}/)` },
      to: { path: `^packages/${pkg}/src/(?!index\\.ts$)` },
    })),
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: {
      path: '(^|/)(dist|dist-types|out|coverage|release|playwright-report|test-results|\\.vite)(/|$)',
    },
    tsConfig: { fileName: 'tsconfig.base.json' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
    reporterOptions: {
      dot: { collapsePattern: 'node_modules/[^/]+' },
    },
  },
};
