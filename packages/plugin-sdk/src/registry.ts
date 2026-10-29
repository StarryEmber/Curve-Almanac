/**
 * Contribution registry implementation (T6.1, SPEC §14.3/ADR-052).
 *
 * One piece of state is shared by the host view (`builtin` owner) and by every
 * plugin view. Mutations are synchronous, notify subscribers with a snapshot
 * and never let a throwing listener break registration.
 */

import { createAppError } from '@curve/domain';

import type { ContributionSource, Registry, RegistryEntry } from './types';

const MAX_CONTRIBUTION_ID_LENGTH = 200;
const CONTRIBUTION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

interface StoredEntry<T> {
  readonly id: string;
  readonly def: T;
  readonly source: ContributionSource;
  readonly seq: number;
}

export type RegistryListener<T> = (entries: ReadonlyArray<RegistryEntry<T>>) => void;

export interface RegistryState<T> {
  readonly entries: Map<string, StoredEntry<T>>;
  readonly listeners: Set<RegistryListener<T>>;
  nextSeq: number;
  closed: boolean;
  readonly validate?: (id: string, def: T) => void;
}

export interface RegistryStateOptions<T> {
  readonly validate?: (id: string, def: T) => void;
}

export function createRegistryState<T>(options: RegistryStateOptions<T> = {}): RegistryState<T> {
  return {
    entries: new Map<string, StoredEntry<T>>(),
    listeners: new Set<RegistryListener<T>>(),
    nextSeq: 0,
    closed: false,
    ...(options.validate === undefined ? {} : { validate: options.validate }),
  };
}

function invalid(message: string): never {
  throw createAppError('E_PLUGIN_INVALID', message);
}

function assertOpen<T>(state: RegistryState<T>): void {
  if (state.closed) {
    invalid('The registry has been disposed.');
  }
}

function assertId(id: string): void {
  if (id.length === 0 || id.length > MAX_CONTRIBUTION_ID_LENGTH) {
    invalid(`Invalid contribution id "${id}".`);
  }
  if (!CONTRIBUTION_ID_PATTERN.test(id)) {
    invalid(`Invalid contribution id "${id}".`);
  }
}

function assertDefinition<T>(def: T): void {
  const candidate: unknown = def;
  if (candidate === null || candidate === undefined) {
    invalid('A contribution definition is required.');
  }
}

function sameSource(a: ContributionSource, b: ContributionSource): boolean {
  if (a.kind === 'builtin' || b.kind === 'builtin') {
    return a.kind === b.kind;
  }
  return a.pluginId === b.pluginId;
}

function describeSource(source: ContributionSource): string {
  return source.kind === 'builtin' ? 'the host' : `plugin "${source.pluginId}"`;
}

function sourceRank(source: ContributionSource): number {
  return source.kind === 'builtin' ? 0 : 1;
}

function snapshot<T>(state: RegistryState<T>): ReadonlyArray<RegistryEntry<T>> {
  return [...state.entries.values()]
    .sort((a, b) => sourceRank(a.source) - sourceRank(b.source) || a.seq - b.seq)
    .map((entry) => ({ id: entry.id, def: entry.def, source: entry.source }));
}

function notify<T>(state: RegistryState<T>): void {
  if (state.listeners.size === 0) {
    return;
  }
  const entries = snapshot(state);
  for (const listener of [...state.listeners]) {
    try {
      listener(entries);
    } catch {
      // A broken subscriber must not break registration or other subscribers.
    }
  }
}

function registerContribution<T>(
  state: RegistryState<T>,
  source: ContributionSource,
  id: string,
  def: T,
): void {
  assertOpen(state);
  assertId(id);
  assertDefinition(def);
  if (state.entries.has(id)) {
    invalid(`Contribution id "${id}" is already registered.`);
  }
  state.validate?.(id, def);
  state.entries.set(id, { id, def, source, seq: state.nextSeq });
  state.nextSeq += 1;
  notify(state);
}

function replaceContribution<T>(
  state: RegistryState<T>,
  source: ContributionSource,
  id: string,
  def: T,
): void {
  assertOpen(state);
  assertId(id);
  assertDefinition(def);
  const existing = state.entries.get(id);
  if (existing === undefined) {
    invalid(`Cannot replace unknown contribution "${id}".`);
  }
  if (!sameSource(existing.source, source)) {
    invalid(
      `Contribution "${id}" belongs to ${describeSource(existing.source)}; only its owner may replace it.`,
    );
  }
  state.validate?.(id, def);
  state.entries.set(id, { ...existing, def });
  notify(state);
}

function removeContribution<T>(state: RegistryState<T>, id: string): void {
  if (state.entries.delete(id)) {
    notify(state);
  }
}

/**
 * Removes every contribution of one source. Used by the host for rollback and
 * `deactivate`; it notifies at most once.
 */
export function removeBySource<T>(state: RegistryState<T>, source: ContributionSource): number {
  let removed = 0;
  for (const [id, entry] of state.entries) {
    if (sameSource(entry.source, source)) {
      state.entries.delete(id);
      removed += 1;
    }
  }
  if (removed > 0) {
    notify(state);
  }
  return removed;
}

/** Clears the registry and closes it; further mutations throw. */
export function closeRegistry<T>(state: RegistryState<T>): void {
  if (state.closed) {
    return;
  }
  state.closed = true;
  state.entries.clear();
  notify(state);
}

export function createRegistry<T>(
  state: RegistryState<T>,
  source: ContributionSource,
): Registry<T> {
  return {
    register(id: string, def: T): () => void {
      registerContribution(state, source, id, def);
      return (): void => {
        removeContribution(state, id);
      };
    },

    replace(id: string, def: T): void {
      replaceContribution(state, source, id, def);
    },

    get(id: string): T | undefined {
      return state.entries.get(id)?.def;
    },

    list(): ReadonlyArray<RegistryEntry<T>> {
      return snapshot(state);
    },

    subscribe(listener: RegistryListener<T>): () => void {
      state.listeners.add(listener);
      return (): void => {
        state.listeners.delete(listener);
      };
    },

    dispose(): void {
      if (source.kind === 'builtin') {
        closeRegistry(state);
      } else {
        removeBySource(state, source);
      }
    },
  };
}
