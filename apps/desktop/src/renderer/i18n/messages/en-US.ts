import type { MessageKey } from './zh-CN';

/**
 * en-US message table (SPEC §16.4: en-US ships as a skeleton, but every key is
 * present — the explicit `Record<MessageKey, string>` makes a missing
 * translation a compile error).
 */

export const enUS: Record<MessageKey, string> = {
  'app.name': 'Curve Studio',

  'shell.skipToMain': 'Skip to main content',
  'shell.sidebar.label': 'Sidebar',
  'shell.nav.label': 'Navigator sections',
  'shell.nav.tables': 'Tables',
  'shell.nav.charts': 'Charts',
  'shell.nav.styles': 'Styles',
  'shell.nav.empty.tables': 'Tables appear here once a workspace is open.',
  'shell.nav.empty.charts': 'Charts appear here once a workspace is open.',
  'shell.nav.empty.styles': 'Table styles appear here once a workspace is open.',
  'shell.titleBar.workspaceEmpty': 'No workspace open',
  'shell.titleBar.toggleSidebar': 'Toggle sidebar',
  'shell.titleBar.toggleInspector': 'Toggle inspector',
  'shell.titleBar.help': 'Help',

  'theme.menuLabel': 'Theme',
  'theme.light': 'Light',
  'theme.dark': 'Dark',
  'theme.system': 'Follow system',

  'language.label': 'Language',
  'language.zh-CN': '简体中文',
  'language.en-US': 'English',

  'shell.empty.title': 'Start from a workspace',
  'shell.empty.body':
    'Curve Studio keeps tables, charts and styles in a local folder. It works offline and never sends your data anywhere.',
  'shell.empty.create': 'New workspace',
  'shell.empty.open': 'Open workspace',
  'shell.empty.unavailable':
    'Workspace support arrives in a later milestone; this build cannot create or open one yet.',

  'shell.inspector.title': 'Inspector',
  'shell.inspector.empty':
    'Nothing selected. Pick a table or chart to inspect its properties here.',
  'shell.inspector.selection': 'Selection',
  'shell.inspector.source': 'Source',
  'shell.inspector.style': 'Style',
  'shell.inspector.none': '—',

  'shell.status.label': 'Status bar',
  'shell.status.version': 'Version {version}',
  'shell.status.platform': 'Platform {platform}',
  'shell.status.loading': 'Connecting to the main process…',
  'shell.status.unavailable': 'Runtime information is unavailable',
  'shell.status.workspace': 'Workspace',
  'shell.status.workspaceNone': 'None',
  'shell.status.autosave': 'Autosave',
  'shell.status.autosaveIdle': 'Idle',

  'shell.help.title': 'Keyboard shortcuts',
  'shell.help.description': 'Every panel can be used with the keyboard alone.',
  'shell.help.dismiss': 'Got it',
  'shell.help.close': 'Close',
  'shell.help.keyTab': 'Tab',
  'shell.help.keyEscape': 'Esc',
  'shell.help.keyArrows': 'Arrow keys',
  'shell.help.tabText': 'Move between focusable controls',
  'shell.help.escapeText': 'Close a dialog or menu',
  'shell.help.arrowsText': 'Move between tabs and menu items',

  'toast.region': 'Notifications',
  'toast.dismiss': 'Dismiss notification',

  'error.E_WS_NOT_FOUND': 'That workspace could not be found.',
  'error.E_WS_INVALID_MANIFEST': 'The workspace manifest is damaged and cannot be opened.',
  'error.E_WS_VERSION_UNSUPPORTED':
    'This workspace was created by a newer Curve Studio and cannot be opened here.',
  'error.E_WS_LOCKED': 'The workspace is open in another window.',
  'error.E_WS_BUSY': 'The workspace is busy. Please try again.',
  'error.E_MIGRATION_FAILED':
    'Upgrading the workspace format failed; the original files are intact.',
  'error.E_TABLE_NOT_FOUND': 'That table could not be found.',
  'error.E_TABLE_PARSE': 'The table data could not be parsed.',
  'error.E_TABLE_LIMIT': 'The table has reached its size limit.',
  'error.E_IMPORT_ENCODING': 'The text encoding of the file could not be detected.',
  'error.E_IMPORT_FORMAT': 'That file format is not supported.',
  'error.E_IMPORT_ABORTED': 'The import was cancelled.',
  'error.E_VALIDATION': 'Some of the values were rejected.',
  'error.E_DUPLICATE_KEY': 'A duplicate key prevents saving.',
  'error.E_TYPE': 'The data type does not match.',
  'error.E_PATH_DENIED': 'The app is not allowed to access that location.',
  'error.E_FS_READ': 'The file could not be read.',
  'error.E_FS_WRITE': 'The file could not be written.',
  'error.E_BACKUP_NOT_FOUND': 'No restorable backup was found.',
  'error.E_IPC_INVALID_PAYLOAD': 'The request could not be understood by the main process.',
  'error.E_PAYLOAD_TOO_LARGE': 'The request was too large to send.',
  'error.E_PLUGIN_INVALID': 'The plugin is not valid.',
  'error.E_PLUGIN_INCOMPATIBLE': 'The plugin is not compatible with this version.',
  'error.E_PLUGIN_ACTIVATE': 'The plugin failed to start.',
  'error.E_EXPORT_FAILED': 'The export failed.',
  'error.E_UNKNOWN': 'Something went wrong.',
};
