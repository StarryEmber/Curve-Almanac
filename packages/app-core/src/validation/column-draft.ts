import { MAX_COLUMNS_PER_TABLE, parseColumnDef } from '@curve/domain';
import type { ColumnDef, ColumnRole, ColumnType, EnumOption, TableMeta } from '@curve/domain';

/**
 * Form-level validation for the column add/edit dialog (T2.3).
 *
 * The dialog builds a `ColumnDraft`; this function normalises it, applies the
 * table-wide rules the schema alone cannot know (unique key, 100-column cap,
 * primary-key storage type) and returns one issue per field. The command layer
 * still re-validates with the same rules, so the UI cannot talk it into an
 * invalid document.
 */

export interface ColumnDraft {
  label: string;
  key: string;
  type: ColumnType;
  role: ColumnRole;
  unit?: string;
  precision?: number;
  enumOptions?: EnumOption[];
  required?: boolean;
}

export type ColumnDraftField =
  'label' | 'key' | 'type' | 'role' | 'unit' | 'precision' | 'enumOptions' | 'required' | 'form';

export type ColumnDraftIssueReason =
  | 'required'
  | 'format'
  | 'range'
  | 'duplicate'
  | 'enum-empty'
  | 'enum-duplicate'
  | 'primary-key-type'
  | 'limit'
  | 'invalid';

export interface ColumnDraftIssue {
  field: ColumnDraftField;
  reason: ColumnDraftIssueReason;
  message: string;
}

export type ColumnDraftResult =
  { ok: true; column: ColumnDef } | { ok: false; issues: readonly ColumnDraftIssue[] };

const FIELD_BY_PATH: Record<string, ColumnDraftField> = {
  label: 'label',
  key: 'key',
  type: 'type',
  role: 'role',
  unit: 'unit',
  precision: 'precision',
  enumOptions: 'enumOptions',
  required: 'required',
};

function fieldForPath(path: string): ColumnDraftField {
  const base = path.split(/[.[]/, 1)[0] ?? '';
  return FIELD_BY_PATH[base] ?? 'form';
}

function reasonForIssue(code: string, field: ColumnDraftField): ColumnDraftIssueReason {
  if (code === 'E_REQUIRED') {
    return 'required';
  }
  if (code === 'E_DUPLICATE_KEY') {
    return 'duplicate';
  }
  if (code === 'E_RANGE') {
    return 'range';
  }
  if (field === 'key' || field === 'label') {
    return 'format';
  }
  return 'invalid';
}

export function checkColumnDraft(
  table: TableMeta,
  draft: ColumnDraft,
  columnId = 'col_draft',
): ColumnDraftResult {
  const issues: ColumnDraftIssue[] = [];
  const seenFields = new Set<ColumnDraftField>();
  const addIssue = (issue: ColumnDraftIssue): void => {
    if (!seenFields.has(issue.field)) {
      seenFields.add(issue.field);
      issues.push(issue);
    }
  };

  const label = draft.label.trim();
  const key = draft.key.trim();
  const unit = draft.unit?.trim();
  const editing = table.columns.some((column) => column.id === columnId);

  if (!editing && table.columns.length >= MAX_COLUMNS_PER_TABLE) {
    addIssue({
      field: 'form',
      reason: 'limit',
      message: `a table may have at most ${String(MAX_COLUMNS_PER_TABLE)} columns`,
    });
  }
  if (label.length === 0) {
    addIssue({ field: 'label', reason: 'required', message: 'the column label is required' });
  }
  if (key.length === 0) {
    addIssue({ field: 'key', reason: 'required', message: 'the column key is required' });
  } else if (table.columns.some((column) => column.id !== columnId && column.key === key)) {
    addIssue({
      field: 'key',
      reason: 'duplicate',
      message: 'the column key must be unique within the table',
    });
  }

  let enumOptions: EnumOption[] | undefined;
  if (draft.type === 'enum') {
    enumOptions = (draft.enumOptions ?? []).map((option) => ({
      value: option.value.trim(),
      label: option.label.trim(),
    }));
    if (
      enumOptions.length === 0 ||
      enumOptions.some((option) => option.value === '' || option.label === '')
    ) {
      addIssue({
        field: 'enumOptions',
        reason: 'enum-empty',
        message: 'enum columns need at least one non-empty option',
      });
    } else {
      const values = new Set<string>();
      for (const option of enumOptions) {
        if (values.has(option.value)) {
          addIssue({
            field: 'enumOptions',
            reason: 'enum-duplicate',
            message: 'enum option values must be unique',
          });
          break;
        }
        values.add(option.value);
      }
    }
  }

  if (columnId === table.primaryKey && draft.type !== 'text') {
    addIssue({
      field: 'type',
      reason: 'primary-key-type',
      message: 'the primary key must remain a text column',
    });
  }

  const candidate: ColumnDef = {
    id: columnId,
    key,
    label,
    type: draft.type,
    role: draft.role,
    ...(unit === undefined || unit.length === 0 ? {} : { unit }),
    ...(draft.precision === undefined ? {} : { precision: draft.precision }),
    ...(enumOptions === undefined ? {} : { enumOptions }),
    ...(draft.required === true ? { required: true } : {}),
  };
  const parsed = parseColumnDef(candidate);
  if (!parsed.ok) {
    for (const issue of parsed.issues) {
      const field = fieldForPath(issue.path);
      addIssue({
        field,
        reason: reasonForIssue(issue.code, field),
        message: issue.message,
      });
    }
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }
  if (!parsed.ok) {
    return {
      ok: false,
      issues: [{ field: 'form', reason: 'invalid', message: 'the column definition is invalid' }],
    };
  }
  return { ok: true, column: parsed.data };
}
