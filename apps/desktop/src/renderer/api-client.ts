/**
 * Renderer-side IPC client.
 *
 * The preload bridge is a dumb pipe, so this layer re-validates both directions
 * (AGENTS §2.1: payloads are checked in main *and* renderer) and turns every
 * failure into an `IpcResult` envelope — the UI never sees a rejected promise or
 * a stack trace. T0.4 replaces the ad-hoc `E_UNKNOWN` messages with `t()` keys.
 */

import {
  appInfoResponseSchema,
  logWriteRequestSchema,
  logWriteResponseSchema,
} from '../shared/contracts/ipc';

import type { IpcResult } from '../shared/contracts/envelope';
import type { CurveApi, LogWriteRequest, OkReply } from '../shared/contracts/ipc';
import type { z } from 'zod';

const BRIDGE_UNAVAILABLE: IpcResult<never> = {
  ok: false,
  error: { code: 'E_UNKNOWN', message: 'The preload bridge is unavailable.' },
};

const BRIDGE_FAILED: IpcResult<never> = {
  ok: false,
  error: { code: 'E_UNKNOWN', message: 'The main process did not answer.' },
};

const MALFORMED_RESPONSE: IpcResult<never> = {
  ok: false,
  error: {
    code: 'E_UNKNOWN',
    message: 'The main process returned a malformed response.',
  },
};

const INVALID_REQUEST: IpcResult<never> = {
  ok: false,
  error: { code: 'E_VALIDATION', message: 'The request payload is invalid.' },
};

async function call<TResponse>(
  schema: z.ZodType<TResponse, TResponse>,
  run: () => Promise<IpcResult<unknown>>,
): Promise<IpcResult<TResponse>> {
  let result: IpcResult<unknown>;
  try {
    result = await run();
  } catch {
    return BRIDGE_FAILED;
  }
  if (!result.ok) {
    return result;
  }
  const parsed = schema.safeParse(result.data);
  if (!parsed.success) {
    return MALFORMED_RESPONSE;
  }
  return { ok: true, data: parsed.data };
}

export function createApiClient(bridge: CurveApi | undefined): CurveApi {
  if (!bridge) {
    return {
      app: { info: async (): Promise<IpcResult<never>> => BRIDGE_UNAVAILABLE },
      log: { write: async (): Promise<IpcResult<never>> => BRIDGE_UNAVAILABLE },
    };
  }

  return {
    app: {
      info: () => call(appInfoResponseSchema, () => bridge.app.info()),
    },
    log: {
      write: (request: LogWriteRequest): Promise<IpcResult<OkReply>> => {
        const parsed = logWriteRequestSchema.safeParse(request);
        if (!parsed.success) {
          return Promise.resolve(INVALID_REQUEST);
        }
        return call(logWriteResponseSchema, () => bridge.log.write(parsed.data));
      },
    },
  };
}
