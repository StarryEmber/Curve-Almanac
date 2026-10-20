import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const tsFiles = ['**/*.{ts,tsx,mts,cts}'];

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/dist-types/**',
      '**/out/**',
      '**/coverage/**',
      '**/release/**',
      '**/playwright-report/**',
      '**/test-results/**',
      '**/.vite/**',
    ],
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: { ...js.configs.recommended.rules },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: { sourceType: 'commonjs' },
  },
  ...tseslint.configs.recommended.map((config) => ({ ...config, files: tsFiles })),
  {
    files: tsFiles,
    plugins: {
      import: importPlugin,
      'react-hooks': reactHooks,
    },
    languageOptions: {
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      globals: { ...globals.node },
    },
    settings: {
      'import/resolver': {
        typescript: { project: ['tsconfig.base.json'] },
      },
    },
    rules: {
      'import/no-duplicates': 'error',
      'import/order': [
        'error',
        {
          groups: [
            'builtin',
            'external',
            'internal',
            'parent',
            'sibling',
            'index',
            'object',
            'type',
          ],
          pathGroups: [{ pattern: '@curve/**', group: 'internal', position: 'before' }],
          pathGroupsExcludedImportTypes: ['builtin'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      eqeqeq: ['error', 'always'],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@curve/*/src', '@curve/*/src/*'],
              message:
                'Import workspace packages from their package root (e.g. @curve/domain), never from src/* (SPEC §4.3.7).',
            },
          ],
        },
      ],
      'no-var': 'error',
      'prefer-const': 'error',
      'react-hooks/exhaustive-deps': 'error',
      'react-hooks/rules-of-hooks': 'error',
    },
  },
  // Renderer Node boundary (AGENTS §2.1). The runtime is already locked down by
  // `nodeIntegration: false` + `contextIsolation`; this keeps the lint/type layer
  // from regressing it and forces all privileged work through window.api.
  {
    files: ['apps/desktop/src/renderer/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser },
    },
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'process', message: 'Not available in the renderer (nodeIntegration: false).' },
        { name: 'require', message: 'Not available in the renderer (nodeIntegration: false).' },
        { name: 'module', message: 'Not available in the renderer (nodeIntegration: false).' },
        { name: 'Buffer', message: 'Not available in the renderer (nodeIntegration: false).' },
        { name: '__dirname', message: 'Not available in the renderer (nodeIntegration: false).' },
        { name: '__filename', message: 'Not available in the renderer (nodeIntegration: false).' },
        {
          name: 'global',
          message: 'Use globalThis; the Node global is not available in the renderer.',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'node:*',
                'fs',
                'path',
                'os',
                'child_process',
                'crypto',
                'http',
                'https',
                'net',
              ],
              message: 'The renderer must use the typed window.api bridge, never Node builtins.',
            },
            {
              group: ['electron', 'electron/*'],
              message: 'The renderer must use window.api, never the Electron modules directly.',
            },
            {
              group: ['@curve/*/src', '@curve/*/src/*'],
              message:
                'Import workspace packages from their package root (e.g. @curve/domain), never from src/* (SPEC §4.3.7).',
            },
          ],
        },
      ],
    },
  },
  prettier,
);
