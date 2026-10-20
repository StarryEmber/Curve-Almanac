import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { createAppError } from '@curve/domain';

import { createLogger } from '../logger';

import { dispatchIpc } from './dispatch';

import type { LogLevel } from '../logger';

function capture(minLevel: LogLevel = 'debug'): {
  logger: ReturnType<typeof createLogger>;
  lines: string[];
} {
  const lines: string[] = [];
  const logger = createLogger(
    (level, line) => {
      lines.push(`${level}: ${line}`);
    },
    { minLevel },
  );
  return { logger, lines };
}

const contract = {
  request: z.strictObject({ name: z.string().min(1) }),
  response: z.strictObject({ greeting: z.string().min(1) }),
};

const greet = async (request: { name: string }): Promise<{ greeting: string }> => ({
  greeting: `Hello ${request.name}`,
});

describe('dispatchIpc — success branch', () => {
  it('returns the handler result in a success envelope', async () => {
    const { logger, lines } = capture();

    const result = await dispatchIpc(
      { channel: 'app:info', contract, handler: greet },
      { name: 'Ada' },
      { logger },
    );

    expect(result).toEqual({ ok: true, data: { greeting: 'Hello Ada' } });
    expect(lines).toEqual([]);
  });

  it('passes the result through when the contract has no response schema', async () => {
    const { logger } = capture();

    const result = await dispatchIpc(
      { channel: 'app:info', contract: { request: contract.request }, handler: greet },
      { name: 'Ada' },
      { logger },
    );

    expect(result).toEqual({ ok: true, data: { greeting: 'Hello Ada' } });
  });
});

describe('dispatchIpc — validation branch', () => {
  it('rejects an invalid payload before the handler runs', async () => {
    const { logger, lines } = capture();
    const handler = vi.fn(greet);

    const result = await dispatchIpc(
      { channel: 'app:info', contract, handler },
      { secret: 'SECRET-VALUE' },
      { logger },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('E_IPC_INVALID_PAYLOAD');
      expect(result.error.message).toContain('does not match the IPC contract');
      // Diagnostics must carry paths, never payload contents.
      expect(result.error.detail).not.toContain('SECRET-VALUE');
      expect(result.error.detail).toContain('name');
    }
    expect(handler).not.toHaveBeenCalled();
    expect(lines[0]).toContain('warn: [ipc] app:info: invalid request payload');
  });

  it('rejects a payload above the size limit', async () => {
    const { logger, lines } = capture();
    const handler = vi.fn(greet);

    const result = await dispatchIpc(
      { channel: 'app:info', contract, handler },
      { name: '0123456789' },
      { logger, maxPayloadBytes: 8 },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('E_PAYLOAD_TOO_LARGE');
      expect(result.error.message).toContain('8 byte');
    }
    expect(handler).not.toHaveBeenCalled();
    expect(lines[0]).toContain('warn: [ipc] app:info: payload of 10 bytes');
  });
});

describe('dispatchIpc — failure branch', () => {
  it('maps a thrown Error to E_UNKNOWN and keeps the stack in the log only', async () => {
    const { logger, lines } = capture();

    const result = await dispatchIpc(
      { channel: 'app:info', contract, handler: () => Promise.reject(new Error('boom')) },
      { name: 'Ada' },
      { logger },
    );

    expect(result).toEqual({
      ok: false,
      error: { code: 'E_UNKNOWN', message: 'boom' },
    });
    if (!result.ok) {
      expect(result.error).not.toHaveProperty('stack');
    }
    expect(lines[0]).toContain('error: [ipc] app:info: handler failed: E_UNKNOWN boom');
    expect(lines.join('\n')).toMatch(/at /);
  });

  it('keeps an AppError thrown by the handler', async () => {
    const { logger } = capture();

    const result = await dispatchIpc(
      {
        channel: 'app:info',
        contract,
        handler: () =>
          Promise.reject(
            createAppError('E_FS_WRITE', 'Could not write the file.', { retryable: true }),
          ),
      },
      { name: 'Ada' },
      { logger },
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'E_FS_WRITE',
        message: 'Could not write the file.',
        retryable: true,
      },
    });
  });

  it('rejects a handler result that violates the response schema', async () => {
    const { logger, lines } = capture();

    const result = await dispatchIpc(
      { channel: 'app:info', contract, handler: () => ({ greeting: '' }) },
      { name: 'Ada' },
      { logger },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('E_UNKNOWN');
      expect(result.error.message).toContain('response');
    }
    expect(lines[0]).toContain('error: [ipc] app:info: handler produced an invalid response');
  });
});
