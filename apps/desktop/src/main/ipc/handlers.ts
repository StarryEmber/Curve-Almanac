/**
 * The channels wired so far: app/log (T0.3) and workspace/manifest (T1.2).
 *
 * Each handler is a thin adapter over an injected dependency so it can be unit
 * tested without Electron (see handlers.test.ts).
 */

import type { WorkspaceStore } from '@curve/persistence';

import { IPC_CHANNELS } from '../../shared/contracts/channels';
import {
  appInfoRequestSchema,
  appInfoResponseSchema,
  logWriteRequestSchema,
  logWriteResponseSchema,
  manifestWriteRequestSchema,
  manifestWriteResponseSchema,
  workspaceCloseRequestSchema,
  workspaceCloseResponseSchema,
  workspaceCreateRequestSchema,
  workspaceCreateResponseSchema,
  workspaceOpenRequestSchema,
  workspaceOpenResponseSchema,
  workspaceRecentRequestSchema,
  workspaceRecentResponseSchema,
} from '../../shared/contracts/ipc';
import { normalizeLogLevel } from '../logger';

import type { AppInfo, OkReply, RecentEntry } from '../../shared/contracts/ipc';
import type { Logger } from '../logger';
import type { IpcRegistrar } from './register';

export interface RegisterIpcHandlersOptions {
  registrar: IpcRegistrar;
  logger: Logger;
  /** Injected so tests can answer without an Electron `app` module. */
  getAppInfo: () => AppInfo;
  workspaceStore: WorkspaceStore;
  listRecentWorkspaces: () => Promise<RecentEntry[]>;
}

export function registerIpcHandlers(options: RegisterIpcHandlersOptions): void {
  const { registrar, logger, workspaceStore } = options;

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

  registrar.handle(
    IPC_CHANNELS.workspaceCreate,
    { request: workspaceCreateRequestSchema, response: workspaceCreateResponseSchema },
    (request) => workspaceStore.create(request),
  );

  registrar.handle(
    IPC_CHANNELS.workspaceOpen,
    { request: workspaceOpenRequestSchema, response: workspaceOpenResponseSchema },
    (request) => workspaceStore.open(request),
  );

  registrar.handle(
    IPC_CHANNELS.workspaceClose,
    { request: workspaceCloseRequestSchema, response: workspaceCloseResponseSchema },
    (request) => workspaceStore.close(request),
  );

  registrar.handle(
    IPC_CHANNELS.workspaceRecent,
    { request: workspaceRecentRequestSchema, response: workspaceRecentResponseSchema },
    () => options.listRecentWorkspaces(),
  );

  registrar.handle(
    IPC_CHANNELS.manifestWrite,
    { request: manifestWriteRequestSchema, response: manifestWriteResponseSchema },
    (request) => workspaceStore.writeManifest(request),
  );
}
