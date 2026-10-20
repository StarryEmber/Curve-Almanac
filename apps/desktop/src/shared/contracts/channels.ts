/**
 * IPC channel names, frozen by SPEC §15.1.
 *
 * This module is deliberately dependency-free: the preload bundle imports it,
 * and a sandboxed preload may only load `electron` plus bundled local code
 * (SPEC §15.4). Zod schemas live in `./ipc.ts`, which the preload never imports.
 */

export const IPC_CHANNELS = {
  appInfo: 'app:info',
  dialogPickDirectory: 'dialog:pickDirectory',
  dialogSaveFile: 'dialog:saveFile',
  workspaceCreate: 'workspace:create',
  workspaceOpen: 'workspace:open',
  workspaceClose: 'workspace:close',
  workspaceRecent: 'workspace:recent',
  workspaceRecentRemove: 'workspace:recent:remove',
  workspaceRecentClear: 'workspace:recent:clear',
  tableRead: 'table:read',
  tableWrite: 'table:write',
  tableTrash: 'table:trash',
  manifestWrite: 'manifest:write',
  fileImportText: 'file:importText',
  fileExportText: 'file:exportText',
  backupList: 'backup:list',
  backupRestore: 'backup:restore',
  logWrite: 'log:write',
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

/** Every channel the contract declares, whether wired yet or not. */
export const ALL_IPC_CHANNELS: readonly IpcChannel[] = Object.freeze(Object.values(IPC_CHANNELS));

/**
 * Channels wired in this milestone. Everything else belongs to T1.2/T1.3 and
 * must stay unregistered: an unhandled channel is rejected by Electron, which
 * is the behaviour the T0.3 acceptance criteria ask for.
 */
export const IMPLEMENTED_IPC_CHANNELS = [IPC_CHANNELS.appInfo, IPC_CHANNELS.logWrite] as const;
