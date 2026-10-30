/**
 * @curve/plugin-sample — reference plugin for the Curve Almanac plugin SDK.
 *
 * Demonstrates the two contribution points that do not need app internals:
 * a semantic field type (`rating`, stored as a number) and a JSON importer
 * (`{points:[{x,y}]}`). It depends on `@curve/plugin-sdk` and `@curve/domain`
 * only (SPEC §4.3.6) and is registered in the desktop renderer assembly point
 * (SPEC §14.1).
 */

export const PACKAGE_NAME = '@curve/plugin-sample' as const;

export {
  POINTS_IMPORTER_ID,
  POINTS_IMPORTER_LABEL,
  parsePointsJson,
  pointsImporter,
} from './points-importer';
export {
  RATING_FIELD_TYPE_ID,
  RATING_INVALID_MESSAGE,
  RATING_MAX,
  RATING_MIN,
  RATING_STAR,
  compareRatings,
  formatRating,
  isRatingValue,
  parseRatingText,
  ratingFieldType,
  validateRating,
} from './rating';
export type { RatingParseResult } from './rating';
export {
  SAMPLE_PLUGIN_ID,
  SAMPLE_PLUGIN_NAME,
  SAMPLE_PLUGIN_VERSION,
  registerSampleContributions,
  sampleFieldTypes,
  samplePlugin,
} from './plugin';
