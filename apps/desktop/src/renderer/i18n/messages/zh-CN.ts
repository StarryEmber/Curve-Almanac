import type { ErrorCode } from '@curve/domain';

/**
 * zh-CN message table — the source of truth for every user-visible string
 * (SPEC §16.4, ADR-013). Keys are flat and dotted; `error.<code>` covers the
 * full SPEC §18 error set, enforced by the annotation on `errorMessages`.
 */

const errorMessages: Record<`error.${ErrorCode}`, string> = {
  'error.E_WS_NOT_FOUND': '找不到该工作区。',
  'error.E_WS_INVALID_MANIFEST': '工作区清单已损坏，无法打开。',
  'error.E_WS_VERSION_UNSUPPORTED': '该工作区由更新版本的 Curve Studio 创建，当前版本无法打开。',
  'error.E_WS_LOCKED': '该工作区正在另一个窗口中使用。',
  'error.E_WS_BUSY': '工作区正忙，请稍后再试。',
  'error.E_MIGRATION_FAILED': '升级工作区格式失败，原文件已保留。',
  'error.E_TABLE_NOT_FOUND': '找不到该数据表。',
  'error.E_TABLE_PARSE': '数据表内容无法解析。',
  'error.E_TABLE_LIMIT': '已超出数据表容量上限。',
  'error.E_IMPORT_ENCODING': '无法识别文件的文本编码。',
  'error.E_IMPORT_FORMAT': '文件格式不受支持。',
  'error.E_IMPORT_ABORTED': '导入已取消。',
  'error.E_VALIDATION': '部分输入未通过校验。',
  'error.E_DUPLICATE_KEY': '键值重复，无法保存。',
  'error.E_TYPE': '数据类型不匹配。',
  'error.E_PATH_DENIED': '应用无权访问该位置。',
  'error.E_FS_READ': '文件读取失败。',
  'error.E_FS_WRITE': '文件写入失败。',
  'error.E_BACKUP_NOT_FOUND': '找不到可恢复的备份。',
  'error.E_IPC_INVALID_PAYLOAD': '主进程无法识别该请求。',
  'error.E_PAYLOAD_TOO_LARGE': '请求内容过大，已取消。',
  'error.E_PLUGIN_INVALID': '插件格式无效。',
  'error.E_PLUGIN_INCOMPATIBLE': '插件与当前版本不兼容。',
  'error.E_PLUGIN_ACTIVATE': '插件启动失败。',
  'error.E_EXPORT_FAILED': '导出失败。',
  'error.E_UNKNOWN': '发生了意外错误。',
};

export const zhCN = {
  'app.name': 'Curve Studio',

  'shell.skipToMain': '跳到主内容',
  'shell.sidebar.label': '侧栏',
  'shell.nav.label': '导航分类',
  'shell.nav.tables': '数据表',
  'shell.nav.charts': '图表',
  'shell.nav.styles': '样式',
  'shell.nav.empty.tables': '打开工作区后，数据表会列在这里。',
  'shell.nav.empty.charts': '打开工作区后，图表会列在这里。',
  'shell.nav.empty.styles': '打开工作区后，表格样式会列在这里。',
  'shell.titleBar.workspaceEmpty': '未打开工作区',
  'shell.titleBar.toggleSidebar': '切换侧栏',
  'shell.titleBar.toggleInspector': '切换检查器',
  'shell.titleBar.help': '帮助',

  'theme.menuLabel': '外观',
  'theme.light': '浅色',
  'theme.dark': '深色',
  'theme.system': '跟随系统',

  'language.label': '语言',
  'language.zh-CN': '简体中文',
  'language.en-US': 'English',

  'shell.empty.title': '从一个工作区开始',
  'shell.empty.body':
    'Curve Studio 把数据表、曲线图和样式保存在本地目录里，离线可用，数据不出本机。',
  'shell.empty.create': '新建工作区',
  'shell.empty.open': '打开工作区',
  'shell.empty.unavailable': '工作区功能将在后续里程碑提供，当前版本还不能新建或打开工作区。',

  'shell.inspector.title': '检查器',
  'shell.inspector.empty': '未选择任何内容。选中表格或图表后，这里会显示它的属性。',
  'shell.inspector.selection': '选择',
  'shell.inspector.source': '来源',
  'shell.inspector.style': '样式',
  'shell.inspector.none': '—',

  'shell.status.label': '状态栏',
  'shell.status.version': '版本 {version}',
  'shell.status.platform': '平台 {platform}',
  'shell.status.loading': '正在连接主进程…',
  'shell.status.unavailable': '运行时信息不可用',
  'shell.status.workspace': '工作区',
  'shell.status.workspaceNone': '未打开',
  'shell.status.autosave': '自动保存',
  'shell.status.autosaveIdle': '空闲',

  'shell.help.title': '键盘快捷键',
  'shell.help.description': '所有面板都可以只用键盘操作。',
  'shell.help.dismiss': '知道了',
  'shell.help.close': '关闭',
  'shell.help.keyTab': 'Tab',
  'shell.help.keyEscape': 'Esc',
  'shell.help.keyArrows': '方向键',
  'shell.help.tabText': '在可聚焦的控件之间移动',
  'shell.help.escapeText': '关闭对话框或菜单',
  'shell.help.arrowsText': '在标签页和菜单项之间移动',

  'toast.region': '通知',
  'toast.dismiss': '关闭通知',

  ...errorMessages,
} as const;

export type MessageKey = keyof typeof zhCN;
