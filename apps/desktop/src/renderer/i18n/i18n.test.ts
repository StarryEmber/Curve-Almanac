import { describe, expect, it } from 'vitest';

import { ERROR_CODES } from '@curve/domain';

import { APP_NAME } from '../../shared/brand';

import { enUS } from './messages/en-US';
import { zhCN } from './messages/zh-CN';
import {
  DEFAULT_LOCALE,
  LOCALES,
  MESSAGE_TABLES,
  createTranslator,
  formatMessage,
  isLocale,
  translateKey,
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

  it('ships the product name from the shared brand constant (T6.0, ADR-051)', () => {
    expect(zhCN['app.name']).toBe(APP_NAME);
    expect(enUS['app.name']).toBe(APP_NAME);
    expect(JSON.stringify(zhCN)).not.toContain('Curve Studio');
    expect(JSON.stringify(enUS)).not.toContain('Curve Studio');
  });

  it('ships a complete English table (only the native language name is CJK)', () => {
    expect(Object.keys(enUS).length).toBeGreaterThan(850);
    const cjk = /[\u3400-\u9fff\uf900-\ufaff]/;
    const untranslated = Object.entries(enUS)
      .filter(([key, value]) => key !== 'language.zh-CN' && cjk.test(value))
      .map(([key]) => key);
    expect(untranslated).toEqual([]);
  });

  it('covers the T5.5 settings and unsaved-changes copy in both locales', () => {
    for (const key of [
      'settings.title',
      'settings.theme',
      'settings.language',
      'settings.autosave',
      'settings.autosaveOn',
      'settings.autosaveOff',
      'settings.defaultStyle',
      'unsaved.title',
      'unsaved.save',
      'unsaved.discard',
      'unsaved.cancel',
      'shell.status.autosaveOff',
      'shell.status.unsaved',
    ] as const) {
      expect(zhCN[key], key).toBeTruthy();
      expect(enUS[key], key).toBeTruthy();
    }
  });
});

describe('translateKey', () => {
  it('uses the requested locale and interpolates parameters', () => {
    expect(translateKey('zh-CN', 'shell.titleBar.help')).toBe('帮助');
    expect(translateKey('en-US', 'shell.status.version', { version: '1.2.3' })).toBe(
      'Version 1.2.3',
    );
  });

  it('throws on a missing key in strict mode (dev builds)', () => {
    expect(() =>
      translateKey('en-US', 'missing.key' as never, undefined, {
        tables: { 'zh-CN': { 'missing.key': '缺失' }, 'en-US': {} },
        strict: true,
      }),
    ).toThrow('Missing message "missing.key" for locale "en-US".');
  });

  it('falls back to zh-CN in production mode and returns the key if unknown', () => {
    const tables = { 'zh-CN': { 'only.zh': '只有中文' }, 'en-US': {} };
    expect(translateKey('en-US', 'only.zh' as never, undefined, { tables, strict: false })).toBe(
      '只有中文',
    );
    expect(translateKey('en-US', 'nowhere' as never, undefined, { tables, strict: false })).toBe(
      'nowhere',
    );
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
