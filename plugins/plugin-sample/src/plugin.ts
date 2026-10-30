/**
 * The example plugin definition (T6.2, SPEC §14.1).
 *
 * It is statically imported by the desktop renderer assembly point; the host
 * activates it at startup and rolls its contributions back if activation fails
 * (T6.1/ADR-052). `sampleFieldTypes` is also read by the main process, which
 * needs the semantic storage types to validate a manifest before the renderer
 * exists (SPEC §14.3 "fieldTypeId 必须能解析").
 */

import type { FieldTypeDef, PluginContext, PluginDefinition } from '@curve/plugin-sdk';

import { POINTS_IMPORTER_ID, pointsImporter } from './points-importer';
import { ratingFieldType } from './rating';

export const SAMPLE_PLUGIN_ID = 'com.curvealmanac.sample';
export const SAMPLE_PLUGIN_NAME = 'Sample: Rating & Points';
export const SAMPLE_PLUGIN_VERSION = '1.0.0';

/** Field types this plugin owns; the single source of truth for both processes. */
export const sampleFieldTypes: readonly FieldTypeDef[] = [ratingFieldType];

/** Registers this plugin's contributions into the host registries. */
export function registerSampleContributions(
  context: Pick<PluginContext, 'fields' | 'importers'>,
): void {
  for (const fieldType of sampleFieldTypes) {
    context.fields.register(fieldType.id, fieldType);
  }
  context.importers.register(POINTS_IMPORTER_ID, pointsImporter);
}

export const samplePlugin: PluginDefinition = {
  id: SAMPLE_PLUGIN_ID,
  name: SAMPLE_PLUGIN_NAME,
  version: SAMPLE_PLUGIN_VERSION,
  apiVersion: '1.0',
  activate(context: PluginContext): void {
    registerSampleContributions(context);
  },
};
