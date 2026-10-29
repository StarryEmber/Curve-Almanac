/**
 * @curve/plugin-sdk — plugin contract, contribution registries and host.
 *
 * SPEC §14.2/§14.3 define the public surface; ADR-052 records the T6.1
 * additions (`subscribe`, contribution `source`) and the host activator.
 * Plugins import this package (and `@curve/domain` types) only; they must never
 * reach into app internals (SPEC §4.3.6).
 */

export const PACKAGE_NAME = '@curve/plugin-sdk' as const;

export { PLUGIN_API_VERSION, createPluginHost, isCompatibleApiVersion } from './host';
export type * from './types';
