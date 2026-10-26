// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ChartPngOutcome } from '@curve/chart-echarts';
import { createAppError } from '@curve/domain';

import { AppCoreProvider } from '../../app-core/use-app-core';
import { I18nProvider } from '../../i18n';

import { ChartExportDialog, ChartExportDialogView } from './ChartExportDialog';

import type { ChartCanvasHandle } from './ChartCanvas';
import type { ChartExportDialogViewProps } from './ChartExportDialog';
import type { IpcResult } from '../../../shared/contracts/envelope';
import type { ExportTextReply, ExportTextRequest } from '../../../shared/contracts/ipc';
import type { RendererCore } from '../../app-core/renderer-core';
import type { Mock } from 'vitest';

const BASE: ChartExportDialogViewProps = {
  open: true,
  suggestedName: 'Readings chart-20261026-0905.png',
  background: 'transparent',
  busy: false,
  error: null,
  savedPath: null,
  disabled: false,
  onBackgroundChange: () => undefined,
  onClose: () => undefined,
  onExport: () => undefined,
};

function mount(overrides: Partial<ChartExportDialogViewProps> = {}): ReturnType<typeof render> {
  return render(
    <I18nProvider initialLocale="zh-CN">
      <ChartExportDialogView {...BASE} {...overrides} />
    </I18nProvider>,
  );
}

interface DialogDoubles {
  exportPng: Mock<(options?: unknown) => Promise<ChartPngOutcome>>;
  exportText: Mock<(request: ExportTextRequest) => Promise<IpcResult<ExportTextReply | null>>>;
}

function mountDialog(
  pngOutcome: ChartPngOutcome = {
    ok: true,
    dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
  },
  saveOutcome: IpcResult<ExportTextReply | null> = { ok: true, data: { path: 'C:/out/chart.png' } },
): DialogDoubles {
  const exportPng = vi.fn(async (_options?: unknown): Promise<ChartPngOutcome> => pngOutcome);
  const exportText = vi.fn(
    async (_request: ExportTextRequest): Promise<IpcResult<ExportTextReply | null>> => saveOutcome,
  );
  const canvas = {
    current: { exportPng } as unknown as ChartCanvasHandle,
  };
  const core = {
    core: { store: { getState: () => ({}), subscribe: () => () => undefined } },
    api: { file: { exportText } },
    tableIo: { terminate: vi.fn() },
    query: { terminate: vi.fn() },
  } as unknown as RendererCore;
  render(
    <AppCoreProvider core={core}>
      <I18nProvider initialLocale="zh-CN">
        <ChartExportDialog
          open
          title="Readings chart"
          disabled={false}
          canvas={canvas}
          onClose={() => undefined}
        />
      </I18nProvider>
    </AppCoreProvider>,
  );
  return { exportPng, exportText };
}

afterEach(() => {
  cleanup();
});

describe('ChartExportDialogView', () => {
  it('shows the 2x note, suggested file name and background options', () => {
    mount();
    expect(screen.getByTestId('chart-export-dialog')).toBeTruthy();
    expect(screen.getByTestId('chart-export-filename').textContent).toBe(BASE.suggestedName);
    expect((screen.getByTestId('chart-export-background') as HTMLSelectElement).value).toBe(
      'transparent',
    );
    expect(screen.getByText('2x')).toBeTruthy();
  });

  it('forwards background changes and the export action', () => {
    const onBackgroundChange = vi.fn();
    const onExport = vi.fn();
    mount({ onBackgroundChange, onExport });

    fireEvent.change(screen.getByTestId('chart-export-background'), {
      target: { value: 'dark' },
    });
    expect(onBackgroundChange).toHaveBeenCalledWith('dark');

    fireEvent.click(screen.getByTestId('chart-export-confirm'));
    expect(onExport).toHaveBeenCalledTimes(1);
  });

  it('disables export while busy or when the chart has no canvas', () => {
    const busy = mount({ busy: true });
    const busyButton = screen.getByTestId('chart-export-confirm') as HTMLButtonElement;
    expect(busyButton.disabled).toBe(true);
    expect(busyButton.textContent).toBe('正在导出…');
    busy.unmount();

    mount({ disabled: true });
    expect((screen.getByTestId('chart-export-confirm') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('chart-export-disabled')).toBeTruthy();
  });

  it('shows export errors and the saved path', () => {
    const view = mount({ error: '保存失败' });
    expect(screen.getByTestId('chart-export-error').textContent).toBe('保存失败');
    view.unmount();

    mount({ savedPath: 'C:\\out\\chart.png' });
    expect(screen.getByTestId('chart-export-success').textContent).toContain('C:\\out\\chart.png');
  });
});

describe('ChartExportDialog container', () => {
  it('rasterises, sends base64 through file:exportText and shows the saved path', async () => {
    const { exportPng, exportText } = mountDialog();
    const suggested = screen.getByTestId('chart-export-filename').textContent ?? '';
    expect(suggested).toMatch(/^Readings chart-\d{8}-\d{4}\.png$/);

    fireEvent.click(screen.getByTestId('chart-export-confirm'));

    await waitFor(() => {
      expect(exportText).toHaveBeenCalledTimes(1);
    });
    expect(exportPng).toHaveBeenCalledWith({ scale: 2, background: 'transparent' });
    expect(exportText).toHaveBeenCalledWith({
      suggestedName: suggested,
      content: 'iVBORw0KGgo=',
      encoding: 'base64',
      filters: [{ name: 'PNG 图片', extensions: ['png'] }],
    });
    await waitFor(() => {
      expect(screen.getByTestId('chart-export-success').textContent).toContain('C:/out/chart.png');
    });
  });

  it('shows adapter failures and never calls the save channel', async () => {
    const { exportText } = mountDialog({
      ok: false,
      error: createAppError('E_EXPORT_FAILED', 'canvas lost'),
    });
    fireEvent.click(screen.getByTestId('chart-export-confirm'));
    await waitFor(() => {
      expect(screen.getByTestId('chart-export-error')).toBeTruthy();
    });
    expect(exportText).not.toHaveBeenCalled();
  });

  it('rejects a non-PNG data URL before writing anything', async () => {
    const { exportText } = mountDialog({ ok: true, dataUrl: 'data:image/jpeg;base64,AAAA' });
    fireEvent.click(screen.getByTestId('chart-export-confirm'));
    await waitFor(() => {
      expect(screen.getByTestId('chart-export-error').textContent).toBe('渲染结果不是有效的 PNG。');
    });
    expect(exportText).not.toHaveBeenCalled();
  });

  it('reports save failures and treats a cancelled dialog as a no-op', async () => {
    const failed = mountDialog(undefined, {
      ok: false,
      error: createAppError('E_EXPORT_FAILED', 'disk full'),
    });
    fireEvent.click(screen.getByTestId('chart-export-confirm'));
    await waitFor(() => {
      expect(failed.exportText).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.getByTestId('chart-export-error')).toBeTruthy();
    });
    failed.exportPng.mockClear();
    cleanup();

    const cancelled = mountDialog(
      { ok: true, dataUrl: 'data:image/png;base64,iVBORw0KGgo=' },
      { ok: true, data: null },
    );
    fireEvent.click(screen.getByTestId('chart-export-confirm'));
    await waitFor(() => {
      expect(cancelled.exportText).toHaveBeenCalled();
    });
    expect(screen.queryByTestId('chart-export-success')).toBeNull();
    expect(screen.queryByTestId('chart-export-error')).toBeNull();
    expect((screen.getByTestId('chart-export-confirm') as HTMLButtonElement).disabled).toBe(false);
  });
});
