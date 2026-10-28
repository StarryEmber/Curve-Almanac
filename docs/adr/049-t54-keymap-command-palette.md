# ADR-049 T5.4 的键位注册表、作用域、冲突判定与命令面板

- 状态：已接受
- 日期：2026-10-28
- 相关：SPEC §9.1、§12、§13.2、§13.4、§16.3；TASKS T5.4；TESTPLAN E7/E11；ADR-025、
  ADR-028、ADR-030、ADR-032、ADR-046、ADR-047、ADR-048

## 背景

T5.3 结束时 renderer 只有一个硬编码的全局 keydown：`WorkspaceView` 在 `window` 上处理
Ctrl/Cmd+W/Z/Shift+Z/Y/S。其余键盘行为都分散在局部组件：

- `DataGrid.handleKeyDown`：方向键/Tab/Home/End/PageUp/PageDown/Enter/F2/Delete 与直接键入；
  `CellEditor`：Enter/Tab/Esc；`onPaste`：Ctrl/Cmd+V 的粘贴事件。
- `TabBar`：ArrowLeft/Right 切标签；`LayoutView` 分隔条：方向键调比例。
- `@curve/ui` 的 `Menu`/`Dialog`/`Tabs` 已实现 APG 键盘契约与焦点陷阱。

T5.4 要求新增键位注册表（作用域：全局/网格/图表）、命令面板（Ctrl/Cmd+K、模糊搜索、最近
使用）与冲突检测/不可用原因，同时不能破坏上述局部键盘。SPEC 没有规定：

1. 命令注册表放在 app-core 还是 renderer；
2. “作用域”是按键捕获所有权还是命令可用上下文；
3. 同一快捷键能否在不同作用域复用；
4. 命令面板如何表达禁用态、最近使用存哪里；
5. 输入框/网格/图表/对话框内的全局快捷键边界。

这些必须先裁决，否则 keydown 分发、面板列表与菜单会各发明一套启用规则。

## 决定

### 1. 注册表在 renderer，命令是 UI 意图而不是新的文档命令

- 新增 `apps/desktop/src/renderer/features/keymap/`；命令只调用既有的
  `core.actions` / Shell 回调（撤销、重做、保存、关闭视图、分栏、复制视图/图表、切换面板、
  帮助、主题），**不在 app-core 增加命令包装层**，也不产生新的 Immer 命令。
- 命令声明形状：

  ```ts
  interface AppCommandDefinition {
    id: string;                       // 稳定 id，E2E 契约
    labelKey: MessageKey;             // 文案走 i18n
    shortcuts: readonly string[];     // 规范写法 "Ctrl/Cmd+K"
    scopes: readonly CommandScope[];  // global | workspace | grid | chart
    visibleInPalette: boolean;
    isEnabled(context: CommandContext): CommandAvailability;
    run(context: CommandContext, handlers: CommandHandlers): void;
  }
  ```

- `isEnabled` 返回 `{ enabled: true }` 或 `{ enabled: false, reason }`；`reason` 是稳定的
  机器可读联合（`no-workspace`、`no-view`、`no-table-view`、`no-history` 等），renderer 再
  映射到 i18n。菜单位置之外（面板/帮助）共用同一判定，不在组件里复制业务规则。
- 命令标签只存 key；命令名 → 文案仍留在 renderer（与 ADR-047 的 `history-action-label` 一致）。

### 2. 作用域是“可用上下文”，不是按键捕获所有权

- `global`：任何界面（欢迎页也生效）。
- `workspace`：需要打开的工作区（保存、撤销/重做、关闭视图、分栏、移动标签等）。
- `grid`：需要活动视图是数据表（复制当前视图）。
- `chart`：需要活动视图是图表（复制当前图表）。
- 作用域只决定命令是否可被 keymap/面板执行；**不是**把网格/图表/对话框的局部按键收进注册表。
  局部组件仍是这些按键的第一处理者：
  - 全局监听在 `window` 冒泡阶段，只处理带修饰键的命令；`event.defaultPrevented` 为真时直接
    忽略（网格/分隔条/Esc 已消费）。
  - `input`/`textarea`/`select`/`contenteditable`/`[role="dialog"]` 内的按键一律不处理，
    因此输入框内 Ctrl/Cmd+C/V、Ctrl/Cmd+Z、Ctrl/Cmd+K 都保持原生语义。
  - 重复按键（`event.repeat`）、输入法组合（`isComposing`）与非 `keydown` 不触发。
- 命令面板只在 `visibleInPalette: true` 时列出；禁用命令仍列出并显示原因（用户能知道为什么
  不能执行），但 Enter 不执行任何动作。

### 3. 快捷键表（v1）

| 命令 id | 文案 key | 快捷键 | 作用域 |
|---|---|---|---|
| `palette.open` | `command.palette.open` | Ctrl/Cmd+K | global（不在面板中列出） |
| `app.help` | `command.app.help` | F1 | global |
| `app.save` | `command.app.save` | Ctrl/Cmd+S | workspace |
| `app.toggleSidebar` | `command.app.toggleSidebar` | Ctrl/Cmd+B | global |
| `app.toggleInspector` | `command.app.toggleInspector` | Ctrl/Cmd+Alt+I | global |
| `history.undo` | `command.history.undo` | Ctrl/Cmd+Z | workspace |
| `history.redo` | `command.history.redo` | Ctrl/Cmd+Shift+Z、Ctrl/Cmd+Y | workspace |
| `view.close` | `command.view.close` | Ctrl/Cmd+W | workspace |
| `view.duplicate` | `command.view.duplicate` | Ctrl/Cmd+Shift+D | grid |
| `chart.duplicate` | `command.chart.duplicate` | Ctrl/Cmd+Shift+D | chart |
| `layout.splitHorizontal` | `command.layout.splitHorizontal` | Ctrl/Cmd+Alt+H | workspace |
| `layout.splitVertical` | `command.layout.splitVertical` | Ctrl/Cmd+Alt+V | workspace |
| `layout.closePane` | `command.layout.closePane` | Ctrl/Cmd+Alt+W | workspace |
| `layout.moveViewToNextPane` | `command.layout.moveViewToNextPane` | Ctrl/Cmd+Alt+M | workspace |
| `theme.light` / `theme.dark` / `theme.system` | `command.theme.*` | —（仅面板） | global |

- 分栏/分栏关闭/移动标签使用 Ctrl/Cmd+Alt 组合，避开 Ctrl/Cmd+Shift+V（纯文本粘贴）与
  Ctrl/Cmd+Shift+W（关闭窗口）等常见约定；输入框内本来就不触发。
- `Ctrl/Cmd+Shift+D` 在 `grid` 与 `chart` 两个互斥作用域复用：数据表视图复制视图，图表视图
  复制图表。这是“同键不同作用域”的明确用法，不构成冲突。
- 主题切换、面板开关等外观操作用面板/按钮进入；`theme.*` 是仅面板命令，没有快捷键。
- 核心命令（除 `theme.*`）都至少有一个快捷键；单测锁定该表并断言冲突为 0。

### 4. 冲突检测

- 规范化快捷键（修饰键顺序无关、字母大小写无关、`Cmd`/`Ctrl`/`Meta` 归一为
  `ctrlOrMeta`）后，两命令的**作用域上下文有交集**且快捷键相同即冲突：
  - `global` 与任何作用域相交；
  - `workspace` 与 `workspace/grid/chart` 相交（网格/图表都隐含工作区）；
  - `grid` 与 `chart` 不相交。
- `createKeymap` 在构造时检测；发现冲突直接抛 `KeymapConflictError`（含 id 与快捷键），
  防止静默地“后注册者覆盖前者”。同一命令重复声明同一快捷键先去重。
- 面板、Help 对话框与快捷键分发都使用同一个 `APP_COMMANDS` 数组；新增命令必须同时通过
  单测的冲突断言，否则应用启动即失败。

### 5. 命令面板

- `Ctrl/Cmd+K` 打开；组件复用 `@curve/ui` 的 `Dialog`（焦点陷阱/Esc/焦点恢复）+
  `Input` + 自绘 `role="listbox"`/`role="option"`（带 `aria-activedescendant`）。
- 搜索是**子序列模糊匹配**，不引入 fuse.js 等运行时依赖：
  - 对本地化标签与命令 id 分别打分，标签命中优先；连续命中、词首命中、前缀命中加分；
  - 空查询按“最近使用”优先，其余按注册顺序；非空查询按分数，最近使用仅作同分排序；
  - 重复 id 去重；无结果显示“没有匹配的命令”，禁用项显示原因但仍可被读出。
- 键盘：↑/↓ 移动、Home/End 到首尾、Enter 执行、Esc 关闭、Tab 由 Dialog 焦点陷阱处理；
  鼠标悬停同步选中。执行后关闭面板并记录最近使用。
- 最近使用上限 8 条，存 `localStorage['curve-studio.recent-commands']`（与主题/语言一致），
  **不写工作区 manifest**；损坏/缺失/存储不可用时静默回退为空列表。存储只在打开面板时读取，
  避免为每次启动初始化一份与图表无关的偏好。
- **渲染稳定性（T4.6 内存门禁）**：`AppShell` 不订阅文档 store；keymap 在按键时读取最新
  state，面板**打开时才**快照命令可用性并条件挂载（关闭时不渲染 Dialog/列表），
  `runCommand` 执行前再按最新 state 复查。面板常驻挂载或让整个 Shell 随每次标签切换重渲染
  会使 100k 图表切换场景的 private 峰值逼近/越过 600MB；当前实现实测 506MB（全量 E2E）。

### 6. Help 对话框与可发现性

- `HelpDialog` 的“键盘快捷键”增加“命令与快捷键”表，数据来自同一 `APP_COMMANDS`（有快捷键
  的命令），显示本地化标签与平台化快捷键（Windows/Linux `Ctrl`、macOS `Cmd`）。
- 命令面板的列表项显示快捷键与禁用原因；`data-command-id`/`data-testid` 是 E2E 契约。

### 7. 不改变的东西

- 不新增 IPC/preload 通道、不新增 manifest 字段、不升级 `formatVersion`、不改 JSONL/CSV/
  图表格式、不放宽 CSP/Electron 安全选项、不新增运行时依赖。
- `DataGrid`/`CellEditor`/`TabBar`/`LayoutView` 分隔条/`Menu`/`Dialog`/`Tabs` 的本地键盘
  契约不变；`WorkspaceView` 原来的 Ctrl/Cmd+W/Z/Y/S 处理迁移到新 keymap，语义不变。
- 撤销/重做仍走 `EditHistory`；保存仍走 `SaveQueue.flush()`；打开/关闭工作区仍清空历史。
- 新建表/导入/筛选/导出 CSV/图表向导等由功能组件自己拥有的对话框**不进入 T5.4 面板**：
  它们的 open 状态目前是组件本地的；把它们提升为全局命令需要额外的注册表/焦点协议，
  留待后续任务（见复核条件）。

## 代价

- 面板覆盖的是 Shell/工作区级命令，不是应用内所有对话框。用户仍通过工具栏/侧栏打开
  新建表、导入、筛选、导出等；这是避免在 T5.4 把局部 UI 状态抽成全局注册表的代价。
- 最近使用是 `localStorage` 偏好，不随工作区同步；清理浏览器数据会丢失顺序（不影响命令本身）。
- Ctrl/Cmd+Alt 组合在部分 AltGr 键盘布局/输入法下可能被占用；当前目标平台 Windows 中文输入
  法实测可用，输入框内不受影响。若出现系统级冲突，需要改表并更新本 ADR/TESTPLAN。
- 冲突检测是启动即抛错：新增命令若与现有快捷键相交会让应用直接失败。这是有意的“早失败”，
  避免用户按键行为随注册顺序变化。
- 禁用命令仍在面板中占位；列表可能较长，但用户能看到不可用原因，而不是命令凭空消失。
- 面板的命令可用性是**打开时的快照**：面板是模态的，打开期间文档不会变化；执行前还会按最新
  state 复查，因此不会执行已失效的命令。若未来面板需要在打开期间随文档实时刷新，应把订阅放进
  一个只在打开时挂载的子树，而不是让 `AppShell` 全局订阅。
- F1 在输入框/对话框内不打开帮助（与“输入框不劫持”一致）；需要时先离开编辑控件。

## 影响

- 代码：
  - `apps/desktop/src/renderer/features/keymap/{shortcut,keymap,command-search,recent-commands,
    commands,command-context,palette-model,use-command-keymap}.ts`。
  - `apps/desktop/src/renderer/features/keymap/CommandPalette.tsx`。
  - `apps/desktop/src/renderer/shell/{AppShell,HelpDialog}.tsx`、
    `features/workspace/WorkspaceView.tsx`（移除旧 keydown）。
  - `packages/ui/src/Input.tsx`：支持 `ref`（Dialog 的 `initialFocusRef`）。
  - `i18n/messages/{zh-CN,en-US}.ts`、`styles.css`。
  - 测试：`keymap.test.ts`、`command-search.test.ts`、`recent-commands.test.ts`、
    `commands.test.ts`、`CommandPalette.test.tsx`、`App.test.tsx`（+3）、
    `e2e/palette.spec.ts`（3 条）。
- 文档：SPEC §9.1/§13.2/§13.4/§16.3、TASKS T5.4、TESTPLAN E7/E11、ADR 索引、CHANGELOG、
  HANDOFF、AGENTS §0、`docs/reports/t5.4/REPORT.md`。
- 快照：无；不改 RenderModel、ECharts option 或表格样式快照。

## 复核条件

- 若产品要求“新建表/导入/筛选/导出/图表向导”也出现在命令面板：新增 renderer 命令注册上下文，
  由功能组件在挂载时注册 open 回调并处理多 pane 下的目标选择；不要在 keymap 里按 DOM 查询
  按钮或复制命令业务逻辑。
- 若 Ctrl/Cmd+Alt 组合与目标输入法/键盘布局冲突：替换为可配置键位或 `Ctrl/Cmd+Shift+…`，
  更新本 ADR 的快捷键表、Help 与单测。
- 若最近使用需要跨设备/跨工作区稳定：迁移到 T5.5 的 `settings.json` 并补迁移/兼容测试；
  不要写进工作区 manifest。
- 若面板需要分组、别名或拼音首字母搜索：扩展 `command-search.ts` 的候选词字段，保持纯函数；
  不要引入模糊搜索依赖。
- 若快捷键需要用户自定义：新增设置与持久化格式（新 ADR），并把 `APP_COMMANDS` 的默认键位与
  用户覆盖分层；当前 v1 不可自定义。
- 若需要把 Electron 原生菜单与注册表同步：新增 main↔renderer 菜单状态通道，更新 SPEC §15 与
  preload 白名单；T5.4 不新增 IPC。
