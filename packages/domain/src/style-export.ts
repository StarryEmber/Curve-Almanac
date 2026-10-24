/**
 * Portable table-style documents (SPEC §10.5; T3.5).
 *
 * A `.curvestyle.json` file is a thin envelope around one `TableStyle`. The
 * style id and rule ids inside it are placeholders: the importer always assigns
 * a fresh identity so two workspaces never share ids by accident.
 */

import { z } from 'zod';

import { createTimestamp } from './factories';
import { tableStyleSchema, isoTimestampSchema } from './schemas';
import { cloneTableStyle } from './table-style';

import type { TableStyle } from './types';

export const STYLE_EXPORT_KIND = 'curve-table-style';
export const STYLE_EXPORT_VERSION = 1;

/**
 * Upper bound for an imported style document, in characters. Real templates are
 * a few kilobytes; the limit only guards against pathological JSON.
 */
export const MAX_STYLE_EXPORT_LENGTH = 2_000_000;

export interface StyleExportDocument {
  kind: typeof STYLE_EXPORT_KIND;
  version: typeof STYLE_EXPORT_VERSION;
  /** ISO 8601 timestamp with offset, e.g. `2026-10-24T03:00:00.000Z`. */
  exportedAt: string;
  style: TableStyle;
}

export const styleExportDocumentSchema: z.ZodType<StyleExportDocument> = z.strictObject({
  kind: z.literal(STYLE_EXPORT_KIND),
  version: z.literal(STYLE_EXPORT_VERSION),
  exportedAt: isoTimestampSchema,
  style: tableStyleSchema,
});

export interface CreateStyleExportDocumentOptions {
  /** Injected so tests and exports are deterministic. */
  now?: Date;
}

/** Snapshots a style (builtin or user) into a detached export document. */
export function createStyleExportDocument(
  style: TableStyle,
  options: CreateStyleExportDocumentOptions = {},
): StyleExportDocument {
  return {
    kind: STYLE_EXPORT_KIND,
    version: STYLE_EXPORT_VERSION,
    exportedAt: createTimestamp(options.now),
    style: cloneTableStyle(style),
  };
}

/** Stable, human-readable JSON: two-space indent and a trailing newline. */
export function serializeStyleExportDocument(document: StyleExportDocument): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}

export type StyleExportFailureReason = 'tooLarge' | 'json' | 'version' | 'document';

export type ParseStyleExportResult =
  | { readonly ok: true; readonly document: StyleExportDocument }
  | { readonly ok: false; readonly reason: StyleExportFailureReason; readonly detail?: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Parses untrusted `.curvestyle.json` text. Returns a structured failure instead
 * of throwing so the renderer can map each reason to a specific message and the
 * manifest is never touched before validation succeeds (SPEC §10.5).
 */
export function parseStyleExportDocument(text: string): ParseStyleExportResult {
  if (text.length > MAX_STYLE_EXPORT_LENGTH) {
    return { ok: false, reason: 'tooLarge' };
  }

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'json' };
  }

  if (isRecord(value) && 'version' in value && value['version'] !== STYLE_EXPORT_VERSION) {
    return {
      ok: false,
      reason: 'version',
      detail: `unsupported style export version: ${String(value['version'])}`,
    };
  }

  const parsed = styleExportDocumentSchema.safeParse(value);
  if (!parsed.success) {
    return {
      ok: false,
      reason: 'document',
      detail: parsed.error.issues[0]?.message ?? 'invalid style export document',
    };
  }
  return { ok: true, document: parsed.data };
}
