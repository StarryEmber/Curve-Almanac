import type { EditorControlProps } from './editor-control';
import type { ReactElement } from 'react';

export function DateCellEditor(props: EditorControlProps): ReactElement {
  return (
    <input
      ref={props.registerRef}
      className="cs-grid__editor"
      type="date"
      value={props.value}
      aria-label={props.label}
      aria-invalid={props.error === null ? undefined : true}
      aria-describedby={props.error === null ? undefined : 'cs-edit-status'}
      aria-busy={props.busy}
      autoFocus
      data-testid="cell-editor"
      onChange={(event) => {
        props.onChange(event.target.value);
      }}
      onKeyDown={props.onKeyDown}
      onBlur={props.onBlur}
      onCompositionStart={props.onCompositionStart}
      onCompositionEnd={props.onCompositionEnd}
    />
  );
}
