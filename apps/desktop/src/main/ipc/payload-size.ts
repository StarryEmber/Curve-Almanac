/**
 * Byte-size estimate for an IPC payload (SPEC §15.1: 256 MB per call).
 *
 * Counting strings and buffers is enough to enforce the limit without
 * `JSON.stringify`, which would allocate a copy of the whole payload. The walk
 * is bounded by depth and a visited set because structured clone can send
 * cyclic graphs.
 */

const MAX_DEPTH = 64;
const SMALL_VALUE_BYTES = 8;

export function measurePayloadBytes(value: unknown): number {
  return measure(value, 0, new WeakSet<object>());
}

function measure(value: unknown, depth: number, seen: WeakSet<object>): number {
  if (typeof value === 'string') {
    return Buffer.byteLength(value, 'utf8');
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return SMALL_VALUE_BYTES;
  }
  if (value === null || typeof value !== 'object') {
    return 0;
  }
  if (depth >= MAX_DEPTH || seen.has(value)) {
    return 0;
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return total(value, (entry) => measure(entry, depth + 1, seen));
  }
  if (ArrayBuffer.isView(value)) {
    return value.byteLength;
  }
  if (value instanceof ArrayBuffer) {
    return value.byteLength;
  }
  if (value instanceof Map) {
    let bytes = 0;
    for (const [key, entry] of value) {
      bytes += measure(key, depth + 1, seen) + measure(entry, depth + 1, seen);
    }
    return bytes;
  }
  if (value instanceof Set) {
    let bytes = 0;
    for (const entry of value) {
      bytes += measure(entry, depth + 1, seen);
    }
    return bytes;
  }
  return total(Object.values(value as Record<string, unknown>), (entry) =>
    measure(entry, depth + 1, seen),
  );
}

function total(values: readonly unknown[], sizeOf: (value: unknown) => number): number {
  let bytes = 0;
  for (const value of values) {
    bytes += sizeOf(value);
  }
  return bytes;
}
