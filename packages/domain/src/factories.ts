/**
 * Id factories (SPEC §6).
 *
 * Every persisted object gets `<prefix>_<uuid>`. The UUID source is injectable
 * so tests (and deterministic fixtures) can produce stable ids without touching
 * a global; production code uses `crypto.randomUUID()`, which both Electron's
 * renderer and Node expose.
 */

export type IdPrefix = 'ws' | 'tbl' | 'col' | 'row' | 'cht' | 'viw' | 'sty' | 'rule';

export type UuidFactory = () => string;

interface CryptoLike {
  randomUUID?: () => string;
}

const ID_PATTERNS: Record<IdPrefix, RegExp> = {
  ws: /^ws_[A-Za-z0-9][A-Za-z0-9_-]*$/,
  tbl: /^tbl_[A-Za-z0-9][A-Za-z0-9_-]*$/,
  col: /^col_[A-Za-z0-9][A-Za-z0-9_-]*$/,
  row: /^row_[A-Za-z0-9][A-Za-z0-9_-]*$/,
  cht: /^cht_[A-Za-z0-9][A-Za-z0-9_-]*$/,
  viw: /^viw_[A-Za-z0-9][A-Za-z0-9_-]*$/,
  sty: /^sty_[A-Za-z0-9][A-Za-z0-9_-]*$/,
  rule: /^rule_[A-Za-z0-9][A-Za-z0-9_-]*$/,
};

/** Default UUID source: the platform CSPRNG. Throws if the runtime has none. */
export function randomUuid(): string {
  const source = (globalThis as { crypto?: CryptoLike }).crypto;
  const value = source?.randomUUID?.();
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('crypto.randomUUID() is unavailable; pass a uuid factory explicitly');
  }
  return value;
}

export function createId(prefix: IdPrefix, uuid: UuidFactory = randomUuid): string {
  return `${prefix}_${uuid()}`;
}

export function createWorkspaceId(uuid: UuidFactory = randomUuid): string {
  return createId('ws', uuid);
}

export function createTableId(uuid: UuidFactory = randomUuid): string {
  return createId('tbl', uuid);
}

export function createColumnId(uuid: UuidFactory = randomUuid): string {
  return createId('col', uuid);
}

export function createRowId(uuid: UuidFactory = randomUuid): string {
  return createId('row', uuid);
}

export function createChartId(uuid: UuidFactory = randomUuid): string {
  return createId('cht', uuid);
}

export function createViewId(uuid: UuidFactory = randomUuid): string {
  return createId('viw', uuid);
}

export function createStyleId(uuid: UuidFactory = randomUuid): string {
  return createId('sty', uuid);
}

export function createRuleId(uuid: UuidFactory = randomUuid): string {
  return createId('rule', uuid);
}

/** True when `value` is an id with the expected prefix. */
export function isId(prefix: IdPrefix, value: string): boolean {
  return ID_PATTERNS[prefix].test(value);
}

/** ISO 8601 timestamp for `createdAt`/`updatedAt`; injectable for tests. */
export function createTimestamp(now: Date = new Date()): string {
  return now.toISOString();
}
