/**
 * React bindings for the plugin registries (T6.3).
 *
 * T5.4 kept the shell from subscribing to the document store for performance
 * reasons; the plugin registries are cheap (a handful of entries) but the same
 * rule applies: a closed dialog must not stay subscribed. Callers pass whether
 * their surface is open, and the subscription exists only while it is.
 */

import { useEffect, useState } from 'react';

import { listPluginLog, subscribePluginLog } from './log';

import { readPluginSnapshot, subscribePluginChanges } from './index';

import type { PluginSnapshot } from './index';
import type { PluginLogEntry } from './log';

/** Live registry snapshot; subscribes only while `enabled` is true. */
export function usePluginSnapshot(enabled = true): PluginSnapshot {
  const [snapshot, setSnapshot] = useState<PluginSnapshot>(readPluginSnapshot);

  useEffect(() => {
    setSnapshot(readPluginSnapshot());
    if (!enabled) {
      return undefined;
    }
    return subscribePluginChanges(() => {
      setSnapshot(readPluginSnapshot());
    });
  }, [enabled]);

  return snapshot;
}

/** Live plugin log ring; subscribes only while `enabled` is true. */
export function usePluginLog(enabled = true): readonly PluginLogEntry[] {
  const [entries, setEntries] = useState<readonly PluginLogEntry[]>(listPluginLog);

  useEffect(() => {
    setEntries(listPluginLog());
    if (!enabled) {
      return undefined;
    }
    return subscribePluginLog(() => {
      setEntries(listPluginLog());
    });
  }, [enabled]);

  return entries;
}
