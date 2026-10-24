/**
 * Template manager (T3.5, SPEC §10.5).
 *
 * Lists builtin and persisted templates, applies one to the current view or the
 * workspace default, renames/copies/exports/deletes user templates and opens the
 * import flow. The dialog is presentational: every mutation is a callback that
 * the panel wires to a command-bus action, so component tests need no Electron.
 */

import { useEffect, useState } from 'react';

import { styleFallbackId } from '@curve/app-core';
import {
  DEFAULT_TABLE_STYLE_ID,
  getBuiltinStyle,
  listBuiltinStyles,
  resolveStyle,
} from '@curve/domain';
import type { AppError, TableStyle, ViewDef } from '@curve/domain';
import { Button, Dialog, Input } from '@curve/ui';

import { describeAppError } from '../../error-text';
import { useI18n } from '../../i18n';

import { styleDisplayName } from './style-text';

import type { ReactElement } from 'react';

export type TemplateActionResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly error: AppError;
      /** True when the document changed but the following manifest save failed. */
      readonly committed?: boolean;
    };

export type TemplateDeleteResult =
  | {
      readonly ok: true;
      readonly fallbackStyleId: string;
      readonly affectedViewIds: readonly string[];
    }
  | {
      readonly ok: false;
      readonly error: AppError;
      readonly committed?: boolean;
    };

export type TemplateDuplicateResult =
  | { readonly ok: true; readonly styleId: string; readonly name: string }
  | {
      readonly ok: false;
      readonly error: AppError;
      readonly committed?: boolean;
    };

export type TemplateExportResult =
  | { readonly ok: true; readonly fileName: string | null }
  | { readonly ok: false; readonly error: AppError };

export interface TemplateManagerDialogProps {
  open: boolean;
  currentStyleId: string;
  defaultStyleId: string;
  /** Persisted user styles (builtins are appended from the domain constants). */
  styles: readonly TableStyle[];
  views: Readonly<Record<string, ViewDef>>;
  onClose: () => void;
  onImport: () => void;
  onApply: (styleId: string, target: 'view' | 'default') => Promise<TemplateActionResult>;
  onDuplicate: (styleId: string) => Promise<TemplateDuplicateResult>;
  onUpdate: (style: TableStyle) => Promise<TemplateActionResult>;
  onDelete: (styleId: string) => Promise<TemplateDeleteResult>;
  onExport: (style: TableStyle) => Promise<TemplateExportResult>;
}

export function TemplateManagerDialog({
  open,
  currentStyleId,
  defaultStyleId,
  styles,
  views,
  onClose,
  onImport,
  onApply,
  onDuplicate,
  onUpdate,
  onDelete,
  onExport,
}: TemplateManagerDialogProps): ReactElement | null {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TableStyle | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    setBusy(false);
    setError(null);
    setStatus(null);
    setRenamingId(null);
    setRenameError(null);
    setDeleteTarget(null);
  }, [open]);

  const stylesById: Record<string, TableStyle> = {};
  for (const style of styles) {
    stylesById[style.id] = style;
  }

  const nameOf = (style: TableStyle): string => styleDisplayName(style, t);

  const namesInUse = (exceptId?: string): Set<string> => {
    const names = new Set<string>();
    for (const builtin of listBuiltinStyles()) {
      names.add(builtin.name);
      names.add(styleDisplayName(builtin, t));
    }
    for (const style of styles) {
      if (style.id !== exceptId) {
        names.add(style.name);
      }
    }
    return names;
  };

  const apply = async (style: TableStyle, target: 'view' | 'default'): Promise<void> => {
    setBusy(true);
    setError(null);
    setStatus(null);
    const outcome = await onApply(style.id, target);
    setBusy(false);
    if (!outcome.ok) {
      setError(describeAppError(outcome.error, t));
      return;
    }
    setStatus(
      target === 'view'
        ? t('style.templates.applied', { name: nameOf(style) })
        : t('style.templates.defaulted', { name: nameOf(style) }),
    );
  };

  const duplicate = async (style: TableStyle): Promise<void> => {
    setBusy(true);
    setError(null);
    setStatus(null);
    const outcome = await onDuplicate(style.id);
    setBusy(false);
    if (!outcome.ok) {
      setError(describeAppError(outcome.error, t));
      return;
    }
    setStatus(t('style.templates.duplicated', { name: outcome.name }));
  };

  const startRename = (style: TableStyle): void => {
    setRenamingId(style.id);
    setRenameValue(style.name);
    setRenameError(null);
    setError(null);
    setStatus(null);
  };

  const commitRename = async (style: TableStyle): Promise<void> => {
    const name = renameValue.trim();
    if (name === '') {
      setRenameError(t('style.templates.nameRequired'));
      return;
    }
    if (name.length > 80) {
      setRenameError(t('style.templates.nameTooLong'));
      return;
    }
    if (namesInUse(style.id).has(name)) {
      setRenameError(t('style.templates.nameTaken'));
      return;
    }
    setRenameError(null);
    setBusy(true);
    setError(null);
    const outcome = await onUpdate({ ...style, name });
    setBusy(false);
    if (!outcome.ok) {
      setError(describeAppError(outcome.error, t));
      return;
    }
    setRenamingId(null);
    setStatus(t('style.templates.renamed', { name }));
  };

  const exportStyle = async (style: TableStyle): Promise<void> => {
    setBusy(true);
    setError(null);
    setStatus(null);
    const outcome = await onExport(style);
    setBusy(false);
    if (!outcome.ok) {
      setError(describeAppError(outcome.error, t));
      return;
    }
    if (outcome.fileName !== null) {
      setStatus(t('style.templates.exported', { file: outcome.fileName }));
    }
  };

  const confirmDelete = async (): Promise<void> => {
    const target = deleteTarget;
    if (target === null) {
      return;
    }
    setBusy(true);
    setError(null);
    setStatus(null);
    const outcome = await onDelete(target.id);
    setBusy(false);
    if (!outcome.ok) {
      setError(describeAppError(outcome.error, t));
      return;
    }
    const fallback = resolveStyle(outcome.fallbackStyleId, styles).style;
    setStatus(
      t('style.templates.deleted', {
        name: nameOf(target),
        count: outcome.affectedViewIds.length,
        fallback: nameOf(fallback),
      }),
    );
    setDeleteTarget(null);
  };

  const references =
    deleteTarget === null
      ? []
      : Object.values(views).filter(
          (view) =>
            view.kind === 'table' &&
            view.tableView !== undefined &&
            view.tableView.styleId === deleteTarget.id,
        );
  const deleteFallbackId =
    deleteTarget === null
      ? DEFAULT_TABLE_STYLE_ID
      : styleFallbackId(
          {
            workspace: { settings: { defaultTableStyleId: defaultStyleId } },
            tableStyles: stylesById,
          },
          deleteTarget.id,
        );
  const deleteFallback = getBuiltinStyle(deleteFallbackId) ?? stylesById[deleteFallbackId];
  const deleteFallbackName =
    deleteFallback === undefined ? deleteFallbackId : nameOf(deleteFallback);

  const close = (): void => {
    if (deleteTarget !== null) {
      setDeleteTarget(null);
      return;
    }
    onClose();
  };

  return (
    <Dialog
      open={open}
      title={
        deleteTarget === null
          ? t('style.templates.title')
          : t('style.templates.deleteTitle', { name: nameOf(deleteTarget) })
      }
      description={
        deleteTarget === null
          ? t('style.templates.description')
          : t('style.templates.deleteBody', { fallback: deleteFallbackName })
      }
      closeLabel={t('common.close')}
      className="cs-template-dialog"
      onClose={close}
      footer={
        deleteTarget === null ? (
          <>
            <Button variant="secondary" data-testid="style-templates-close" onClick={onClose}>
              {t('style.templates.close')}
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setDeleteTarget(null);
              }}
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              disabled={busy}
              data-testid="style-template-delete-confirm"
              onClick={() => void confirmDelete()}
            >
              {t('style.templates.deleteConfirm')}
            </Button>
          </>
        )
      }
    >
      {deleteTarget === null ? (
        <div className="cs-template-body">
          <div className="cs-template-toolbar">
            <Button
              variant="primary"
              size="sm"
              data-testid="style-template-import"
              onClick={onImport}
            >
              {t('style.templates.import')}
            </Button>
          </div>

          {error === null ? null : (
            <p className="cs-style-error" role="alert">
              {error}
            </p>
          )}
          {status === null ? null : (
            <p className="cs-template-status" role="status" data-testid="style-template-status">
              {status}
            </p>
          )}

          <ul className="cs-template-list" data-testid="style-template-list">
            {[...listBuiltinStyles(), ...styles].map((style) => {
              const isCurrent = style.id === currentStyleId;
              const isDefault = style.id === defaultStyleId;
              const name = nameOf(style);
              return (
                <li
                  key={style.id}
                  className="cs-template-row"
                  data-testid={`style-template-${style.id}`}
                  data-current={isCurrent ? 'true' : undefined}
                  data-default={isDefault ? 'true' : undefined}
                >
                  <div className="cs-template-row__info">
                    <span className="cs-template-row__name">{name}</span>
                    <span className="cs-template-row__meta">
                      <span>
                        {style.builtin ? t('style.templates.builtin') : t('style.templates.user')}
                      </span>
                      {isCurrent ? (
                        <span className="cs-template-badge">{t('style.templates.current')}</span>
                      ) : null}
                      {isDefault ? (
                        <span className="cs-template-badge">{t('style.templates.default')}</span>
                      ) : null}
                    </span>
                    {renamingId === style.id ? (
                      <div className="cs-template-rename">
                        <Input
                          label={t('style.templates.renameLabel')}
                          value={renameValue}
                          error={renameError ?? undefined}
                          data-testid={`style-template-rename-input-${style.id}`}
                          onChange={(event) => {
                            setRenameValue(event.target.value);
                            setRenameError(null);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              void commitRename(style);
                            }
                            if (event.key === 'Escape') {
                              setRenamingId(null);
                            }
                          }}
                        />
                        <div className="cs-template-rename__actions">
                          <Button
                            size="sm"
                            variant="primary"
                            disabled={busy}
                            data-testid={`style-template-rename-save-${style.id}`}
                            onClick={() => void commitRename(style)}
                          >
                            {t('style.templates.renameSave')}
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              setRenamingId(null);
                            }}
                          >
                            {t('common.cancel')}
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className="cs-template-row__actions">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      data-testid={`style-template-apply-${style.id}`}
                      aria-label={`${t('style.templates.apply')} ${name}`}
                      onClick={() => void apply(style, 'view')}
                    >
                      {t('style.templates.apply')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      data-testid={`style-template-default-${style.id}`}
                      aria-label={`${t('style.templates.setDefault')} ${name}`}
                      onClick={() => void apply(style, 'default')}
                    >
                      {t('style.templates.setDefault')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      data-testid={`style-template-duplicate-${style.id}`}
                      aria-label={`${t('style.templates.duplicate')} ${name}`}
                      onClick={() => void duplicate(style)}
                    >
                      {t('style.templates.duplicate')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      data-testid={`style-template-export-${style.id}`}
                      aria-label={`${t('style.templates.export')} ${name}`}
                      onClick={() => void exportStyle(style)}
                    >
                      {t('style.templates.export')}
                    </Button>
                    {style.builtin ? null : (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          data-testid={`style-template-rename-${style.id}`}
                          aria-label={`${t('style.templates.rename')} ${name}`}
                          onClick={() => {
                            startRename(style);
                          }}
                        >
                          {t('style.templates.rename')}
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          disabled={busy}
                          data-testid={`style-template-delete-${style.id}`}
                          aria-label={`${t('style.templates.delete')} ${name}`}
                          onClick={() => {
                            setDeleteTarget(style);
                            setError(null);
                            setStatus(null);
                          }}
                        >
                          {t('style.templates.delete')}
                        </Button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          {styles.length === 0 ? (
            <p className="cs-style-hint">{t('style.templates.empty')}</p>
          ) : null}
        </div>
      ) : (
        <div className="cs-template-body">
          {error === null ? null : (
            <p className="cs-style-error" role="alert">
              {error}
            </p>
          )}
          {references.length === 0 ? (
            <p className="cs-style-hint" data-testid="style-template-delete-references">
              {t('style.templates.deleteNoReferences')}
            </p>
          ) : (
            <p
              className="cs-dialog__notice"
              role="note"
              data-testid="style-template-delete-references"
            >
              {t('style.templates.deleteReferences', {
                count: references.length,
                names: references.map((view) => view.title).join(', '),
              })}
            </p>
          )}
          <p className="cs-style-hint">{t('style.templates.deleteUndoHint')}</p>
        </div>
      )}
    </Dialog>
  );
}
