import type { AppError } from '@curve/domain';
import type { ImportIssue, ImportStats } from '@curve/table-engine';

/** The plan summary the wizard renders; accepted rows stay in a ref. */
export type ImportPlanView =
  | {
      ok: true;
      stats: ImportStats;
      issues: readonly ImportIssue[];
      totalIssues: number;
      finalRowCount: number;
    }
  | {
      ok: false;
      error: AppError;
      stats: ImportStats;
      issues: readonly ImportIssue[];
      totalIssues: number;
    };
