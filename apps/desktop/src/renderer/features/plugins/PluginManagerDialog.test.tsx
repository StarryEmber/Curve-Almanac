// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { SAMPLE_PLUGIN_ID, RATING_FIELD_TYPE_ID } from '@curve/plugin-sample';

import { I18nProvider } from '../../i18n';
import { activateRendererPlugins, pluginHost } from '../../plugins';
import { appendPluginLog, clearPluginLog } from '../../plugins/log';

import { PluginManagerDialog } from './PluginManagerDialog';

beforeAll(async () => {
  await activateRendererPlugins();
});

afterEach(() => {
  cleanup();
  clearPluginLog();
});

function renderManager(focus: 'plugins' | 'log' = 'plugins'): { onClose: () => void } {
  const onClose = vi.fn();
  render(
    <I18nProvider initialLocale="zh-CN">
      <PluginManagerDialog open focus={{ section: focus }} onClose={onClose} />
    </I18nProvider>,
  );
  return { onClose };
}

describe('PluginManagerDialog', () => {
  it('lists the compiled-in plugins with their state and contributions', () => {
    renderManager();

    const row = screen.getByTestId(`plugin-row-${SAMPLE_PLUGIN_ID}`);
    expect(row.getAttribute('data-plugin-status')).toBe('active');
    expect(row.textContent).toContain('Sample: Rating & Points');
    expect(row.textContent).toContain('已启用');
    expect(row.textContent).toContain('字段类型 1');
    expect(row.textContent).toContain('导入器 1');
    expect(screen.getByTestId(`plugin-toggle-${SAMPLE_PLUGIN_ID}`).textContent).toBe('禁用');
    expect(screen.getByTestId('plugin-manager').textContent).toContain('只在本次运行有效');
  });

  it('disables and re-enables a plugin, refreshing the contribution counts', async () => {
    renderManager();
    const row = screen.getByTestId(`plugin-row-${SAMPLE_PLUGIN_ID}`);

    act(() => {
      screen.getByTestId(`plugin-toggle-${SAMPLE_PLUGIN_ID}`).click();
    });
    await waitFor(() => {
      expect(row.getAttribute('data-plugin-status')).toBe('inactive');
    });
    expect(pluginHost.fields.get(RATING_FIELD_TYPE_ID)).toBeUndefined();
    expect(row.textContent).toContain('字段类型 0');
    expect(screen.getByTestId(`plugin-toggle-${SAMPLE_PLUGIN_ID}`).textContent).toBe('启用');

    act(() => {
      screen.getByTestId(`plugin-toggle-${SAMPLE_PLUGIN_ID}`).click();
    });
    await waitFor(() => {
      expect(row.getAttribute('data-plugin-status')).toBe('active');
    });
    expect(pluginHost.fields.get(RATING_FIELD_TYPE_ID)).toBeDefined();
    expect(row.textContent).toContain('字段类型 1');
  });

  it('shows the plugin log ring and focuses it when opened from an error', () => {
    renderManager('log');

    act(() => {
      appendPluginLog('error', '[plugin-host] plugin "x" disabled: boom');
    });

    expect(screen.getByTestId('plugin-log-entry').textContent).toContain('boom');
    expect(document.activeElement).toBe(screen.getByTestId('plugin-log'));
  });

  it('shows the empty state until something is logged', () => {
    renderManager();

    expect(screen.getByTestId('plugin-log-empty').textContent).toContain('暂无插件日志');
  });
});
