import {
  checkInvariants,
  createAppError,
  createTimestamp,
  createWorkspaceId,
  parseManifest,
} from '@curve/domain';
import type { UuidFactory, ValidationIssue, WorkspaceManifest } from '@curve/domain';

import { findManifestPathIssues } from './layout';

export interface CreateEmptyManifestOptions {
  name: string;
  appVersion: string;
  now?: Date;
  uuid?: UuidFactory;
}

export interface ValidatedManifest {
  manifest: WorkspaceManifest;
  warnings: string[];
}

export interface ValidateManifestOptions {
  /** When present, the manifest id must match this open workspace id. */
  workspaceId?: string;
}

const DEFAULT_TABLE_STYLE_ID = 'builtin.report-light';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Renders domain issues without including untrusted values. */
export function formatValidationIssues(issues: readonly ValidationIssue[]): string {
  return issues
    .slice(0, 5)
    .map((issue) => `${issue.path.length > 0 ? issue.path : '<root>'}: ${issue.code}`)
    .join('; ');
}

function invalidManifest(message: string, detail?: string): never {
  throw createAppError(
    'E_WS_INVALID_MANIFEST',
    message,
    detail === undefined ? undefined : { detail },
  );
}

/** Creates the empty manifest written by `workspace:create` (SPEC §6.5/§7.2). */
export function createEmptyManifest(options: CreateEmptyManifestOptions): WorkspaceManifest {
  const name = options.name.trim();
  if (name.length === 0) {
    throw createAppError('E_VALIDATION', 'Workspace name must not be empty.');
  }
  if (options.appVersion.trim().length === 0) {
    throw createAppError('E_VALIDATION', 'App version must not be empty.');
  }

  const now = options.now ?? new Date();
  const timestamp = createTimestamp(now);
  const candidate: WorkspaceManifest = {
    formatVersion: 1,
    id: createWorkspaceId(options.uuid),
    name,
    appVersion: options.appVersion,
    createdAt: timestamp,
    updatedAt: timestamp,
    tables: [],
    charts: [],
    views: [],
    tableStyles: [],
    layout: { type: 'pane', viewIds: [], activeViewId: null },
    settings: {
      theme: 'system',
      locale: 'zh-CN',
      defaultTableStyleId: DEFAULT_TABLE_STYLE_ID,
      autosave: true,
    },
  };

  const parsed = parseManifest(candidate);
  if (!parsed.ok) {
    invalidManifest(
      'The generated workspace manifest is invalid.',
      formatValidationIssues(parsed.issues),
    );
  }
  return parsed.data;
}

/**
 * Structural (Zod) + cross-object invariant validation of a manifest loaded
 * from disk or received over IPC. Never writes anything; throws a typed
 * `E_WS_INVALID_MANIFEST` so the original file stays untouched.
 */
export function validateManifest(
  value: unknown,
  options: ValidateManifestOptions = {},
): ValidatedManifest {
  const parsed = parseManifest(value);
  if (!parsed.ok) {
    invalidManifest(
      'The workspace manifest does not match the format.',
      formatValidationIssues(parsed.issues),
    );
  }

  if (options.workspaceId !== undefined && parsed.data.id !== options.workspaceId) {
    invalidManifest('The manifest id does not match the open workspace.');
  }

  const pathIssues = findManifestPathIssues(parsed.data);
  if (pathIssues.length > 0) {
    invalidManifest('The workspace manifest contains an unsafe table path.', pathIssues[0]);
  }

  const report = checkInvariants(parsed.data);
  if (report.issues.length > 0) {
    invalidManifest(
      'The workspace manifest violates a domain invariant.',
      formatValidationIssues(report.issues),
    );
  }

  return { manifest: parsed.data, warnings: report.warnings };
}

/**
 * Reads `manifest.json` text. The version check happens before Zod so a future
 * `formatVersion` maps to `E_WS_VERSION_UNSUPPORTED` rather than a generic
 * validation error (SPEC §7.6, AGENTS §2.2).
 */
export function parseManifestDocument(raw: string): ValidatedManifest {
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    invalidManifest('The workspace manifest is not valid JSON.');
  }

  if (isRecord(value)) {
    const version = value['formatVersion'];
    if (typeof version === 'number' && Number.isFinite(version) && version > 1) {
      throw createAppError(
        'E_WS_VERSION_UNSUPPORTED',
        'This workspace was created by a newer version of Curve Studio.',
        { detail: `formatVersion=${String(version)}` },
      );
    }
  }

  return validateManifest(value);
}

/** Pretty JSON with a trailing newline; UTF-8 without BOM is the caller's job. */
export function serializeManifest(manifest: WorkspaceManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}
