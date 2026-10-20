/**
 * Dirty-table bookkeeping (TASKS T1.3).
 *
 * This is the pure half of "which tables have unsaved changes". Persisting,
 * auto-saving and surfacing the list is `app-core`'s job (T1.5); keeping the
 * primitives here means they can be unit tested and shared with the main
 * process without pulling Zustand or React into `@curve/table-engine`
 * (AGENTS §5, SPEC §4.2).
 */

export interface DirtyTableEntry {
  tableId: string;
  /**
   * Monotonic counter for the whole tracker. A caller that remembers the
   * revision it last saved can tell whether the table was touched again.
   */
  revision: number;
  /** Epoch milliseconds from the injected clock. */
  markedAt: number;
}

export interface DirtyTableTrackerOptions {
  /** Injectable clock so tests do not depend on system time (AGENTS §6). */
  now?: () => number;
}

/**
 * Marks tables as having unsaved changes.
 *
 * `list()` keeps first-mark order; re-marking a dirty table refreshes its
 * `markedAt`/`revision` without moving it, which keeps status-bar ordering
 * stable while the user keeps typing.
 */
export class DirtyTableTracker {
  private readonly entries = new Map<string, DirtyTableEntry>();
  private readonly now: () => number;
  private nextRevision = 1;

  constructor(options: DirtyTableTrackerOptions = {}) {
    this.now = options.now ?? Date.now;
  }

  get size(): number {
    return this.entries.size;
  }

  mark(tableId: string): DirtyTableEntry {
    return this.store(tableId);
  }

  markAll(tableIds: Iterable<string>): DirtyTableEntry[] {
    const marked: DirtyTableEntry[] = [];
    for (const tableId of tableIds) {
      marked.push(this.store(tableId));
    }
    return marked;
  }

  /** Removes the mark; returns whether the table was dirty. */
  clear(tableId: string): boolean {
    return this.entries.delete(tableId);
  }

  clearAll(): void {
    this.entries.clear();
  }

  has(tableId: string): boolean {
    return this.entries.has(tableId);
  }

  get(tableId: string): DirtyTableEntry | undefined {
    const entry = this.entries.get(tableId);
    return entry === undefined ? undefined : { ...entry };
  }

  /** Dirty tables in first-mark order, as copies. */
  list(): DirtyTableEntry[] {
    return [...this.entries.values()].map((entry) => ({ ...entry }));
  }

  ids(): string[] {
    return [...this.entries.keys()];
  }

  private store(tableId: string): DirtyTableEntry {
    const entry: DirtyTableEntry = {
      tableId,
      revision: this.nextRevision,
      markedAt: this.now(),
    };
    this.nextRevision += 1;
    this.entries.set(tableId, entry);
    return { ...entry };
  }
}
