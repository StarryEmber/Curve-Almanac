/**
 * Empty-state card shared by the three T4.5 chart states (ADR-044 §2):
 * no table, unmapped/invalid mapping and resolvable-but-no-points.
 */

import { Button } from '@curve/ui';

import type { ReactElement, ReactNode } from 'react';

export type ChartEmptyKind = 'no-table' | 'unmapped' | 'no-data';

export interface ChartEmptyStateProps {
  kind: ChartEmptyKind;
  title: string;
  body: string;
  actionLabel: string;
  onAction: () => void;
  /** Optional extra content (e.g. the inline remap editor). */
  children?: ReactNode;
}

export function ChartEmptyState({
  kind,
  title,
  body,
  actionLabel,
  onAction,
  children,
}: ChartEmptyStateProps): ReactElement {
  return (
    <div className="cs-chart-empty" data-testid="chart-empty-state" data-chart-empty={kind}>
      <h3 className="cs-chart-empty__title">{title}</h3>
      <p className="cs-chart-empty__body">{body}</p>
      <Button variant="primary" data-testid={`chart-empty-action-${kind}`} onClick={onAction}>
        {actionLabel}
      </Button>
      {children}
    </div>
  );
}
