// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { AppCoreProvider } from '../../app-core/use-app-core';
import { I18nProvider } from '../../i18n';
import { SettingsProvider } from '../settings/SettingsProvider';

import {
  UnsavedChangesProvider,
  useUnsavedChangesGuard,
  type UnsavedChangesChoice,
} from './unsaved-changes';

import type { AppSettings } from '../../../shared/contracts/settings';
import type { RendererCore } from '../../app-core/renderer-core';
import type { ReactElement, ReactNode } from 'react';

const BASE_SETTINGS: AppSettings = {
  version: 1,
  theme: 'system',
  locale: 'zh-CN',
  autosave: false,
  defaultTableStyleId: 'builtin.report-light',
};

function createHarness(initialUnsaved: boolean): {
  core: RendererCore;
  setUnsaved(unsaved: boolean): void;
} {
  let unsaved = initialUnsaved;
  const listeners = new Set<() => void>();
  const state = {
    workspace: { id: 'ws_1' },
    tableStyles: {},
    ui: { save: { status: 'idle', pending: 0, unsaved, error: null } },
  };
  const core = {
    api: {},
    core: {
      actions: {},
      store: {
        getState: () => state,
        subscribe: (listener: () => void) => {
          listeners.add(listener);
          return () => {
            listeners.delete(listener);
          };
        },
      },
      setAutosaveEnabled: () => undefined,
    },
    tableIo: { terminate: () => undefined },
    query: { terminate: () => undefined },
  } as unknown as RendererCore;
  return {
    core,
    setUnsaved: (next) => {
      unsaved = next;
      state.ui.save.unsaved = next;
      for (const listener of listeners) {
        listener();
      }
    },
  };
}

function Probe(): ReactElement {
  const guard = useUnsavedChangesGuard();
  const [choice, setChoice] = useState<UnsavedChangesChoice | 'pending' | 'none'>('none');
  return (
    <div>
      <span data-testid="choice">{choice}</span>
      <button
        onClick={() => {
          setChoice('pending');
          void guard.request('quit').then((next) => {
            setChoice(next);
          });
        }}
      >
        request
      </button>
    </div>
  );
}

function renderProvider(
  harness: ReturnType<typeof createHarness>,
  settings: AppSettings = BASE_SETTINGS,
): void {
  const settingsApi = {
    settings: async () => ({ ok: true as const, data: settings }),
    updateSettings: async (next: AppSettings) => ({ ok: true as const, data: next }),
  };
  const wrapper = ({ children }: { children: ReactNode }): ReactElement => (
    <SettingsProvider initialSettings={settings} api={settingsApi}>
      <I18nProvider initialLocale="zh-CN">
        <AppCoreProvider core={harness.core}>
          <UnsavedChangesProvider>{children}</UnsavedChangesProvider>
        </AppCoreProvider>
      </I18nProvider>
    </SettingsProvider>
  );
  render(<Probe />, { wrapper });
}

afterEach(() => {
  cleanup();
});

describe('UnsavedChangesProvider', () => {
  it('does not prompt when the document is already on disk', async () => {
    const parts = createHarness(false);
    renderProvider(parts);

    fireEvent.click(screen.getByRole('button', { name: 'request' }));

    await waitFor(() => {
      expect(screen.getByTestId('choice').textContent).toBe('save');
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('does not prompt while autosave is on, even with a pending write', async () => {
    const parts = createHarness(true);
    renderProvider(parts, { ...BASE_SETTINGS, autosave: true });

    fireEvent.click(screen.getByRole('button', { name: 'request' }));

    await waitFor(() => {
      expect(screen.getByTestId('choice').textContent).toBe('save');
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('asks Save / Discard / Cancel while autosave is off and dirty', async () => {
    const parts = createHarness(true);
    renderProvider(parts);

    fireEvent.click(screen.getByRole('button', { name: 'request' }));

    const dialog = await screen.findByRole('dialog', { name: '有未保存的修改' });
    expect(dialog).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: '保存并继续' }));

    await waitFor(() => {
      expect(screen.getByTestId('choice').textContent).toBe('save');
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('resolves discard and cancel, including Escape as cancel', async () => {
    const parts = createHarness(true);
    renderProvider(parts);

    fireEvent.click(screen.getByRole('button', { name: 'request' }));
    await screen.findByRole('dialog', { name: '有未保存的修改' });
    fireEvent.click(screen.getByRole('button', { name: '放弃修改' }));
    await waitFor(() => {
      expect(screen.getByTestId('choice').textContent).toBe('discard');
    });

    fireEvent.click(screen.getByRole('button', { name: 'request' }));
    await screen.findByRole('dialog', { name: '有未保存的修改' });
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.getByTestId('choice').textContent).toBe('cancel');
    });
  });

  it('reflects a dirty transition reported by the store', async () => {
    const parts = createHarness(false);
    renderProvider(parts);

    act(() => {
      parts.setUnsaved(true);
    });
    fireEvent.click(screen.getByRole('button', { name: 'request' }));

    expect(await screen.findByRole('dialog', { name: '有未保存的修改' })).toBeDefined();
  });
});
