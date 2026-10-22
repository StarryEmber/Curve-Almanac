/**
 * Opaque tokens for selected import source files (T2.5).
 *
 * The renderer receives only bytes plus a token. At commit time it sends the
 * token back; main resolves the previously dialog-selected path. This prevents
 * a compromised renderer from asking main to archive an arbitrary path while
 * still allowing the archive to re-read the source and verify its hash.
 */

import { randomUUID } from 'node:crypto';

import { createAppError } from '@curve/domain';

export interface ImportTokenEntry {
  path: string;
  name: string;
  size: number;
  sha256: string;
  format: 'csv' | 'json';
}

export interface ImportTokenStore {
  issue(entry: ImportTokenEntry): string;
  get(token: string): ImportTokenEntry;
  consume(token: string): void;
  size(): number;
}

export function createImportTokenStore(options: { uuid?: () => string } = {}): ImportTokenStore {
  const tokens = new Map<string, ImportTokenEntry>();
  const uuid = options.uuid ?? randomUUID;

  return {
    issue(entry) {
      const token = uuid();
      tokens.set(token, entry);
      return token;
    },
    get(token) {
      const entry = tokens.get(token);
      if (entry === undefined) {
        throw createAppError('E_IMPORT_FORMAT', 'The selected import file is no longer available.');
      }
      return entry;
    },
    consume(token) {
      tokens.delete(token);
    },
    size: () => tokens.size,
  };
}
