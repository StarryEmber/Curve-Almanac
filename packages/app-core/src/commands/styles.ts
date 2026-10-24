/**
 * Style commands (SPEC §10.5/§10.6, §13.1; T3.3/T3.4).
 *
 * Styles live in `manifest.tableStyles`, not in table JSONL, so these commands
 * are manifest-only document changes. `style.update` is deliberately limited to
 * persisted user styles; editing a builtin first forks it into a new user style
 * with `style.create`, which can atomically point a view at the copy.
 */

import { createAppError, createTimestamp, isId, tableStyleSchema } from '@curve/domain';
import type { TableStyle } from '@curve/domain';

import type { CommandDefinition } from './types';
import type { AppState } from '../state/types';
import type { Draft } from 'immer';

export interface StyleUpdatePayload {
  style: TableStyle;
}

export interface StyleCreatePayload {
  style: TableStyle;
  /** Optional table view to point at the new style in the same command. */
  viewId?: string;
}

export interface StyleUpdateCommandOptions {
  /** Injected so `updatedAt` assertions are deterministic. */
  now?: () => Date;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalid(message: string): never {
  throw createAppError('E_VALIDATION', message);
}

function parsePayload(payload: unknown): StyleUpdatePayload {
  if (!isRecord(payload) || !('style' in payload)) {
    invalid('style.update expects { style }.');
  }
  const parsed = tableStyleSchema.safeParse(payload['style']);
  if (!parsed.success) {
    invalid('The table style is invalid.');
  }
  return { style: parsed.data };
}

function parseCreatePayload(payload: unknown): StyleCreatePayload {
  if (!isRecord(payload) || !('style' in payload)) {
    invalid('style.create expects { style, viewId? }.');
  }
  const parsed = tableStyleSchema.safeParse(payload['style']);
  if (!parsed.success) {
    invalid('The table style is invalid.');
  }
  const viewId = payload['viewId'];
  if (viewId !== undefined && (typeof viewId !== 'string' || !isId('viw', viewId))) {
    invalid('style.create expects a valid viewId.');
  }
  return {
    style: parsed.data,
    ...(viewId === undefined ? {} : { viewId }),
  };
}

function assertRuleIds(style: TableStyle): void {
  const seen = new Set<string>();
  for (const rule of style.conditionalRules) {
    if (seen.has(rule.id)) {
      invalid(`Duplicate conditional rule id "${rule.id}".`);
    }
    seen.add(rule.id);
  }
}

export function createStyleUpdateCommand(
  options: StyleUpdateCommandOptions = {},
): CommandDefinition<StyleUpdatePayload> {
  const now = options.now ?? ((): Date => new Date());

  return {
    name: 'style.update',
    parse: parsePayload,
    apply(draft: Draft<AppState>, payload: StyleUpdatePayload): void {
      const style = payload.style;
      if (style.builtin || !isId('sty', style.id)) {
        invalid('Only persisted user styles can be updated.');
      }
      const existing = draft.tableStyles[style.id];
      if (existing === undefined) {
        invalid('The table style does not exist.');
      }
      if (existing.builtin) {
        invalid('Builtin styles cannot be updated directly.');
      }
      assertRuleIds(style);
      draft.tableStyles[style.id] = style;
      if (draft.workspace !== null) {
        draft.workspace.updatedAt = createTimestamp(now());
      }
    },
  };
}

/**
 * Creates a user style and optionally applies it to one table view.
 *
 * T3.4 uses the optional `viewId` so “edit a builtin” is one command and one
 * undo entry: fork the template, create the copy, point the view at it. T3.5 can
 * reuse the same command without a view for template imports.
 */
export function createStyleCreateCommand(
  options: StyleUpdateCommandOptions = {},
): CommandDefinition<StyleCreatePayload> {
  const now = options.now ?? ((): Date => new Date());

  return {
    name: 'style.create',
    parse: parseCreatePayload,
    apply(draft: Draft<AppState>, payload: StyleCreatePayload): void {
      const style = payload.style;
      if (style.builtin || !isId('sty', style.id)) {
        invalid('style.create only accepts persisted user styles.');
      }
      if (draft.tableStyles[style.id] !== undefined) {
        invalid(`A table style with id "${style.id}" already exists.`);
      }
      assertRuleIds(style);
      if (payload.viewId !== undefined) {
        const view = draft.views[payload.viewId];
        if (view === undefined || view.kind !== 'table' || view.tableView === undefined) {
          invalid('style.create can only apply to an existing table view.');
        }
        view.tableView.styleId = style.id;
      }
      draft.tableStyles[style.id] = style;
      if (draft.workspace !== null) {
        draft.workspace.updatedAt = createTimestamp(now());
      }
    },
  };
}
