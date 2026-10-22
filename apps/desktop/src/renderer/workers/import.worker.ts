/**
 * Import Worker entry (T2.5). Wiring only; the state machine lives in
 * `../import/worker-handler.ts` so it can be unit tested in Node.
 */

import { createImportWorkerHandler } from '../import/worker-handler';

interface ImportWorkerScope {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  postMessage(message: unknown): void;
}

const scope = globalThis as unknown as ImportWorkerScope;
const handler = createImportWorkerHandler();

scope.onmessage = (event) => {
  scope.postMessage(handler.handle(event.data));
};
