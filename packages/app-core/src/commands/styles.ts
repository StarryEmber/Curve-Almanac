/**
 * Style commands (SPEC §10.5/§10.6, §13.1; T3.3/T3.4).
 *
 * Styles live in `manifest.tableStyles`, not in table JSONL, so these commands
 * are manifest-only document changes. `style.update` is deliberately limited to
 * persisted user styles; editing a builtin first forks it into a new user style
 * with `style.create`, which can atomically point a view at the copy.
 */

import {
  DEFAULT_TABLE_STYLE_ID,
  createAppError,
  createTimestamp,
  getBuiltinStyle,
  isId,
  tableStyleSchema,
} from '@curve/domain';
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

export interface StyleDeletePayload {
  styleId: string;
}

export type StyleApplyTarget =
  { readonly kind: 'view'; readonly viewId: string } | { readonly kind: 'default' };

export interface StyleApplyPayload {
  styleId: string;
  target: StyleApplyTarget;
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

export interface StyleFallbackState {
  readonly workspace: { readonly settings: { readonly defaultTableStyleId: string } } | null;
  readonly tableStyles: Readonly<Record<string, TableStyle>>;
}

/**
 * The style every reference falls back to when `deletedStyleId` is removed.
 * Prefers the workspace default while it still resolves; otherwise the builtin
 * report-light template (SPEC §10.3/§10.5).
 */
export function styleFallbackId(state: StyleFallbackState, deletedStyleId: string): string {
  const preferred = state.workspace?.settings.defaultTableStyleId;
  if (preferred !== undefined && preferred !== deletedStyleId) {
    if (getBuiltinStyle(preferred) !== undefined) {
      return preferred;
    }
    const candidate = state.tableStyles[preferred];
    if (candidate !== undefined && !candidate.builtin) {
      return preferred;
    }
  }
  return DEFAULT_TABLE_STYLE_ID;
}

function parseDeletePayload(payload: unknown): StyleDeletePayload {
  if (!isRecord(payload) || typeof payload['styleId'] !== 'string') {
    invalid('style.delete expects { styleId }.');
  }
  const styleId = payload['styleId'];
  if (!isId('sty', styleId)) {
    invalid('style.delete only accepts persisted user style ids.');
  }
  return { styleId };
}

export function createStyleDeleteCommand(
  options: StyleUpdateCommandOptions = {},
): CommandDefinition<StyleDeletePayload> {
  const now = options.now ?? ((): Date => new Date());

  return {
    name: 'style.delete',
    parse: parseDeletePayload,
    apply(draft: Draft<AppState>, payload: StyleDeletePayload): void {
      const styleId = payload.styleId;
      const existing = draft.tableStyles[styleId];
      if (existing === undefined) {
        invalid('The table style does not exist.');
      }
      if (existing.builtin) {
        invalid('Builtin styles cannot be deleted.');
      }
      const fallbackId = styleFallbackId(draft, styleId);
      for (const view of Object.values(draft.views)) {
        if (
          view.kind === 'table' &&
          view.tableView !== undefined &&
          view.tableView.styleId === styleId
        ) {
          view.tableView.styleId = fallbackId;
        }
      }
      if (draft.workspace !== null) {
        if (draft.workspace.settings.defaultTableStyleId === styleId) {
          draft.workspace.settings.defaultTableStyleId = fallbackId;
        }
        draft.workspace.updatedAt = createTimestamp(now());
      }
      delete draft.tableStyles[styleId];
    },
  };
}

function parseApplyPayload(payload: unknown): StyleApplyPayload {
  if (!isRecord(payload) || typeof payload['styleId'] !== 'string') {
    invalid('style.apply expects { styleId, target }.');
  }
  const styleId = payload['styleId'];
  const target = payload['target'];
  if (!isRecord(target)) {
    invalid('style.apply expects a target of { kind: "view" } or { kind: "default" }.');
  }
  if (target['kind'] === 'view') {
    const viewId = target['viewId'];
    if (typeof viewId !== 'string' || !isId('viw', viewId)) {
      invalid('style.apply expects a valid viewId.');
    }
    return { styleId, target: { kind: 'view', viewId } };
  }
  if (target['kind'] === 'default') {
    return { styleId, target: { kind: 'default' } };
  }
  invalid('style.apply expects a target of { kind: "view" } or { kind: "default" }.');
}

function assertStyleResolvable(state: Draft<AppState>, styleId: string): void {
  if (getBuiltinStyle(styleId) !== undefined) {
    return;
  }
  if (!isId('sty', styleId)) {
    invalid(`Unknown table style "${styleId}".`);
  }
  const style = state.tableStyles[styleId];
  if (style === undefined || style.builtin) {
    invalid(`Unknown table style "${styleId}".`);
  }
}

export function createStyleApplyCommand(
  options: StyleUpdateCommandOptions = {},
): CommandDefinition<StyleApplyPayload> {
  const now = options.now ?? ((): Date => new Date());

  return {
    name: 'style.apply',
    parse: parseApplyPayload,
    apply(draft: Draft<AppState>, payload: StyleApplyPayload): void {
      assertStyleResolvable(draft, payload.styleId);
      if (payload.target.kind === 'view') {
        const view = draft.views[payload.target.viewId];
        if (view === undefined || view.kind !== 'table' || view.tableView === undefined) {
          invalid('style.apply can only target an existing table view.');
        }
        view.tableView.styleId = payload.styleId;
      } else {
        if (draft.workspace === null) {
          invalid('style.apply needs an open workspace for the default style.');
        }
        draft.workspace.settings.defaultTableStyleId = payload.styleId;
      }
      if (draft.workspace !== null) {
        draft.workspace.updatedAt = createTimestamp(now());
      }
    },
  };
}
