import { useEffect, useRef } from 'react';

import { useImport } from './use-import';

import type { ReactElement } from 'react';

export interface ImportSessionProps {
  tableId: string;
  onDone: () => void;
}

/**
 * Lazy-loaded owner of one import wizard session (T2.5).
 *
 * Keeping this component out of the initial TableList chunk keeps the import UI
 * and Worker client from affecting the 100k grid first-frame budget. The parent
 * mounts it only after the user chooses "Import"; `onDone` unmounts it after
 * success or cancel.
 */
export function ImportSession({ tableId, onDone }: ImportSessionProps): ReactElement {
  const { start, dialogs } = useImport({ onClosed: onDone });
  const started = useRef(false);

  useEffect(() => {
    if (started.current) {
      return;
    }
    started.current = true;
    start(tableId);
  }, [start, tableId]);

  return dialogs;
}
