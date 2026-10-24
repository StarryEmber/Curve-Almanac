/** Conditional-rule editor for the style editor (T3.4, SPEC §10.4/§10.6). */

import { useState } from 'react';

import {
  buildConditionalPredicate,
  conditionPredicateFromRule,
  createConditionalPredicateDraft,
  createConditionDraft,
  defaultConditionalOperator,
  defaultConditionalValue,
  MAX_CONDITIONAL_GROUPS,
} from '@curve/app-core';
import type {
  ConditionalConditionDraft,
  ConditionalGroupDraft,
  ConditionalPredicateDraft,
  ConditionalPredicateIssue,
} from '@curve/app-core';
import {
  MAX_FILTER_CHILDREN,
  compareOpNeedsSecondValue,
  compareOpNeedsValue,
  conditionCompareOps,
  createRuleId,
  MAX_CONDITIONAL_RULES,
} from '@curve/domain';
import type { ColumnDef, CompareOp, ConditionalRule, TableMeta } from '@curve/domain';
import { Button, Input, Select } from '@curve/ui';

import { useI18n } from '../../i18n';

import { CheckboxField, ColorField } from './StyleFieldControls';

import type { MessageKey, Translate } from '../../i18n';
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

const REASON_KEYS: Record<ConditionalPredicateIssue['reason'], MessageKey> = {
  'missing-column': 'grid.filter.reason.missing-column',
  'unsupported-operator': 'grid.filter.reason.unsupported-operator',
  'missing-value': 'grid.filter.reason.missing-value',
  'invalid-type': 'grid.filter.reason.invalid-type',
  'out-of-range': 'grid.filter.reason.out-of-range',
  'invalid-enum': 'grid.filter.reason.invalid-enum',
  limit: 'grid.filter.reason.limit',
};

interface RuleStyleDraft {
  background?: string;
  foreground?: string;
  bold: boolean;
  italic: boolean;
  icon: 'none' | 'up' | 'down' | 'warning';
}

interface RuleEditing {
  /** null when adding a new rule. */
  index: number | null;
  id: string;
  enabled: boolean;
  label: string;
  targetKind: 'row' | 'cell';
  targetColumnId: string;
  predicate: ConditionalPredicateDraft;
  style: RuleStyleDraft;
  complex: boolean;
}

export interface StyleRulesTabProps {
  table: TableMeta;
  rules: readonly ConditionalRule[];
  onChange: (rules: readonly ConditionalRule[], commit: boolean) => void;
  onErrorChange: (key: string, error: string | null) => void;
}

export function StyleRulesTab({
  table,
  rules,
  onChange,
  onErrorChange,
}: StyleRulesTabProps): ReactElement {
  const { t } = useI18n();
  const [editing, setEditing] = useState<RuleEditing | null>(null);
  const [issues, setIssues] = useState<readonly ConditionalPredicateIssue[]>([]);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [ruleFieldErrors, setRuleFieldErrors] = useState<Record<string, string | null>>({});

  const setRuleFieldError = (key: string, error: string | null): void => {
    setRuleFieldErrors((current) => ({ ...current, [key]: error }));
    onErrorChange(`rule.${key}`, error);
  };

  const clearRuleFieldErrors = (): void => {
    setRuleFieldErrors({});
    onErrorChange('rule.background', null);
    onErrorChange('rule.foreground', null);
  };

  const closeEditor = (): void => {
    setEditing(null);
    setIssues([]);
    setGlobalError(null);
    clearRuleFieldErrors();
  };

  const openEditor = (rule: ConditionalRule, index: number): void => {
    const predicate = conditionPredicateFromRule(rule.when, table);
    setEditing({
      index,
      id: rule.id,
      enabled: rule.enabled,
      label: rule.label ?? '',
      targetKind: rule.target.kind,
      targetColumnId:
        rule.target.kind === 'cell' ? rule.target.columnId : (table.columns[0]?.id ?? ''),
      predicate: predicate ?? createConditionalPredicateDraft(table),
      style: {
        ...(rule.style.background === undefined ? {} : { background: rule.style.background }),
        ...(rule.style.foreground === undefined ? {} : { foreground: rule.style.foreground }),
        bold: rule.style.bold === true,
        italic: rule.style.italic === true,
        icon: rule.style.icon ?? 'none',
      },
      complex: predicate === null,
    });
    setIssues([]);
    setGlobalError(null);
    clearRuleFieldErrors();
  };

  const startAdd = (): void => {
    if (table.columns.length === 0 || rules.length >= MAX_CONDITIONAL_RULES) {
      return;
    }
    setEditing({
      index: null,
      id: createRuleId(),
      enabled: true,
      label: '',
      targetKind: 'row',
      targetColumnId: table.columns[0]?.id ?? '',
      predicate: createConditionalPredicateDraft(table),
      style: { bold: false, italic: false, icon: 'none' },
      complex: false,
    });
    setIssues([]);
    setGlobalError(null);
    clearRuleFieldErrors();
  };

  const patchEditing = (patch: Partial<RuleEditing>): void => {
    setEditing((current) => (current === null ? null : { ...current, ...patch }));
  };

  const saveRule = (): void => {
    if (editing === null || editing.complex) {
      return;
    }
    if (Object.values(ruleFieldErrors).some((error) => error !== null)) {
      return;
    }
    const built = buildConditionalPredicate(table, editing.predicate);
    if (!built.ok) {
      setIssues(built.issues);
      return;
    }
    if (editing.targetKind === 'cell') {
      if (!table.columns.some((column) => column.id === editing.targetColumnId)) {
        setGlobalError(t('style.rules.error.target'));
        return;
      }
    }
    if (editing.index === null && rules.length >= MAX_CONDITIONAL_RULES) {
      setGlobalError(t('style.rules.error.limit', { count: MAX_CONDITIONAL_RULES }));
      return;
    }

    const style: ConditionalRule['style'] = {
      ...(editing.style.background === undefined ? {} : { background: editing.style.background }),
      ...(editing.style.foreground === undefined ? {} : { foreground: editing.style.foreground }),
      ...(editing.style.bold ? { bold: true } : {}),
      ...(editing.style.italic ? { italic: true } : {}),
      ...(editing.style.icon === 'none' ? {} : { icon: editing.style.icon }),
    };
    const nextRule: ConditionalRule = {
      id: editing.id,
      enabled: editing.enabled,
      ...(editing.label.trim() === '' ? {} : { label: editing.label.trim() }),
      target:
        editing.targetKind === 'cell'
          ? { kind: 'cell', columnId: editing.targetColumnId }
          : { kind: 'row' },
      when: built.predicate,
      style,
    };

    const next =
      editing.index === null
        ? [...rules, nextRule]
        : rules.map((rule, index) => (index === editing.index ? nextRule : rule));
    onChange(next, true);
    closeEditor();
  };

  const toggleRule = (rule: ConditionalRule, enabled: boolean): void => {
    onChange(
      rules.map((candidate) => (candidate.id === rule.id ? { ...candidate, enabled } : candidate)),
      true,
    );
  };

  const removeRule = (rule: ConditionalRule): void => {
    onChange(
      rules.filter((candidate) => candidate.id !== rule.id),
      true,
    );
    if (editing?.id === rule.id) {
      closeEditor();
    }
  };

  return (
    <div className="cs-style-tab" data-testid="style-rules-tab">
      <div className="cs-style-rules__header">
        <p className="cs-style-hint">
          {t('style.rules.hint', {
            count: rules.length,
            max: MAX_CONDITIONAL_RULES,
          })}
        </p>
        <Button
          size="sm"
          variant="secondary"
          data-testid="style-rule-add"
          disabled={table.columns.length === 0 || rules.length >= MAX_CONDITIONAL_RULES}
          onClick={startAdd}
        >
          {t('style.rules.add')}
        </Button>
      </div>

      {rules.length === 0 ? (
        <p className="cs-style-hint">{t('style.rules.empty')}</p>
      ) : (
        <ul className="cs-style-rules">
          {rules.map((rule, index) => (
            <li
              key={rule.id}
              className="cs-style-rules__item"
              data-testid={`style-rule-${rule.id}`}
            >
              <CheckboxField
                label={rule.label ?? t('style.rules.unnamed', { index: index + 1 })}
                checked={rule.enabled}
                onChange={(enabled) => {
                  toggleRule(rule, enabled);
                }}
              />
              <span className="cs-style-rules__target">{ruleTargetLabel(rule, table, t)}</span>
              <span className="cs-style-rules__count">
                {t('style.rules.conditionCount', { count: countConditions(rule.when) })}
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  openEditor(rule, index);
                }}
              >
                {t('style.rules.edit')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  removeRule(rule);
                }}
              >
                {t('style.rules.remove')}
              </Button>
            </li>
          ))}
        </ul>
      )}

      {editing === null ? null : (
        <section className="cs-style-rule-editor" aria-label={t('style.rules.editor')}>
          <h3 className="cs-style-section__title">
            {editing.index === null ? t('style.rules.newTitle') : t('style.rules.editTitle')}
          </h3>
          {editing.complex ? (
            <p className="cs-style-error" role="alert">
              {t('style.rules.complex')}
            </p>
          ) : null}

          <div className="cs-style-grid">
            <Input
              label={t('style.rules.label')}
              value={editing.label}
              maxLength={120}
              data-testid="style-rule-label"
              onChange={(event) => {
                patchEditing({ label: event.target.value });
              }}
            />
            <Select
              label={t('style.rules.target')}
              value={editing.targetKind}
              options={[
                { value: 'row', label: t('style.rules.targetRow') },
                { value: 'cell', label: t('style.rules.targetCellShort') },
              ]}
              data-testid="style-rule-target"
              onChange={(event) => {
                patchEditing({ targetKind: event.target.value === 'cell' ? 'cell' : 'row' });
              }}
            />
            {editing.targetKind === 'cell' ? (
              <Select
                label={t('style.rules.targetColumn')}
                value={editing.targetColumnId}
                options={table.columns.map((column) => ({
                  value: column.id,
                  label: column.label,
                }))}
                data-testid="style-rule-target-column"
                onChange={(event) => {
                  patchEditing({ targetColumnId: event.target.value });
                }}
              />
            ) : null}
          </div>

          <ConditionPredicateEditor
            table={table}
            draft={editing.predicate}
            onChange={(predicate) => {
              patchEditing({ predicate });
              setIssues([]);
            }}
          />

          <section className="cs-style-section" aria-labelledby="style-rule-style-title">
            <h4 className="cs-style-section__title" id="style-rule-style-title">
              {t('style.rules.style')}
            </h4>
            <div className="cs-style-grid">
              <ColorField
                label={t('style.rules.background')}
                value={editing.style.background}
                allowEmpty
                onChange={(value) => {
                  patchEditing({
                    style: { ...editing.style, background: value },
                  });
                }}
                onCommit={() => undefined}
                onErrorChange={(error) => {
                  setRuleFieldError('background', error);
                }}
                errorMessage={t('style.error.color')}
                pickerLabel={t('style.tokens.pickColor')}
              />
              <ColorField
                label={t('style.rules.foreground')}
                value={editing.style.foreground}
                allowEmpty
                onChange={(value) => {
                  patchEditing({
                    style: { ...editing.style, foreground: value },
                  });
                }}
                onCommit={() => undefined}
                onErrorChange={(error) => {
                  setRuleFieldError('foreground', error);
                }}
                errorMessage={t('style.error.color')}
                pickerLabel={t('style.tokens.pickColor')}
              />
              <Select
                label={t('style.rules.icon')}
                value={editing.style.icon}
                options={[
                  { value: 'none', label: t('style.rules.iconNone') },
                  { value: 'up', label: t('style.rules.iconUp') },
                  { value: 'down', label: t('style.rules.iconDown') },
                  { value: 'warning', label: t('style.rules.iconWarning') },
                ]}
                onChange={(event) => {
                  patchEditing({
                    style: {
                      ...editing.style,
                      icon: event.target.value as RuleStyleDraft['icon'],
                    },
                  });
                }}
              />
            </div>
            <div className="cs-style-inline-checks">
              <CheckboxField
                label={t('style.rules.bold')}
                checked={editing.style.bold}
                onChange={(bold) => {
                  patchEditing({ style: { ...editing.style, bold } });
                }}
              />
              <CheckboxField
                label={t('style.rules.italic')}
                checked={editing.style.italic}
                onChange={(italic) => {
                  patchEditing({ style: { ...editing.style, italic } });
                }}
              />
            </div>
          </section>

          {issues.length > 0 ? (
            <ul className="cs-style-issues" role="alert">
              {issues.map((issue, index) => (
                <li key={`${String(issue.groupIndex)}-${String(issue.conditionIndex)}-${index}`}>
                  {t('style.rules.issue', {
                    condition:
                      issue.conditionIndex >= 0 ? issue.conditionIndex + 1 : issue.groupIndex + 1,
                    reason: t(REASON_KEYS[issue.reason]),
                  })}
                </li>
              ))}
            </ul>
          ) : null}
          {globalError === null ? null : (
            <p className="cs-style-error" role="alert">
              {globalError}
            </p>
          )}

          <div className="cs-style-actions">
            <Button variant="secondary" onClick={closeEditor}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="primary"
              data-testid="style-rule-save"
              disabled={
                editing.complex || Object.values(ruleFieldErrors).some((error) => error !== null)
              }
              onClick={saveRule}
            >
              {t('style.rules.save')}
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}

function countConditions(when: ConditionalRule['when']): number {
  if (when.kind === 'compare') {
    return 1;
  }
  return when.children.reduce((total, child) => total + countConditions(child), 0);
}

function ruleTargetLabel(rule: ConditionalRule, table: TableMeta, t: Translate): string {
  if (rule.target.kind === 'row') {
    return t('style.rules.targetRow');
  }
  const columnId = rule.target.columnId;
  const column = table.columns.find((candidate) => candidate.id === columnId);
  return t('style.rules.targetCell', { column: column?.label ?? columnId });
}

interface ConditionPredicateEditorProps {
  table: TableMeta;
  draft: ConditionalPredicateDraft;
  onChange: (draft: ConditionalPredicateDraft) => void;
}

function ConditionPredicateEditor({
  table,
  draft,
  onChange,
}: ConditionPredicateEditorProps): ReactElement {
  const { t } = useI18n();

  const setGroup = (index: number, value: ConditionalGroupDraft): void => {
    onChange({
      ...draft,
      groups: draft.groups.map((group, position) => (position === index ? value : group)),
    });
  };

  const addGroup = (): void => {
    if (draft.groups.length >= MAX_CONDITIONAL_GROUPS) {
      return;
    }
    onChange({
      ...draft,
      groups: [...draft.groups, { mode: 'all', conditions: [createConditionDraft(table)] }],
    });
  };

  const removeGroup = (index: number): void => {
    if (draft.groups.length <= 1) {
      return;
    }
    onChange({
      ...draft,
      groups: draft.groups.filter((_group, position) => position !== index),
    });
  };

  return (
    <fieldset className="cs-style-fieldset">
      <legend>{t('style.rules.conditions')}</legend>
      <Select
        label={t('style.rules.groupMode')}
        value={draft.mode}
        options={[
          { value: 'all', label: t('style.rules.matchAll') },
          { value: 'any', label: t('style.rules.matchAny') },
        ]}
        data-testid="style-rule-mode"
        onChange={(event) => {
          onChange({ ...draft, mode: event.target.value === 'any' ? 'any' : 'all' });
        }}
      />
      {draft.groups.map((group, groupIndex) => (
        <div className="cs-style-condition-group" key={groupIndex}>
          <div className="cs-style-condition-group__header">
            <Select
              label={t('style.rules.groupMode')}
              value={group.mode}
              options={[
                { value: 'all', label: t('style.rules.matchAll') },
                { value: 'any', label: t('style.rules.matchAny') },
              ]}
              onChange={(event) => {
                setGroup(groupIndex, {
                  ...group,
                  mode: event.target.value === 'any' ? 'any' : 'all',
                });
              }}
            />
            {draft.groups.length > 1 ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  removeGroup(groupIndex);
                }}
              >
                {t('style.rules.removeGroup', { index: groupIndex + 1 })}
              </Button>
            ) : null}
          </div>
          {group.conditions.map((condition, conditionIndex) => (
            <ConditionRow
              key={conditionIndex}
              table={table}
              groupIndex={groupIndex}
              conditionIndex={conditionIndex}
              condition={condition}
              canRemove={group.conditions.length > 1}
              onChange={(next) => {
                setGroup(groupIndex, {
                  ...group,
                  conditions: group.conditions.map((candidate, position) =>
                    position === conditionIndex ? next : candidate,
                  ),
                });
              }}
              onRemove={() => {
                setGroup(groupIndex, {
                  ...group,
                  conditions: group.conditions.filter(
                    (_candidate, position) => position !== conditionIndex,
                  ),
                });
              }}
            />
          ))}
          <Button
            size="sm"
            variant="ghost"
            disabled={group.conditions.length >= MAX_FILTER_CHILDREN}
            onClick={() => {
              setGroup(groupIndex, {
                ...group,
                conditions: [...group.conditions, createConditionDraft(table)],
              });
            }}
          >
            {t('style.rules.addCondition')}
          </Button>
        </div>
      ))}
      <div className="cs-style-actions">
        <Button
          size="sm"
          variant="secondary"
          disabled={draft.groups.length >= MAX_CONDITIONAL_GROUPS}
          onClick={addGroup}
        >
          {t('style.rules.addGroup')}
        </Button>
      </div>
    </fieldset>
  );
}

interface ConditionRowProps {
  table: TableMeta;
  groupIndex: number;
  conditionIndex: number;
  condition: ConditionalConditionDraft;
  canRemove: boolean;
  onChange: (condition: ConditionalConditionDraft) => void;
  onRemove: () => void;
}

function ConditionRow({
  table,
  groupIndex,
  conditionIndex,
  condition,
  canRemove,
  onChange,
  onRemove,
}: ConditionRowProps): ReactElement {
  const { t } = useI18n();
  const column = table.columns.find((candidate) => candidate.id === condition.columnId);
  const operators = column === undefined ? [] : conditionCompareOps(column);
  const testIdBase = `style-rule-condition-${String(groupIndex)}-${String(conditionIndex)}`;

  return (
    <div className="cs-style-condition">
      <Select
        label={t('grid.filter.column')}
        value={condition.columnId}
        options={table.columns.map((candidate) => ({
          value: candidate.id,
          label: candidate.label,
        }))}
        data-testid={`${testIdBase}-column`}
        onChange={(event) => {
          const nextColumn = table.columns.find((candidate) => candidate.id === event.target.value);
          if (nextColumn === undefined) {
            return;
          }
          onChange({
            columnId: nextColumn.id,
            op: defaultConditionalOperator(nextColumn),
            value: defaultConditionalValue(nextColumn),
          });
        }}
      />
      <Select
        label={t('grid.filter.operator')}
        value={condition.op}
        options={operators.map((op) => ({ value: op, label: t(OP_KEYS[op]) }))}
        data-testid={`${testIdBase}-op`}
        onChange={(event) => {
          const op = event.target.value as CompareOp;
          const needsValue = compareOpNeedsValue(op);
          const value =
            needsValue && condition.value === '' && column !== undefined
              ? defaultConditionalValue(column)
              : condition.value;
          onChange({
            ...condition,
            op,
            ...(needsValue ? { value } : { value: '', value2: '' }),
            ...(compareOpNeedsSecondValue(op) ? {} : { value2: '' }),
          });
        }}
      />
      {column === undefined ? null : (
        <ConditionValueFields
          column={column}
          condition={condition}
          testIdBase={testIdBase}
          onChange={onChange}
        />
      )}
      <Button
        size="sm"
        variant="ghost"
        disabled={!canRemove}
        aria-label={t('style.rules.removeCondition')}
        data-testid={`${testIdBase}-remove`}
        onClick={onRemove}
      >
        <span aria-hidden="true">-</span>
      </Button>
    </div>
  );
}

function ConditionValueFields({
  column,
  condition,
  testIdBase,
  onChange,
}: {
  column: ColumnDef;
  condition: ConditionalConditionDraft;
  testIdBase: string;
  onChange: (condition: ConditionalConditionDraft) => void;
}): ReactElement | null {
  const { t } = useI18n();
  if (!compareOpNeedsValue(condition.op)) {
    return null;
  }
  const second = compareOpNeedsSecondValue(condition.op);

  const renderValue = (field: 'value' | 'value2', value: string, label: string): ReactNode => {
    if (column.type === 'boolean') {
      return (
        <Select
          label={label}
          value={value === 'false' ? 'false' : 'true'}
          options={[
            { value: 'true', label: t('grid.editor.true') },
            { value: 'false', label: t('grid.editor.false') },
          ]}
          data-testid={`${testIdBase}-${field}`}
          onChange={(event) => {
            onChange({
              ...condition,
              ...(field === 'value'
                ? { value: event.target.value }
                : { value2: event.target.value }),
            });
          }}
        />
      );
    }
    if (column.type === 'enum') {
      return (
        <Select
          label={label}
          value={value}
          options={(column.enumOptions ?? []).map((option) => ({
            value: option.value,
            label: option.label,
          }))}
          data-testid={`${testIdBase}-${field}`}
          onChange={(event) => {
            onChange({
              ...condition,
              ...(field === 'value'
                ? { value: event.target.value }
                : { value2: event.target.value }),
            });
          }}
        />
      );
    }
    return (
      <Input
        label={label}
        type={column.type === 'date' ? 'date' : 'text'}
        inputMode={column.type === 'number' ? 'decimal' : undefined}
        value={value}
        data-testid={`${testIdBase}-${field}`}
        onChange={(event) => {
          onChange({
            ...condition,
            ...(field === 'value' ? { value: event.target.value } : { value2: event.target.value }),
          });
        }}
      />
    );
  };

  return (
    <>
      {renderValue('value', condition.value, t('grid.filter.value'))}
      {second ? renderValue('value2', condition.value2 ?? '', t('grid.filter.value2')) : null}
    </>
  );
}
