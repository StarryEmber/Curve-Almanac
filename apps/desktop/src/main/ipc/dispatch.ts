/**
 * The single place where an IPC request becomes an IPC response envelope.
 *
 * Order matters: size guard → request validation → handler → response
 * validation. A failure anywhere produces `{ ok: false, error }` and never
 * throws, so one bad caller cannot take down the main process.
 */

import { toAppError } from '@curve/domain';

import { ipcFail, ipcOk } from '../../shared/contracts/envelope';

import { measurePayloadBytes } from './payload-size';

import type { IpcResult } from '../../shared/contracts/envelope';
import type { Logger } from '../logger';
import type { z } from 'zod';

/** SPEC §15.1: a single IPC payload may not exceed 256 MB. */
export const MAX_IPC_PAYLOAD_BYTES = 268_435_456;

export interface HandlerContract<TRequest, TResponse> {
  /**
   * The input type is deliberately `unknown`: `safeParse` receives whatever
   * crossed the IPC boundary, and the schema is responsible for narrowing it.
   */
  request: z.ZodType<TRequest, unknown>;
  response?: z.ZodType<TResponse, unknown>;
}

export interface HandlerDefinition<TRequest, TResponse> {
  channel: string;
  contract: HandlerContract<TRequest, TResponse>;
  handler: (request: TRequest) => TResponse | Promise<TResponse>;
}

export interface DispatchOptions {
  logger: Logger;
  maxPayloadBytes?: number;
}

const INVALID_PAYLOAD_MESSAGE = 'The request payload does not match the IPC contract.';
const INVALID_RESPONSE_MESSAGE =
  'The handler produced a response that does not match the IPC contract.';

/**
 * Renders Zod issues as `path: code` pairs. Payload *values* are deliberately
 * left out: the detail travels to the renderer and into the log.
 */
function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : '<root>';
      return `${path}: ${issue.code}`;
    })
    .join('; ');
}

export async function dispatchIpc<TRequest, TResponse>(
  definition: HandlerDefinition<TRequest, TResponse>,
  rawPayload: unknown,
  options: DispatchOptions,
): Promise<IpcResult<TResponse>> {
  const { channel, contract, handler } = definition;
  const { logger } = options;
  const maxPayloadBytes = options.maxPayloadBytes ?? MAX_IPC_PAYLOAD_BYTES;

  const payloadBytes = measurePayloadBytes(rawPayload);
  if (payloadBytes > maxPayloadBytes) {
    logger.warn(
      `[ipc] ${channel}: payload of ${payloadBytes} bytes exceeds the ${maxPayloadBytes} byte limit`,
    );
    return ipcFail({
      code: 'E_PAYLOAD_TOO_LARGE',
      message: `The payload exceeds the ${maxPayloadBytes} byte IPC limit.`,
    });
  }

  const parsed = contract.request.safeParse(rawPayload);
  if (!parsed.success) {
    const detail = formatIssues(parsed.error);
    logger.warn(`[ipc] ${channel}: invalid request payload (${detail})`);
    return ipcFail({
      code: 'E_IPC_INVALID_PAYLOAD',
      message: INVALID_PAYLOAD_MESSAGE,
      detail,
    });
  }

  try {
    const data = await handler(parsed.data);
    if (!contract.response) {
      return ipcOk(data);
    }
    const checked = contract.response.safeParse(data);
    if (!checked.success) {
      logger.error(
        `[ipc] ${channel}: handler produced an invalid response (${formatIssues(checked.error)})`,
      );
      return ipcFail({ code: 'E_UNKNOWN', message: INVALID_RESPONSE_MESSAGE });
    }
    return ipcOk(checked.data);
  } catch (error) {
    const appError = toAppError(error);
    logger.error(
      `[ipc] ${channel}: handler failed: ${appError.code} ${appError.message}`,
      error instanceof Error ? error : undefined,
    );
    return ipcFail(appError);
  }
}
