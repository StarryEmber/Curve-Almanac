/**
 * File-side helpers for the T2.5 import wizard.
 *
 * The renderer never touches the filesystem. These functions run in the main
 * process: the native dialog chooses a source, the file is size/extension
 * checked and read once as bytes (so GBK is not lost), and exports are written
 * atomically to the user-chosen destination.
 */

import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { basename, extname } from 'node:path';

import { createAppError } from '@curve/domain';

import { atomicWrite } from '../workspace/atomic-write';

export const MAX_IMPORT_FILE_BYTES = 100 * 1024 * 1024;
export const MAX_ARCHIVE_COPY_BYTES = 50 * 1024 * 1024;

export interface ImportSourceFile {
  name: string;
  bytes: Uint8Array;
  sha256: string;
  size: number;
  format: 'csv' | 'json';
}

export function importFormatFromName(name: string): 'csv' | 'json' | null {
  const extension = extname(name).toLowerCase();
  if (extension === '.csv' || extension === '.tsv') {
    return 'csv';
  }
  if (extension === '.json') {
    return 'json';
  }
  return null;
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export async function readImportSource(path: string): Promise<ImportSourceFile> {
  const name = basename(path);
  const format = importFormatFromName(name);
  if (format === null) {
    throw createAppError('E_IMPORT_FORMAT', 'Only .csv, .tsv and .json files can be imported.');
  }

  let info;
  try {
    info = await stat(path);
  } catch {
    throw createAppError('E_FS_READ', 'The import file could not be read.');
  }
  if (!info.isFile()) {
    throw createAppError('E_IMPORT_FORMAT', 'The selected path is not a file.');
  }
  if (info.size > MAX_IMPORT_FILE_BYTES) {
    throw createAppError('E_IMPORT_FORMAT', 'Import files may not exceed 100 MB.', {
      detail: `bytes=${String(info.size)}`,
    });
  }

  let bytes: Uint8Array;
  try {
    bytes = await readFile(path);
  } catch {
    throw createAppError('E_FS_READ', 'The import file could not be read.');
  }
  return {
    name,
    bytes,
    sha256: sha256Hex(bytes),
    size: bytes.byteLength,
    format,
  };
}

export async function exportTextFile(path: string, content: string): Promise<{ path: string }> {
  try {
    await atomicWrite(path, content);
  } catch {
    throw createAppError('E_EXPORT_FAILED', 'The export file could not be written.');
  }
  return { path };
}
