import { useRef } from 'react';

import type { ColumnDef } from '@curve/domain';

import { useI18n } from '../../../i18n';

import { BooleanCellEditor } from './BooleanCellEditor';
import { DateCellEditor } from './DateCellEditor';
import { EnumCellEditor } from './EnumCellEditor';
import { NumberCellEditor } from './NumberCellEditor';
import { TextCellEditor } from './TextCellEditor';

import type { EditorCommitDirection, EditorControlProps } from './editor-control';
import type { KeyboardEvent, ReactElement } from 'react';

export interface CellEditorProps {
  column: ColumnDef;
  value: string;
  error: string | null;
  busy: boolean;
  onChange(value: string): void;
  onCommit(direction: EditorCommitDirection): void;
  onCancel(): void;
  onBlur(): void;
  registerRef(element: HTMLInputElement | HTMLSelectElement | null): void;
}

/**
 * Dispatches to the native editor for the column's storage type and owns the
 * keyboard/composition semantics shared by every control (SPEC §9.2):
 * Enter commits down, Tab/Shift+Tab commits sideways, Esc cancels, and Enter
 * during IME composition never commits.
 */
export function CellEditor(props: CellEditorProps): ReactElement {
  const { t } = useI18n();
  const composing = useRef(false);

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement | HTMLSelectElement>): void => {
    if (event.nativeEvent.isComposing || composing.current) {
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      props.onCommit('down');
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      event.stopPropagation();
      props.onCommit(event.shiftKey ? 'left' : 'right');
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      props.onCancel();
      return;
    }
    // Keep grid navigation from stealing arrow/Home/End keys from the control.
    event.stopPropagation();
  };

  const control: EditorControlProps = {
    label: t('grid.editor.label', { column: props.column.label }),
    value: props.value,
    error: props.error,
    busy: props.busy,
    onChange: props.onChange,
    onKeyDown: handleKeyDown,
    onBlur: props.onBlur,
    onCompositionStart: () => {
      composing.current = true;
    },
    onCompositionEnd: () => {
      composing.current = false;
    },
    registerRef: props.registerRef,
  };

  switch (props.column.type) {
    case 'text':
      return <TextCellEditor {...control} />;
    case 'number':
      return <NumberCellEditor {...control} />;
    case 'date':
      return <DateCellEditor {...control} />;
    case 'boolean':
      return <BooleanCellEditor {...control} />;
    case 'enum':
      return <EnumCellEditor {...control} options={props.column.enumOptions ?? []} />;
  }
}
