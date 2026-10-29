import { afterEach, describe, expect, it, vi } from 'vitest';

import { QUIT_TIMEOUT_MS, UNSAVED_QUIT_TIMEOUT_MS, createQuitGuard } from './quit-guard';

function setup(confirmResult = true): {
  guard: ReturnType<typeof createQuitGuard>;
  request: ReturnType<typeof vi.fn>;
  confirm: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
} {
  const request = vi.fn();
  const close = vi.fn();
  const confirm = vi.fn(async () => confirmResult);
  const guard = createQuitGuard({
    request,
    confirm,
    close,
    appName: 'Curve Almanac',
    logger: { warn: () => undefined },
  });
  return { guard, request, confirm, close };
}

describe('quit guard', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('asks the renderer once and blocks the close until answered', () => {
    const { guard, request, close } = setup();

    guard.request('window-close');
    guard.request('app-quit');

    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith('window-close');
    expect(guard.canQuit()).toBe(false);
    expect(guard.isPending()).toBe(true);
    expect(close).not.toHaveBeenCalled();
  });

  it('quits immediately when the renderer reports a successful flush', () => {
    const { guard, close } = setup();

    guard.request('window-close');
    guard.respond({ action: 'quit', flushed: true });

    expect(close).toHaveBeenCalledTimes(1);
    expect(guard.canQuit()).toBe(true);
    expect(guard.isPending()).toBe(false);
  });

  it('asks the user when the flush failed and closes only after confirmation', async () => {
    const { guard, confirm, close } = setup(true);

    guard.request('window-close');
    guard.respond({ action: 'quit', flushed: false });
    await vi.waitFor(() => {
      expect(confirm).toHaveBeenCalledTimes(1);
    });

    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'flush-failed', title: 'Curve Almanac' }),
    );
    expect(close).toHaveBeenCalledTimes(1);
    expect(guard.canQuit()).toBe(true);
  });

  it('stays open when the user cancels the failed-flush confirmation', async () => {
    const { guard, close } = setup(false);

    guard.request('window-close');
    guard.respond({ action: 'quit', flushed: false });
    await vi.waitFor(() => {
      expect(guard.isPending()).toBe(false);
    });

    expect(close).not.toHaveBeenCalled();
    expect(guard.canQuit()).toBe(false);
  });

  it('falls back to the confirmation when the renderer does not answer within 3s', async () => {
    vi.useFakeTimers();
    const { guard, confirm, close } = setup(true);

    guard.request('app-quit');
    await vi.advanceTimersByTimeAsync(QUIT_TIMEOUT_MS - 1);
    expect(confirm).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ kind: 'timeout' }));
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('does not hang when the renderer answers "cancel"', async () => {
    vi.useFakeTimers();
    const { guard, close } = setup();

    guard.request('window-close');
    guard.respond({ action: 'cancel', flushed: false });

    expect(close).not.toHaveBeenCalled();
    expect(guard.canQuit()).toBe(false);
    expect(guard.isPending()).toBe(false);
    // A later close attempt starts a fresh handshake.
    guard.request('window-close');
    expect(guard.isPending()).toBe(true);
    await vi.advanceTimersByTimeAsync(QUIT_TIMEOUT_MS + 1);
  });

  it('ignores answers that arrive after the confirmation took over', async () => {
    vi.useFakeTimers();
    const { guard, close } = setup(false);

    guard.request('window-close');
    await vi.advanceTimersByTimeAsync(QUIT_TIMEOUT_MS);
    guard.respond({ action: 'quit', flushed: true });

    expect(close).not.toHaveBeenCalled();
    expect(guard.canQuit()).toBe(false);
  });

  it('survives a renderer that cannot be reached', async () => {
    const close = vi.fn();
    const confirm = vi.fn(async () => true);
    const guard = createQuitGuard({
      request: () => {
        throw new Error('webContents is gone');
      },
      confirm,
      close,
      logger: { warn: () => undefined },
    });

    guard.request('app-quit');
    await vi.waitFor(() => {
      expect(confirm).toHaveBeenCalledTimes(1);
    });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('waits for the autosave-off prompt with a longer, dynamic timeout (T5.5)', async () => {
    vi.useFakeTimers();
    let autosave = false;
    const confirm = vi.fn(async () => false);
    const guard = createQuitGuard({
      request: () => undefined,
      confirm,
      close: () => undefined,
      logger: { warn: () => undefined },
      timeoutMs: () => (autosave ? QUIT_TIMEOUT_MS : UNSAVED_QUIT_TIMEOUT_MS),
    });

    guard.request('window-close');
    await vi.advanceTimersByTimeAsync(QUIT_TIMEOUT_MS + 1);
    expect(confirm).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(UNSAVED_QUIT_TIMEOUT_MS - QUIT_TIMEOUT_MS - 2);
    expect(confirm).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ kind: 'timeout' }));

    guard.respond({ action: 'cancel', flushed: true });
    autosave = true;
    guard.request('window-close');
    await vi.advanceTimersByTimeAsync(QUIT_TIMEOUT_MS);
    expect(confirm).toHaveBeenCalledTimes(2);
  });
});
