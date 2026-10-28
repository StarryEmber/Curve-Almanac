import { describe, expect, it } from 'vitest';

import { enUS } from '../../i18n/messages/en-US';
import { zhCN } from '../../i18n/messages/zh-CN';

import { historyActionKey } from './history-action-label';

const COMMANDS = [
  'table.cell.set',
  'table.paste',
  'table.import',
  'table.rows.insert',
  'table.rows.delete',
  'table.create',
  'table.delete',
  'table.meta.update',
  'table.column.add',
  'table.column.update',
  'table.column.delete',
  'table.column.reorder',
  'view.create',
  'view.delete',
  'view.update',
  'view.layout',
  'style.create',
  'style.update',
  'style.delete',
  'style.apply',
  'chart.create',
  'chart.update',
  'chart.delete',
  'workspace.rename',
] as const;

describe('history action labels', () => {
  it('maps every registered command to a translated action label', () => {
    for (const command of COMMANDS) {
      const key = historyActionKey(command);
      expect(key, command).not.toBe('history.action.generic');
      expect(zhCN[key], `zh-CN ${command}`).toBeDefined();
      expect(enUS[key], `en-US ${command}`).toBeDefined();
    }
  });

  it('falls back to one generic label for empty or unknown commands', () => {
    expect(historyActionKey(null)).toBe('history.action.generic');
    expect(historyActionKey('table.unknown')).toBe('history.action.generic');
    expect(zhCN['history.action.generic']).toBe('修改文档');
    expect(enUS['history.action.generic']).toBe('document change');
  });
});
