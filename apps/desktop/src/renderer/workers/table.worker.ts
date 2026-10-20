/**
 * Table data Web Worker (TASKS T1.3).
 *
 * Wiring only: the protocol logic lives in `../table-io/handler.ts` so it can
 * be unit tested in Node. This file is loaded by the renderer through
 * `createTableIoClient`, which uses `new Worker(new URL(...), { type: 'module' })`
 * so the production CSP only needs same-origin (`default-src 'self'`).
 */

import { handleTableWorkerRequest } from '../table-io/handler';

interface TableWorkerScope {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  postMessage(message: unknown): void;
}

const scope = globalThis as unknown as TableWorkerScope;

scope.onmessage = (event) => {
  scope.postMessage(handleTableWorkerRequest(event.data));
};
