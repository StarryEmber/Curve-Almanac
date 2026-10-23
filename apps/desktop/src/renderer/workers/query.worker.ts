/**
 * Dedicated filter/sort Web Worker (T2.6).
 *
 * Wiring only: the cache and message dispatch live in
 * `../query/handler.ts`, which is unit-tested in Node. The renderer creates this
 * worker with `new Worker(new URL(...), { type: 'module' })`, so the production
 * CSP only needs same-origin (`default-src 'self'`).
 */

import { handleQueryWorkerRequest, QueryCache } from '../query/handler';

interface QueryWorkerScope {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  postMessage(message: unknown): void;
}

const scope = globalThis as unknown as QueryWorkerScope;
const cache = new QueryCache();

scope.onmessage = (event) => {
  scope.postMessage(handleQueryWorkerRequest(event.data, cache));
};
