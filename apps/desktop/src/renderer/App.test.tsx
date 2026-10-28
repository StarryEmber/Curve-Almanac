// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from './App';

function stubApi(info: () => Promise<unknown>): void {
  vi.stubGlobal('api', {
    app: { info },
    log: {
      write: async () => ({ ok: true, data: { ok: true } }),
    },
  });
}

const readyInfo = {
  ok: true,
  data: {
    version: '0.1.0',
    platform: 'win32',
    locale: 'en-US',
    documentsDir: 'C:\\Users\\test\\Documents',
  },
};

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.style.overflow = '';
});

describe('App shell', () => {
  it('lays out the title bar, sidebar, main area, inspector and status bar', () => {
    stubApi(async () => readyInfo);

    render(<App />);

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Curve Studio');
    expect(screen.getByTestId('titlebar')).toBeDefined();
    expect(screen.getByTestId('sidebar')).toBeDefined();
    expect(screen.getByRole('main')).toBeDefined();
    expect(screen.getByTestId('inspector')).toBeDefined();
    expect(screen.getByTestId('statusbar')).toBeDefined();
    expect(screen.getByRole('tab', { name: '数据表' })).toBeDefined();
    expect(document.documentElement.lang).toBe('zh-CN');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('offers a skip link to the main region', () => {
    stubApi(async () => readyInfo);

    render(<App />);

    const skip = screen.getByRole('link', { name: '跳到主内容' });
    expect(skip.getAttribute('href')).toBe('#cs-main');
    expect(screen.getByRole('main').id).toBe('cs-main');
  });

  it('shows the runtime facts from app:info in the status bar', async () => {
    stubApi(async () => readyInfo);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('runtime-status').textContent).toContain('0.1.0');
    });
    const status = screen.getByTestId('runtime-status').textContent ?? '';
    expect(status).toContain('版本');
    expect(status).toContain('win32');
  });

  it('shows a localised toast instead of the raw main-process error', async () => {
    stubApi(async () => ({
      ok: false,
      error: { code: 'E_WS_LOCKED', message: 'SECRET RAW MESSAGE' },
    }));

    render(<App />);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('E_WS_LOCKED');
    expect(alert.textContent).toContain('另一个窗口');
    expect(alert.textContent).not.toContain('SECRET RAW MESSAGE');
    expect(screen.getByTestId('runtime-status').textContent).toBe('运行时信息不可用');
  });

  it('reports a rejected bridge instead of crashing', async () => {
    stubApi(async () => Promise.reject(new Error('no handler registered')));

    render(<App />);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('E_UNKNOWN');
  });

  it('switches every shell label when the locale changes', async () => {
    stubApi(async () => readyInfo);
    render(<App />);

    fireEvent.change(screen.getByLabelText('语言'), { target: { value: 'en-US' } });

    expect(screen.getByRole('tab', { name: 'Tables' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Charts' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Help' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Toggle sidebar' })).toBeDefined();
    expect(document.documentElement.lang).toBe('en-US');
    expect(window.localStorage.getItem('curve-studio.locale')).toBe('en-US');
    await waitFor(() => {
      expect(screen.getByTestId('runtime-status').textContent).toContain('Version');
    });
  });

  it('switches the theme through the token layer', () => {
    stubApi(async () => readyInfo);
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '外观: 跟随系统' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: '深色' }));

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(window.localStorage.getItem('curve-studio.theme')).toBe('dark');

    fireEvent.click(screen.getByRole('button', { name: '外观: 深色' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: '浅色' }));

    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('collapses and restores both side panels', () => {
    stubApi(async () => readyInfo);
    render(<App />);

    const sidebarToggle = screen.getByRole('button', { name: '切换侧栏' });
    fireEvent.click(sidebarToggle);
    expect(screen.queryByTestId('sidebar')).toBeNull();
    expect(sidebarToggle.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(sidebarToggle);
    expect(screen.getByTestId('sidebar')).toBeDefined();

    const inspectorToggle = screen.getByRole('button', { name: '切换检查器' });
    fireEvent.click(inspectorToggle);
    expect(screen.queryByTestId('inspector')).toBeNull();
    fireEvent.click(inspectorToggle);
    expect(screen.getByTestId('inspector')).toBeDefined();
  });

  it('opens the help dialog, closes it with Escape and restores focus', () => {
    stubApi(async () => readyInfo);
    render(<App />);

    const help = screen.getByRole('button', { name: '帮助' });
    help.focus();
    fireEvent.click(help);

    const dialog = screen.getByRole('dialog', { name: '键盘快捷键' });
    expect(dialog).toBeDefined();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '关闭' }));

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(help);
  });

  it('opens the help dialog with F1 from the global keymap', () => {
    stubApi(async () => readyInfo);
    render(<App />);

    fireEvent.keyDown(window, { key: 'F1' });

    expect(screen.getByRole('dialog', { name: '键盘快捷键' })).toBeDefined();
  });

  it('opens the command palette with Ctrl+K, runs a command and closes on Escape', () => {
    stubApi(async () => readyInfo);
    render(<App />);

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });

    const dialog = screen.getByRole('dialog', { name: '命令面板' });
    expect(dialog).toBeDefined();
    const input = screen.getByRole('combobox', { name: '搜索命令' });
    expect(document.activeElement).toBe(input);

    fireEvent.change(input, { target: { value: '键盘' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(screen.queryByRole('dialog', { name: '命令面板' })).toBeNull();
    expect(screen.getByRole('dialog', { name: '键盘快捷键' })).toBeDefined();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('does not steal modified keys from an input or select', () => {
    stubApi(async () => readyInfo);
    render(<App />);

    fireEvent.keyDown(screen.getByLabelText('语言'), { key: 'k', ctrlKey: true });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens the new-workspace dialog and validates the name', async () => {
    stubApi(async () => readyInfo);
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '新建工作区' }));

    expect(screen.getByRole('dialog', { name: '新建工作区' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: '创建工作区' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('请输入工作区名称');
  });
});
