/**
 * Largest-Triangle-Three-Buckets downsampling (T4.2, SPEC §11.2.6–7, ADR-041).
 *
 * Sampling happens once, inside `@curve/chart-model`, while the RenderModel is
 * built; `@curve/chart-echarts` must never sample again. The algorithm treats
 * the series' point order as its x order, so a sampled series is always a
 * subsequence of the sorted (or physical) rows and LTTB never reorders points.
 *
 * `null` is a gap (SPEC §11.2.4), not a zero: gaps are excluded from the
 * triangle-area candidates, are never returned as retained indices, and stay
 * `null` in the RenderModel.
 */

/** The sampling knob persisted on a chart (`ChartOptions['sampling']`). */
export interface SamplingOptions {
  enabled: boolean;
  threshold: number;
  target: number;
}

/** Fewer than three retained points cannot describe a bucket triangle. */
const MIN_BUCKET_TARGET = 3;

interface ValidPoint {
  /** Index in the caller's arrays. */
  index: number;
  x: number;
  y: number;
}

function validateTarget(target: number): void {
  if (!Number.isInteger(target) || target < 1) {
    throw new RangeError(`LTTB target must be a positive integer, received ${String(target)}.`);
  }
}

function collectValidPoints(
  xValues: readonly number[],
  yValues: readonly (number | null)[],
): ValidPoint[] {
  if (xValues.length !== yValues.length) {
    throw new RangeError(
      `LTTB needs aligned arrays, received ${String(xValues.length)} x and ` +
        `${String(yValues.length)} y values.`,
    );
  }
  const points: ValidPoint[] = [];
  for (let index = 0; index < xValues.length; index += 1) {
    const x = xValues[index];
    const y = yValues[index];
    if (x === undefined || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) {
      continue;
    }
    points.push({ index, x, y });
  }
  return points;
}

/**
 * Returns the ascending original indices retained by LTTB (SPEC §11.2.6–7).
 *
 * - The first and last non-null point are always kept (SPEC §11.2.7).
 * - `null`/non-finite y values are gaps: they neither form nor bias a triangle.
 * - When the series has at most `target` real points nothing is dropped.
 * - `target` 1 and 2 degenerate to the first (and last) point; targets below 3
 *   cannot form a bucket triangle and are clamped the same way.
 *
 * Throws `RangeError` for a non-positive/non-integer target or misaligned
 * arrays: both are programming errors, not user input (the persisted
 * `sampling` object is already schema-validated).
 */
export function lttbIndices(
  xValues: readonly number[],
  yValues: readonly (number | null)[],
  target: number,
): number[] {
  validateTarget(target);
  const points = collectValidPoints(xValues, yValues);
  const firstIndex = points[0]?.index;
  const lastIndex = points[points.length - 1]?.index;
  if (firstIndex === undefined || lastIndex === undefined) {
    return [];
  }
  if (points.length <= target) {
    return points.map((point) => point.index);
  }
  if (target < MIN_BUCKET_TARGET) {
    return target === 1 ? [firstIndex] : [firstIndex, lastIndex];
  }

  const sampled: number[] = [firstIndex];
  const every = (points.length - 2) / (target - 2);
  let anchor = 0;

  for (let bucket = 0; bucket < target - 2; bucket += 1) {
    // The next bucket's mean becomes the third vertex of the triangle.
    const averageStart = Math.floor((bucket + 1) * every) + 1;
    const averageEnd = Math.min(Math.floor((bucket + 2) * every) + 1, points.length);
    let averageX = 0;
    let averageY = 0;
    let averageCount = 0;
    for (let index = averageStart; index < averageEnd; index += 1) {
      const point = points[index];
      if (point === undefined) {
        continue;
      }
      averageX += point.x;
      averageY += point.y;
      averageCount += 1;
    }
    if (averageCount > 0) {
      averageX /= averageCount;
      averageY /= averageCount;
    } else {
      averageX = points[points.length - 1]?.x ?? 0;
      averageY = points[points.length - 1]?.y ?? 0;
    }

    const rangeStart = Math.floor(bucket * every) + 1;
    // The final point is reserved for the tail, so the range stops before it.
    const rangeEnd = Math.min(Math.floor((bucket + 1) * every) + 1, points.length - 1);
    const anchorPoint = points[anchor];
    let bestIndex = rangeStart;
    if (anchorPoint !== undefined) {
      let bestArea = -1;
      for (let index = rangeStart; index < rangeEnd; index += 1) {
        const point = points[index];
        if (point === undefined) {
          continue;
        }
        // Twice the triangle area; the factor is constant for the comparison.
        const area = Math.abs(
          (anchorPoint.x - averageX) * (point.y - anchorPoint.y) -
            (anchorPoint.x - point.x) * (averageY - anchorPoint.y),
        );
        if (area > bestArea) {
          bestArea = area;
          bestIndex = index;
        }
      }
    }
    const bestPoint = points[bestIndex];
    if (bestPoint === undefined) {
      continue;
    }
    sampled.push(bestPoint.index);
    anchor = bestIndex;
  }

  sampled.push(lastIndex);
  return sampled;
}

/**
 * Decides whether one series must be sampled (SPEC §11.2.6, ADR-041).
 *
 * Returns `null` when the series must be rendered exactly as resolved
 * (sampling disabled, real point count within `threshold`, or `target` not
 * smaller than the series). Otherwise returns the ascending retained indices.
 */
export function sampleSeriesIndices(
  xValues: readonly number[],
  values: readonly (number | null)[],
  options: SamplingOptions,
): number[] | null {
  if (!options.enabled) {
    return null;
  }
  let pointCount = 0;
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      pointCount += 1;
    }
  }
  if (pointCount <= options.threshold || pointCount <= options.target) {
    return null;
  }
  return lttbIndices(xValues, values, options.target);
}
