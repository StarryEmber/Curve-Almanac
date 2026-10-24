/** Per-column display overrides for the style editor (T3.4, SPEC §10.2). */

import { useId } from 'react';

import type { ColumnDef, ColumnStyleOverride, TableMeta } from '@curve/domain';
import { Button, Select } from '@curve/ui';

import { useI18n } from '../../i18n';

import { NumberField, TextField } from './StyleFieldControls';

import type { ReactElement } from 'react';

type NumberFormat = NonNullable<ColumnStyleOverride['numberFormat']>;

export interface StyleColumnsTabProps {
  table: TableMeta;
  overrides: Readonly<Record<string, ColumnStyleOverride>>;
  onChange: (overrides: Record<string, ColumnStyleOverride>, commit: boolean) => void;
  onErrorChange: (key: string, error: string | null) => void;
}

function compactOverride(override: ColumnStyleOverride): ColumnStyleOverride {
  const compact: ColumnStyleOverride = {};
  if (override.label !== undefined && override.label !== '') {
    compact.label = override.label;
  }
  if (override.width !== undefined) {
    compact.width = override.width;
  }
  if (override.align !== undefined) {
    compact.align = override.align;
  }
  if (override.dateFormat !== undefined) {
    compact.dateFormat = override.dateFormat;
  }
  if (override.cellRender !== undefined) {
    compact.cellRender = override.cellRender;
  }
  if (override.numberFormat !== undefined) {
    compact.numberFormat = override.numberFormat;
  }
  return compact;
}

export function StyleColumnsTab({
  table,
  overrides,
  onChange,
  onErrorChange,
}: StyleColumnsTabProps): ReactElement {
  const { t } = useI18n();
  const baseId = useId();

  const replace = (
    columnId: string,
    next: ColumnStyleOverride | undefined,
    commit: boolean,
  ): void => {
    const updated = { ...overrides };
    if (next === undefined || Object.keys(next).length === 0) {
      delete updated[columnId];
    } else {
      updated[columnId] = compactOverride(next);
    }
    onChange(updated, commit);
  };

  const patch = (
    columnId: string,
    patchValue: Partial<ColumnStyleOverride>,
    commit: boolean,
  ): void => {
    const current = overrides[columnId] ?? {};
    replace(columnId, { ...current, ...patchValue }, commit);
  };

  if (table.columns.length === 0) {
    return <p className="cs-style-hint">{t('style.columns.empty')}</p>;
  }

  return (
    <div className="cs-style-tab" data-testid="style-columns-tab">
      <p className="cs-style-hint">{t('style.columns.hint')}</p>
      <ul className="cs-style-columns">
        {table.columns.map((column) => (
          <ColumnOverrideItem
            key={column.id}
            idPrefix={`${baseId}-${column.id}`}
            column={column}
            override={overrides[column.id]}
            onPatch={(patchValue, commit) => {
              patch(column.id, patchValue, commit);
            }}
            onReplace={(next, commit) => {
              replace(column.id, next, commit);
            }}
            onCommit={() => {
              onChange(overrides, true);
            }}
            onErrorChange={onErrorChange}
          />
        ))}
      </ul>
    </div>
  );
}

interface ColumnOverrideItemProps {
  idPrefix: string;
  column: ColumnDef;
  override: ColumnStyleOverride | undefined;
  onPatch: (patch: Partial<ColumnStyleOverride>, commit: boolean) => void;
  onReplace: (next: ColumnStyleOverride | undefined, commit: boolean) => void;
  onCommit: () => void;
  onErrorChange: (key: string, error: string | null) => void;
}

function ColumnOverrideItem({
  idPrefix,
  column,
  override,
  onPatch,
  onReplace,
  onCommit,
  onErrorChange,
}: ColumnOverrideItemProps): ReactElement {
  const { t } = useI18n();
  const numberFormat = override?.numberFormat;
  const covered = override !== undefined && Object.keys(override).length > 0;

  const setNumberFormat = (next: NumberFormat | undefined, commit: boolean): void => {
    if (next === undefined) {
      const { numberFormat: _numberFormat, ...rest } = override ?? {};
      onReplace(rest, commit);
      return;
    }
    onPatch({ numberFormat: next }, commit);
  };

  return (
    <li className="cs-style-columns__item">
      <details className="cs-style-column" data-testid={`style-column-${column.id}`}>
        <summary className="cs-style-column__summary">
          <span className="cs-style-column__name">{column.label}</span>
          <span className="cs-style-column__key">{column.key}</span>
          <span className="cs-style-column__type">{t(`columns.type.${column.type}`)}</span>
          <span className="cs-style-column__badge">
            {covered ? t('style.columns.overridden') : t('style.columns.inherited')}
          </span>
        </summary>
        <div className="cs-style-column__body">
          <div className="cs-style-grid">
            <TextField
              label={t('style.columns.label')}
              value={override?.label ?? ''}
              onChange={(value) => {
                onPatch({ label: value === '' ? undefined : value }, false);
              }}
              onCommit={onCommit}
              onErrorChange={(error) => {
                onErrorChange(`${idPrefix}-label`, error);
              }}
              errorMessage={t('style.error.label')}
              maxLength={80}
            />
            <NumberField
              label={t('style.columns.width')}
              value={override?.width ?? column.width ?? 160}
              min={80}
              max={800}
              onChange={(value) => {
                onPatch({ width: value }, false);
              }}
              onCommit={onCommit}
              onErrorChange={(error) => {
                onErrorChange(`${idPrefix}-width`, error);
              }}
              errorMessage={t('style.error.range', { min: 80, max: 800 })}
            />
            <Select
              label={t('style.columns.align')}
              value={override?.align ?? ''}
              options={[
                { value: '', label: t('style.default') },
                { value: 'left', label: t('style.align.left') },
                { value: 'center', label: t('style.align.center') },
                { value: 'right', label: t('style.align.right') },
              ]}
              onChange={(event) => {
                const value = event.target.value;
                onPatch(
                  { align: value === '' ? undefined : (value as 'left' | 'center' | 'right') },
                  true,
                );
              }}
            />
            <Select
              label={t('style.columns.render')}
              value={override?.cellRender ?? 'auto'}
              options={[
                { value: 'auto', label: t('style.render.auto') },
                { value: 'text', label: t('style.render.text') },
                { value: 'number', label: t('style.render.number') },
                { value: 'date', label: t('style.render.date') },
                { value: 'badge', label: t('style.render.badge') },
                { value: 'bar', label: t('style.render.bar') },
              ]}
              onChange={(event) => {
                onPatch(
                  {
                    cellRender: event.target.value as NonNullable<
                      ColumnStyleOverride['cellRender']
                    >,
                  },
                  true,
                );
              }}
            />
          </div>

          {column.type === 'number' ? (
            <fieldset className="cs-style-fieldset">
              <legend>{t('style.columns.numberFormat')}</legend>
              <div className="cs-style-grid">
                <Select
                  label={t('style.columns.format')}
                  value={numberFormat?.style ?? ''}
                  options={[
                    { value: '', label: t('style.default') },
                    { value: 'decimal', label: t('style.number.decimal') },
                    { value: 'percent', label: t('style.number.percent') },
                    { value: 'currency', label: t('style.number.currency') },
                  ]}
                  onChange={(event) => {
                    const style = event.target.value;
                    if (style === '') {
                      setNumberFormat(undefined, true);
                      return;
                    }
                    setNumberFormat(
                      {
                        style: style as NumberFormat['style'],
                        digits: numberFormat?.digits ?? column.precision ?? 2,
                        ...(numberFormat?.currency === undefined
                          ? {}
                          : { currency: numberFormat.currency }),
                      },
                      true,
                    );
                  }}
                />
                <NumberField
                  label={t('style.columns.digits')}
                  value={numberFormat?.digits ?? column.precision ?? 2}
                  min={0}
                  max={10}
                  onChange={(value) => {
                    setNumberFormat(
                      {
                        style: numberFormat?.style ?? 'decimal',
                        digits: value,
                        ...(numberFormat?.currency === undefined
                          ? {}
                          : { currency: numberFormat.currency }),
                      },
                      false,
                    );
                  }}
                  onCommit={onCommit}
                  onErrorChange={(error) => {
                    onErrorChange(`${idPrefix}-digits`, error);
                  }}
                  errorMessage={t('style.error.range', { min: 0, max: 10 })}
                />
                {numberFormat?.style === 'currency' ? (
                  <TextField
                    label={t('style.columns.currency')}
                    value={numberFormat.currency ?? ''}
                    required
                    maxLength={8}
                    onChange={(value) => {
                      setNumberFormat(
                        {
                          style: numberFormat.style,
                          digits: numberFormat.digits,
                          currency: value,
                        },
                        false,
                      );
                    }}
                    onCommit={onCommit}
                    onErrorChange={(error) => {
                      onErrorChange(`${idPrefix}-currency`, error);
                    }}
                    errorMessage={t('style.error.currency')}
                  />
                ) : null}
              </div>
            </fieldset>
          ) : null}

          {column.type === 'date' ? (
            <Select
              label={t('style.columns.dateFormat')}
              value={override?.dateFormat ?? ''}
              options={[
                { value: '', label: t('style.default') },
                { value: 'date', label: t('style.date.date') },
                { value: 'date-time', label: t('style.date.dateTime') },
                { value: 'time', label: t('style.date.time') },
                { value: 'iso', label: t('style.date.iso') },
              ]}
              onChange={(event) => {
                const value = event.target.value;
                onPatch(
                  {
                    dateFormat:
                      value === ''
                        ? undefined
                        : (value as NonNullable<ColumnStyleOverride['dateFormat']>),
                  },
                  true,
                );
              }}
            />
          ) : null}

          <Button
            size="sm"
            variant="ghost"
            disabled={!covered}
            onClick={() => {
              onReplace(undefined, true);
            }}
          >
            {t('style.columns.clear')}
          </Button>
        </div>
      </details>
    </li>
  );
}
