/**
 * `@curve/ui` — design tokens and presentational React components.
 *
 * Dependency rule (SPEC §4.2): React plus `@curve/domain` types. app-core,
 * persistence and Electron are forbidden here.
 *
 * The stylesheets are imported for their side effects so any consumer of the
 * package gets the tokens and component classes exactly once (Vite de-dupes
 * them; `sideEffects` in package.json keeps them from being tree-shaken).
 */

import './tokens.css';
import './ui.css';

export { Button } from './Button';
export type { ButtonProps, ButtonSize, ButtonVariant } from './Button';

export { TableStyleProvider } from './TableStyleProvider';
export type { TableStyleProviderProps } from './TableStyleProvider';

export { TABLE_STYLE_CSS_VARIABLES, styleToCssVars, tableRowHeight } from './table-style';
export type { TableStyleCssVariable, TableStyleCssVars } from './table-style';

export {
  barRatioForValue,
  columnDisplayLabel,
  computeBarRanges,
  conditionalCellStyle,
  enumBadgeTone,
  formatStyledCellValue,
  presentStyledCell,
  resolveCellAlign,
  resolveCellRender,
} from './table-style-format';
export type {
  BadgeTone,
  BarRange,
  CellAlign,
  CellRenderMode,
  ConditionalCellStyle,
  ConditionalCellStyleOptions,
  ConditionalIcon,
  StyledCellOptions,
  StyledCellPresentation,
} from './table-style-format';

export { Dialog } from './Dialog';
export type { DialogProps } from './Dialog';

export { Input } from './Input';
export type { InputProps } from './Input';

export { Menu } from './Menu';
export type { MenuItemDefinition, MenuProps } from './Menu';

export { Select } from './Select';
export type { SelectOption, SelectProps } from './Select';

export { Tabs } from './Tabs';
export type { TabItem, TabsProps } from './Tabs';

export { DEFAULT_TOAST_AUTO_DISMISS_MS, ToastHost, useToasts } from './Toast';
export type {
  ToastController,
  ToastHostProps,
  ToastMessage,
  ToastTone,
  UseToastsOptions,
} from './Toast';

export {
  DEFAULT_THEME_MODE,
  THEME_ATTRIBUTE,
  THEME_MODES,
  THEME_STORAGE_KEY,
  applyTheme,
  getSystemDarkQuery,
  isThemeMode,
  prefersDark,
  readStoredTheme,
  resolveTheme,
} from './theme';
export type { MediaQueryLike, ResolvedTheme, ThemeMode, ThemeStorage } from './theme';
