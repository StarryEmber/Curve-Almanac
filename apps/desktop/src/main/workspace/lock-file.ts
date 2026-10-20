/**
 * `.lock` lifecycle (SPEC §7.5).
 *
 * A lock is a small JSON document `{ pid, startedAt, appVersion }`. It is
 * written atomically *after* the manifest has been validated, so a corrupt
 * workspace never gains a lock. A lock is stale when its PID is gone or it is
 * older than 24 hours; a stale lock is reported as a warning and replaced.
 */

import { readFile, unlink } from 'node:fs/promises';

import { z } from 'zod';

import { isoTimestampSchema } from '@curve/domain';

import { atomicWrite } from './atomic-write';
import { isEnoent } from './path-safety';

import type { AtomicWrite } from './atomic-write';

export const LOCK_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface WorkspaceLock {
  pid: number;
  startedAt: string;
  appVersion: string;
}

export type LockStatus = 'none' | 'active' | 'stale' | 'corrupt';

export interface LockInspection {
  status: LockStatus;
  lock?: WorkspaceLock;
}

export const workspaceLockSchema: z.ZodType<WorkspaceLock> = z.strictObject({
  pid: z.number().int().positive(),
  startedAt: isoTimestampSchema,
  appVersion: z.string().min(1),
});

export interface InspectLockOptions {
  now: Date;
  isProcessAlive?: (pid: number) => boolean;
  maxAgeMs?: number;
}

/** Cross-platform "does this PID exist?" check; permission errors mean alive. */
export function defaultIsProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? (error as { code?: unknown }).code
        : undefined;
    return code !== 'ESRCH';
  }
}

export function isLockStale(
  lock: WorkspaceLock,
  now: Date,
  isProcessAlive: (pid: number) => boolean = defaultIsProcessAlive,
  maxAgeMs = LOCK_MAX_AGE_MS,
): boolean {
  const startedAt = Date.parse(lock.startedAt);
  if (!Number.isFinite(startedAt)) {
    return true;
  }
  if (now.getTime() - startedAt > maxAgeMs) {
    return true;
  }
  return !isProcessAlive(lock.pid);
}

export async function inspectLock(
  lockPath: string,
  options: InspectLockOptions,
): Promise<LockInspection> {
  let raw: string;
  try {
    raw = await readFile(lockPath, 'utf8');
  } catch (error) {
    if (isEnoent(error)) {
      return { status: 'none' };
    }
    throw error;
  }

  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    return { status: 'corrupt' };
  }
  const parsed = workspaceLockSchema.safeParse(value);
  if (!parsed.success) {
    return { status: 'corrupt' };
  }

  const isAlive = options.isProcessAlive ?? defaultIsProcessAlive;
  const stale = isLockStale(parsed.data, options.now, isAlive, options.maxAgeMs);
  return { status: stale ? 'stale' : 'active', lock: parsed.data };
}

export function lockDocument(pid: number, startedAt: Date, appVersion: string): WorkspaceLock {
  return { pid, startedAt: startedAt.toISOString(), appVersion };
}

export async function writeLock(
  lockPath: string,
  lock: WorkspaceLock,
  write: AtomicWrite = atomicWrite,
): Promise<void> {
  await write(lockPath, `${JSON.stringify(lock)}\n`);
}

/**
 * Removes the lock only when it belongs to `pid`. A foreign lock is left alone
 * so a second process can never be unlocked by mistake.
 */
export async function removeLockIfOwned(lockPath: string, pid: number): Promise<void> {
  let raw: string;
  try {
    raw = await readFile(lockPath, 'utf8');
  } catch (error) {
    if (isEnoent(error)) {
      return;
    }
    throw error;
  }

  try {
    const parsed = workspaceLockSchema.safeParse(JSON.parse(raw) as unknown);
    if (!parsed.success || parsed.data.pid !== pid) {
      return;
    }
  } catch {
    return;
  }

  try {
    await unlink(lockPath);
  } catch (error) {
    if (isEnoent(error)) {
      return;
    }
    throw error;
  }
}
