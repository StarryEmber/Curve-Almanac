import writeFileAtomic from 'write-file-atomic';

/**
 * The one place the main process writes a file. `write-file-atomic` keeps the
 * temporary file next to the target, fsyncs it and renames it into place, so a
 * crash can never leave a half-written document (ADR-019, SPEC §7.4).
 *
 * The function is injectable in unit tests to simulate an interrupted write.
 */
export type AtomicWrite = (file: string, data: string) => Promise<void>;

export const atomicWrite: AtomicWrite = (file, data) =>
  writeFileAtomic(file, data, { encoding: 'utf8', fsync: true });
