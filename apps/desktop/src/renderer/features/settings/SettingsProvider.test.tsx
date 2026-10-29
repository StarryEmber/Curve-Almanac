// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SettingsProvider, useSettings } from './SettingsProvider';

import type { AppSettings } from '../../../shared/contracts/settings';
import type { ReactElement, ReactNode } from 'react';

const SETTINGS: AppSettings = {
  version: 1,
  theme: 'system',
  locale: 'zh-CN',
  autosave: true,
  defaultTableStyleId: 'builtin.report-light',
};

function Consumer(): ReactElement {
  const { settings, ready, error, update } = useSettings();
  return (
    <div>
      <span data-testid="settings-value">
        {settings.locale}/{settings.theme}/{String(settings.autosave)}/
        {settings.defaultTableStyleId}
      </span>
      <span data-testid="settings-ready">{String(ready)}</span>
      <span data-testid="settings-error">{error?.code ?? ''}</span>
      <button
        onClick={() => {
          void update({ locale: 'en-US', theme: 'dark' });
        }}
      >
        change
      </button>
      <button
        onClick={() => {
          void update({ autosave: false });
        }}
      >
        autosave off
      </button>
    </div>
  );
}

function renderProvider(
  api: Parameters<typeof SettingsProvider>[0]['api'],
  initialSettings?: AppSettings,
): void {
  const wrapper = ({ children }: { children: ReactNode }): ReactElement => (
    <SettingsProvider initialSettings={initialSettings} api={api}>
      {children}
    </SettingsProvider>
  );
  render(<Consumer />, { wrapper });
}

afterEach(() => {
  cleanup();
});

describe('SettingsProvider', () => {
  it('starts from the settings read before mount', () => {
    const api = {
      settings: vi.fn(async () => ({ ok: true as const, data: SETTINGS })),
      updateSettings: vi.fn(async (next: AppSettings) => ({ ok: true as const, data: next })),
    };
    renderProvider(api, SETTINGS);

    expect(screen.getByTestId('settings-value').textContent).toBe(
      'zh-CN/system/true/builtin.report-light',
    );
    expect(screen.getByTestId('settings-ready').textContent).toBe('true');
    expect(api.settings).not.toHaveBeenCalled();
  });

  it('loads asynchronously when no initial settings were supplied', async () => {
    const api = {
      settings: vi.fn(async () => ({
        ok: true as const,
        data: { ...SETTINGS, locale: 'en-US' as const, theme: 'dark' as const },
      })),
      updateSettings: vi.fn(async (next: AppSettings) => ({ ok: true as const, data: next })),
    };
    renderProvider(api);

    expect(screen.getByTestId('settings-ready').textContent).toBe('false');
    await waitFor(() => {
      expect(screen.getByTestId('settings-value').textContent).toBe(
        'en-US/dark/true/builtin.report-light',
      );
    });
    expect(screen.getByTestId('settings-ready').textContent).toBe('true');
  });

  it('applies updates optimistically and persists the complete document', async () => {
    const api = {
      settings: vi.fn(async () => ({ ok: true as const, data: SETTINGS })),
      updateSettings: vi.fn(async (next: AppSettings) => ({ ok: true as const, data: next })),
    };
    renderProvider(api, SETTINGS);

    fireEvent.click(screen.getByRole('button', { name: 'change' }));

    expect(screen.getByTestId('settings-value').textContent).toBe(
      'en-US/dark/true/builtin.report-light',
    );
    await waitFor(() => {
      expect(api.updateSettings).toHaveBeenCalledWith({
        ...SETTINGS,
        locale: 'en-US',
        theme: 'dark',
      });
    });
    expect(screen.getByTestId('settings-error').textContent).toBe('');
  });

  it('keeps the optimistic value and exposes a persistence failure', async () => {
    const api = {
      settings: vi.fn(async () => ({ ok: true as const, data: SETTINGS })),
      updateSettings: vi.fn(async () => ({
        ok: false as const,
        error: { code: 'E_FS_WRITE' as const, message: 'disk full' },
      })),
    };
    renderProvider(api, SETTINGS);

    fireEvent.click(screen.getByRole('button', { name: 'autosave off' }));

    await waitFor(() => {
      expect(screen.getByTestId('settings-error').textContent).toBe('E_FS_WRITE');
    });
    expect(screen.getByTestId('settings-value').textContent).toContain('/false/');
  });

  it('never sends an older document after a rapid newer change', async () => {
    const sent: AppSettings[] = [];
    const api = {
      settings: vi.fn(async () => ({ ok: true as const, data: SETTINGS })),
      updateSettings: vi.fn(async (next: AppSettings) => {
        sent.push(next);
        return { ok: true as const, data: next };
      }),
    };
    renderProvider(api, SETTINGS);

    fireEvent.click(screen.getByRole('button', { name: 'change' }));
    fireEvent.click(screen.getByRole('button', { name: 'autosave off' }));

    await waitFor(() => {
      expect(sent).toHaveLength(2);
    });
    expect(sent[0]).toMatchObject({ locale: 'en-US', theme: 'dark', autosave: true });
    expect(sent[1]).toMatchObject({ locale: 'en-US', theme: 'dark', autosave: false });
  });
});
