// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from './App';

import type { AppInfo, IpcResult } from '../shared/ipc';

function stubAppInfo(impl: () => Promise<IpcResult<AppInfo>>): void {
  vi.stubGlobal('api', { app: { info: impl } });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('App shell', () => {
  it('renders the product title before the main process answers', () => {
    stubAppInfo(() => new Promise<IpcResult<AppInfo>>(() => undefined));

    render(<App />);

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Curve Studio');
    expect(screen.getByRole('status').textContent).toContain('Connecting');
  });

  it('shows the runtime facts from the app:info response', async () => {
    stubAppInfo(async () => ({
      ok: true,
      data: { version: '0.1.0', platform: 'win32', locale: 'en-US' },
    }));

    render(<App />);

    const facts = await screen.findByTestId('runtime-status');
    expect(facts.textContent).toContain('0.1.0');
    expect(facts.textContent).toContain('win32');
    expect(facts.textContent).toContain('en-US');
  });

  it('shows the error envelope message when the main process rejects the call', async () => {
    stubAppInfo(async () => ({
      ok: false,
      error: { code: 'E_UNKNOWN', message: 'main is unavailable' },
    }));

    render(<App />);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('main is unavailable');
  });

  it('reports a rejected bridge instead of crashing', async () => {
    stubAppInfo(async () => Promise.reject(new Error('no handler registered')));

    render(<App />);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('did not answer');
  });
});
