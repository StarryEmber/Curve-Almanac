/**
 * Wires typed handlers onto `ipcMain`.
 *
 * Only channels declared in the contract can be registered (`IpcChannel`), and
 * registering the same channel twice is a programming error rather than a
 * silent override. Everything that is not registered here stays unhandled, so
 * Electron rejects the invocation with "No handler registered for ...".
 */

import { dispatchIpc } from './dispatch';

import type { IpcChannel } from '../../shared/contracts/channels';
import type { Logger } from '../logger';
import type { DispatchOptions, HandlerContract } from './dispatch';

/** The slice of `ipcMain` this module needs; keeps the registrar unit-testable. */
export interface IpcMainLike {
  handle(channel: string, listener: (event: unknown, payload?: unknown) => unknown): void;
}

export interface IpcRegistrarOptions {
  ipcMain: IpcMainLike;
  logger: Logger;
  maxPayloadBytes?: number;
}

export interface IpcRegistrar {
  /** Registers one channel; the handler receives the validated request payload. */
  handle<TRequest, TResponse>(
    channel: IpcChannel,
    contract: HandlerContract<TRequest, TResponse>,
    handler: (request: TRequest) => TResponse | Promise<TResponse>,
  ): void;
  handles(channel: IpcChannel): boolean;
  channels(): readonly IpcChannel[];
}

export function createIpcRegistrar(options: IpcRegistrarOptions): IpcRegistrar {
  const registered = new Set<IpcChannel>();
  const dispatchOptions: DispatchOptions = {
    logger: options.logger,
    maxPayloadBytes: options.maxPayloadBytes,
  };

  return {
    handle(channel, contract, handler) {
      if (registered.has(channel)) {
        throw new Error(`Duplicate IPC handler for channel "${channel}".`);
      }
      options.ipcMain.handle(channel, (_event, payload) =>
        dispatchIpc({ channel, contract, handler }, payload, dispatchOptions),
      );
      registered.add(channel);
    },
    handles: (channel) => registered.has(channel),
    channels: () => [...registered],
  };
}
