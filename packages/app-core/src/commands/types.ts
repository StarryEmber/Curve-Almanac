import type { AppError } from '@curve/domain';

import type { AppLogger } from '../logging';
import type { AppState } from '../state/types';
import type { Draft, Patch } from 'immer';

/**
 * A synchronous document command.
 *
 * `apply` receives an Immer draft and must not perform IO. The bus wraps it in
 * `produceWithPatches`, so a thrown `AppError` leaves the published state
 * untouched (SPEC §13.1).
 */
export interface CommandDefinition<P> {
  readonly name: string;
  /** Narrow the untrusted dispatch payload; throw `AppError` on failure. */
  parse(payload: unknown): P;
  apply(draft: Draft<AppState>, payload: P): void;
  /** Table whose data this command changes, used to refresh dirty markers. */
  dirtyTable?(payload: P): string | null;
  /** Reserved for T5.2's 800ms edit merging. */
  mergeKey?(payload: P): string;
}

export interface CommandResult<P = unknown> {
  readonly name: string;
  readonly payload: P;
  /** State produced by Immer, before UI-only dirty/error updates. */
  readonly next: AppState;
  readonly patches: Patch[];
  readonly inversePatches: Patch[];
  readonly mergeKey?: string;
}

export type DispatchResult<P = unknown> =
  | { readonly ok: true; readonly result: CommandResult<P> }
  | { readonly ok: false; readonly error: AppError };

export interface CommandBus {
  register<P>(definition: CommandDefinition<P>): void;
  dispatch(name: string, payload?: unknown): DispatchResult;
  has(name: string): boolean;
  names(): string[];
}

export interface CommandBusOptions {
  logger?: AppLogger;
}
