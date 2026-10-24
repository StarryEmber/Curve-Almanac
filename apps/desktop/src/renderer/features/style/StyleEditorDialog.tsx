/**
 * Style editor dialog (T3.4, SPEC §10.6).
 *
 * The inspector hosts the entry point; this wide surface holds the four groups
 * and the first-50-rows preview. Editing a builtin is lazy: the local draft is a
 * fork, and the first committed control creates the user style and points the
 * view at it in one `style.create` command (one undo entry). Later controls use
 * `style.update`. Every text/number/colour field previews on input but commits
 * on blur/Enter; selects and checkboxes commit immediately.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import {
  createTableStyle,
  forkTableStyle,
  getBuiltinStyle,
  listBuiltinStyles,
  reassignStyleIdentity,
  styleCopyName,
  tableStyleSchema,
  toAppError,
} from '@curve/domain';
import type {
  AppError,
  ConditionalRule,
  Row,
  TableMeta,
  TableStyle,
  TableStyleTokens,
  ViewDef,
} from '@curve/domain';
import { Button, Dialog, Input, Select, Tabs } from '@curve/ui';

import { describeAppError } from '../../error-text';
import { useI18n } from '../../i18n';

import { densityLabel, styleDisplayName } from './style-text';
import { StyleColumnsTab } from './StyleColumnsTab';
import { StylePreview } from './StylePreview';
import { StyleRulesTab } from './StyleRulesTab';
import { StyleTokensTab } from './StyleTokensTab';

import type { ReactElement } from 'react';

export type StyleCommitOutcome =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly error: AppError;
      /** True when the document changed but the following manifest save failed. */
      readonly committed?: boolean;
    };

export interface StyleEditorDialogProps {
  open: boolean;
  table: TableMeta;
  view: ViewDef;
  tableStyle: TableStyle;
  rows: readonly Row[];
  /** Persisted template names used by the "save as" form (T3.5). */
  existingNames?: readonly string[];
  onClose: () => void;
  onCreateStyle: (style: TableStyle) => Promise<StyleCommitOutcome>;
  onUpdateStyle: (style: TableStyle) => Promise<StyleCommitOutcome>;
}

function styleDraft(style: TableStyle): TableStyle {
  if (style.builtin) {
    return forkTableStyle(style);
  }
  return createTableStyle({
    id: style.id,
    name: style.name,
    tokens: style.tokens,
    columnOverrides: style.columnOverrides,
    conditionalRules: style.conditionalRules,
  });
}

function signature(style: TableStyle): string {
  return JSON.stringify(style);
}

export function StyleEditorDialog({
  open,
  table,
  view,
  tableStyle,
  rows,
  existingNames = [],
  onClose,
  onCreateStyle,
  onUpdateStyle,
}: StyleEditorDialogProps): ReactElement | null {
  const { t } = useI18n();
  const initializedRef = useRef(false);
  const [draft, setDraft] = useState<TableStyle>(() => styleDraft(tableStyle));
  const draftRef = useRef(draft);
  const [sourceStyle, setSourceStyle] = useState(tableStyle);
  const [templateId, setTemplateId] = useState<string | null>(
    tableStyle.builtin ? tableStyle.id : null,
  );
  const [persistedId, setPersistedId] = useState<string | null>(
    tableStyle.builtin ? null : tableStyle.id,
  );
  const persistedIdRef = useRef(persistedId);
  const lastCommittedRef = useRef(signature(draft));
  const [busy, setBusy] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | null>>({});
  const [previewMs, setPreviewMs] = useState<number | null>(null);
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [saveAsName, setSaveAsName] = useState('');
  const [saveAsError, setSaveAsError] = useState<string | null>(null);
  const [saveAsNotice, setSaveAsNotice] = useState<string | null>(null);
  const changedAtRef = useRef<number | null>(null);
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    if (!open) {
      initializedRef.current = false;
      return;
    }
    if (initializedRef.current) {
      return;
    }
    initializedRef.current = true;
    const next = styleDraft(tableStyle);
    draftRef.current = next;
    setDraft(next);
    setSourceStyle(tableStyle);
    setTemplateId(tableStyle.builtin ? tableStyle.id : null);
    const initialPersistedId = tableStyle.builtin ? null : tableStyle.id;
    persistedIdRef.current = initialPersistedId;
    setPersistedId(initialPersistedId);
    lastCommittedRef.current = signature(next);
    setBusy(false);
    setCommitError(null);
    setFieldErrors({});
    setPreviewMs(null);
    setSaveAsOpen(false);
    setSaveAsName('');
    setSaveAsError(null);
    setSaveAsNotice(null);
    changedAtRef.current = null;
  }, [open, tableStyle]);

  useLayoutEffect(() => {
    if (changedAtRef.current === null) {
      return;
    }
    const elapsed = performance.now() - changedAtRef.current;
    changedAtRef.current = null;
    setPreviewMs(elapsed);
  }, [draft]);

  const applyDraft = useCallback((next: TableStyle, commit: boolean): void => {
    changedAtRef.current = performance.now();
    draftRef.current = next;
    setDraft(next);
    if (commit) {
      // `enqueueCommit` is declared below with a stable identity.
      void commitRef.current(next);
    }
  }, []);

  const enqueueCommit = useCallback(
    (next: TableStyle): Promise<boolean> => {
      const parsed = tableStyleSchema.safeParse(next);
      if (!parsed.success) {
        setCommitError(t('style.editor.error.invalid'));
        return Promise.resolve(false);
      }
      const nextSignature = signature(parsed.data);
      if (nextSignature === lastCommittedRef.current) {
        return Promise.resolve(true);
      }

      let accepted = true;
      queueRef.current = queueRef.current.then(async () => {
        setBusy(true);
        setCommitError(null);
        try {
          const outcome =
            persistedIdRef.current === null
              ? await onCreateStyle(parsed.data)
              : await onUpdateStyle(parsed.data);
          if (outcome.ok || outcome.committed === true) {
            lastCommittedRef.current = nextSignature;
            if (persistedIdRef.current === null) {
              persistedIdRef.current = parsed.data.id;
              setPersistedId(parsed.data.id);
            }
          } else {
            accepted = false;
            setCommitError(describeAppError(outcome.error, t));
          }
        } catch (thrown) {
          accepted = false;
          setCommitError(describeAppError(toAppError(thrown), t));
        } finally {
          setBusy(false);
        }
      });
      return queueRef.current.then(() => accepted);
    },
    [onCreateStyle, onUpdateStyle, t],
  );

  const commitRef = useRef<(style: TableStyle) => Promise<boolean>>(async () => true);
  useEffect(() => {
    commitRef.current = enqueueCommit;
  }, [enqueueCommit]);

  const openSaveAs = (): void => {
    setSaveAsName(styleCopyName(styleDisplayName(sourceStyle, t), existingNames));
    setSaveAsError(null);
    setSaveAsNotice(null);
    setSaveAsOpen(true);
  };

  const saveAs = async (): Promise<void> => {
    const name = saveAsName.trim();
    if (name === '') {
      setSaveAsError(t('style.templates.nameRequired'));
      return;
    }
    if (name.length > 80) {
      setSaveAsError(t('style.templates.nameTooLong'));
      return;
    }
    if (existingNames.includes(name)) {
      setSaveAsError(t('style.templates.nameTaken'));
      return;
    }
    setSaveAsError(null);
    setSaveAsNotice(null);

    queueRef.current = queueRef.current.then(async () => {
      setBusy(true);
      setCommitError(null);
      try {
        const copy = reassignStyleIdentity(draftRef.current, { name });
        const outcome = await onCreateStyle(copy);
        if (!outcome.ok && outcome.committed !== true) {
          setSaveAsError(describeAppError(outcome.error, t));
          return;
        }
        persistedIdRef.current = copy.id;
        setPersistedId(copy.id);
        draftRef.current = copy;
        setDraft(copy);
        setSourceStyle(copy);
        setTemplateId(null);
        lastCommittedRef.current = signature(copy);
        setSaveAsOpen(false);
        setSaveAsNotice(t('style.editor.savedAs', { name: copy.name }));
      } catch (thrown) {
        setSaveAsError(describeAppError(toAppError(thrown), t));
      } finally {
        setBusy(false);
      }
    });
    await queueRef.current;
  };

  const setFieldError = useCallback((key: string, error: string | null): void => {
    setFieldErrors((current) => {
      if (current[key] === undefined && error === null) {
        return current;
      }
      const next = { ...current };
      if (error === null) {
        delete next[key];
      } else {
        next[key] = error;
      }
      return next;
    });
  }, []);

  const updateTokens = (tokens: TableStyleTokens, commit: boolean): void => {
    applyDraft({ ...draftRef.current, tokens }, commit);
  };

  const updateColumns = (columnOverrides: TableStyle['columnOverrides'], commit: boolean): void => {
    applyDraft({ ...draftRef.current, columnOverrides: { ...columnOverrides } }, commit);
  };

  const updateRules = (rules: readonly ConditionalRule[], commit: boolean): void => {
    applyDraft({ ...draftRef.current, conditionalRules: [...rules] }, commit);
  };

  const trailingErrors = Object.values(fieldErrors).some((error) => error !== null);

  const finish = async (): Promise<void> => {
    if (trailingErrors) {
      return;
    }
    const ok = await enqueueCommit(draftRef.current);
    if (ok) {
      onClose();
    }
  };

  const templateOptions = listBuiltinStyles().map((style) => ({
    value: style.id,
    label: styleDisplayName(style, t),
  }));

  const templateContent = (
    <div className="cs-style-tab" data-testid="style-template-tab">
      {persistedId === null ? (
        <>
          <p className="cs-style-hint">{t('style.editor.templateHint')}</p>
          <Select
            label={t('style.editor.template')}
            value={templateId ?? tableStyle.id}
            options={templateOptions}
            data-testid="style-template"
            onChange={(event) => {
              const builtin = getBuiltinStyle(event.target.value);
              if (builtin === undefined || persistedIdRef.current !== null) {
                return;
              }
              const next = forkTableStyle(builtin);
              setSourceStyle(builtin);
              setTemplateId(builtin.id);
              lastCommittedRef.current = signature(next);
              draftRef.current = next;
              setDraft(next);
            }}
          />
        </>
      ) : (
        <p className="cs-style-hint">{t('style.editor.customStyleHint')}</p>
      )}
      <dl className="cs-style-summary">
        <div>
          <dt>{t('style.panel.name')}</dt>
          <dd>{styleDisplayName(sourceStyle, t)}</dd>
        </div>
        <div>
          <dt>{t('style.panel.density')}</dt>
          <dd>{densityLabel(draft.tokens.density, t)}</dd>
        </div>
        <div>
          <dt>{t('style.editor.copyStatus')}</dt>
          <dd>
            {persistedId === null ? t('style.editor.copyPending') : t('style.editor.copySaved')}
          </dd>
        </div>
      </dl>

      <div className="cs-style-saveas">
        <Button
          size="sm"
          variant="secondary"
          data-testid="style-save-as-open"
          disabled={busy}
          onClick={openSaveAs}
        >
          {t('style.editor.saveAs')}
        </Button>
        {saveAsOpen ? (
          <div className="cs-style-saveas__form">
            <Input
              label={t('style.editor.saveAsName')}
              value={saveAsName}
              error={saveAsError ?? undefined}
              data-testid="style-save-as-name"
              onChange={(event) => {
                setSaveAsName(event.target.value);
                setSaveAsError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  void saveAs();
                }
              }}
            />
            <div className="cs-style-saveas__actions">
              <Button
                size="sm"
                variant="primary"
                disabled={busy}
                data-testid="style-save-as-confirm"
                onClick={() => void saveAs()}
              >
                {t('style.editor.saveAsConfirm')}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setSaveAsOpen(false);
                }}
              >
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        ) : null}
        {saveAsNotice === null ? null : (
          <p className="cs-style-hint" role="status" data-testid="style-save-as-notice">
            {saveAsNotice}
          </p>
        )}
      </div>
    </div>
  );

  return (
    <Dialog
      open={open}
      title={t('style.editor.title')}
      description={t('style.editor.description')}
      closeLabel={t('common.close')}
      onClose={onClose}
      className="cs-style-editor-dialog"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            data-testid="style-done"
            disabled={busy || trailingErrors}
            onClick={() => {
              void finish();
            }}
          >
            {busy ? t('style.editor.saving') : t('style.editor.done')}
          </Button>
        </>
      }
    >
      <div className="cs-style-editor" data-testid="style-editor">
        <div className="cs-style-editor__form">
          {trailingErrors ? (
            <p className="cs-style-error" role="alert">
              {t('style.editor.error.fix')}
            </p>
          ) : null}
          {commitError === null ? null : (
            <p className="cs-style-error" role="alert">
              {commitError}
            </p>
          )}

          <Tabs
            label={t('style.editor.groups')}
            defaultTabId="tokens"
            tabs={[
              {
                id: 'tokens',
                label: t('style.editor.tokens'),
                content: (
                  <StyleTokensTab
                    tokens={draft.tokens}
                    onChange={updateTokens}
                    onErrorChange={setFieldError}
                  />
                ),
              },
              {
                id: 'template',
                label: t('style.editor.template'),
                content: templateContent,
              },
              {
                id: 'columns',
                label: t('style.editor.columns'),
                content: (
                  <StyleColumnsTab
                    table={table}
                    overrides={draft.columnOverrides}
                    onChange={updateColumns}
                    onErrorChange={setFieldError}
                  />
                ),
              },
              {
                id: 'rules',
                label: t('style.editor.rules'),
                content: (
                  <StyleRulesTab
                    table={table}
                    rules={draft.conditionalRules}
                    onChange={updateRules}
                    onErrorChange={setFieldError}
                  />
                ),
              },
            ]}
          />
        </div>

        <aside className="cs-style-editor__preview" aria-label={t('style.preview.label')}>
          <StylePreview
            table={table}
            view={view}
            tableStyle={draft}
            rows={rows}
            previewMs={previewMs}
            displayName={styleDisplayName(sourceStyle, t)}
          />
          <p className="cs-style-hint">{t('style.editor.previewHint')}</p>
        </aside>
      </div>
    </Dialog>
  );
}
