import { describe, expect, it } from 'vitest';

import { ALL_IPC_CHANNELS, IMPLEMENTED_IPC_CHANNELS, IPC_CHANNELS } from './channels';

/** SPEC §15.1, transcribed independently so a renamed channel fails here. */
const SPEC_CHANNELS = {
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
};

describe('IPC channels', () => {
  it('uses exactly the names frozen by SPEC §15.1', () => {
    expect(IPC_CHANNELS).toEqual(SPEC_CHANNELS);
  });

  it('lists every channel once', () => {
    const names = [...ALL_IPC_CHANNELS];

    expect(names).toHaveLength(Object.keys(SPEC_CHANNELS).length);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual(Object.values(SPEC_CHANNELS));
  });

  it('wires app/log plus the T1.2 workspace lifecycle and manifest:write', () => {
    expect([...IMPLEMENTED_IPC_CHANNELS]).toEqual([
      IPC_CHANNELS.appInfo,
      IPC_CHANNELS.logWrite,
      IPC_CHANNELS.workspaceCreate,
      IPC_CHANNELS.workspaceOpen,
      IPC_CHANNELS.workspaceClose,
      IPC_CHANNELS.workspaceRecent,
      IPC_CHANNELS.manifestWrite,
    ]);
  });

  it('keeps the implemented set inside the declared contract', () => {
    for (const channel of IMPLEMENTED_IPC_CHANNELS) {
      expect(ALL_IPC_CHANNELS).toContain(channel);
    }
  });
});
