/**
 * File-name and byte helpers for `.curvestyle.json` transfer (T3.5).
 *
 * The main process owns the dialogs and file IO; the renderer only turns a
 * chosen file into text and picks a safe default name for export.
 */

const UNSAFE_FILE_CHARS = /[\\/:*?"<>|\u0000-\u001f]/g;
const MAX_BASE_LENGTH = 80;

/** `My report` → `My report.curvestyle.json`; path-unsafe characters become `-`. */
export function styleExportFileName(name: string): string {
  const cleaned = name.replace(UNSAFE_FILE_CHARS, '-').trim().slice(0, MAX_BASE_LENGTH);
  return `${cleaned === '' ? 'style' : cleaned}.curvestyle.json`;
}

/** Last path segment for either separator, used only for status messages. */
export function fileNameFromPath(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] ?? path;
}

/** UTF-8 decode without failing on a BOM; invalid bytes surface as JSON errors. */
export function decodeStyleFileBytes(bytes: Uint8Array): string {
  return new TextDecoder('utf-8').decode(bytes).replace(/^\uFEFF/, '');
}
