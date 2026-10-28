/**
 * Command palette (T5.4, ADR-049).
 *
 * The component is a thin view over `searchCommandItems`: it renders the
 * dialog/combobox/listbox, translates labels and disabled reasons, and forwards
 * run/close. All availability and search logic stays in pure modules.
 */

import { useEffect, useId, useMemo, useRef, useState } from 'react';

import { Dialog, Input } from '@curve/ui';

import { useI18n } from '../../i18n';

import { searchCommandItems } from './command-search';
import { disabledReasonKey } from './commands';
import { formatShortcut } from './shortcut';

import type { PaletteCommandItem } from './palette-model';
import type { KeyboardEvent, ReactElement } from 'react';

export interface CommandPaletteProps {
  open: boolean;
  items: readonly PaletteCommandItem[];
  onClose: () => void;
  onRun: (commandId: string) => void;
}

interface LocalizedItem extends PaletteCommandItem {
  label: string;
}

export function CommandPalette({ open, items, onClose, onRun }: CommandPaletteProps): ReactElement {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<Array<HTMLLIElement | null>>([]);
  const listboxId = useId();

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
    }
  }, [open]);

  const localized = useMemo<LocalizedItem[]>(
    () => items.map((item) => ({ ...item, label: t(item.labelKey) })),
    [items, t],
  );
  const visible = useMemo(() => searchCommandItems(localized, query), [localized, query]);
  const safeIndex = visible.length === 0 ? 0 : Math.min(activeIndex, visible.length - 1);
  const active = visible[safeIndex];

  useEffect(() => {
    optionRefs.current[safeIndex]?.scrollIntoView?.({ block: 'nearest' });
  }, [safeIndex, visible.length]);

  const optionId = (index: number): string => `${listboxId}-option-${String(index)}`;

  const move = (delta: 1 | -1): void => {
    if (visible.length === 0) {
      return;
    }
    setActiveIndex((current) => {
      const start = Math.min(current, visible.length - 1);
      return (start + delta + visible.length) % visible.length;
    });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      move(1);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      move(-1);
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      setActiveIndex(Math.max(0, visible.length - 1));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (active !== undefined && active.reason === null) {
        onRun(active.id);
      }
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  };

  const isRecent = query.trim().length === 0;

  return (
    <Dialog
      open={open}
      title={t('commandPalette.title')}
      description={t('commandPalette.description')}
      closeLabel={t('shell.help.close')}
      onClose={onClose}
      initialFocusRef={inputRef}
      className="cs-command-palette"
    >
      <div data-testid="command-palette">
        <Input
          ref={inputRef}
          label={t('commandPalette.searchLabel')}
          className="cs-command-palette__search"
          value={query}
          placeholder={t('commandPalette.searchPlaceholder')}
          autoComplete="off"
          spellCheck={false}
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={active === undefined ? undefined : optionId(safeIndex)}
          data-testid="command-palette-input"
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={handleKeyDown}
        />

        {visible.length === 0 ? (
          <p className="cs-command-palette__empty" role="status">
            {t('commandPalette.empty')}
          </p>
        ) : (
          <ul
            id={listboxId}
            role="listbox"
            aria-label={t('commandPalette.listLabel')}
            className="cs-command-palette__list"
            data-testid="command-palette-list"
          >
            {visible.map((item, index) => (
              <li
                key={item.id}
                ref={(element) => {
                  optionRefs.current[index] = element;
                }}
                id={optionId(index)}
                role="option"
                aria-selected={index === safeIndex}
                aria-disabled={item.reason !== null}
                data-command-id={item.id}
                data-command-recent={isRecent && item.recentRank !== null ? 'true' : 'false'}
                className="cs-command-palette__option"
                onMouseDown={(event) => {
                  event.preventDefault();
                }}
                onMouseEnter={() => {
                  setActiveIndex(index);
                }}
                onClick={() => {
                  if (item.reason === null) {
                    onRun(item.id);
                  }
                }}
              >
                <span className="cs-command-palette__label">{item.label}</span>
                {isRecent && item.recentRank !== null ? (
                  <span className="cs-command-palette__recent">{t('commandPalette.recent')}</span>
                ) : null}
                {item.reason === null ? null : (
                  <span className="cs-command-palette__reason">
                    {t(disabledReasonKey(item.reason))}
                  </span>
                )}
                {item.shortcuts.length === 0 ? null : (
                  <kbd className="cs-kbd cs-command-palette__shortcut">
                    {formatShortcut(item.shortcuts[0] ?? '')}
                  </kbd>
                )}
              </li>
            ))}
          </ul>
        )}

        <p className="cs-command-palette__hint">{t('commandPalette.hint')}</p>
      </div>
    </Dialog>
  );
}
