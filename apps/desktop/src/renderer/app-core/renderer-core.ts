/**
 * Renderer composition root (T2.1): IPC-backed persistence, the table Worker
 * and one app-core instance. Components never construct stores themselves.
 */

import { createAppCore } from '@curve/app-core';
import type { AppCore } from '@curve/app-core';

import { createApiClient } from '../api-client';
import { createTableIoClient } from '../table-io/client';

import { createRendererWorkspaceStore, unwrapIpc } from './workspace-store';

import type { RendererWorkspaceStore } from './workspace-store';
import type { CurveApi } from '../../shared/contracts/ipc';
import type { TableIoClient } from '../table-io/client';

export interface RendererCore {
  readonly api: CurveApi;
  readonly workspaceStore: RendererWorkspaceStore;
  readonly core: AppCore;
  readonly tableIo: TableIoClient;
}

export function createRendererCore(bridge: CurveApi | undefined): RendererCore {
  const api = createApiClient(bridge);
  const workspaceStore = createRendererWorkspaceStore(api);
  const tableIo = createTableIoClient();

  const core = createAppCore({
    workspaceStore,
    decodeTable: async (jsonl, table) => {
      const decoded = await tableIo.decode(jsonl, table);
      if (!decoded.ok) {
        throw decoded.error;
      }
      return decoded.result;
    },
    encodeTable: (rows) => tableIo.encode(rows),
    archiveImport: async (request) => unwrapIpc(await api.file.archiveImport(request)),
  });

  return { api, workspaceStore, core, tableIo };
}
