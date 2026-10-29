/**
 * Unsaved-changes prompt for autosave-off mode (T5.5, SPEC §12 / ADR-050).
 *
 * With autosave on the quit handshake flushes silently (T5.3). With autosave
 * off, document changes intentionally stay in memory, so closing the window or
 * the workspace must ask Save / Discard / Cancel. Both entry points go through
 * this provider so the decision is implemented once.
 */

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

import { Button, Dialog } from '@curve/ui';

import { useAppState, useRendererCore } from '../../app-core/use-app-core';
import { useI18n } from '../../i18n';
import { useSettings } from '../settings/SettingsProvider';

import type { ReactElement, ReactNode } from 'react';

export type UnsavedChangesAction = 'quit' | 'close-workspace';
export type UnsavedChangesChoice = 'save' | 'discard' | 'cancel';

export interface UnsavedChangesGuard {
  /**
   * Returns `save` when there is nothing to ask about (autosave on, or no
   * unsaved changes), otherwise waits for the user's choice.
   */
  request(action: UnsavedChangesAction): Promise<UnsavedChangesChoice>;
}

const UnsavedChangesContext = createContext<UnsavedChangesGuard | null>(null);

interface Waiter {
  resolve(choice: UnsavedChangesChoice): void;
}

export interface UnsavedChangesProviderProps {
  children: ReactNode;
}

/**
 * Owns the modal and the promises of every caller waiting for a decision. Two
 * near-simultaneous requests (for example a window close while the workspace
 * close prompt is open) share the same answer instead of stacking dialogs.
 */
export function UnsavedChangesProvider({ children }: UnsavedChangesProviderProps): ReactElement {
  const { t } = useI18n();
  const { settings } = useSettings();
  const { core } = useRendererCore();
  const unsaved = useAppState((state) => state.ui.save.unsaved);
  const [pending, setPending] = useState<UnsavedChangesAction | null>(null);
  const waitersRef = useRef<Waiter[]>([]);
  const saveButtonRef = useRef<HTMLButtonElement>(null);

  const request = useCallback(
    (action: UnsavedChangesAction): Promise<UnsavedChangesChoice> => {
      // Ask the queue directly as well: a quit request can arrive in the same
      // tick as an edit, before the React snapshot has caught up.
      const queueDirty = core.hasUnsavedChanges?.() ?? false;
      if (settings.autosave || (!unsaved && !queueDirty)) {
        return Promise.resolve('save');
      }
      setPending(action);
      return new Promise<UnsavedChangesChoice>((resolve) => {
        waitersRef.current.push({ resolve });
      });
    },
    [core, settings.autosave, unsaved],
  );

  const choose = (choice: UnsavedChangesChoice): void => {
    const waiters = waitersRef.current;
    waitersRef.current = [];
    setPending(null);
    for (const waiter of waiters) {
      waiter.resolve(choice);
    }
  };

  const guard = useMemo<UnsavedChangesGuard>(() => ({ request }), [request]);

  return (
    <UnsavedChangesContext.Provider value={guard}>
      {children}
      <Dialog
        open={pending !== null}
        title={t('unsaved.title')}
        description={pending === 'close-workspace' ? t('unsaved.bodyClose') : t('unsaved.bodyQuit')}
        closeLabel={t('common.close')}
        onClose={() => {
          choose('cancel');
        }}
        initialFocusRef={saveButtonRef}
        className="cs-unsaved-dialog"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                choose('cancel');
              }}
            >
              {t('unsaved.cancel')}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                choose('discard');
              }}
            >
              {t('unsaved.discard')}
            </Button>
            <Button
              ref={saveButtonRef}
              onClick={() => {
                choose('save');
              }}
            >
              {t('unsaved.save')}
            </Button>
          </>
        }
      >
        <p className="cs-unsaved-dialog__hint">{t('unsaved.hint')}</p>
      </Dialog>
    </UnsavedChangesContext.Provider>
  );
}

export function useUnsavedChangesGuard(): UnsavedChangesGuard {
  const value = useContext(UnsavedChangesContext);
  if (value === null) {
    throw new Error('useUnsavedChangesGuard must be used inside <UnsavedChangesProvider>');
  }
  return value;
}
