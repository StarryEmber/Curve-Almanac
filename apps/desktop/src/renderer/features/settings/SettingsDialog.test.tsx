// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppCoreProvider } from '../../app-core/use-app-core';
import { I18nProvider } from '../../i18n';

import { SettingsDialog } from './SettingsDialog';
import { SettingsProvider } from './SettingsProvider';

import type { AppSettings } from '../../../shared/contracts/settings';
import type { RendererCore } from '../../app-core/renderer-core';
import type { ReactElement, ReactNode } from 'react';

const SETTINGS: AppSettings = {
  version: 1,
  theme: 'system',
  locale: 'zh-CN',
  autosave: true,
  defaultTableStyleId: 'builtin.report-light',
};

const USER_STYLE = {
  id: 'sty_warm',
  name: 'Warm',
  builtin: false,
  tokens: {},
  columnOverrides: {},
  conditionalRules: [],
};

interface HarnessOptions {
  workspace?: { id: string; name: string; settings: { defaultTableStyleId: string } } | null;
  userStyles?: Record<string, unknown>;
  applyResult?:
    { ok: true; data: undefined } | { ok: false; error: { code: string; message: string } };
}

function harness(options: HarnessOptions = {}) {
  const state = {
    workspace: options.workspace ?? null,
    tableStyles: options.userStyles ?? {},
    ui: { save: { status: 'idle', pending: 0, unsaved: false, error: null } },
  };
  const applyTableStyle = vi.fn(
    async () => options.applyResult ?? { ok: true as const, data: undefined },
  );
  const core = {
    api: {},
    core: {
      actions: { applyTableStyle },
      store: { getState: () => state, subscribe: () => () => undefined },
      setAutosaveEnabled: () => undefined,
    },
    tableIo: { terminate: () => undefined },
    query: { terminate: () => undefined },
  } as unknown as RendererCore;
  const updateSettings = vi.fn(async (next: AppSettings) => ({
    ok: true as const,
    data: next,
  }));
  return { core, applyTableStyle, updateSettings };
}

function renderDialog(
  parts: ReturnType<typeof harness>,
  opts: { open?: boolean; onClose?: () => void } = {},
): void {
  const api = {
    settings: async () => ({ ok: true as const, data: SETTINGS }),
    updateSettings: parts.updateSettings,
  };
  const wrapper = ({ children }: { children: ReactNode }): ReactElement => (
    <SettingsProvider initialSettings={SETTINGS} api={api}>
      <I18nProvider initialLocale="zh-CN">
        <AppCoreProvider core={parts.core}>{children}</AppCoreProvider>
      </I18nProvider>
    </SettingsProvider>
  );
  render(<SettingsDialog open={opts.open ?? true} onClose={opts.onClose ?? (() => undefined)} />, {
    wrapper,
  });
}

afterEach(() => {
  cleanup();
});

describe('SettingsDialog', () => {
  it('shows the current preferences and closes from the footer', () => {
    const parts = harness();
    const onClose = vi.fn();
    renderDialog(parts, { onClose });

    expect(screen.getByTestId('settings-dialog')).toBeDefined();
    expect((screen.getByTestId('settings-theme') as HTMLSelectElement).value).toBe('system');
    expect((screen.getByTestId('settings-language') as HTMLSelectElement).value).toBe('zh-CN');
    expect((screen.getByTestId('settings-autosave') as HTMLSelectElement).value).toBe('on');
    expect((screen.getByTestId('settings-default-style') as HTMLSelectElement).value).toBe(
      'builtin.report-light',
    );

    fireEvent.click(screen.getByTestId('settings-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('persists theme, language and autosave changes immediately', async () => {
    const parts = harness();
    renderDialog(parts);

    fireEvent.change(screen.getByTestId('settings-theme'), { target: { value: 'dark' } });
    fireEvent.change(screen.getByTestId('settings-language'), { target: { value: 'en-US' } });
    fireEvent.change(screen.getByTestId('settings-autosave'), { target: { value: 'off' } });

    await waitFor(() => {
      expect(parts.updateSettings).toHaveBeenCalledTimes(3);
    });
    expect(parts.updateSettings.mock.calls[0]?.[0]).toMatchObject({ theme: 'dark' });
    expect(parts.updateSettings.mock.calls[1]?.[0]).toMatchObject({
      theme: 'dark',
      locale: 'en-US',
    });
    expect(parts.updateSettings.mock.calls[2]?.[0]).toMatchObject({
      theme: 'dark',
      locale: 'en-US',
      autosave: false,
    });
  });

  it('seeds the next workspace with the chosen builtin style when none is open', async () => {
    const parts = harness();
    renderDialog(parts);

    fireEvent.change(screen.getByTestId('settings-default-style'), {
      target: { value: 'builtin.finance' },
    });

    await waitFor(() => {
      expect(parts.updateSettings).toHaveBeenCalledWith(
        expect.objectContaining({ defaultTableStyleId: 'builtin.finance' }),
      );
    });
    expect(parts.applyTableStyle).not.toHaveBeenCalled();
  });

  it('applies a workspace default style through the existing command', async () => {
    const parts = harness({
      workspace: {
        id: 'ws_1',
        name: 'Demo',
        settings: { defaultTableStyleId: 'builtin.report-light' },
      },
      userStyles: { sty_warm: USER_STYLE },
    });
    renderDialog(parts);

    fireEvent.change(screen.getByTestId('settings-default-style'), {
      target: { value: 'sty_warm' },
    });

    await waitFor(() => {
      expect(parts.applyTableStyle).toHaveBeenCalledWith('sty_warm', { kind: 'default' });
    });
    // A user style is workspace-specific and must not become the app seed.
    expect(parts.updateSettings).not.toHaveBeenCalled();
  });

  it('shows a command failure inline instead of pretending it applied', async () => {
    const parts = harness({
      workspace: {
        id: 'ws_1',
        name: 'Demo',
        settings: { defaultTableStyleId: 'builtin.report-light' },
      },
      applyResult: {
        ok: false,
        error: { code: 'E_VALIDATION', message: 'style missing' },
      },
    });
    renderDialog(parts);

    fireEvent.change(screen.getByTestId('settings-default-style'), {
      target: { value: 'builtin.dark' },
    });

    await waitFor(() => {
      expect(screen.getByTestId('settings-style-error').textContent).toContain('E_VALIDATION');
    });
  });
});
