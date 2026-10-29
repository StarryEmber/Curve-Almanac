import {
  checkInvariants,
  createAppError,
  createTimestamp,
  createWorkspaceId,
  DEFAULT_TABLE_STYLE_ID,
  isId,
  parseManifest,
} from '@curve/domain';
import type {
  LayoutNode,
  UuidFactory,
  ValidationIssue,
  WorkspaceManifest,
  WorkspaceSettings,
} from '@curve/domain';

import { findManifestPathIssues } from './layout';

export interface CreateEmptyManifestOptions {
  name: string;
  appVersion: string;
  now?: Date;
  uuid?: UuidFactory;
  /** T5.5: initial workspace settings (new workspaces inherit app preferences). */
  settings?: Partial<WorkspaceSettings>;
}

export interface ValidatedManifest {
  manifest: WorkspaceManifest;
  warnings: string[];
}

export interface ValidateManifestOptions {
  /** When present, the manifest id must match this open workspace id. */
  workspaceId?: string;
}

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
      theme: options.settings?.theme ?? 'system',
      locale: options.settings?.locale ?? 'zh-CN',
      defaultTableStyleId: options.settings?.defaultTableStyleId ?? DEFAULT_TABLE_STYLE_ID,
      autosave: options.settings?.autosave ?? true,
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
 * Rebuilds a single-pane layout from the manifest's view list. Used only when a
 * persisted layout cannot be loaded (missing/duplicate view refs, bad ratio,
 * too many panes): SPEC §12/§19 require falling back to one pane without losing
 * any view. The original manifest is never rewritten here; the next save writes
 * the repaired layout.
 */
function fallbackLayoutOf(
  value: Record<string, unknown>,
): Extract<LayoutNode, { type: 'pane' }> | null {
  const views = value['views'];
  if (!Array.isArray(views)) {
    return null;
  }
  const viewIds: string[] = [];
  for (const view of views) {
    if (!isRecord(view)) {
      continue;
    }
    const id = view['id'];
    if (typeof id === 'string' && isId('viw', id) && !viewIds.includes(id)) {
      viewIds.push(id);
    }
  }
  return { type: 'pane', viewIds, activeViewId: viewIds[0] ?? null };
}

function validateWithLayoutFallback(value: Record<string, unknown>): ValidatedManifest | null {
  const fallback = fallbackLayoutOf(value);
  if (fallback === null) {
    return null;
  }
  try {
    const validated = validateManifest({ ...value, layout: fallback });
    return {
      manifest: validated.manifest,
      warnings: [
        ...validated.warnings,
        `layout was invalid; restored a single pane with ${String(fallback.viewIds.length)} view(s)`,
      ],
    };
  } catch {
    return null;
  }
}

/**
 * Reads `manifest.json` text. The version check happens before Zod so a future
 * `formatVersion` maps to `E_WS_VERSION_UNSUPPORTED` rather than a generic
 * validation error (SPEC §7.6, AGENTS §2.2).
 *
 * A layout that fails to load (bad references/ratio/pane count) is repaired to
 * a single pane containing every view, with a warning (SPEC §12/§19). Other
 * invalid fields still reject the manifest.
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
        'This workspace was created by a newer version of the application.',
        { detail: `formatVersion=${String(version)}` },
      );
    }
  }

  try {
    return validateManifest(value);
  } catch (error) {
    if (!isRecord(value)) {
      throw error;
    }
    const recovered = validateWithLayoutFallback(value);
    if (recovered === null) {
      throw error;
    }
    return recovered;
  }
}

/** Pretty JSON with a trailing newline; UTF-8 without BOM is the caller's job. */
export function serializeManifest(manifest: WorkspaceManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}
