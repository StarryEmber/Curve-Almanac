/**
 * `style.update` (SPEC §13.1; T3.3).
 *
 * Styles live in `manifest.tableStyles`, not in table JSONL, so this command is
 * a manifest-only document change. It is deliberately limited to persisted user
 * styles: editing a builtin first forks it in the UI (T3.4), and the command
 * refuses `builtin.*` ids instead of silently mutating frozen constants.
 */

import { createAppError, createTimestamp, isId, tableStyleSchema } from '@curve/domain';
import type { TableStyle } from '@curve/domain';

import type { CommandDefinition } from './types';
import type { AppState } from '../state/types';
import type { Draft } from 'immer';

export interface StyleUpdatePayload {
  style: TableStyle;
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
