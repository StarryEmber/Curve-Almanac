/**
 * IPC channel names, frozen by SPEC §15.1.
 *
 * This module is deliberately dependency-free: the preload bundle imports it,
 * and a sandboxed preload may only load `electron` plus bundled local code
 * (SPEC §15.4). Zod schemas live in `./ipc.ts`, which the preload never imports.
 */

export const IPC_CHANNELS = {
  appInfo: 'app:info',
  appQuitResponse: 'app:quit-response',
  dialogPickDirectory: 'dialog:pickDirectory',
  dialogSaveFile: 'dialog:saveFile',
  workspaceCreate: 'workspace:create',
  workspaceOpen: 'workspace:open',
  workspaceInspect: 'workspace:inspect',
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
  fileExportCsv: 'file:exportCsv',
  fileArchiveImport: 'file:archiveImport',
  backupList: 'backup:list',
  backupRestore: 'backup:restore',
  logWrite: 'log:write',
} as const;

/**
 * Main → renderer event channels (T5.3 quit handshake). They are not
 * `ipcMain.handle` request channels, so they stay out of `ALL_IPC_CHANNELS`
 * (which `ipc.spec.ts` probes for registered handlers).
 */
export const IPC_EVENT_CHANNELS = {
  appQuitRequested: 'app:quit-requested',
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
export type IpcEventChannel = (typeof IPC_EVENT_CHANNELS)[keyof typeof IPC_EVENT_CHANNELS];

/** Every invoke channel the contract declares, whether wired yet or not. */
export const ALL_IPC_CHANNELS: readonly IpcChannel[] = Object.freeze(Object.values(IPC_CHANNELS));

/**
 * Channels wired in this milestone. Everything else belongs to later milestones
 * and must stay unregistered: an unhandled channel is rejected by Electron,
 * which is the behaviour the T0.3 acceptance criteria ask for.
 *
 * T1.2 adds the workspace lifecycle and `manifest:write`; T1.3 adds the three
 * `table:*` channels; T2.1 adds `dialog:pickDirectory` for the welcome page.
 * T5.3 adds `workspace:inspect`, the recent-list mutations and the quit
 * handshake response.
 */
export const IMPLEMENTED_IPC_CHANNELS = [
  IPC_CHANNELS.appInfo,
  IPC_CHANNELS.appQuitResponse,
  IPC_CHANNELS.dialogPickDirectory,
  IPC_CHANNELS.logWrite,
  IPC_CHANNELS.workspaceCreate,
  IPC_CHANNELS.workspaceOpen,
  IPC_CHANNELS.workspaceInspect,
  IPC_CHANNELS.workspaceClose,
  IPC_CHANNELS.workspaceRecent,
  IPC_CHANNELS.workspaceRecentRemove,
  IPC_CHANNELS.workspaceRecentClear,
  IPC_CHANNELS.manifestWrite,
  IPC_CHANNELS.tableRead,
  IPC_CHANNELS.tableWrite,
  IPC_CHANNELS.tableTrash,
  IPC_CHANNELS.fileImportText,
  IPC_CHANNELS.fileExportText,
  IPC_CHANNELS.fileExportCsv,
  IPC_CHANNELS.fileArchiveImport,
] as const;
