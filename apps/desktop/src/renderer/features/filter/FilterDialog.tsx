import { useEffect, useMemo, useState } from 'react';

import {
  allowedCompareOps,
  buildFilterPredicate,
  compareOpNeedsValue,
  createEmptyFilterDraft,
  defaultFilterValueFor,
  defaultOperatorFor,
  filterDraftFromPredicate,
} from '@curve/app-core';
import type {
  FilterDraft,
  FilterDraftCondition,
  FilterDraftIssue,
  FilterDraftIssueReason,
} from '@curve/app-core';
import { MAX_FILTER_CHILDREN } from '@curve/domain';
import type { CompareOp, FilterPredicate, TableMeta } from '@curve/domain';
import { Button, Dialog, Input, Select } from '@curve/ui';

import { useI18n } from '../../i18n';

import type { MessageKey } from '../../i18n';
import type { ReactElement, ReactNode } from 'react';

const OP_KEYS: Record<CompareOp, MessageKey> = {
  eq: 'grid.filter.op.eq',
  neq: 'grid.filter.op.neq',
  gt: 'grid.filter.op.gt',
  gte: 'grid.filter.op.gte',
  lt: 'grid.filter.op.lt',
  lte: 'grid.filter.op.lte',
  contains: 'grid.filter.op.contains',
  startsWith: 'grid.filter.op.startsWith',
  endsWith: 'grid.filter.op.endsWith',
  between: 'grid.filter.op.between',
  isNull: 'grid.filter.op.isNull',
  notNull: 'grid.filter.op.notNull',
};

const REASON_KEYS: Record<FilterDraftIssueReason, MessageKey> = {
  'missing-column': 'grid.filter.reason.missing-column',
  'unsupported-operator': 'grid.filter.reason.unsupported-operator',
  'missing-value': 'grid.filter.reason.missing-value',
  'invalid-type': 'grid.filter.reason.invalid-type',
  'out-of-range': 'grid.filter.reason.out-of-range',
  'invalid-enum': 'grid.filter.reason.invalid-enum',
  limit: 'grid.filter.reason.limit',
};

const MAX_CONDITIONS = MAX_FILTER_CHILDREN;

export interface FilterDialogProps {
  open: boolean;
  table: TableMeta;
  filter: FilterPredicate | undefined;
  onClose: () => void;
  onApply: (filter: FilterPredicate | undefined) => void;
}

function normalizeDraft(table: TableMeta, draft: FilterDraft): FilterDraft {
  return {
    ...draft,
    conditions: draft.conditions.map((condition) => {
      const column = table.columns.find((candidate) => candidate.id === condition.columnId);
      if (column === undefined || compareOpNeedsValue(condition.op) === false) {
        return condition;
      }
      const value = condition.value === '' ? defaultFilterValueFor(column) : condition.value;
      return value === condition.value ? condition : { ...condition, value };
    }),
  };
}

export function FilterDialog({
  open,
  table,
  filter,
  onClose,
  onApply,
}: FilterDialogProps): ReactElement | null {
  const { t } = useI18n();
  const [draft, setDraft] = useState<FilterDraft>(() => createEmptyFilterDraft(table));
  const [issues, setIssues] = useState<readonly FilterDraftIssue[]>([]);
  const [nested, setNested] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    const next = filterDraftFromPredicate(table, filter);
    setNested(next === null);
    setDraft(normalizeDraft(table, next ?? { mode: 'all', conditions: [] }));
    setIssues([]);
  }, [filter, open, table]);

  const columnById = useMemo(
    () => new Map(table.columns.map((column) => [column.id, column])),
    [table.columns],
  );

  const patchCondition = (index: number, patch: Partial<FilterDraftCondition>): void => {
    setDraft((current) => ({
      ...current,
      conditions: current.conditions.map((condition, position) =>
        position === index ? { ...condition, ...patch } : condition,
      ),
    }));
    setIssues([]);
  };

  const changeColumn = (index: number, columnId: string): void => {
    const column = columnById.get(columnId);
    if (column === undefined) {
      return;
    }
    patchCondition(index, {
      columnId,
      op: defaultOperatorFor(column),
      value: defaultFilterValueFor(column),
      value2: '',
    });
  };

  const changeOperator = (index: number, op: CompareOp): void => {
    patchCondition(index, {
      op,
      ...(compareOpNeedsValue(op) ? {} : { value: '', value2: '' }),
      ...(op === 'between' ? {} : { value2: '' }),
    });
  };

  const addCondition = (): void => {
    const column = table.columns[0];
    if (column === undefined || draft.conditions.length >= MAX_CONDITIONS) {
      return;
    }
    setDraft((current) => ({
      ...current,
      conditions: [
        ...current.conditions,
        {
          columnId: column.id,
          op: defaultOperatorFor(column),
          value: defaultFilterValueFor(column),
        },
      ],
    }));
    setIssues([]);
  };

  const removeCondition = (index: number): void => {
    setDraft((current) => ({
      ...current,
      conditions: current.conditions.filter((_condition, position) => position !== index),
    }));
    setIssues([]);
  };

  const apply = (): void => {
    if (nested) {
      return;
    }
    const result = buildFilterPredicate(table, draft);
    if (!result.ok) {
      setIssues(result.issues);
      return;
    }
    onApply(result.filter);
  };

  const renderValueControl = (condition: FilterDraftCondition, index: number): ReactNode => {
    const column = columnById.get(condition.columnId);
    if (column === undefined || !compareOpNeedsValue(condition.op)) {
      return null;
    }
    const type = condition.op === 'between' ? 'between' : 'single';
    if (column.type === 'boolean') {
      return (
        <Select
          label={t('grid.filter.value')}
          value={condition.value === 'false' ? 'false' : 'true'}
          options={[
            { value: 'true', label: t('grid.editor.true') },
            { value: 'false', label: t('grid.editor.false') },
          ]}
          onChange={(event) => {
            patchCondition(index, { value: event.target.value });
          }}
        />
      );
    }
    if (column.type === 'enum') {
      return (
        <Select
          label={t('grid.filter.value')}
          value={condition.value}
          options={(column.enumOptions ?? []).map((option) => ({
            value: option.value,
            label: option.label,
          }))}
          onChange={(event) => {
            patchCondition(index, { value: event.target.value });
          }}
        />
      );
    }
    if (type === 'between') {
      return (
        <>
          <Input
            label={t('grid.filter.value')}
            type={column.type === 'date' ? 'date' : 'text'}
            inputMode={column.type === 'number' ? 'decimal' : undefined}
            value={condition.value}
            onChange={(event) => {
              patchCondition(index, { value: event.target.value });
            }}
          />
          <Input
            label={t('grid.filter.value2')}
            type={column.type === 'date' ? 'date' : 'text'}
            inputMode={column.type === 'number' ? 'decimal' : undefined}
            value={condition.value2 ?? ''}
            onChange={(event) => {
              patchCondition(index, { value2: event.target.value });
            }}
          />
        </>
      );
    }
    return (
      <Input
        label={t('grid.filter.value')}
        type={column.type === 'date' ? 'date' : 'text'}
        inputMode={column.type === 'number' ? 'decimal' : undefined}
        value={condition.value}
        onChange={(event) => {
          patchCondition(index, { value: event.target.value });
        }}
      />
    );
  };

  const footer = (
    <>
      {filter === undefined ? null : (
        <Button
          variant="ghost"
          onClick={() => {
            onApply(undefined);
          }}
        >
          {t('grid.filter.clear')}
        </Button>
      )}
      <Button variant="secondary" onClick={onClose}>
        {t('common.cancel')}
      </Button>
      <Button variant="primary" disabled={nested} onClick={apply}>
        {t('grid.filter.apply')}
      </Button>
    </>
  );

  return (
    <Dialog
      open={open}
      title={t('grid.filter.title')}
      description={t('grid.filter.description')}
      closeLabel={t('common.close')}
      onClose={onClose}
      footer={footer}
      className="cs-filter-dialog"
    >
      {nested ? (
        <p className="cs-filter__warning" role="alert">
          {t('grid.filter.nested')}
        </p>
      ) : null}
      {issues.length > 0 ? (
        <ul className="cs-filter__issues" role="alert">
          {issues.map((issue) => (
            <li key={`${String(issue.index)}-${issue.field}-${issue.reason}`}>
              {issue.index < 0
                ? t(REASON_KEYS[issue.reason])
                : t('grid.filter.error.condition', {
                    index: issue.index + 1,
                    reason: t(REASON_KEYS[issue.reason]),
                  })}
            </li>
          ))}
        </ul>
      ) : null}

      <Select
        label={t('grid.filter.mode')}
        value={draft.mode}
        options={[
          { value: 'all', label: t('grid.filter.mode.all') },
          { value: 'any', label: t('grid.filter.mode.any') },
        ]}
        onChange={(event) => {
          setDraft((current) => ({
            ...current,
            mode: event.target.value === 'any' ? 'any' : 'all',
          }));
          setIssues([]);
        }}
      />

      <div className="cs-filter__conditions">
        {draft.conditions.length === 0 ? (
          <p className="cs-filter__empty">{t('grid.filter.empty')}</p>
        ) : (
          draft.conditions.map((condition, index) => {
            const column = columnById.get(condition.columnId);
            const operators = column === undefined ? [] : allowedCompareOps(column);
            return (
              <div className="cs-filter__condition" key={index}>
                <span className="cs-filter__index">{index + 1}</span>
                <Select
                  label={t('grid.filter.column')}
                  value={condition.columnId}
                  options={table.columns.map((entry) => ({
                    value: entry.id,
                    label: entry.label,
                  }))}
                  onChange={(event) => {
                    changeColumn(index, event.target.value);
                  }}
                />
                <Select
                  label={t('grid.filter.operator')}
                  value={condition.op}
                  options={operators.map((op) => ({ value: op, label: t(OP_KEYS[op]) }))}
                  onChange={(event) => {
                    changeOperator(index, event.target.value as CompareOp);
                  }}
                />
                {renderValueControl(condition, index)}
                <Button
                  size="sm"
                  variant="ghost"
                  iconOnly
                  aria-label={t('grid.filter.remove', { index: index + 1 })}
                  onClick={() => {
                    removeCondition(index);
                  }}
                >
                  <span aria-hidden="true">×</span>
                </Button>
              </div>
            );
          })
        )}
      </div>

      <div className="cs-filter__actions">
        <Button
          size="sm"
          variant="secondary"
          disabled={draft.conditions.length >= MAX_CONDITIONS || table.columns.length === 0}
          onClick={addCondition}
        >
          {t('grid.filter.add')}
        </Button>
        {draft.conditions.length >= MAX_CONDITIONS ? (
          <span className="cs-filter__hint">{t('grid.filter.limit')}</span>
        ) : null}
      </div>
    </Dialog>
  );
}
