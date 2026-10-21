import { useI18n } from '../../../i18n';

import type { EditorControlProps } from './editor-control';
import type { ReactElement } from 'react';

export function BooleanCellEditor(props: EditorControlProps): ReactElement {
  const { t } = useI18n();
  return (
    <select
      ref={props.registerRef}
      className="cs-grid__editor cs-grid__editor--select"
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
    >
      <option value="">{t('grid.editor.empty')}</option>
      <option value="true">{t('grid.editor.true')}</option>
      <option value="false">{t('grid.editor.false')}</option>
    </select>
  );
}
