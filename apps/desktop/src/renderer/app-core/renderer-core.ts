/**
 * Renderer composition root (T2.1): IPC-backed persistence, the table Worker
 * and one app-core instance. Components never construct stores themselves.
 */

import { createAppCore } from '@curve/app-core';
import type { AppCore } from '@curve/app-core';

import { createApiClient } from '../api-client';
import { fieldTypeLookup } from '../plugins';
import { createQueryClient } from '../query/client';
import { createTableIoClient } from '../table-io/client';

import { createRendererWorkspaceStore, unwrapIpc } from './workspace-store';

import type { RendererWorkspaceStore } from './workspace-store';
import type { CurveApi } from '../../shared/contracts/ipc';
import type { QueryClient } from '../query/client';
import type { TableIoClient } from '../table-io/client';

export interface RendererCore {
  readonly api: CurveApi;
  readonly workspaceStore: RendererWorkspaceStore;
  readonly core: AppCore;
  readonly tableIo: TableIoClient;
  readonly query: QueryClient;
}

export interface RendererCoreOptions {
  /** T5.5: initial autosave preference; toggled later through `core`. */
  autosaveEnabled?: boolean;
}

export function createRendererCore(
  bridge: CurveApi | undefined,
  options: RendererCoreOptions = {},
): RendererCore {
  const api = createApiClient(bridge);
  const workspaceStore = createRendererWorkspaceStore(api);
  const tableIo = createTableIoClient();
  const query = createQueryClient();

  const core = createAppCore({
    workspaceStore,
    ...(options.autosaveEnabled === undefined ? {} : { autosaveEnabled: options.autosaveEnabled }),
    // T6.2: the command layer must enforce the same semantic field-type rules
    // as the grid, so both read the plugin host registry.
    fieldTypes: fieldTypeLookup,
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

  return { api, workspaceStore, core, tableIo, query };
}
