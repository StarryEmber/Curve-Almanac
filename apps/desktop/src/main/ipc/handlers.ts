/**
 * The channels wired in T0.3: `app:info` and `log:write`.
 *
 * Each handler is a thin adapter over an injected dependency so it can be unit
 * tested without Electron (see handlers.test.ts).
 */

import { IPC_CHANNELS } from '../../shared/contracts/channels';
import {
  appInfoRequestSchema,
  appInfoResponseSchema,
  logWriteRequestSchema,
  logWriteResponseSchema,
} from '../../shared/contracts/ipc';
import { normalizeLogLevel } from '../logger';

import type { AppInfo, OkReply } from '../../shared/contracts/ipc';
import type { Logger } from '../logger';
import type { IpcRegistrar } from './register';

export interface RegisterIpcHandlersOptions {
  registrar: IpcRegistrar;
  logger: Logger;
  /** Injected so tests can answer without an Electron `app` module. */
  getAppInfo: () => AppInfo;
}

export function registerIpcHandlers(options: RegisterIpcHandlersOptions): void {
  const { registrar, logger } = options;

  registrar.handle(
    IPC_CHANNELS.appInfo,
    { request: appInfoRequestSchema, response: appInfoResponseSchema },
    () => options.getAppInfo(),
  );

  registrar.handle(
    IPC_CHANNELS.logWrite,
    { request: logWriteRequestSchema, response: logWriteResponseSchema },
    (request): OkReply => {
      // Renderer diagnostics are prefixed so they are distinguishable from
      // main-process log lines. The renderer owns what it puts in `detail`.
      logger[normalizeLogLevel(request.level)](`[renderer] ${request.message}`, request.detail);
      return { ok: true };
    },
  );
}
