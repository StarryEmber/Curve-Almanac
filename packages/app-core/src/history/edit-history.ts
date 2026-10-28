/**
 * Command history for undo/redo (SPEC §13.2, T5.2).
 *
 * Every successful command that changed the document is recorded from its
 * Immer `patches`/`inversePatches`; there is no second history implementation.
 * `table.cell.set` keeps the T2.2 800 ms same-cell merge, while pastes, imports,
 * structural changes, views, styles and charts are one entry per command.
 *
 * `view.layout` is special: a command that only changes pane focus / the active
 * tab is UI state and must neither enter history nor drop the redo branch
 * (TESTPLAN E7 step 4). Structural layout edits (split, move, ratio, close pane)
 * still produce a reversible patch, so they are recorded normally.
 *
 * The stack is capped at 100 entries and an estimated 256 MB. The estimator
 * deliberately does not stringify 100k-row arrays on the edit path: forward
 * row-array patches are shared with the published document, and inverse arrays
 * are usually the same row objects in a different array (T2.7). Only row arrays
 * that actually retain new row objects (for example an import replacement) are
 * counted at sample-extrapolated full size.
 */

import { applyPatches } from 'immer';

import type { LayoutNode, Row } from '@curve/domain';

import type { CommandResult } from '../commands/types';
import type { AppState, AppStore, HistoryState } from '../state/types';
import type { Patch } from 'immer';

export const DEFAULT_MERGE_WINDOW_MS = 800;
export const DEFAULT_HISTORY_LIMIT = 100;
/** SPEC §13.2: 256 MB of estimated patch memory. */
export const DEFAULT_HISTORY_MAX_BYTES = 256 * 1024 * 1024;

const TRANSIENT_COMMANDS = new Set(['view.layout']);

export interface EditHistoryEntry {
  name: string;
  mergeKey?: string;
  /** Tables touched by either the forward or inverse patches. */
  tableIds: readonly string[];
  /** A patch targeted `tables/<id>/rows`, so the JSONL must be rewritten. */
  rowsPatched: boolean;
  /** A patch added or removed a whole `tables/<id>` entry. */
  wholeTablePatched: boolean;
  patches: readonly Patch[];
  inversePatches: readonly Patch[];
  recordedAt: number;
  /** Estimated retained bytes of both patch arrays. */
  bytes: number;
}

export interface EditHistoryOptions {
  store: AppStore;
  /** Injected clock so the merge window is deterministic in tests. */
  now?: () => number;
  mergeWindowMs?: number;
  limit?: number;
  /** Estimated memory cap; defaults to `DEFAULT_HISTORY_MAX_BYTES`. */
  maxBytes?: number;
  /** Called after an undo/redo changed a table (save queue hook). */
  onChanged?: (tableId: string) => void;
  /** Called after an undo/redo changed manifest-only document state. */
  onWorkspaceChanged?: () => void;
  /** Publishes the small UI snapshot consumed by the Edit menu. */
  onStateChange?: (state: HistoryState) => void;
}

export interface EditHistory {
  /** Records a successful command result; focus-only layout changes are ignored. */
  record(result: CommandResult): void;
  undo(): boolean;
  redo(): boolean;
  canUndo(): boolean;
  canRedo(): boolean;
  size(): number;
  /** Estimated bytes retained by both stacks (diagnostics/tests). */
  sizeBytes(): number;
  /** UI-only snapshot for the Edit menu. */
  snapshot(): HistoryState;
  clear(): void;
}

interface PatchAnalysis {
  tableIds: readonly string[];
  rowsPatched: boolean;
  wholeTablePatched: boolean;
}

interface EstimateContext {
  /** Rows currently published for the table whose patch is being measured. */
  currentRows: readonly Row[] | undefined;
}

const ARRAY_OVERHEAD = 32;
const OBJECT_OVERHEAD = 32;
const POINTER_BYTES = 8;
const STRING_CHAR_BYTES = 2;
const STRING_OVERHEAD = 16;
const MAX_DEPTH = 12;
const ROW_SAMPLE_SIZE = 16;
const GENERIC_ARRAY_SAMPLE_THRESHOLD = 1_024;
const GENERIC_ARRAY_SAMPLE_SIZE = 24;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRow(value: unknown): value is Row {
  return isRecord(value) && typeof value['id'] === 'string' && Array.isArray(value['values']);
}

function isRowArray(value: unknown): value is readonly Row[] {
  return Array.isArray(value) && value.length > 0 && isRow(value[0]);
}

function isTableData(value: unknown): value is { table: unknown; rows: readonly unknown[] } {
  return isRecord(value) && isRecord(value['table']) && Array.isArray(value['rows']);
}

/** True when the array keeps the same row objects as the published table. */
function isMostlySharedRows(
  rows: readonly unknown[],
  current: readonly Row[] | undefined,
): boolean {
  if (current === undefined) {
    return false;
  }
  if (rows.length === 0) {
    return true;
  }
  const indexes = [0, rows.length >> 2, rows.length >> 1, (rows.length * 3) >> 2, rows.length - 1];
  let matches = 0;
  let total = 0;
  for (const index of new Set(indexes)) {
    if (index < 0 || index >= rows.length) {
      continue;
    }
    total += 1;
    if (rows[index] === current[index]) {
      matches += 1;
    }
  }
  return total > 0 && matches * 4 >= total * 3;
}

function estimateRowsContents(rows: readonly unknown[], depth: number): number {
  const sampleCount = Math.min(ROW_SAMPLE_SIZE, rows.length);
  const step = Math.max(1, Math.floor(rows.length / sampleCount));
  let sampled = 0;
  let count = 0;
  for (let index = 0; index < rows.length && count < sampleCount; index += step) {
    sampled += estimateValue(rows[index], { currentRows: undefined }, depth + 1);
    count += 1;
  }
  return count === 0 ? 0 : Math.round((sampled / count) * rows.length);
}

function estimateRows(rows: readonly unknown[], context: EstimateContext, depth: number): number {
  const shallow = ARRAY_OVERHEAD + rows.length * POINTER_BYTES;
  if (rows.length === 0 || isMostlySharedRows(rows, context.currentRows)) {
    return shallow;
  }
  return shallow + estimateRowsContents(rows, depth);
}

function estimateArray(value: readonly unknown[], context: EstimateContext, depth: number): number {
  if (isRowArray(value)) {
    return estimateRows(value, context, depth);
  }
  const shallow = ARRAY_OVERHEAD + value.length * POINTER_BYTES;
  if (value.length > GENERIC_ARRAY_SAMPLE_THRESHOLD) {
    const sampleCount = Math.min(GENERIC_ARRAY_SAMPLE_SIZE, value.length);
    const step = Math.max(1, Math.floor(value.length / sampleCount));
    let sampled = 0;
    let count = 0;
    for (let index = 0; index < value.length && count < sampleCount; index += step) {
      sampled += estimateValue(value[index], context, depth + 1);
      count += 1;
    }
    return shallow + (count === 0 ? 0 : Math.round((sampled / count) * value.length));
  }
  let total = shallow;
  for (const item of value) {
    total += estimateValue(item, context, depth + 1);
  }
  return total;
}

function estimateObject(
  value: Record<string, unknown>,
  context: EstimateContext,
  depth: number,
): number {
  let total = OBJECT_OVERHEAD;
  for (const [key, item] of Object.entries(value)) {
    total += STRING_OVERHEAD + key.length * STRING_CHAR_BYTES;
    total += estimateValue(item, context, depth + 1);
  }
  return total;
}

/**
 * Structural estimate of the memory a patch value keeps alive. Strings count
 * UTF-16 code units, object/array entries get a pointer-sized allowance, and
 * big arrays are sampled rather than walked on every edit.
 */
function estimateValue(value: unknown, context: EstimateContext, depth: number): number {
  if (depth > MAX_DEPTH) {
    return OBJECT_OVERHEAD;
  }
  if (value === null || value === undefined) {
    return POINTER_BYTES;
  }
  switch (typeof value) {
    case 'string':
      return STRING_OVERHEAD + value.length * STRING_CHAR_BYTES;
    case 'number':
      return POINTER_BYTES;
    case 'boolean':
      return 4;
    case 'bigint':
      return 16;
    case 'function':
      return POINTER_BYTES;
    default:
      break;
  }
  if (Array.isArray(value)) {
    return estimateArray(value, context, depth);
  }
  if (isTableData(value)) {
    return (
      OBJECT_OVERHEAD +
      estimateValue(value['table'], { currentRows: undefined }, depth + 1) +
      estimateRows(value['rows'], context, depth + 1)
    );
  }
  if (isRecord(value)) {
    return estimateObject(value, context, depth);
  }
  return POINTER_BYTES;
}

function estimatePatches(patches: readonly Patch[], state: AppState): number {
  let total = 0;
  for (const patch of patches) {
    const tableId =
      patch.path[0] === 'tables' && typeof patch.path[1] === 'string' ? patch.path[1] : null;
    const currentRows = tableId === null ? undefined : state.tables[tableId]?.rows;
    total += patch.path.length * STRING_OVERHEAD;
    total += estimateValue(patch.value, { currentRows }, 0);
  }
  return total;
}

function analyzePatches(
  patches: readonly Patch[],
  inversePatches: readonly Patch[],
): PatchAnalysis {
  const tableIds = new Set<string>();
  let rowsPatched = false;
  let wholeTablePatched = false;
  for (const patch of [...patches, ...inversePatches]) {
    if (patch.path[0] !== 'tables') {
      continue;
    }
    const tableId = patch.path[1];
    if (typeof tableId !== 'string') {
      continue;
    }
    tableIds.add(tableId);
    if (patch.path.length === 2) {
      wholeTablePatched = true;
    } else if (patch.path[2] === 'rows') {
      rowsPatched = true;
    }
  }
  return { tableIds: [...tableIds], rowsPatched, wholeTablePatched };
}

function layoutShapeEquals(left: LayoutNode, right: LayoutNode): boolean {
  if (left.type !== right.type) {
    return false;
  }
  if (left.type === 'pane') {
    if (right.type !== 'pane' || left.viewIds.length !== right.viewIds.length) {
      return false;
    }
    return left.viewIds.every((viewId, index) => viewId === right.viewIds[index]);
  }
  if (right.type !== 'split') {
    return false;
  }
  return (
    left.direction === right.direction &&
    left.ratio === right.ratio &&
    layoutShapeEquals(left.first, right.first) &&
    layoutShapeEquals(left.second, right.second)
  );
}

/** The pre-command layout is carried by the root `layout` inverse patch. */
function previousLayout(result: CommandResult): LayoutNode | null {
  const patch = result.inversePatches.find(
    (candidate) => candidate.path.length === 1 && candidate.path[0] === 'layout',
  );
  if (patch === undefined) {
    return null;
  }
  const value = patch.value;
  return isRecord(value) && (value['type'] === 'pane' || value['type'] === 'split')
    ? (value as LayoutNode)
    : null;
}

/**
 * Focus-only `view.layout`: the tree is identical once `activeViewId` is
 * ignored. This is the E7 "tab switch does not enter history" rule.
 */
function isFocusOnlyLayoutChange(result: CommandResult): boolean {
  if (!TRANSIENT_COMMANDS.has(result.name)) {
    return false;
  }
  const before = previousLayout(result);
  return before === null || layoutShapeEquals(before, result.next.layout);
}

function tableShouldBeWritten(entry: EditHistoryEntry, state: AppState): readonly string[] {
  return entry.tableIds.filter((tableId) => {
    const data = state.tables[tableId];
    if (data === undefined) {
      return false;
    }
    return entry.rowsPatched || (entry.wholeTablePatched && data.rows.length > 0);
  });
}

export function createEditHistory(options: EditHistoryOptions): EditHistory {
  const { store } = options;
  const now = options.now ?? ((): number => Date.now());
  const mergeWindowMs = options.mergeWindowMs ?? DEFAULT_MERGE_WINDOW_MS;
  const limit = options.limit ?? DEFAULT_HISTORY_LIMIT;
  const maxBytes = options.maxBytes ?? DEFAULT_HISTORY_MAX_BYTES;
  const undoStack: EditHistoryEntry[] = [];
  const redoStack: EditHistoryEntry[] = [];
  let undoBytes = 0;
  let redoBytes = 0;

  const snapshot = (): HistoryState => ({
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    undoAction: undoStack.at(-1)?.name ?? null,
    redoAction: redoStack.at(-1)?.name ?? null,
    undoDepth: undoStack.length,
    redoDepth: redoStack.length,
  });

  const publish = (): void => {
    options.onStateChange?.(snapshot());
  };

  const trim = (): void => {
    while (undoStack.length > 0 && (undoStack.length > limit || undoBytes > maxBytes)) {
      const dropped = undoStack.shift();
      if (dropped !== undefined) {
        undoBytes -= dropped.bytes;
      }
    }
    if (undoBytes < 0) {
      undoBytes = 0;
    }
  };

  const persist = (entry: EditHistoryEntry): void => {
    const state = store.getState();
    const tableIds = tableShouldBeWritten(entry, state);
    if (tableIds.length === 0) {
      options.onWorkspaceChanged?.();
      return;
    }
    for (const tableId of tableIds) {
      options.onChanged?.(tableId);
    }
  };

  const record = (result: CommandResult): void => {
    if (result.patches.length === 0) {
      return;
    }
    if (isFocusOnlyLayoutChange(result)) {
      return;
    }
    const recordedAt = now();
    const analysis = analyzePatches(result.patches, result.inversePatches);
    const estimateState = result.next;
    const bytes =
      estimatePatches(result.patches, estimateState) +
      estimatePatches(result.inversePatches, estimateState);
    const entry: EditHistoryEntry = {
      name: result.name,
      ...(result.mergeKey === undefined ? {} : { mergeKey: result.mergeKey }),
      ...analysis,
      patches: result.patches,
      inversePatches: result.inversePatches,
      recordedAt,
      bytes,
    };

    const previous = undoStack.at(-1);
    const canMerge =
      redoStack.length === 0 &&
      result.name === 'table.cell.set' &&
      previous !== undefined &&
      previous.mergeKey !== undefined &&
      previous.mergeKey === entry.mergeKey &&
      recordedAt - previous.recordedAt <= mergeWindowMs;

    redoStack.length = 0;
    redoBytes = 0;

    if (canMerge && previous !== undefined) {
      // Keep the first inverse (state before the first edit) and the latest
      // forward patches (current state), then re-measure the merged entry.
      previous.patches = entry.patches;
      previous.recordedAt = recordedAt;
      const mergedBytes =
        estimatePatches(previous.inversePatches, estimateState) +
        estimatePatches(previous.patches, estimateState);
      undoBytes += mergedBytes - previous.bytes;
      previous.bytes = mergedBytes;
    } else {
      undoStack.push(entry);
      undoBytes += entry.bytes;
    }
    trim();
    publish();
  };

  const undo = (): boolean => {
    const entry = undoStack.pop();
    if (entry === undefined) {
      return false;
    }
    store.setState(applyPatches(store.getState(), entry.inversePatches), true);
    undoBytes -= entry.bytes;
    redoStack.push(entry);
    redoBytes += entry.bytes;
    publish();
    persist(entry);
    return true;
  };

  const redo = (): boolean => {
    const entry = redoStack.pop();
    if (entry === undefined) {
      return false;
    }
    store.setState(applyPatches(store.getState(), entry.patches), true);
    redoBytes -= entry.bytes;
    undoStack.push(entry);
    undoBytes += entry.bytes;
    publish();
    persist(entry);
    return true;
  };

  return {
    record,
    undo,
    redo,
    canUndo: () => undoStack.length > 0,
    canRedo: () => redoStack.length > 0,
    size: () => undoStack.length,
    sizeBytes: () => undoBytes + redoBytes,
    snapshot,
    clear: () => {
      undoStack.length = 0;
      redoStack.length = 0;
      undoBytes = 0;
      redoBytes = 0;
      publish();
    },
  };
}
