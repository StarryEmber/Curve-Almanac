/**
 * Quit handshake (T5.3, SPEC §13.3 / ADR-048).
 *
 * The save queue lives in the renderer, so the main process cannot flush it
 * directly. Closing the window or quitting first asks the renderer to flush;
 * the renderer answers within `QUIT_TIMEOUT_MS`, or the main process falls back
 * to a native "quit anyway?" confirmation. The guard is deliberately a plain
 * state machine with injected effects so it can be unit tested without
 * Electron: `close`/`quit` must never hang on a dead or unsaved renderer.
 */

import type { Logger } from './logger';
import type { QuitRequest, QuitResponseRequest } from '../shared/contracts/ipc';

/** Maximum time the renderer gets to flush before the confirmation (SPEC §13.3). */
export const QUIT_TIMEOUT_MS = 3_000;

/**
 * T5.5: with autosave off the renderer may show a "save / discard / cancel"
 * dialog before it answers. The quit guard waits this long for that decision
 * instead of falling back to the native confirmation while the user is reading.
 */
export const UNSAVED_QUIT_TIMEOUT_MS = 60_000;

export type QuitReason = QuitRequest['reason'];

export type QuitConfirmKind = 'timeout' | 'flush-failed';

export interface QuitConfirmOptions {
  kind: QuitConfirmKind;
  title: string;
  message: string;
  detail: string;
}

export interface QuitGuardOptions {
  /** Sends `app:quit-requested` to the renderer. */
  request: (reason: QuitReason) => void;
  /** Native fallback confirmation; resolves true when the app may quit. */
  confirm: (options: QuitConfirmOptions) => Promise<boolean>;
  /** Closes the window (and therefore quits) once quitting is approved. */
  close: () => void;
  /**
   * Handshake timeout in milliseconds. A function lets the main process use the
   * longer T5.5 timeout while autosave is off (the renderer is showing the
   * unsaved-changes dialog).
   */
  timeoutMs?: number | (() => number);
  logger?: Pick<Logger, 'warn'>;
  appName?: string;
}

export interface QuitGuard {
  /** True once quitting is approved; close/quit handlers may proceed. */
  canQuit(): boolean;
  /** Starts the handshake; repeated calls while pending are ignored. */
  request(reason: QuitReason): void;
  /** Renderer answer to `app:quit-requested`. */
  respond(answer: QuitResponseRequest): void;
  /** Cancels a pending handshake (renderer chose "cancel"). */
  cancel(): void;
  isPending(): boolean;
}

type Phase = 'idle' | 'requested' | 'confirming' | 'ready';

function confirmOptions(kind: QuitConfirmKind, appName: string): QuitConfirmOptions {
  if (kind === 'timeout') {
    return {
      kind,
      title: appName,
      message: 'Curve Studio is still saving your changes.',
      detail:
        'The save did not finish within 3 seconds. Quit anyway? ' +
        'Changes from the last moment may be lost.',
    };
  }
  return {
    kind,
    title: appName,
    message: 'Some changes could not be saved.',
    detail: 'Quit anyway? Unsaved changes will be lost.',
  };
}

export function createQuitGuard(options: QuitGuardOptions): QuitGuard {
  const appName = options.appName ?? 'Curve Studio';
  const resolveTimeoutMs = (): number =>
    typeof options.timeoutMs === 'function'
      ? options.timeoutMs()
      : (options.timeoutMs ?? QUIT_TIMEOUT_MS);
  let phase: Phase = 'idle';
  let timer: ReturnType<typeof setTimeout> | null = null;

  const clearTimer = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const finish = (): void => {
    clearTimer();
    phase = 'ready';
    options.close();
  };

  const askToQuitAnyway = async (kind: QuitConfirmKind): Promise<void> => {
    if (phase !== 'requested') {
      return;
    }
    phase = 'confirming';
    clearTimer();
    let confirmed = false;
    try {
      confirmed = await options.confirm(confirmOptions(kind, appName));
    } catch (thrown) {
      options.logger?.warn(`[quit] confirmation failed: ${String(thrown)}`);
      confirmed = false;
    }
    if (phase !== 'confirming') {
      return;
    }
    if (confirmed) {
      finish();
    } else {
      phase = 'idle';
    }
  };

  const startTimer = (): void => {
    clearTimer();
    const timeoutMs = resolveTimeoutMs();
    timer = setTimeout(() => {
      options.logger?.warn(
        `[quit] the renderer did not answer the flush handshake within ${String(timeoutMs)}ms`,
      );
      void askToQuitAnyway('timeout');
    }, timeoutMs);
  };

  return {
    canQuit: () => phase === 'ready',

    request(reason: QuitReason): void {
      if (phase !== 'idle') {
        return;
      }
      phase = 'requested';
      try {
        options.request(reason);
      } catch (thrown) {
        options.logger?.warn(`[quit] failed to reach the renderer: ${String(thrown)}`);
        void askToQuitAnyway('timeout');
        return;
      }
      startTimer();
    },

    respond(answer: QuitResponseRequest): void {
      if (phase !== 'requested') {
        return;
      }
      if (answer.action === 'cancel') {
        phase = 'idle';
        clearTimer();
        return;
      }
      if (answer.flushed) {
        finish();
        return;
      }
      void askToQuitAnyway('flush-failed');
    },

    cancel(): void {
      if (phase === 'requested') {
        phase = 'idle';
        clearTimer();
      }
    },

    isPending: () => phase === 'requested' || phase === 'confirming',
  };
}
