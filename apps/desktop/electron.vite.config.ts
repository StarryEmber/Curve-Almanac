import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';

import { buildContentSecurityPolicy, type RuntimeMode } from './src/shared/csp';

import type { Plugin } from 'vite';

const fromConfigDir = (relativePath: string): string =>
  fileURLToPath(new URL(relativePath, import.meta.url));

/**
 * Injects the renderer Content-Security-Policy as a meta tag into `index.html`
 * for both `serve` (development policy) and `build` (production policy).
 *
 * A meta tag is used instead of response headers because the production
 * renderer is loaded from `file://`, where `webRequest.onHeadersReceived` is not
 * guaranteed to fire. Keeping a single injection point also means a development
 * bundle can never carry the production policy (which would break HMR).
 */
function cspPlugin(): Plugin {
  let mode: RuntimeMode = 'production';
  return {
    name: 'curve:csp-meta',
    configResolved(config) {
      mode = config.command === 'serve' ? 'development' : 'production';
    },
    transformIndexHtml() {
      return [
        {
          tag: 'meta',
          attrs: {
            'http-equiv': 'Content-Security-Policy',
            content: buildContentSecurityPolicy(mode),
          },
          injectTo: 'head-prepend',
        },
      ];
    },
  };
}

export default defineConfig({
  main: {
    // Sandboxed renderers cannot load an ESM preload, so both process bundles
    // are pinned to CJS with an explicit `.cjs` extension. `"type": "module"`
    // in package.json would otherwise make Node treat `.js` as ESM.
    build: {
      rolldownOptions: {
        input: { index: fromConfigDir('src/main/index.ts') },
        output: {
          format: 'cjs',
          entryFileNames: 'index.cjs',
          chunkFileNames: 'chunks/[name]-[hash].cjs',
        },
      },
    },
  },
  preload: {
    build: {
      rolldownOptions: {
        input: { index: fromConfigDir('src/preload/index.ts') },
        output: {
          format: 'cjs',
          entryFileNames: 'index.cjs',
          chunkFileNames: 'chunks/[name]-[hash].cjs',
        },
      },
    },
  },
  renderer: {
    plugins: [react(), cspPlugin()],
  },
});
