// @vitest-environment jsdom

import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppCoreProvider } from './use-app-core';
import { useQuitGuard } from './use-quit-guard';

import type { RendererCore } from './renderer-core';
import type { QuitRequest } from '../../shared/contracts/ipc';
import type { ReactNode } from 'react';

interface Harness {
  api: {
    app: {
      onQuitRequested: (handler: (request: QuitRequest) => void) => () => void;
      respondToQuit: ReturnType<typeof vi.fn>;
    };
    workspace: { close: ReturnType<typeof vi.fn> };
  };
  flushSaves: ReturnType<typeof vi.fn>;
  emit: (request: QuitRequest) => void;
  core: RendererCore;
}

function createHarness(options: {
  flushOk?: boolean;
  closeFails?: boolean;
  workspaceId?: string | null;
}): Harness {
  let listener: ((request: QuitRequest) => void) | undefined;
  const api = {
    app: {
      onQuitRequested: (handler: (request: QuitRequest) => void): (() => void) => {
        listener = handler;
        return () => {
          listener = undefined;
        };
      },
      respondToQuit: vi.fn(async () => ({ ok: true as const, data: { ok: true as const } })),
    },
    workspace: {
      close: vi.fn(async () => {
        if (options.closeFails === true) {
          throw new Error('main process is gone');
        }
        return { ok: true as const, data: { ok: true as const } };
      }),
    },
  };
  const flushSaves = vi.fn(async () =>
    options.flushOk === false
      ? { ok: false as const, error: { code: 'E_FS_WRITE' as const, message: 'disk full' } }
      : { ok: true as const, data: undefined },
  );
  const workspace = options.workspaceId === null ? null : { id: options.workspaceId ?? 'ws_1' };
  const core = {
    api,
    core: {
      actions: { flushSaves },
      store: { getState: () => ({ workspace }) },
    },
    tableIo: { terminate: () => undefined },
    query: { terminate: () => undefined },
  } as unknown as RendererCore;

  return {
    api,
    flushSaves,
    emit: (request) => {
      listener?.(request);
    },
    core,
  };
}

function renderGuard(core: RendererCore): void {
  const wrapper = ({ children }: { children: ReactNode }): ReactNode => (
    <AppCoreProvider core={core}>{children}</AppCoreProvider>
  );
  renderHook(() => useQuitGuard(), { wrapper });
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useQuitGuard', () => {
  it('flushes, releases the workspace lock and answers the handshake', async () => {
    const harness = createHarness({});
    renderGuard(harness.core);

    harness.emit({ reason: 'window-close' });

    await waitFor(() => {
      expect(harness.api.app.respondToQuit).toHaveBeenCalledWith({
        action: 'quit',
        flushed: true,
      });
    });
    expect(harness.flushSaves).toHaveBeenCalledTimes(1);
    expect(harness.api.workspace.close).toHaveBeenCalledWith({ workspaceId: 'ws_1' });
  });

  it('reports a failed flush and keeps the lock for the next recovery prompt', async () => {
    const harness = createHarness({ flushOk: false });
    renderGuard(harness.core);

    harness.emit({ reason: 'app-quit' });

    await waitFor(() => {
      expect(harness.api.app.respondToQuit).toHaveBeenCalledWith({
        action: 'quit',
        flushed: false,
      });
    });
    expect(harness.api.workspace.close).not.toHaveBeenCalled();
  });

  it('still answers when releasing the lock fails after a successful flush', async () => {
    const harness = createHarness({ closeFails: true });
    renderGuard(harness.core);

    harness.emit({ reason: 'app-quit' });

    await waitFor(() => {
      expect(harness.api.app.respondToQuit).toHaveBeenCalledWith({
        action: 'quit',
        flushed: true,
      });
    });
  });

  it('answers without closing a workspace when none is open', async () => {
    const harness = createHarness({ workspaceId: null });
    renderGuard(harness.core);

    harness.emit({ reason: 'window-close' });

    await waitFor(() => {
      expect(harness.api.app.respondToQuit).toHaveBeenCalledWith({
        action: 'quit',
        flushed: true,
      });
    });
    expect(harness.api.workspace.close).not.toHaveBeenCalled();
  });
});
