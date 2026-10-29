import { describe, expect, it } from 'vitest';

import {
  ALL_IPC_CHANNELS,
  IMPLEMENTED_IPC_CHANNELS,
  IPC_CHANNELS,
  IPC_EVENT_CHANNELS,
} from './channels';

/** SPEC §15.1, transcribed independently so a renamed channel fails here. */
const SPEC_CHANNELS = {
  appInfo: 'app:info',
  appSettings: 'app:settings',
  appSettingsUpdate: 'app:settings:update',
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
};

/** SPEC §15.1 main → renderer events (T5.3 quit handshake). */
const SPEC_EVENT_CHANNELS = {
  appQuitRequested: 'app:quit-requested',
};

describe('IPC channels', () => {
  it('uses exactly the names frozen by SPEC §15.1', () => {
    expect(IPC_CHANNELS).toEqual(SPEC_CHANNELS);
    expect(IPC_EVENT_CHANNELS).toEqual(SPEC_EVENT_CHANNELS);
  });

  it('lists every channel once', () => {
    const names = [...ALL_IPC_CHANNELS];

    expect(names).toHaveLength(Object.keys(SPEC_CHANNELS).length);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual(Object.values(SPEC_CHANNELS));
  });

  it('wires app/log, workspace, manifest, table, directory picker and import files', () => {
    expect([...IMPLEMENTED_IPC_CHANNELS]).toEqual([
      IPC_CHANNELS.appInfo,
      IPC_CHANNELS.appSettings,
      IPC_CHANNELS.appSettingsUpdate,
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
    ]);
  });

  it('keeps the implemented set inside the declared contract', () => {
    for (const channel of IMPLEMENTED_IPC_CHANNELS) {
      expect(ALL_IPC_CHANNELS).toContain(channel);
    }
  });
});
