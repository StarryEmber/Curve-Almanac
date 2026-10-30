# ADR-054 T6.3 的注册表驱动 UI、来源标识、错误隔离与会话级插件禁用

- 状态：已接受
- 日期：2026-10-30
- 相关：SPEC §13.4、§14.1、§14.2、§14.3、§14.4；TASKS T6.1、T6.2、T6.3；ADR-010、ADR-015、
  ADR-031、ADR-049、ADR-052、ADR-053

## 背景

T6.2 接通了两个验收面（列对话框的语义类型、导入向导的示例导入器），但 SPEC §14.4 的四类内置
贡献仍有一半留在 UI 里，T6.1 留下的宿主能力也没有消费者：

1. **内置列表仍然硬编码**：`features/columns/column-form.ts` 的 `COLUMN_TYPES`（5 种存储类型）、
   `NewChartDialog`/`ChartInspector` 的 `KINDS = ['line','scatter','bar']`，以及导入向导里
   “自动（内置 CSV/JSON）”这个不可见的隐式分支。注册表只有插件贡献，内置贡献没有注册。
2. **没有来源标识**：`RegistryEntry.source` 在 T6.1 就存在，但 UI 只显示 `def.label`，用户分不清
   哪个选项来自插件；出问题时也不知道该禁用谁。
3. **没有错误边界**：`format`/`parse`/`run` 抛错会直接进 React 渲染或事件循环；没有“带插件名的
   toast”，也没有可跳转的日志。
4. **没有禁用入口与刷新**：`getDisabled()` 只存在于宿主内存；`deactivate` 后没有任何 UI 能调用；
   `Registry.subscribe` 也没有消费者，所以“贡献点变更后 UI 刷新”无法验证。
5. **`commands` 注册表没有消费者**：`CommandDef.run(ctx)` 没有 `execute` 适配器，插件命令无法
   进入命令面板。

## 决定

### 1. 内置贡献通过同一注册表注册（`renderer/plugins/builtins.ts`）

- `registerBuiltinContributions(host)` 在 `activateRendererPlugins()` 里、`activateAll()` 之前用
  宿主视图（`source = builtin`）注册：
  - **字段类型**：`text`/`number`/`date`/`boolean`/`enum`（**id 就是存储类型**，与 SPEC §14.4 一致）；
  - **导入器**：`builtin.csv`（`.csv/.tsv/.txt`）与 `builtin.json`（`.json`）；
  - **图表类型**：`line`/`scatter`/`bar`（id 就是 `ChartSpec.kind`）。
- 字段类型的语义函数委托给 `@curve/domain`：`parseText` 复用 `coerceCell`（enum 例外，见下），
  `format` 复用 `formatCellValue`，`validate`/`compare` 只做类型与空值语义。内置字段类型是
  “存储类型本身”的声明，应用对没有 `fieldTypeId` 的列仍直接走 domain 格式化，不经过插件调用。
- **`fieldTypeId` 永远不指向内置 id**：列对话框的语义类型下拉只列 `source.kind === 'plugin'` 的
  字段类型；存储类型下拉只列 `source.kind === 'builtin'` 的字段类型。主进程的 resolver 只认识
  编译进包的插件字段类型（ADR-053），写入内置 id 会被严格校验拒绝，UI 不允许产生这种值。
- **命令注册表只承载插件命令**：内置命令目录仍是 T5.4 的 `APP_COMMANDS`（`labelKey`/快捷键/
  作用域/`isEnabled` 的唯一来源）。`CommandDef` 没有这些字段，把它复制进注册表会形成第二份快捷键
  与可用性判定，直接违背 T5.4 的“单一注册表 + 冲突检测”契约。命令面板合并两者：内置条目带
  `labelKey`，插件条目带插件提供的 `label` 与 `(插件：<name>)` 徽标。

### 2. 四类贡献点的 UI 读取方式

| 贡献点 | 读取位置 | 刷新方式 |
|---|---|---|
| 字段类型（存储类型） | `ColumnFormDialog` 的“存储类型” | `usePluginSnapshot(open)` 订阅 |
| 字段类型（语义类型） | `ColumnFormDialog` 的“语义类型” | 同上 |
| 导入器 | `use-import` → 向导的“导入器”下拉 | `usePluginSnapshot(open)` 订阅 |
| 图表类型 | `NewChartDialog` 的下拉（含插件预设） | `usePluginSnapshot()` 订阅 |
| 图表类型 | `ChartInspector` 的下拉（只列内置） | 每次渲染读 `listChartKinds()` |
| 命令 | 命令面板（打开时快照） | 打开时读 `listPluginCommands()` |

- 订阅只在对应表面**打开时**存在（关闭的对话框不常驻监听），沿用 T5.4 的渲染稳定性约束。
- 内置标签按 id 走消息表（`columns.type.*`、`chart.kind.*`），插件标签是插件提供的字符串，
  追加来源后缀；插件文案不本地化（与 ADR-053 一致）。

### 3. 图表类型：内置 3 种 + 插件“预设”

- `ChartSpec.kind` 仍是 v1 的 `line | scatter | bar`（manifest/领域 schema 不变）。
- 插件 `ChartKindDef` 通过 `seriesType` 映射到这三种，`defaults` 作为**创建时的图表选项预设**：
  向导选择插件类型时以 `seriesType` 建图并把 `defaults` 合并进 `options`。
- 检查器只列内置类型：`ChartSpec` 没有“预设 id”字段，列出插件预设会让下拉值无法回显
  （选中后回落到 series type）。要持久化预设，必须升级 schema 并写迁移（见复核条件）。

### 4. 导入器：内置走 Worker，插件走渲染进程

- 内置条目在向导里可见且可选；选中后**强制 Worker 的解析器**：`ImportOpenPayload` 增加可选
  `format: 'auto' | 'csv' | 'json'`（渲染进程 ↔ import Worker 的内部协议，不是 IPC/SPEC §15
  通道），`'auto'` 保持 T2.5 的扩展名嗅探。
- 内置 `ImporterDef.parse` 用 table-engine 的 `parseCsv`/`parseJson` 实现，是完整的注册表贡献
  （测试与将来的程序化解析可用）；向导仍把内置文件交给 Worker，因为编码嗅探、分隔符/表头覆盖与
  10 万行规划必须在 Worker 里（T2.5/ADR-031 的边界不变）。
- 插件条目继续在渲染进程解码 + `parse`（ADR-053），失败时保留文件并**继续显示导入器下拉**，
  用户可以切回内置解析器（否则一次插件抛错会把人锁在错误页）。

### 5. 来源标识

- 每个 `RegistryEntry` 带 `source`；UI 在插件标签后追加 `t('plugins.optionSource')`
  （`{label}（插件：{plugin}）`），命令面板条目另带 `data-command-source` 与
  `(插件：<name>)` 徽标。
- 插件名来自 `PluginState.name`（`getPlugins()`），缺失时回退到插件 id。

### 6. 错误隔离、toast 与日志

- 三个调用点包 `try/catch`：`formatFieldCell`（网格/自动列宽/样式预览）、插件命令
  `runPluginCommand`、插件导入器（`runPluginImport` 之后）。
- 失败统一走 `reportPluginError`：归一化为 `AppError`，按 `pluginId + code + message` 在 2 秒内
  去重（防止逐单元格刷屏），写入 200 条环形日志，并发布事件。
- `AppShell` 订阅事件，弹一条**带插件名**的错误 toast，并带“查看插件日志”动作：点击打开插件
  管理器并聚焦日志区（`@curve/ui` 的 `ToastMessage` 增加可选 `action`）。
- 回退：格式化失败 → 该单元格用存储格式化（`null` 返回值）；导入失败 → 内联错误 + 文件保持打开；
  命令失败 → 面板关闭、不产生任何文档变更。其它插件与内置功能不受影响。

### 7. 手动禁用：会话级，不落盘

- 插件管理器（标题栏“插件”按钮 / 命令面板 `app.plugins`）列出每个插件的状态、版本、API 版本、
  当前贡献数量、错误与日志，并提供“禁用/启用”。
- 禁用调用宿主 `deactivate(pluginId)`（先跑 hook，再移除该插件贡献），启用调用
  `activate(pluginId)`；两者都会触发注册表通知，所有打开的选择器随之刷新。
- **不持久化**：不写 `settings.json`、不写 manifest、不改 `AppSettings`；重启后被禁用的插件会
  重新尝试激活。这是最保守、最易回滚的选择（ADR-052 的复核条件要求“若需跨启动记忆”再补迁移）。
- 插件管理器也显示 `disabled`（激活失败）状态并允许“启用”重试。

### 8. 插件命令进入命令面板

- 面板打开时把 `commands` 注册表的条目并入 `buildPaletteItems`；内置 id 优先，插件不能遮蔽内置
  命令。运行插件命令时构造 `PluginCommandContext`：`log` 写入同一个环形日志（`[plugin:<id>]` 前缀），
  `execute(commandId, payload)` 调 `core.commands.dispatch`，失败抛 `AppError`。
- 插件命令没有快捷键与作用域（v1 不在 `CommandDef` 上定义），只通过面板执行。

## 代价

- **内置字段类型的语义函数基本不可达**：`fieldTypeId` 不会指向内置 id，它们的 `parseText`/`format`
  只在注册表契约与单测里使用。这是“id 与存储类型同名、插件不得占用”的必然结果，换来的是
  “存储类型列表也是注册表数据”和无迁移的格式稳定。
- **插件图表预设不能在检查器里回显**：向导选预设后只能看到 series type。要持久化预设需要
  `ChartSpec` 新字段 + `formatVersion` 迁移。
- **禁用不持久化**：坏插件每次启动都会重试并再记一条日志；用户需要每次手动禁用。
- **两个错误面**：导入失败同时有内联错误与 toast（toast 提供日志入口）；去重窗口内的重复失败
  只留第一条。
- **插件文案与命令标签不本地化**：`FieldTypeDef`/`ImporterDef`/`CommandDef` 只有 `label: string`。
- **内置导入器多一条 `format` 协议字段**：渲染进程与 Worker 之间的内部消息，不影响 IPC 契约，
  但 `isImportWorkerRequest` 白名单需要同步（已加测试）。
- **错误状态多渲染一个下拉**：导入向导在“内置打开失败、尚无会话”时不显示导入器（避免空操作），
  只在已打开文件、插件解析失败时显示。

## 影响

- 新增：`apps/desktop/src/renderer/plugins/{builtins,log,errors,labels,use-plugin-snapshot}.ts`、
  `features/plugins/PluginManagerDialog.tsx`、`e2e/plugin-ui.spec.ts`、
  `apps/desktop/test/plugin-contributions.test.ts`、本 ADR 与 `docs/reports/t6.3/REPORT.md`。
- 修改：`renderer/plugins/index.ts`（内置注册、快照/订阅、启用禁用、安全调用、插件命令执行）、
  `features/{columns/ColumnFormDialog,charts/NewChartDialog,charts/ChartInspector,
  import/use-import,import/ImportWizardDialog,keymap/commands,keymap/palette-model,
  keymap/CommandPalette,keymap/use-command-keymap,plugins/PluginManagerDialog}`、
  `renderer/import/{worker-protocol,worker-handler,client}.ts`、`shell/{AppShell,TitleBar}.tsx`、
  `i18n/messages/{zh-CN,en-US}.ts`、`renderer/styles.css`、`packages/ui/src/{Toast.tsx,ui.css,
  Toast.test.tsx}`、`e2e/import-fixtures.ts`、SPEC §13.4/§14.1/§14.3/§14.4、TASKS T6.3、
  TESTPLAN E9、CHANGELOG、HANDOFF、AGENTS §0、ADR 索引。
- 不改：`formatVersion`、JSONL/manifest 字段、`AppSettings`/`settings.json`、IPC 通道与 preload
  API、CSP/Electron 安全选项、错误码、`@curve/plugin-sdk` 公开 API（无新宿主方法）、运行时依赖。

## 复核条件

- 若需要跨启动记住禁用（ADR-052 复核条件）：把禁用列表写进 `settings.json`（新增字段 + 迁移 +
  规范化），补“禁用后重启仍禁用”的 E2E，**不要**塞进 manifest。
- 若需要持久化插件图表预设：给 `ChartSpec` 增加 `kindId`/`presetId`，升级 `formatVersion` 并写
  迁移，再让检查器列出插件预设。
- 若插件导入需要处理大文件：把插件数据集送入 Worker 规划（或拆独立 Worker），不要在渲染进程
  对 10 万行做内联规划。
- 若需要本地化插件文案：把 `label` 升级为 `labelKey`/多语言 map，并更新 SPEC §14.2。
- 若需要“插件失败只提示一次、重启也不重试”：把 `E_PLUGIN_*` 的禁用状态持久化，并重新评估
  “禁用即不再加载”的信任模型。
- 若命令面板需要插件命令快捷键：先给 `CommandDef` 增加 `shortcuts/scopes` 并接入
  `createKeymap` 的冲突检测，不要再开第二套键位表。
