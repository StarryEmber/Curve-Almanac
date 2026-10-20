// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from './App';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function stubApi(info: () => Promise<unknown>): void {
  vi.stubGlobal('api', {
    app: { info },
    log: {
      write: async () => ({ ok: true, data: { ok: true } }),
    },
  });
}

describe('App shell', () => {
  it('renders the product title before the main process answers', () => {
    stubApi(() => new Promise(() => undefined));

    render(<App />);

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Curve Studio');
    expect(screen.getByRole('status').textContent).toContain('Connecting');
  });

  it('shows the runtime facts from the app:info response', async () => {
    stubApi(async () => ({
      ok: true,
      data: { version: '0.1.0', platform: 'win32', locale: 'en-US' },
    }));

    render(<App />);

    const facts = await screen.findByTestId('runtime-status');
    expect(facts.textContent).toContain('0.1.0');
    expect(facts.textContent).toContain('win32');
    expect(facts.textContent).toContain('en-US');
  });

  it('shows a localised toast instead of the raw main-process error', async () => {
    stubApi(async () => ({
      ok: false,
      error: { code: 'E_WS_LOCKED', message: 'SECRET RAW MESSAGE' },
    }));

    render(<App />);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('E_WS_LOCKED');
    expect(alert.textContent).not.toContain('SECRET RAW MESSAGE');
    expect(screen.getByRole('status').textContent).toContain('unavailable');
  });

  it('reports a rejected bridge instead of crashing', async () => {
    stubApi(async () => Promise.reject(new Error('no handler registered')));

    render(<App />);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('E_UNKNOWN');
  });
});
