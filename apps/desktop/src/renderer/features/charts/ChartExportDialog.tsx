/**
 * PNG export dialog for one chart (T4.5, SPEC §11.6, ADR-044 §3).
 *
 * The view is presentational so it can be unit tested without ECharts/IPC; the
 * container owns the imperative canvas handle, the rasterisation result and the
 * `file:exportText` call. Background choice is the only export option (scale is
 * fixed at 2x by SPEC).
 */

import { useEffect, useState } from 'react';

import type { ChartPngBackground } from '@curve/chart-echarts';
import { Button, Dialog, Select } from '@curve/ui';
import type { SelectOption } from '@curve/ui';

import { useRendererCore } from '../../app-core/use-app-core';
import { describeAppError } from '../../error-text';
import { useI18n } from '../../i18n';

import { CHART_PNG_SCALE, chartPngFileName, pngDataUrlToBase64 } from './chart-export';

import type { ChartCanvasHandle } from './ChartCanvas';
import type { MessageKey } from '../../i18n';
import type { ReactElement, RefObject } from 'react';

const BACKGROUNDS: readonly ChartPngBackground[] = ['transparent', 'light', 'dark'];

const BACKGROUND_KEYS: Record<ChartPngBackground, MessageKey> = {
  transparent: 'chart.export.background.transparent',
  light: 'chart.export.background.light',
  dark: 'chart.export.background.dark',
};

export interface ChartExportDialogViewProps {
  open: boolean;
  suggestedName: string;
  background: ChartPngBackground;
  busy: boolean;
  error: string | null;
  savedPath: string | null;
  disabled: boolean;
  onBackgroundChange: (background: ChartPngBackground) => void;
  onClose: () => void;
  onExport: () => void;
}

export function ChartExportDialogView({
  open,
  suggestedName,
  background,
  busy,
  error,
  savedPath,
  disabled,
  onBackgroundChange,
  onClose,
  onExport,
}: ChartExportDialogViewProps): ReactElement {
  const { t } = useI18n();
  const backgroundOptions: SelectOption[] = BACKGROUNDS.map((id) => ({
    value: id,
    label: t(BACKGROUND_KEYS[id]),
  }));

  return (
    <Dialog
      open={open}
      title={t('chart.export.title')}
      description={t('chart.export.description')}
      closeLabel={t('common.close')}
      onClose={onClose}
      className="cs-chart-export"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            disabled={busy || disabled}
            data-testid="chart-export-confirm"
            onClick={onExport}
          >
            {busy ? t('chart.export.busy') : t('chart.export.confirm')}
          </Button>
        </>
      }
    >
      <div className="cs-chart-export__body" data-testid="chart-export-dialog">
        <Select
          label={t('chart.export.background')}
          options={backgroundOptions}
          value={background}
          data-testid="chart-export-background"
          onChange={(event) => {
            onBackgroundChange(event.target.value as ChartPngBackground);
          }}
        />
        <dl className="cs-chart-facts">
          <div className="cs-chart-facts__row">
            <dt>{t('chart.export.fileName')}</dt>
            <dd data-testid="chart-export-filename">{suggestedName}</dd>
          </div>
          <div className="cs-chart-facts__row">
            <dt>{t('chart.export.scale')}</dt>
            <dd>{t('chart.export.pixelRatio')}</dd>
          </div>
        </dl>
        {disabled ? (
          <p className="cs-chart-export__hint" data-testid="chart-export-disabled">
            {t('chart.export.unavailable')}
          </p>
        ) : null}
        {error === null ? null : (
          <p className="cs-field__error" role="alert" data-testid="chart-export-error">
            {error}
          </p>
        )}
        {savedPath === null ? null : (
          <p className="cs-chart-export__success" role="status" data-testid="chart-export-success">
            {t('chart.export.success', { path: savedPath })}
          </p>
        )}
      </div>
    </Dialog>
  );
}

export interface ChartExportDialogProps {
  open: boolean;
  title: string;
  disabled: boolean;
  canvas: RefObject<ChartCanvasHandle | null>;
  onClose: () => void;
}

/** Container: rasterises through the canvas handle and saves via IPC. */
export function ChartExportDialog({
  open,
  title,
  disabled,
  canvas,
  onClose,
}: ChartExportDialogProps): ReactElement {
  const { t } = useI18n();
  const { api } = useRendererCore();
  const [background, setBackground] = useState<ChartPngBackground>('transparent');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedPath, setSavedPath] = useState<string | null>(null);
  const [suggestedName, setSuggestedName] = useState('');

  useEffect(() => {
    if (!open) {
      return;
    }
    setBackground('transparent');
    setBusy(false);
    setError(null);
    setSavedPath(null);
    setSuggestedName(chartPngFileName(title, new Date()));
  }, [open, title]);

  const startExport = async (): Promise<void> => {
    if (busy) {
      return;
    }
    setBusy(true);
    setError(null);
    setSavedPath(null);
    const handle = canvas.current;
    if (handle === null) {
      setError(t('chart.export.unavailable'));
      setBusy(false);
      return;
    }
    const rendered = await handle.exportPng({ scale: CHART_PNG_SCALE, background });
    if (!rendered.ok) {
      setError(describeAppError(rendered.error, t));
      setBusy(false);
      return;
    }
    const base64 = pngDataUrlToBase64(rendered.dataUrl);
    if (base64 === null) {
      setError(t('chart.export.invalidImage'));
      setBusy(false);
      return;
    }
    const written = await api.file.exportText({
      suggestedName,
      content: base64,
      encoding: 'base64',
      filters: [{ name: t('chart.export.filter'), extensions: ['png'] }],
    });
    setBusy(false);
    if (!written.ok) {
      setError(describeAppError(written.error, t));
      return;
    }
    if (written.data === null) {
      // The user cancelled the native save dialog; not an error.
      return;
    }
    setSavedPath(written.data.path);
  };

  return (
    <ChartExportDialogView
      open={open}
      suggestedName={suggestedName}
      background={background}
      busy={busy}
      error={error}
      savedPath={savedPath}
      disabled={disabled}
      onBackgroundChange={setBackground}
      onClose={onClose}
      onExport={() => {
        void startExport();
      }}
    />
  );
}
