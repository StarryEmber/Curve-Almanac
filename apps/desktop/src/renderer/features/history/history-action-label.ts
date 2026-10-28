import type { MessageKey } from '../../i18n';

/**
 * Stable command name -> user-facing action label (T5.2).
 *
 * `EditHistory` exposes the command name (never localized text) in its UI
 * snapshot; the renderer owns the copy so app-core stays i18n-free.
 */
const ACTION_KEYS: Record<string, MessageKey> = {
  'table.cell.set': 'history.action.table.cell.set',
  'table.paste': 'history.action.table.paste',
  'table.import': 'history.action.table.import',
  'table.rows.insert': 'history.action.table.rows.insert',
  'table.rows.delete': 'history.action.table.rows.delete',
  'table.create': 'history.action.table.create',
  'table.delete': 'history.action.table.delete',
  'table.meta.update': 'history.action.table.meta.update',
  'table.column.add': 'history.action.table.column.add',
  'table.column.update': 'history.action.table.column.update',
  'table.column.delete': 'history.action.table.column.delete',
  'table.column.reorder': 'history.action.table.column.reorder',
  'view.create': 'history.action.view.create',
  'view.delete': 'history.action.view.delete',
  'view.update': 'history.action.view.update',
  'view.layout': 'history.action.view.layout',
  'style.create': 'history.action.style.create',
  'style.update': 'history.action.style.update',
  'style.delete': 'history.action.style.delete',
  'style.apply': 'history.action.style.apply',
  'chart.create': 'history.action.chart.create',
  'chart.update': 'history.action.chart.update',
  'chart.delete': 'history.action.chart.delete',
  'workspace.rename': 'history.action.workspace.rename',
};

export function historyActionKey(action: string | null): MessageKey {
  if (action === null) {
    return 'history.action.generic';
  }
  return ACTION_KEYS[action] ?? 'history.action.generic';
}
