/**
 * Streaming CSV destination for `file:exportCsv` (T3.6, ADR-039).
 *
 * The renderer formats and chunks rows; main owns the save dialog, the
 * temporary file and the atomic rename. Only opaque tokens cross the IPC
 * boundary, so a compromised renderer cannot choose an arbitrary write path.
 *
 * Writes are synchronous on purpose: chunks are small (about 1,000 rows), the
 * renderer awaits each append, and a synchronous write keeps `before-quit`
 * cleanup deterministic (close + unlink without an event loop).
 */

import { randomUUID } from 'node:crypto';
import { closeSync, fsyncSync, openSync, renameSync, unlinkSync, writeSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

import { createAppError } from '@curve/domain';
import type { AppError } from '@curve/domain';

import { MAX_EXPORT_CSV_CHUNK_BYTES } from '../../shared/contracts/ipc';

import type { ExportCsvReply, ExportCsvRequest, FileFilter } from '../../shared/contracts/ipc';

export interface ChooseCsvSavePath {
  (suggestedName: string, filters: FileFilter[]): Promise<string | null>;
}

export interface CsvExportWriterOptions {
  chooseSavePath: ChooseCsvSavePath;
  /** Injectable for deterministic tests; defaults to `randomUUID`. */
  uuid?: () => string;
}

export interface CsvExportWriter {
  handle(request: ExportCsvRequest): Promise<ExportCsvReply | null>;
  /** Best-effort cleanup for app quit; removes every unfinished temporary file. */
  dispose(): void;
  activeCount(): number;
}

interface ExportSession {
  path: string;
  tempPath: string;
  fd: number;
  bytes: number;
  closed: boolean;
}

function exportError(message: string, detail?: string): AppError {
  return createAppError('E_EXPORT_FAILED', message, detail === undefined ? undefined : { detail });
}

function writeAll(fd: number, buffer: Buffer): void {
  let offset = 0;
  while (offset < buffer.length) {
    const written = writeSync(fd, buffer, offset, buffer.length - offset);
    if (written <= 0) {
      throw new Error('The export file accepted no bytes.');
    }
    offset += written;
  }
}

export function createCsvExportWriter(options: CsvExportWriterOptions): CsvExportWriter {
  const uuid = options.uuid ?? randomUUID;
  const sessions = new Map<string, ExportSession>();

  function closeSession(session: ExportSession): void {
    if (session.closed) {
      return;
    }
    session.closed = true;
    closeSync(session.fd);
  }

  function discard(session: ExportSession): void {
    try {
      closeSession(session);
    } catch {
      // The descriptor may already be gone; unlinking is still worth a try.
    }
    try {
      unlinkSync(session.tempPath);
    } catch {
      // A missing temporary file is already the desired end state.
    }
  }

  function getSession(token: string): ExportSession {
    const session = sessions.get(token);
    if (session === undefined) {
      throw exportError('The export session is no longer available.');
    }
    return session;
  }

  async function begin(
    request: Extract<ExportCsvRequest, { op: 'begin' }>,
  ): Promise<ExportCsvReply | null> {
    const path = await options.chooseSavePath(request.suggestedName, request.filters);
    if (path === null) {
      return null;
    }

    const tempPath = join(dirname(path), `.${basename(path)}.curve-export-${uuid()}.tmp`);
    let fd: number;
    try {
      fd = openSync(tempPath, 'wx');
    } catch {
      throw exportError('The export file could not be created.');
    }

    const token = uuid();
    sessions.set(token, { path, tempPath, fd, bytes: 0, closed: false });
    return { op: 'begin', token, path };
  }

  function append(request: Extract<ExportCsvRequest, { op: 'append' }>): ExportCsvReply {
    const session = getSession(request.token);
    const buffer = Buffer.from(request.chunk, 'utf8');
    if (buffer.length > MAX_EXPORT_CSV_CHUNK_BYTES) {
      throw createAppError(
        'E_PAYLOAD_TOO_LARGE',
        'The export chunk is larger than the IPC contract allows.',
        { detail: `bytes=${String(buffer.length)}` },
      );
    }

    try {
      writeAll(session.fd, buffer);
    } catch {
      sessions.delete(request.token);
      discard(session);
      throw exportError('The export file could not be written.');
    }
    session.bytes += buffer.length;
    return { op: 'append', bytes: session.bytes };
  }

  function finish(request: Extract<ExportCsvRequest, { op: 'finish' }>): ExportCsvReply {
    const session = getSession(request.token);
    try {
      fsyncSync(session.fd);
      closeSession(session);
      renameSync(session.tempPath, session.path);
    } catch {
      sessions.delete(request.token);
      discard(session);
      throw exportError('The export file could not be written.');
    }
    sessions.delete(request.token);
    return {
      op: 'finish',
      path: session.path,
      bytes: session.bytes,
      rows: request.rows,
    };
  }

  function cancel(request: Extract<ExportCsvRequest, { op: 'cancel' }>): ExportCsvReply {
    const session = sessions.get(request.token);
    if (session === undefined) {
      return { op: 'cancel', removed: false };
    }
    sessions.delete(request.token);
    try {
      closeSession(session);
    } catch {
      // Fall through to unlink; on Windows it may fail if the handle leaked.
    }
    try {
      unlinkSync(session.tempPath);
      return { op: 'cancel', removed: true };
    } catch {
      return { op: 'cancel', removed: false };
    }
  }

  return {
    async handle(request) {
      switch (request.op) {
        case 'begin':
          return begin(request);
        case 'append':
          return append(request);
        case 'finish':
          return finish(request);
        case 'cancel':
          return cancel(request);
      }
    },
    dispose() {
      for (const [token, session] of sessions) {
        sessions.delete(token);
        discard(session);
      }
    },
    activeCount: () => sessions.size,
  };
}
