import { enablePatches, produceWithPatches, setAutoFreeze } from 'immer';

import { createAppError, toAppError } from '@curve/domain';
import type { AppError } from '@curve/domain';

import { defaultAppLogger } from '../logging';

import type {
  CommandBus,
  CommandBusOptions,
  CommandDefinition,
  CommandResult,
  DispatchResult,
} from './types';
import type { AppState, AppStore } from '../state/types';
import type { Draft, Patch } from 'immer';

// Patches are the undo/redo contract (ADR-006). Auto-freeze is disabled because
// deep-freezing a 100k-row table on the first edit would turn a single-cell
// command into a full-state traversal (ADR-025).
enablePatches();
setAutoFreeze(false);

interface RegisteredCommand {
  readonly name: string;
  parse(payload: unknown): unknown;
  apply(draft: Draft<AppState>, payload: unknown): void;
  dirtyTable?(payload: unknown): string | null;
  mergeKey?(payload: unknown): string;
}

function fail(error: AppError): DispatchResult {
  return { ok: false, error };
}

/**
 * Creates a command registry bound to one vanilla store.
 *
 * Commands are synchronous and document-only. Async work (opening a workspace,
 * reading tables) belongs in a use case and never enters this bus.
 */
export function createCommandBus(store: AppStore, options: CommandBusOptions = {}): CommandBus {
  const logger = options.logger ?? defaultAppLogger;
  const registry = new Map<string, RegisteredCommand>();

  const recordFailure = (event: string, error: AppError): void => {
    logger.error(event, error);
    store.getState().actions.setError(error);
  };

  return {
    register<P>(definition: CommandDefinition<P>): void {
      if (registry.has(definition.name)) {
        throw createAppError('E_VALIDATION', `Command "${definition.name}" is already registered.`);
      }
      const registered: RegisteredCommand = {
        name: definition.name,
        parse: (payload) => definition.parse(payload),
        apply: (draft, payload) => {
          definition.apply(draft, payload as P);
        },
      };
      if (definition.dirtyTable !== undefined) {
        registered.dirtyTable = (payload) => definition.dirtyTable?.(payload as P) ?? null;
      }
      if (definition.mergeKey !== undefined) {
        registered.mergeKey = (payload) => definition.mergeKey?.(payload as P) ?? '';
      }
      registry.set(definition.name, registered);
    },

    dispatch(name: string, payload?: unknown): DispatchResult {
      const command = registry.get(name);
      if (command === undefined) {
        const error = createAppError('E_VALIDATION', `Unknown command "${name}".`);
        recordFailure(`command "${name}" rejected`, error);
        return fail(error);
      }

      let parsed: unknown;
      try {
        parsed = command.parse(payload);
      } catch (thrown) {
        const error = toAppError(thrown);
        recordFailure(`command "${name}" rejected`, error);
        return fail(error);
      }

      let next: AppState;
      let patches: Patch[];
      let inversePatches: Patch[];
      try {
        [next, patches, inversePatches] = produceWithPatches(store.getState(), (draft) => {
          command.apply(draft, parsed);
        });
      } catch (thrown) {
        const error = toAppError(thrown);
        recordFailure(`command "${name}" failed`, error);
        return fail(error);
      }

      store.setState(next, true);

      if (patches.length > 0 && command.dirtyTable !== undefined) {
        const tableId = command.dirtyTable(parsed);
        if (tableId !== null) {
          store.getState().actions.markDirty(tableId);
        }
      }
      if (store.getState().ui.error !== null) {
        store.getState().actions.clearError();
      }

      const mergeKey = command.mergeKey?.(parsed);
      const result: CommandResult = {
        name,
        payload: parsed,
        next,
        patches,
        inversePatches,
        ...(mergeKey === undefined ? {} : { mergeKey }),
      };
      return { ok: true, result };
    },

    has(name: string): boolean {
      return registry.has(name);
    },

    names(): string[] {
      return [...registry.keys()];
    },
  };
}
