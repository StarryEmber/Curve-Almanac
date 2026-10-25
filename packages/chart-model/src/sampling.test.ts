import { describe, expect, it } from 'vitest';

import { lttbIndices, sampleSeriesIndices } from '@curve/chart-model';
import type { SamplingOptions } from '@curve/chart-model';

/* -------------------------------------------------------------------------- */
/* Deterministic fixtures (no clock, no randomness)                           */
/* -------------------------------------------------------------------------- */

/** Deterministic LCG so property checks stay reproducible. */
function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 4_294_967_296;
  };
}

function ramp(count: number): { x: number[]; y: number[] } {
  const x: number[] = [];
  const y: number[] = [];
  for (let index = 0; index < count; index += 1) {
    x.push(index);
    y.push((index % 37) * 1.5);
  }
  return { x, y };
}

/** Flat baseline with one isolated spike, used for the peak-preservation check. */
function spike(count: number, spikeIndex: number): { x: number[]; y: number[] } {
  const x: number[] = [];
  const y: number[] = [];
  for (let index = 0; index < count; index += 1) {
    x.push(index);
    y.push(index === spikeIndex ? 1_000 : 1);
  }
  return { x, y };
}

function nonNullCount(values: readonly (number | null)[]): number {
  let count = 0;
  for (const value of values) {
    if (value !== null) {
      count += 1;
    }
  }
  return count;
}

const ENABLED: SamplingOptions = { enabled: true, threshold: 2_000, target: 2_000 };

/* -------------------------------------------------------------------------- */
/* lttbIndices (SPEC §11.2.6–7)                                               */
/* -------------------------------------------------------------------------- */

describe('lttbIndices', () => {
  it('keeps exactly the target number of points for a dense series', () => {
    const { x, y } = ramp(1_000);
    const indices = lttbIndices(x, y, 100);

    expect(indices).toHaveLength(100);
    expect(indices[0]).toBe(0);
    expect(indices[99]).toBe(999);
    expect(new Set(indices).size).toBe(100);
  });

  it('returns every index when the series already fits the target', () => {
    const { x, y } = ramp(10);
    expect(lttbIndices(x, y, 10)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(lttbIndices(x, y, 50)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('preserves an isolated peak', () => {
    const { x, y } = spike(1_000, 500);
    const indices = lttbIndices(x, y, 40);
    expect(indices).toContain(500);
  });

  it('clamps tiny targets to the first and last point', () => {
    const { x, y } = ramp(100);
    expect(lttbIndices(x, y, 1)).toEqual([0]);
    expect(lttbIndices(x, y, 2)).toEqual([0, 99]);
  });

  it('keeps first and last point for target 3', () => {
    const { x, y } = ramp(100);
    const indices = lttbIndices(x, y, 3);
    expect(indices).toHaveLength(3);
    expect(indices[0]).toBe(0);
    expect(indices[2]).toBe(99);
  });

  it('returns an empty list for an empty series', () => {
    expect(lttbIndices([], [], 10)).toEqual([]);
  });

  it('ignores null y values and never returns a null point', () => {
    const x: number[] = [];
    const y: (number | null)[] = [];
    for (let index = 0; index < 1_000; index += 1) {
      x.push(index);
      y.push(index % 3 === 0 ? null : Math.sin(index / 25) * 10);
    }
    const indices = lttbIndices(x, y, 50);

    expect(indices.length).toBeLessThanOrEqual(50);
    expect(indices[0]).toBe(1);
    expect(indices[indices.length - 1]).toBe(998);
    for (const index of indices) {
      expect(y[index]).not.toBeNull();
    }
  });

  it('keeps every non-null point when the null-free count fits the target', () => {
    const x = [0, 1, 2, 3, 4, 5];
    const y: (number | null)[] = [1, null, 2, null, 3, null];
    expect(lttbIndices(x, y, 3)).toEqual([0, 2, 4]);
    expect(lttbIndices(x, y, 10)).toEqual([0, 2, 4]);
  });

  it('stays deterministic and ascending with duplicate x values', () => {
    const x: number[] = [];
    const y: number[] = [];
    for (let index = 0; index < 500; index += 1) {
      x.push(Math.floor(index / 2));
      y.push((index % 11) - 5);
    }
    const first = lttbIndices(x, y, 25);
    const second = lttbIndices(x, y, 25);

    expect(second).toEqual(first);
    expect(first).toHaveLength(25);
    for (let index = 1; index < first.length; index += 1) {
      expect(first[index]).toBeGreaterThan(first[index - 1] ?? -1);
      expect(x[first[index] ?? 0]).toBeGreaterThanOrEqual(x[first[index - 1] ?? 0] ?? Number.NaN);
    }
  });

  it('rejects malformed requests instead of guessing', () => {
    expect(() => lttbIndices([0, 1], [1, 2], 0)).toThrow(RangeError);
    expect(() => lttbIndices([0, 1], [1, 2], 1.5)).toThrow(RangeError);
    expect(() => lttbIndices([0, 1], [1], 2)).toThrow(RangeError);
  });

  it('property: sampled points stay within target, ascending and non-null', () => {
    const random = createRandom(7);
    const x: number[] = [];
    const y: (number | null)[] = [];
    let value = 0;
    for (let index = 0; index < 5_000; index += 1) {
      value += random() * 4 - 2;
      x.push(index > 0 && index % 100 === 0 ? (x[index - 1] ?? 0) : index * 10);
      y.push(index > 0 && index % 97 === 0 ? null : value);
    }
    const valid = nonNullCount(y);

    for (const target of [10, 100, 1_000]) {
      const indices = lttbIndices(x, y, target);
      expect(indices.length).toBeLessThanOrEqual(target);
      expect(indices.length).toBe(Math.min(target, valid));
      expect(indices[0]).toBe(0);
      expect(indices[indices.length - 1]).toBe(4_999);

      for (let index = 1; index < indices.length; index += 1) {
        const previous = indices[index - 1] ?? -1;
        const current = indices[index] ?? -1;
        expect(current).toBeGreaterThan(previous);
        expect(y[current]).not.toBeNull();
        expect(x[current]).toBeGreaterThanOrEqual(x[previous] ?? Number.NaN);
      }
    }
  });

  it('downsamples a 100k series to 2k points', () => {
    const x: number[] = [];
    const y: number[] = [];
    for (let index = 0; index < 100_000; index += 1) {
      x.push(index);
      y.push(Math.sin(index / 300) * 100 + (index % 500) / 50);
    }
    const indices = lttbIndices(x, y, 2_000);

    expect(indices).toHaveLength(2_000);
    expect(indices[0]).toBe(0);
    expect(indices[1_999]).toBe(99_999);
  });
});

/* -------------------------------------------------------------------------- */
/* sampleSeriesIndices — the per-series decision (SPEC §11.2.6)               */
/* -------------------------------------------------------------------------- */

describe('sampleSeriesIndices', () => {
  it('returns null when sampling is disabled', () => {
    const { x, y } = ramp(5_000);
    expect(sampleSeriesIndices(x, y, { ...ENABLED, enabled: false })).toBeNull();
  });

  it('returns null when the point count is within the threshold', () => {
    const { x, y } = ramp(2_000);
    expect(sampleSeriesIndices(x, y, ENABLED)).toBeNull();

    const above = ramp(2_001);
    expect(sampleSeriesIndices(above.x, above.y, ENABLED)).toHaveLength(2_000);
  });

  it('counts only non-null points against the threshold', () => {
    const x: number[] = [];
    const y: (number | null)[] = [];
    for (let index = 0; index < 3_000; index += 1) {
      x.push(index);
      y.push(index % 2 === 0 ? index : null);
    }
    // 1,500 real points: below the 2,000 threshold, so no sampling.
    expect(sampleSeriesIndices(x, y, ENABLED)).toBeNull();
  });

  it('returns null when the target is not smaller than the point count', () => {
    const { x, y } = ramp(3_000);
    expect(sampleSeriesIndices(x, y, { enabled: true, threshold: 100, target: 3_000 })).toBeNull();
  });

  it('returns the retained indices for an oversized series', () => {
    const { x, y } = ramp(10_000);
    const indices = sampleSeriesIndices(x, y, { enabled: true, threshold: 500, target: 400 });
    expect(indices).toHaveLength(400);
  });
});
