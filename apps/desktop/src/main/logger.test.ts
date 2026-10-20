import { describe, expect, it, vi } from 'vitest';

import { createConsoleLogger, createLogger, normalizeLogLevel } from './logger';

import type { LogLevel } from './logger';

function capture(): {
  levels: LogLevel[];
  lines: string[];
  sink: (l: LogLevel, m: string) => void;
} {
  const levels: LogLevel[] = [];
  const lines: string[] = [];
  return {
    levels,
    lines,
    sink: (level, line) => {
      levels.push(level);
      lines.push(line);
    },
  };
}

describe('normalizeLogLevel', () => {
  it('keeps the four documented levels', () => {
    expect(normalizeLogLevel('debug')).toBe('debug');
    expect(normalizeLogLevel('info')).toBe('info');
    expect(normalizeLogLevel('warn')).toBe('warn');
    expect(normalizeLogLevel('error')).toBe('error');
  });

  it('falls back to info for anything else', () => {
    expect(normalizeLogLevel('verbose')).toBe('info');
    expect(normalizeLogLevel('')).toBe('info');
    expect(normalizeLogLevel('ERROR')).toBe('info');
  });
});

describe('createLogger', () => {
  it('forwards the level and message to the sink', () => {
    const { levels, lines, sink } = capture();
    const logger = createLogger(sink);

    logger.info('window ready');

    expect(levels).toEqual(['info']);
    expect(lines).toEqual(['window ready']);
  });

  it('appends a detail string', () => {
    const { lines, sink } = capture();
    createLogger(sink).error('failed', 'EACCES');

    expect(lines).toEqual(['failed EACCES']);
  });

  it('serialises an object detail and falls back for unserialisable ones', () => {
    const { lines, sink } = capture();
    const logger = createLogger(sink);

    logger.warn('state', { bounds: { width: 800 } });

    const cyclic: Record<string, unknown> = {};
    cyclic['self'] = cyclic;
    logger.warn('state', cyclic);

    expect(lines[0]).toBe('state {"bounds":{"width":800}}');
    expect(lines[1]).toContain('[unserialisable detail]');
  });

  it('uses an Error stack as the detail', () => {
    const { lines, sink } = capture();
    const error = new Error('boom');

    createLogger(sink).error('failed', error);

    expect(lines[0]).toContain('failed');
    expect(lines[0]).toContain('Error: boom');
    expect(lines[0]).toMatch(/at /);
  });

  it('truncates long messages and details', () => {
    const { lines, sink } = capture();
    const logger = createLogger(sink, { maxMessageLength: 10, maxDetailLength: 4 });

    logger.info('0123456789abcdef', 'wxyz1234');

    expect(lines[0]).toBe('0123456789... wxyz...');
  });

  it('drops entries below the minimum level', () => {
    const { levels, sink } = capture();
    const logger = createLogger(sink, { minLevel: 'warn' });

    logger.debug('noise');
    logger.info('noise');
    logger.warn('kept');
    logger.error('kept too');

    expect(levels).toEqual(['warn', 'error']);
  });
});

describe('createConsoleLogger', () => {
  it('routes each level to the matching console method with the main prefix', () => {
    const spies = {
      debug: vi.spyOn(console, 'debug').mockImplementation(() => undefined),
      info: vi.spyOn(console, 'info').mockImplementation(() => undefined),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => undefined),
      error: vi.spyOn(console, 'error').mockImplementation(() => undefined),
    };
    const logger = createConsoleLogger({ minLevel: 'debug' });

    logger.debug('d');
    logger.info('i');
    logger.warn('w');
    logger.error('e');

    expect(spies.debug).toHaveBeenCalledWith('[main] d');
    expect(spies.info).toHaveBeenCalledWith('[main] i');
    expect(spies.warn).toHaveBeenCalledWith('[main] w');
    expect(spies.error).toHaveBeenCalledWith('[main] e');

    for (const spy of Object.values(spies)) {
      spy.mockRestore();
    }
  });
});
