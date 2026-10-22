import { lazy, Suspense, useState } from 'react';

import { Button } from '@curve/ui';

import { useAppState, useRendererCore } from '../../app-core/use-app-core';
import { useI18n } from '../../i18n';

import { DeleteTableDialog } from './DeleteTableDialog';
import { NewTableDialog } from './NewTableDialog';
import { RenameTableDialog } from './RenameTableDialog';

import type { ReactElement } from 'react';

const ImportSession = lazy(async () => {
  const module = await import('../import/ImportSession');
  return { default: module.ImportSession };
});

type DialogState =
  | { kind: 'none' }
  | { kind: 'new' }
  | { kind: 'rename'; tableId: string; name: string }
  | { kind: 'delete'; tableId: string; name: string };

/** Left navigator: table list plus create/rename/delete (SPEC §9.0, T2.1). */
export function TableList(): ReactElement {
  const { t } = useI18n();
  const { core } = useRendererCore();
  const tables = useAppState((state) => state.tables);
  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' });
  const [importTableId, setImportTableId] = useState<string | null>(null);

  const tableData = Object.values(tables);

  return (
    <section className="cs-tables" data-testid="table-list">
      <div className="cs-tables__header">
        <h2 className="cs-tables__title">{t('tables.title')}</h2>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            setDialog({ kind: 'new' });
          }}
        >
          {t('tables.new')}
        </Button>
      </div>

      {tableData.length === 0 ? (
        <p className="cs-tables__empty">{t('tables.empty')}</p>
      ) : (
        <ul className="cs-tables__list">
          {tableData.map(({ table, rows }) => (
            <li key={table.id} className="cs-tables__item">
              <button
                type="button"
                className="cs-tables__open"
                onClick={() => {
                  void core.actions.openTable(table.id);
                }}
              >
                <span className="cs-tables__name">{table.name}</span>
                <span className="cs-tables__meta">
                  {t('grid.rows', { count: rows.length })} ·{' '}
                  {t('grid.columns', { count: table.columns.length })}
                </span>
              </button>
              <div className="cs-tables__actions">
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={t('tables.import', { name: table.name })}
                  onClick={() => {
                    setImportTableId(table.id);
                  }}
                >
                  {t('common.import')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={t('tables.rename', { name: table.name })}
                  onClick={() => {
                    setDialog({ kind: 'rename', tableId: table.id, name: table.name });
                  }}
                >
                  {t('common.rename')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={t('tables.delete', { name: table.name })}
                  onClick={() => {
                    setDialog({ kind: 'delete', tableId: table.id, name: table.name });
                  }}
                >
                  {t('common.delete')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <NewTableDialog
        open={dialog.kind === 'new'}
        onClose={() => {
          setDialog({ kind: 'none' });
        }}
      />
      <RenameTableDialog
        open={dialog.kind === 'rename'}
        tableId={dialog.kind === 'rename' ? dialog.tableId : null}
        initialName={dialog.kind === 'rename' ? dialog.name : ''}
        onClose={() => {
          setDialog({ kind: 'none' });
        }}
      />
      <DeleteTableDialog
        open={dialog.kind === 'delete'}
        tableId={dialog.kind === 'delete' ? dialog.tableId : null}
        tableName={dialog.kind === 'delete' ? dialog.name : ''}
        onClose={() => {
          setDialog({ kind: 'none' });
        }}
      />
      {importTableId === null ? null : (
        <Suspense fallback={null}>
          <ImportSession
            tableId={importTableId}
            onDone={() => {
              setImportTableId(null);
            }}
          />
        </Suspense>
      )}
    </section>
  );
}
