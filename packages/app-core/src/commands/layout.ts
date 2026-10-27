/**
 * Pure layout helpers shared by the workspace/view commands (T2.1/T5.1).
 *
 * The store keeps one recursive `LayoutNode` tree (SPEC §12). A pane path is a
 * stable, UI-only address (`root`, `root.0`, `root.1`, `root.0.1`) used to
 * target a pane without adding ids to the persisted manifest.
 */

import { createAppError } from '@curve/domain';
import type { LayoutNode } from '@curve/domain';

export type PaneNode = Extract<LayoutNode, { type: 'pane' }>;
export type SplitNode = Extract<LayoutNode, { type: 'split' }>;

export interface PaneEntry {
  path: string;
  pane: PaneNode;
}

export const LAYOUT_ROOT_PATH = 'root';

export function isPaneNode(node: LayoutNode): node is PaneNode {
  return node.type === 'pane';
}

export function isSplitNode(node: LayoutNode): node is SplitNode {
  return node.type === 'split';
}

function childPath(base: string, index: 0 | 1): string {
  return `${base}.${String(index)}`;
}

/** Depth-first list of panes with their UI-only path, in visual order. */
export function listPaneEntries(layout: LayoutNode, path: string = LAYOUT_ROOT_PATH): PaneEntry[] {
  if (isPaneNode(layout)) {
    return [{ path, pane: layout }];
  }
  return [
    ...listPaneEntries(layout.first, childPath(path, 0)),
    ...listPaneEntries(layout.second, childPath(path, 1)),
  ];
}

export function listPanes(layout: LayoutNode): PaneNode[] {
  return listPaneEntries(layout).map((entry) => entry.pane);
}

export function countPanes(layout: LayoutNode): number {
  return listPaneEntries(layout).length;
}

function pathSegments(path: string): number[] | null {
  const parts = path.split('.');
  if (parts[0] !== LAYOUT_ROOT_PATH) {
    return null;
  }
  const segments: number[] = [];
  for (const part of parts.slice(1)) {
    if (part !== '0' && part !== '1') {
      return null;
    }
    segments.push(Number(part));
  }
  return segments;
}

export function findPaneEntry(layout: LayoutNode, path: string): PaneEntry | null {
  return listPaneEntries(layout).find((entry) => entry.path === path) ?? null;
}

export function findPaneByPath(layout: LayoutNode, path: string): PaneNode | null {
  return findPaneEntry(layout, path)?.pane ?? null;
}

export function findPaneForViewEntry(layout: LayoutNode, viewId: string): PaneEntry | null {
  return listPaneEntries(layout).find((entry) => entry.pane.viewIds.includes(viewId)) ?? null;
}

export function findPaneForView(layout: LayoutNode, viewId: string): PaneNode | null {
  return findPaneForViewEntry(layout, viewId)?.pane ?? null;
}

export function panePathForView(layout: LayoutNode, viewId: string): string | null {
  return findPaneForViewEntry(layout, viewId)?.path ?? null;
}

/** The pane that owns the active view, else the first pane, else `null`. */
export function findActivePane(layout: LayoutNode): PaneNode | null {
  const panes = listPanes(layout);
  const active = panes.find((pane) => pane.activeViewId !== null);
  return active ?? panes[0] ?? null;
}

/** Visual path of the first pane that has an active view, else the first pane. */
export function activePanePath(layout: LayoutNode): string | null {
  const entries = listPaneEntries(layout);
  return (
    entries.find((entry) => entry.pane.activeViewId !== null)?.path ?? entries[0]?.path ?? null
  );
}

/**
 * Adds `viewId` to the pane at `panePath` (or the first pane with an active
 * view / first pane) and activates it. Returns the pane path.
 */
export function addViewToLayout(
  layout: LayoutNode,
  viewId: string,
  panePath?: string | null,
): string {
  const entries = listPaneEntries(layout);
  const entry =
    (panePath === undefined || panePath === null
      ? undefined
      : entries.find((candidate) => candidate.path === panePath)) ??
    entries.find((candidate) => candidate.pane.activeViewId !== null) ??
    entries[0];
  if (entry === undefined) {
    throw createAppError('E_WS_INVALID_MANIFEST', 'The layout has no pane.');
  }
  if (!entry.pane.viewIds.includes(viewId)) {
    entry.pane.viewIds.push(viewId);
  }
  entry.pane.activeViewId = viewId;
  return entry.path;
}

/** Activates an existing view; adds it to a pane when the layout lost it. */
export function activateViewInLayout(
  layout: LayoutNode,
  viewId: string,
  panePath?: string | null,
): string {
  const entry = findPaneForViewEntry(layout, viewId);
  if (entry === null) {
    return addViewToLayout(layout, viewId, panePath);
  }
  entry.pane.activeViewId = viewId;
  return entry.path;
}

function removeFromPane(pane: PaneNode, viewId: string): { pane: PaneNode; removed: boolean } {
  const index = pane.viewIds.indexOf(viewId);
  if (index < 0) {
    return { pane, removed: false };
  }
  const viewIds = [...pane.viewIds];
  viewIds.splice(index, 1);
  const activeViewId =
    pane.activeViewId === viewId
      ? (viewIds[index] ?? viewIds[index - 1] ?? null)
      : pane.activeViewId;
  return { pane: { ...pane, viewIds, activeViewId }, removed: true };
}

/** Drops empty panes from a split, keeping at least one empty pane. */
export function pruneEmptyPanes(layout: LayoutNode): LayoutNode {
  if (isPaneNode(layout)) {
    return layout;
  }
  const first = pruneEmptyPanes(layout.first);
  const second = pruneEmptyPanes(layout.second);
  const firstEmpty = isPaneNode(first) && first.viewIds.length === 0;
  const secondEmpty = isPaneNode(second) && second.viewIds.length === 0;
  if (firstEmpty && secondEmpty) {
    return first;
  }
  if (firstEmpty) {
    return second;
  }
  if (secondEmpty) {
    return first;
  }
  return { ...layout, first, second };
}

/**
 * Removes every reference to `viewId`, collapses panes that became empty and
 * picks the nearest remaining view as the pane's active view. A layout with
 * every view closed becomes one empty root pane (SPEC §12).
 */
export function removeViewFromLayout(layout: LayoutNode, viewId: string): LayoutNode {
  function remove(node: LayoutNode): LayoutNode {
    if (isPaneNode(node)) {
      return removeFromPane(node, viewId).pane;
    }
    const first = remove(node.first);
    const second = remove(node.second);
    return pruneEmptyPanes({ ...node, first, second });
  }
  return remove(layout);
}

function replaceNodeAtSegments(
  node: LayoutNode,
  segments: readonly number[],
  replacement: LayoutNode,
): LayoutNode {
  if (segments.length === 0) {
    return replacement;
  }
  if (!isSplitNode(node)) {
    throw createAppError('E_VALIDATION', 'The layout path does not address a split.');
  }
  const [index, ...rest] = segments;
  return index === 0
    ? { ...node, first: replaceNodeAtSegments(node.first, rest, replacement) }
    : { ...node, second: replaceNodeAtSegments(node.second, rest, replacement) };
}

/**
 * Splits the pane at `panePath` into two panes: the original pane keeps its
 * tabs and the new second pane is empty. Returns the new tree and the path of
 * the new pane (which the caller should focus).
 */
export function splitPaneInLayout(
  layout: LayoutNode,
  panePath: string,
  direction: 'horizontal' | 'vertical',
): { layout: LayoutNode; panePath: string } {
  const entry = findPaneEntry(layout, panePath);
  const segments = pathSegments(panePath);
  if (entry === null || segments === null) {
    throw createAppError('E_VALIDATION', 'The pane does not exist.');
  }
  const replacement: SplitNode = {
    type: 'split',
    direction,
    ratio: 0.5,
    first: entry.pane,
    second: { type: 'pane', viewIds: [], activeViewId: null },
  };
  return {
    layout: replaceNodeAtSegments(layout, segments, replacement),
    panePath: childPath(panePath, 1),
  };
}

function addToPaneByPath(layout: LayoutNode, targetPanePath: string, viewId: string): LayoutNode {
  const segments = pathSegments(targetPanePath);
  if (segments === null) {
    throw createAppError('E_VALIDATION', 'The target pane does not exist.');
  }
  function add(node: LayoutNode, rest: readonly number[]): LayoutNode {
    if (rest.length === 0) {
      if (!isPaneNode(node)) {
        throw createAppError('E_VALIDATION', 'The target pane does not exist.');
      }
      return {
        ...node,
        viewIds: node.viewIds.includes(viewId) ? node.viewIds : [...node.viewIds, viewId],
        activeViewId: viewId,
      };
    }
    if (!isSplitNode(node)) {
      throw createAppError('E_VALIDATION', 'The target pane does not exist.');
    }
    const [index, ...tail] = rest;
    return index === 0
      ? { ...node, first: add(node.first, tail) }
      : { ...node, second: add(node.second, tail) };
  }
  return add(layout, segments);
}

/** Moves one view to the pane at `targetPanePath`; collapses the source pane if empty. */
export function moveViewToPane(
  layout: LayoutNode,
  viewId: string,
  targetPanePath: string,
): LayoutNode {
  const target = findPaneEntry(layout, targetPanePath);
  const source = findPaneForViewEntry(layout, viewId);
  if (target === null) {
    throw createAppError('E_VALIDATION', 'The target pane does not exist.');
  }
  if (source === null) {
    throw createAppError('E_VALIDATION', 'The view is not in the layout.');
  }
  if (source.path === targetPanePath) {
    return layout;
  }

  function removeOnly(node: LayoutNode): LayoutNode {
    if (isPaneNode(node)) {
      return removeFromPane(node, viewId).pane;
    }
    return { ...node, first: removeOnly(node.first), second: removeOnly(node.second) };
  }

  const withoutView = removeOnly(layout);
  const withView = addToPaneByPath(withoutView, targetPanePath, viewId);
  return pruneEmptyPanes(withView);
}

/** Sets a split ratio by path; the caller validates the 0.2–0.8 range. */
export function setSplitRatio(layout: LayoutNode, splitPath: string, ratio: number): LayoutNode {
  const segments = pathSegments(splitPath);
  if (segments === null) {
    throw createAppError('E_VALIDATION', 'The split path is invalid.');
  }
  function update(node: LayoutNode, rest: readonly number[]): LayoutNode {
    if (rest.length === 0) {
      if (!isSplitNode(node)) {
        throw createAppError('E_VALIDATION', 'The path does not address a split.');
      }
      return { ...node, ratio };
    }
    if (!isSplitNode(node)) {
      throw createAppError('E_VALIDATION', 'The path does not address a split.');
    }
    const [index, ...tail] = rest;
    return index === 0
      ? { ...node, first: update(node.first, tail) }
      : { ...node, second: update(node.second, tail) };
  }
  return update(layout, segments);
}

/**
 * Removes one pane and collapses its parent split. Closing the only pane is
 * rejected; callers keep at least one pane (SPEC §12).
 */
export function removePaneFromLayout(layout: LayoutNode, panePath: string): LayoutNode {
  const segments = pathSegments(panePath);
  if (segments === null || segments.length === 0) {
    throw createAppError('E_VALIDATION', 'The root pane cannot be removed.');
  }
  function remove(node: LayoutNode, rest: readonly number[]): LayoutNode {
    if (!isSplitNode(node)) {
      throw createAppError('E_VALIDATION', 'The pane path does not exist.');
    }
    const [index, ...tail] = rest;
    if (tail.length === 0) {
      return index === 0 ? node.second : node.first;
    }
    return index === 0
      ? { ...node, first: remove(node.first, tail) }
      : { ...node, second: remove(node.second, tail) };
  }
  return pruneEmptyPanes(remove(layout, segments));
}

/** First view id found in the layout, used as a fallback when a view is removed. */
export function firstViewId(layout: LayoutNode): string | null {
  for (const pane of listPanes(layout)) {
    const id = pane.viewIds[0];
    if (id !== undefined) {
      return id;
    }
  }
  return null;
}
