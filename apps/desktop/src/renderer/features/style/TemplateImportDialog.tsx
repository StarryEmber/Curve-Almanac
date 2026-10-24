/**
 * Template import dialog (T3.5, SPEC §10.5).
 *
 * Picking the file is delegated to the panel (IPC); parsing, identity
 * reassignment and missing-column reporting use `@curve/app-core` validation.
 * The preview reuses the real first-50-rows renderer, then one `style.create`
 * command commits the imported copy.
 */

import { useEffect, useState } from 'react';

import { missingStyleColumns, prepareStyleImport } from '@curve/app-core';
import type {
  AppError,
  TableMeta,
  StyleExportFailureReason,
  TableStyle,
  ViewDef,
  Row,
} from '@curve/domain';
import { Button, Dialog } from '@curve/ui';

import { describeAppError } from '../../error-text';
import { useI18n } from '../../i18n';

import { StylePreview } from './StylePreview';

import type { TemplateActionResult } from './TemplateManagerDialog';
import type { MessageKey } from '../../i18n';
import type { ReactElement } from 'react';

const IMPORT_ERROR_KEYS: Record<StyleExportFailureReason, MessageKey> = {
  tooLarge: 'style.templates.importError.tooLarge',
  json: 'style.templates.importError.json',
  version: 'style.templates.importError.version',
  document: 'style.templates.importError.document',
};

export type PickStyleFileResult =
  | { readonly ok: true; readonly file: { readonly name: string; readonly text: string } | null }
  | { readonly ok: false; readonly error: AppError };

type ImportPreview = Extract<ReturnType<typeof prepareStyleImport>, { ok: true }>;

export interface TemplateImportDialogProps {
  open: boolean;
  table: TableMeta;
  view: ViewDef;
  rows: readonly Row[];
  existingNames: readonly string[];
  onClose: () => void;
  onPickFile: () => Promise<PickStyleFileResult>;
  onImport: (style: TableStyle, applyToView: boolean) => Promise<TemplateActionResult>;
}

export function TemplateImportDialog({
  open,
  table,
  view,
  rows,
  existingNames,
  onClose,
  onPickFile,
  onImport,
}: TemplateImportDialogProps): ReactElement | null {
  const { t } = useI18n();
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [applyToView, setApplyToView] = useState(true);

  useEffect(() => {
    if (!open) {
      return;
    }
    setPicking(false);
    setBusy(false);
    setError(null);
    setFileName(null);
    setPreview(null);
    setApplyToView(true);
  }, [open]);

  const pick = async (): Promise<void> => {
    setPicking(true);
    setError(null);
    setPreview(null);
    setFileName(null);
    const picked = await onPickFile();
    setPicking(false);
    if (!picked.ok) {
      setError(describeAppError(picked.error, t));
      return;
    }
    if (picked.file === null) {
      return;
    }
    setFileName(picked.file.name);
    const prepared = prepareStyleImport(picked.file.text, { existingNames });
    if (!prepared.ok) {
      setError(t(IMPORT_ERROR_KEYS[prepared.reason]));
      return;
    }
    setPreview(prepared);
  };

  const confirm = async (): Promise<void> => {
    if (preview === null) {
      return;
    }
    setBusy(true);
    setError(null);
    const outcome = await onImport(preview.style, applyToView);
    setBusy(false);
    if (!outcome.ok) {
      setError(describeAppError(outcome.error, t));
      return;
    }
    onClose();
  };

  const missingColumns = preview === null ? [] : missingStyleColumns(preview.style, table);

  return (
    <Dialog
      open={open}
      title={t('style.templates.importTitle')}
      description={t('style.templates.importDescription')}
      closeLabel={t('common.close')}
      className="cs-template-import-dialog"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          {preview === null ? (
            <Button
              variant="primary"
              disabled={picking}
              data-testid="style-import-pick"
              onClick={() => void pick()}
            >
              {picking ? t('style.templates.importPicking') : t('style.templates.importPick')}
            </Button>
          ) : (
            <>
              <Button
                variant="secondary"
                disabled={busy}
                data-testid="style-import-repick"
                onClick={() => void pick()}
              >
                {t('style.templates.importRepick')}
              </Button>
              <Button
                variant="primary"
                disabled={busy}
                data-testid="style-import-confirm"
                onClick={() => void confirm()}
              >
                {busy ? t('style.editor.saving') : t('style.templates.importConfirm')}
              </Button>
            </>
          )}
        </>
      }
    >
      <div className="cs-template-import" data-testid="style-import-dialog">
        {error === null ? null : (
          <p className="cs-style-error" role="alert">
            {error}
          </p>
        )}

        {preview === null ? (
          <p className="cs-style-hint">
            {fileName === null
              ? t('style.templates.importHint')
              : t('style.templates.importFile', { name: fileName })}
          </p>
        ) : (
          <>
            <dl className="cs-style-summary" data-testid="style-import-summary">
              <div>
                <dt>{t('style.templates.importName')}</dt>
                <dd>{preview.style.name}</dd>
              </div>
              <div>
                <dt>{t('style.templates.importRules')}</dt>
                <dd>
                  {t('style.templates.importRuleCount', {
                    count: preview.style.conditionalRules.length,
                  })}
                </dd>
              </div>
              <div>
                <dt>{t('style.templates.importOverrides')}</dt>
                <dd>
                  {t('style.templates.importOverrideCount', {
                    count: Object.keys(preview.style.columnOverrides).length,
                  })}
                </dd>
              </div>
            </dl>

            {preview.renamed ? (
              <p className="cs-style-hint" role="note">
                {t('style.templates.importRenamed', { name: preview.style.name })}
              </p>
            ) : null}

            {missingColumns.length > 0 ? (
              <p className="cs-dialog__notice" role="note" data-testid="style-import-missing">
                {t('style.templates.importMissing', {
                  count: missingColumns.length,
                  columns: missingColumns.join(', '),
                })}
              </p>
            ) : null}

            <label className="cs-template-import__apply">
              <input
                type="checkbox"
                checked={applyToView}
                data-testid="style-import-apply"
                onChange={(event) => {
                  setApplyToView(event.target.checked);
                }}
              />
              <span>{t('style.templates.importApply')}</span>
            </label>

            <div className="cs-template-import__preview">
              <StylePreview
                table={table}
                view={view}
                tableStyle={preview.style}
                rows={rows}
                previewMs={null}
                displayName={preview.style.name}
              />
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
