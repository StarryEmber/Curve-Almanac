/**
 * Pure layout helpers shared by the table/view commands (T2.1).
 *
 * The store keeps one `LayoutNode` tree (SPEC §12). T2.1 only renders a single
 * pane, but the commands already walk the recursive shape so T5.1 can add splits
 * without rewriting them.
 */

import { createAppError } from '@curve/domain';
import type { LayoutNode } from '@curve/domain';

export type PaneNode = Extract<LayoutNode, { type: 'pane' }>;
export type SplitNode = Extract<LayoutNode, { type: 'split' }>;

export function isPaneNode(node: LayoutNode): node is PaneNode {
  return node.type === 'pane';
}

export function isSplitNode(node: LayoutNode): node is SplitNode {
  return node.type === 'split';
}

/** Depth-first list of panes in visual order. */
export function listPanes(layout: LayoutNode): PaneNode[] {
  if (isPaneNode(layout)) {
    return [layout];
  }
  return [...listPanes(layout.first), ...listPanes(layout.second)];
}

/** The pane that owns the active view, else the first pane, else `null`. */
export function findActivePane(layout: LayoutNode): PaneNode | null {
  const panes = listPanes(layout);
  const active = panes.find((pane) => pane.activeViewId !== null);
  return active ?? panes[0] ?? null;
}

export function findPaneForView(layout: LayoutNode, viewId: string): PaneNode | null {
  return listPanes(layout).find((pane) => pane.viewIds.includes(viewId)) ?? null;
}

/** Adds `viewId` to the active pane (or the first pane) and activates it. */
export function addViewToLayout(layout: LayoutNode, viewId: string): void {
  const pane = findActivePane(layout);
  if (pane === null) {
    throw createAppError('E_WS_INVALID_MANIFEST', 'The layout has no pane.');
  }
  if (!pane.viewIds.includes(viewId)) {
    pane.viewIds.push(viewId);
  }
  pane.activeViewId = viewId;
}

/** Activates an existing view; adds it to a pane when the layout lost it. */
export function activateViewInLayout(layout: LayoutNode, viewId: string): void {
  const pane = findPaneForView(layout, viewId);
  if (pane === null) {
    addViewToLayout(layout, viewId);
    return;
  }
  pane.activeViewId = viewId;
}

/**
 * Removes every reference to `viewId` and picks the nearest remaining view as
 * the pane's active view. Empty panes are kept: T5.1 owns pane lifecycle.
 */
export function removeViewFromLayout(layout: LayoutNode, viewId: string): void {
  for (const pane of listPanes(layout)) {
    const index = pane.viewIds.indexOf(viewId);
    if (index < 0) {
      continue;
    }
    pane.viewIds.splice(index, 1);
    if (pane.activeViewId === viewId) {
      pane.activeViewId = pane.viewIds[index] ?? pane.viewIds[index - 1] ?? null;
    }
  }
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
