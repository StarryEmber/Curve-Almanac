import { describe, expect, it } from 'vitest';

import { ERROR_CODES } from '@curve/domain';

import { enUS } from './messages/en-US';
import { zhCN } from './messages/zh-CN';
import {
  DEFAULT_LOCALE,
  LOCALES,
  MESSAGE_TABLES,
  createTranslator,
  formatMessage,
  isLocale,
} from './translate';

describe('message tables', () => {
  it('defaults to zh-CN and ships both locales (SPEC §16.4)', () => {
    expect(DEFAULT_LOCALE).toBe('zh-CN');
    expect(LOCALES).toEqual(['zh-CN', 'en-US']);
  });

  it('has identical key sets in both languages', () => {
    expect(Object.keys(enUS).sort()).toEqual(Object.keys(zhCN).sort());
  });

  it('has no empty messages', () => {
    for (const [locale, table] of Object.entries(MESSAGE_TABLES)) {
      for (const [key, value] of Object.entries(table)) {
        expect(value.trim(), `${locale} ${key}`).not.toBe('');
      }
    }
  });

  it('covers every SPEC §18 error code', () => {
    for (const code of ERROR_CODES) {
      expect(zhCN[`error.${code}`]).toBeDefined();
      expect(enUS[`error.${code}`]).toBeDefined();
    }
  });

  it('really translates, rather than copying the Chinese copy', () => {
    expect(enUS['shell.empty.title']).not.toBe(zhCN['shell.empty.title']);
    expect(enUS['theme.dark']).not.toBe(zhCN['theme.dark']);
  });
});

describe('formatMessage', () => {
  it('replaces named placeholders', () => {
    expect(
      formatMessage('版本 {version} · {platform}', { version: '0.1.0', platform: 'win32' }),
    ).toBe('版本 0.1.0 · win32');
  });

  it('leaves unknown placeholders visible so a bug is obvious', () => {
    expect(formatMessage('Hello {name}', { other: 1 })).toBe('Hello {name}');
  });

  it('returns the template untouched without params', () => {
    expect(formatMessage('No placeholders')).toBe('No placeholders');
  });
});

describe('createTranslator', () => {
  it('returns locale-specific copy', () => {
    expect(createTranslator('zh-CN')('shell.titleBar.help')).toBe('帮助');
    expect(createTranslator('en-US')('shell.titleBar.help')).toBe('Help');
  });

  it('interpolates through the public t()', () => {
    expect(createTranslator('en-US')('shell.status.version', { version: '9.9.9' })).toBe(
      'Version 9.9.9',
    );
  });
});

describe('isLocale', () => {
  it('accepts the shipped locales only', () => {
    expect(isLocale('zh-CN')).toBe(true);
    expect(isLocale('en-US')).toBe(true);
    expect(isLocale('fr-FR')).toBe(false);
    expect(isLocale(null)).toBe(false);
  });
});
