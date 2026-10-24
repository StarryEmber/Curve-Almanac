/** Token controls for the style editor (T3.4, SPEC §10.2/§10.6). */

import type { Density, GridMode, TableStyleTokens } from '@curve/domain';
import { Select } from '@curve/ui';

import { useI18n } from '../../i18n';

import { densityLabel, gridLabel } from './style-text';
import { CheckboxField, ColorField, NumberField, TextField } from './StyleFieldControls';

import type { ReactElement } from 'react';

export interface StyleTokensTabProps {
  tokens: TableStyleTokens;
  onChange: (tokens: TableStyleTokens, commit: boolean) => void;
  onErrorChange: (key: string, error: string | null) => void;
}

/** SPEC §10.2 maps each density to its standard vertical padding. */
const DENSITY_PADDING_Y: Record<Density, number> = {
  compact: 4,
  normal: 7,
  comfortable: 10,
};

export function StyleTokensTab({
  tokens,
  onChange,
  onErrorChange,
}: StyleTokensTabProps): ReactElement {
  const { t } = useI18n();

  const setTokens = (patch: Partial<TableStyleTokens>, commit: boolean): void => {
    onChange({ ...tokens, ...patch }, commit);
  };
  const setHeader = (patch: Partial<TableStyleTokens['header']>, commit: boolean): void => {
    onChange({ ...tokens, header: { ...tokens.header, ...patch } }, commit);
  };
  const setBody = (patch: Partial<TableStyleTokens['body']>, commit: boolean): void => {
    onChange({ ...tokens, body: { ...tokens.body, ...patch } }, commit);
  };
  const setSelection = (patch: Partial<TableStyleTokens['selection']>, commit: boolean): void => {
    onChange({ ...tokens, selection: { ...tokens.selection, ...patch } }, commit);
  };

  return (
    <div className="cs-style-tab" data-testid="style-tokens-tab">
      <section className="cs-style-section" aria-labelledby="style-token-density">
        <h3 className="cs-style-section__title" id="style-token-density">
          {t('style.tokens.layout')}
        </h3>
        <div className="cs-style-grid">
          <Select
            label={t('style.tokens.density')}
            value={tokens.density}
            options={(['compact', 'normal', 'comfortable'] as const).map((value) => ({
              value,
              label: densityLabel(value, t),
            }))}
            data-testid="style-density"
            onChange={(event) => {
              const density = event.target.value as Density;
              setTokens({ density, cellPaddingY: DENSITY_PADDING_Y[density] }, true);
            }}
          />
          <NumberField
            label={t('style.tokens.fontSize')}
            value={tokens.fontSize}
            min={11}
            max={18}
            onChange={(value) => {
              setTokens({ fontSize: value }, false);
            }}
            onCommit={() => {
              setTokens({}, true);
            }}
            onErrorChange={(error) => {
              onErrorChange('fontSize', error);
            }}
            errorMessage={t('style.error.range', { min: 11, max: 18 })}
            testId="style-font-size"
          />
          <NumberField
            label={t('style.tokens.radius')}
            value={tokens.radius}
            min={0}
            max={12}
            onChange={(value) => {
              setTokens({ radius: value }, false);
            }}
            onCommit={() => {
              setTokens({}, true);
            }}
            onErrorChange={(error) => {
              onErrorChange('radius', error);
            }}
            errorMessage={t('style.error.range', { min: 0, max: 12 })}
          />
          <NumberField
            label={t('style.tokens.paddingX')}
            value={tokens.cellPaddingX}
            min={4}
            max={24}
            onChange={(value) => {
              setTokens({ cellPaddingX: value }, false);
            }}
            onCommit={() => {
              setTokens({}, true);
            }}
            onErrorChange={(error) => {
              onErrorChange('paddingX', error);
            }}
            errorMessage={t('style.error.range', { min: 4, max: 24 })}
          />
          <NumberField
            label={t('style.tokens.paddingY')}
            value={tokens.cellPaddingY}
            min={2}
            max={16}
            onChange={(value) => {
              setTokens({ cellPaddingY: value }, false);
            }}
            onCommit={() => {
              setTokens({}, true);
            }}
            onErrorChange={(error) => {
              onErrorChange('paddingY', error);
            }}
            errorMessage={t('style.error.range', { min: 2, max: 16 })}
          />
          <CheckboxField
            label={t('style.tokens.zebra')}
            checked={tokens.zebra}
            onChange={(checked) => {
              setTokens({ zebra: checked }, true);
            }}
          />
        </div>
        <TextField
          label={t('style.tokens.fontFamily')}
          value={tokens.fontFamily}
          required
          onChange={(value) => {
            setTokens({ fontFamily: value }, false);
          }}
          onCommit={() => {
            setTokens({}, true);
          }}
          onErrorChange={(error) => {
            onErrorChange('fontFamily', error);
          }}
          errorMessage={t('style.error.required')}
          testId="style-font-family"
        />
      </section>

      <section className="cs-style-section" aria-labelledby="style-token-header">
        <h3 className="cs-style-section__title" id="style-token-header">
          {t('style.tokens.header')}
        </h3>
        <div className="cs-style-grid">
          <ColorField
            label={t('style.tokens.headerBackground')}
            value={tokens.header.background}
            onChange={(value) => {
              setHeader({ background: value ?? tokens.header.background }, false);
            }}
            onCommit={() => {
              setHeader({}, true);
            }}
            onErrorChange={(error) => {
              onErrorChange('headerBackground', error);
            }}
            errorMessage={t('style.error.color')}
            pickerLabel={t('style.tokens.pickColor')}
          />
          <ColorField
            label={t('style.tokens.headerForeground')}
            value={tokens.header.foreground}
            onChange={(value) => {
              setHeader({ foreground: value ?? tokens.header.foreground }, false);
            }}
            onCommit={() => {
              setHeader({}, true);
            }}
            onErrorChange={(error) => {
              onErrorChange('headerForeground', error);
            }}
            errorMessage={t('style.error.color')}
            pickerLabel={t('style.tokens.pickColor')}
          />
          <ColorField
            label={t('style.tokens.headerBorder')}
            value={tokens.header.borderColor}
            onChange={(value) => {
              setHeader({ borderColor: value ?? tokens.header.borderColor }, false);
            }}
            onCommit={() => {
              setHeader({}, true);
            }}
            onErrorChange={(error) => {
              onErrorChange('headerBorder', error);
            }}
            errorMessage={t('style.error.color')}
            pickerLabel={t('style.tokens.pickColor')}
          />
        </div>
        <CheckboxField
          label={t('style.tokens.headerBold')}
          checked={tokens.header.bold}
          onChange={(checked) => {
            setHeader({ bold: checked }, true);
          }}
        />
      </section>

      <section className="cs-style-section" aria-labelledby="style-token-body">
        <h3 className="cs-style-section__title" id="style-token-body">
          {t('style.tokens.body')}
        </h3>
        <div className="cs-style-grid">
          <ColorField
            label={t('style.tokens.bodyBackground')}
            value={tokens.body.background}
            onChange={(value) => {
              setBody({ background: value ?? tokens.body.background }, false);
            }}
            onCommit={() => {
              setBody({}, true);
            }}
            onErrorChange={(error) => {
              onErrorChange('bodyBackground', error);
            }}
            errorMessage={t('style.error.color')}
            pickerLabel={t('style.tokens.pickColor')}
          />
          <ColorField
            label={t('style.tokens.alternateBackground')}
            value={tokens.body.alternateBackground}
            onChange={(value) => {
              setBody({ alternateBackground: value ?? tokens.body.alternateBackground }, false);
            }}
            onCommit={() => {
              setBody({}, true);
            }}
            onErrorChange={(error) => {
              onErrorChange('alternateBackground', error);
            }}
            errorMessage={t('style.error.color')}
            pickerLabel={t('style.tokens.pickColor')}
          />
          <ColorField
            label={t('style.tokens.bodyForeground')}
            value={tokens.body.foreground}
            onChange={(value) => {
              setBody({ foreground: value ?? tokens.body.foreground }, false);
            }}
            onCommit={() => {
              setBody({}, true);
            }}
            onErrorChange={(error) => {
              onErrorChange('bodyForeground', error);
            }}
            errorMessage={t('style.error.color')}
            pickerLabel={t('style.tokens.pickColor')}
          />
          <ColorField
            label={t('style.tokens.bodyBorder')}
            value={tokens.body.borderColor}
            onChange={(value) => {
              setBody({ borderColor: value ?? tokens.body.borderColor }, false);
            }}
            onCommit={() => {
              setBody({}, true);
            }}
            onErrorChange={(error) => {
              onErrorChange('bodyBorder', error);
            }}
            errorMessage={t('style.error.color')}
            pickerLabel={t('style.tokens.pickColor')}
          />
        </div>
        <Select
          label={t('style.tokens.grid')}
          value={tokens.body.grid}
          options={(['none', 'horizontal', 'all'] as const).map((value) => ({
            value,
            label: gridLabel(value, t),
          }))}
          onChange={(event) => {
            setBody({ grid: event.target.value as GridMode }, true);
          }}
        />
      </section>

      <section className="cs-style-section" aria-labelledby="style-token-selection">
        <h3 className="cs-style-section__title" id="style-token-selection">
          {t('style.tokens.selection')}
        </h3>
        <div className="cs-style-grid">
          <ColorField
            label={t('style.tokens.selectionBackground')}
            value={tokens.selection.background}
            onChange={(value) => {
              setSelection({ background: value ?? tokens.selection.background }, false);
            }}
            onCommit={() => {
              setSelection({}, true);
            }}
            onErrorChange={(error) => {
              onErrorChange('selectionBackground', error);
            }}
            errorMessage={t('style.error.color')}
            pickerLabel={t('style.tokens.pickColor')}
          />
          <ColorField
            label={t('style.tokens.selectionForeground')}
            value={tokens.selection.foreground}
            onChange={(value) => {
              setSelection({ foreground: value ?? tokens.selection.foreground }, false);
            }}
            onCommit={() => {
              setSelection({}, true);
            }}
            onErrorChange={(error) => {
              onErrorChange('selectionForeground', error);
            }}
            errorMessage={t('style.error.color')}
            pickerLabel={t('style.tokens.pickColor')}
          />
        </div>
      </section>

      <p className="cs-style-hint">{t('style.tokens.hint')}</p>
    </div>
  );
}
