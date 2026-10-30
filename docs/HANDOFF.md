# HANDOFF — Curve Almanac 实施交接

> 本文件面向**下一个实现会话**。**M5 已于 2026-10-29 获用户接受并关闭**（T5.1–T5.5、
> `docs/reports/m5/REPORT.md`、ADR-046–050）。**M6 已开始：`T6.0`（品牌更名
> Curve Studio → Curve Almanac）、`T6.1`（插件 SDK 与注册表）与 `T6.2`（示例插件）已完成**
> （`docs/reports/t6.0/REPORT.md`、`docs/reports/t6.1/REPORT.md`、`docs/reports/t6.2/REPORT.md`；
> ADR-051、ADR-052、ADR-053）；`T6.3`（插件接入 UI 与隔离）–`T6.5` 尚未开始，**不要自动领取**：
> 等用户明确指示后再开始 `T6.3`。
> 最后更新：2026-10-30 · 分支 `main`；M3 验收记录 **`4ec9653`**、T4.1 代码 **`06858d4`**、
> T4.2 代码 **`247093d`**、T4.3 代码 **`7a9b665`**、T4.4 代码 **`862063f`**、
> T4.5 代码 **`fd68789`**、T4.6 代码 **`0fc37aa`**、M4 演示/报告 **`657f8c3`**、
> T5.1 代码/报告 **`eb152b4`**、T5.2 代码/报告 **`a9dcf75`**、T5.3 代码/报告 **`02e30a8`**、
> T5.4 代码/报告 **`fb53d9b`**、T5.5 代码/报告 **`f80acaa`**、M5 演示/报告 **`50f7ea9`**、
> T6.0 代码/报告 **`cc6dd5c`**、T6.1 代码/报告 **`2ea05cf`**、T6.2 代码/报告 **`15e43ed`**
> （本交接文档的提交见 `git log -1 -- docs/HANDOFF.md`）。
> 阅读顺序：`AGENTS.md` → 本文件（§0.3–§0.11）→ `docs/reports/m5/REPORT.md` →
> `docs/reports/t6.0/REPORT.md` → `docs/reports/t6.1/REPORT.md` → `docs/reports/t6.2/REPORT.md` →
> `docs/TASKS.md` 的 M6 → `docs/SPEC.md` → ADR-053/052/051/050/048。

---

## 0. 一页摘要（给下一个会话）

- **当前状态**：M1–M5 均已获用户接受；`T3.1`–`T3.6`、`T4.1`–`T4.6`、`T5.1`–`T5.5`、M5 验收
  演示、**`T6.0`（品牌更名 Curve Almanac）**、**`T6.1`（插件 SDK 与注册表）**与
  **`T6.2`（示例插件）**均已完成；**M5 已于 2026-10-29 关闭**；M6 的 `T6.3`–`T6.5` 尚未开始。
- **本次交接范围**：T6.1 之后的 `T6.2` 示例插件——`plugins/plugin-sample`（`rating` 语义字段类型 +
  points JSON 导入器）、渲染进程组装点与首帧前激活、列对话框“语义类型”、导入向导“导入器”、
  网格/样式预览的字段类型格式化、app-core 的结构化字段类型端口、主进程 `fieldTypeId` 严格解析、
  ADR-053 与 `docs/reports/t6.2/REPORT.md`。不改 IPC/数据格式/CSP，不新增运行时依赖。
- **基线**：`pnpm verify` **188 files / 1761 tests**（ESLint 0；depcruise 514 modules / 2209 deps /
  0 violations）；coverage 全局 lines **77.25%**（statements 77.11% / branches 69.95% /
  functions 76.23%）；`pnpm build` exit 0（renderer **3,394.50 kB**、CSS 77.89 kB、main 338.76 kB）；
  `pnpm e2e` **107 passed**（6.5m）；`pnpm bench` exit 0。
- **硬约束**：不绕过命令总线；不新增未写 ADR 的运行时依赖；不改 `formatVersion`/IPC/公共 API
  而不更新 SPEC/ADR；不跳过验收项；不自动跨任务/里程碑；强杀后不得静默丢数据。
- **停点**：T6.2 已完成；**M6 其余任务（T6.3–T6.5）未开始**。不要自动领取 `T6.3`；等用户
  明确指示后再开始。
- **接手动作**：确认工作树干净、`node_modules` 已安装（含 `echarts@6.1.0`）；读
  `docs/reports/t6.2/REPORT.md`、`docs/reports/t6.1/REPORT.md`、ADR-053/052/051/050/048、TASKS 的 M6；
  收到“开始 M6 下一任务”后按 §0.3 领取 `T6.3`。
- **M5 完成结果**：2 表 3 视图 → 复制视图/水平分栏/移动标签 → 5 次编辑 + 撤销/重做 5 步 →
  提交 200 后强杀（999 丢弃、200 保留）→ 尝试恢复 → 关闭后从最近列表重开 → 英文 + 深色 →
  重启后 2 pane / 3 标签 / Readings 活动 / 值 200 全部还原。截图在 `docs/reports/m5/`。
- **T6.0 完成结果**：Curve Studio → Curve Almanac：`shared/brand.ts` 的 `APP_NAME` 统一
  `productName`/窗口标题/`<title>`/`app.name`/关于菜单/文案；新建默认父目录
  `Documents/Curve Almanac`；userData 改为 `%APPDATA%/Curve Almanac`（v1 未发布，不做迁移）；
  品牌一致性测试 2 条 + i18n 旧名断言 1 条；截图 `docs/reports/t6.0/t6.0-window.png`。
- **T6.1 完成结果**：`@curve/plugin-sdk` 的公开契约与宿主——`Registry<T>`（`subscribe`、带
  `source` 的 `list`、owner 化 `replace`）、四类注册表、`createPluginHost`（版本主版本校验、
  定义/贡献校验、激活失败回滚 + `disabled`、deactivate、内存禁用列表）、`ImportResult`；
  26 条单测（registry 10 + host 15 + 骨架 1）；报告 `docs/reports/t6.1/REPORT.md`。
- **T6.2 完成结果**：`plugins/plugin-sample` 的 `rating` 语义字段类型（`com.curvealmanac.rating`，
  storageType number，`★` 格式化，1–5 校验）与 points JSON 导入器（`com.curvealmanac.points`）；
  渲染进程组装点首帧前激活；列对话框“语义类型”、列表面板徽标、网格/自动列宽/样式预览的字段类型
  格式化；导入向导“导入器”下拉（渲染进程解析 + 内联规划）；app-core 结构化 `FieldTypeLookup`
  （命令层与编辑器同规则）；主进程只读 `sampleFieldTypes` 严格解析 `fieldTypeId`（载入不再警告）；
  29 条插件单测 + 3 条 E2E；ADR-053、报告 `docs/reports/t6.2/REPORT.md`（2 张截图）。
- **T5.1 完成结果**：2 表 3 视图 → 水平分栏 → 移动标签 → 比例 0.35 → 垂直/4 pane → 关闭空
  pane → 重启恢复；非法 layout（缺失引用/ratio 0.1）回退单 pane 且视图不丢；标签 Arrow/
  Ctrl+W 与 200% 缩放通过；截图在 `docs/reports/t5.1/`。
- **T5.2 完成结果**：5 次间隔 >800ms 的编辑 → 撤销 5 次、重做 3 次并断言 JSONL；标签切换/
  选择/滚动不入历史，焦点切换保留 redo；关闭/重开清空历史；Edit 菜单显示
  “撤销 编辑单元格（Ctrl+Z）”；100 步/256MB/各命令单条由单测覆盖；截图在
  `docs/reports/t5.2/`。
- **T5.3 完成结果**：编辑后 1.5s 落盘、Ctrl+S 立即写、去抖窗口内退出仍保存且下次启动无恢复
  提示；`taskkill /F /T` 强杀后恢复对话框提示“最后 1.5 秒”并恢复已提交数据；伪造 stale/
  corrupt 锁出现“尝试恢复/直接打开”；损坏 manifest 列备份、取消不改字节、重建后行数据相等；
  只读表文件显示“保存失败”且重试成功；最近列表可移除/清空。截图在 `docs/reports/t5.3/`。
- **不要回退的东西**：`LayoutNode` 形状、`view.create/delete/update/layout` 命令名与撤销语义、
  `activePanePath` 的 UI-only 性质、500ms 布局去抖 + flush、`workspace-empty` 空态契约、
  `pane` 的 `data-pane-active`（不要改回 `data-active`，网格/粘贴依赖它）、M4 的图表契约；
  T5.2 的 `EditHistory` 单一栈、`ui.history` 快照、`data-undo-depth`/`data-undo-action` 契约；
  T5.3 的 `SaveQueue` 1.5s/10s 窗口、`app:quit-*` 握手、clean quit 删除 `.lock`、flush 失败
  保留 `.lock`、`workspace:inspect` 只读、`recentRemove`/`recentClear` 名称；T5.4 的
  `APP_COMMANDS` 快捷键表/作用域、`KeymapConflictError`、`data-command-id`/
  `data-command-recent`、面板只在打开时挂载与 AppShell 不订阅 store 的性能约束；T6.0 的
  `APP_NAME` 单一来源与 `productName`/`<title>`/`app.name` 一致性测试（再改名前先看 ADR-051）；
  T6.1 的 `Registry` 语义（`subscribe` 同步快照、`source`、插件只能 `replace` 自己的贡献、
  宿主 `dispose` 关闭/插件 `dispose` 只清自己）、`isCompatibleApiVersion` 主版本规则、
  `createPluginHost` 的错误隔离与 `E_PLUGIN_*` code（不要改成抛错中断整批插件）；T6.2 的
  `com.curvealmanac.rating` / `com.curvealmanac.points` id、`parseText` 只做类型/`validate` 管值域
  的分工、`ColumnDraft.fieldTypeId` 三态、`FieldTypeLookup` 结构化端口（app-core 不 import
  plugin-sdk）、`StyledCellOptions.formatField` 回调、`plugin.spec.ts` 的
  `column-form-field-type`/`import-importer`/`data-field-type` 契约（ADR-053）。

### 0.1 T5.1 结果（2026-10-27 完成）

1. 用例：`apps/desktop/e2e/layout.spec.ts` 3 条——分栏/移动/比例/4 pane/重启（5.2s）、
   非法 layout 回退（2.2s）、键盘 + 200% 缩放（2.5s）；报告 `docs/reports/t5.1/REPORT.md`。
2. 实测：2 pane ratio 0.35；4 pane（水平+垂直）后回到 2 pane；重启后 pane 数/比例/每个 pane
   的活动标签恢复；缺失引用与 ratio 0.1 均回退 1 pane + 3 标签 + warning；ArrowRight 切换、
   Ctrl+W 关闭、Separator ArrowDown 到 52%。
3. 保存：纯布局变更 500ms 去抖，`flushSaves`/关闭工作区/Ctrl+S 冲掉；视图创建/删除/更新
   立即写。`view.layout` 的可选 `activePanePath` 不写 manifest。
4. 证据：报告 + **4 张截图**（split / four-panes / fallback / restored）；
   `pnpm e2e` 重写 `docs/reports/m0/*.png`，提交前已还原。
5. 提交：**`eb152b4`**（`feat(layout): add recursive split panes and tabs (T5.1)`）。
6. 残留：最后聚焦 pane 不持久化（重启焦点为第一个有活动标签的 pane）；分栏创建空 pane；
   无跨 pane 拖拽；强退可能丢最后 500ms 布局变化（已由 T5.3 退出 flush 处理）；详见报告 §8 与
   ADR-046。

### 0.2 T5.2 结果（2026-10-28 完成）

1. 用例：`apps/desktop/e2e/undo.spec.ts` 3 条——5 次编辑（间隔 900ms）→ 撤销 5 次/重做 3 次
   + JSONL + Edit 菜单（7.6s）；标签/选择/滚动不入历史 + 焦点切换保留 redo + 关闭/重开清空
   （3.7s）；键盘打开菜单 + 200% 缩放不越界（2.9s）。报告 `docs/reports/t5.2/REPORT.md`。
2. 历史：`EditHistory` 单一栈默认记录所有带 patches 的命令；`view.layout` 仅在布局树忽略
   `activeViewId` 后变化时入栈；`table.cell.set` 保留 800ms/`mergeKey` 合并，redo 非空时不再
   并进旧条目。单测覆盖 100 步、256MB 估算、100k 行单元格补丁、表/列/行/视图/图表/导入。
3. 上限：100 条或 256MB 估算；行数组与当前表共享时只计数组（100k ≈ 800KB），独特行数组
   （import replace/删表/删列）抽样 16 行外推；超限丢最旧，单条超限也丢；不用 JSON.stringify。
4. 保存：行补丁走表 + manifest；纯 manifest 命令只写 manifest；删除表 redo 只移除 manifest
   引用，可能留下无害孤儿文件。撤销/重做复用 `SaveQueue`，打开/关闭清空历史与 `ui.history`。
5. UI：TitleBar 新增“编辑”Menu，显示“撤销 编辑单元格（Ctrl+Z）”/“重做 …”与空栈禁用态；
   `ui.history` 快照含 depth/action；`data-undo-depth`/`data-undo-action` 是 E2E 契约。
6. 证据：报告 + **2 张截图**（`t5.2-history-menu.png`、`t5.2-history-undone.png`）。
7. 提交：**`a9dcf75`**（`feat(undo): add full command history and Edit menu (T5.2)`）。
8. 残留：256MB 是估算（共享行数组低估、独特行高估）；单条超大导入会失去撤销；`table.delete`
   redo 留孤儿文件；`table.meta.update` 菜单文案不区分重命名/换主键；原生 Electron Edit 菜单
   仍未与历史同步。详见报告 §8 与 ADR-047“复核条件”。

### 0.3 下一会话行动清单（M6 剩余任务启动前；T6.0/T6.1/T6.2 已完成）

> 前提：T5.1–T5.5、M5 验收演示、**T6.0 品牌更名**、**T6.1 插件 SDK/注册表**与 **T6.2 示例插件**
> 均已完成，**M5 已于 2026-10-29 获用户接受并关闭**。**M6 的 `T6.3`–`T6.5` 尚未开始；不要自动
> 领取任何 M6 任务。**

1. 开场先确认：`git status --short` 干净、`pnpm --version` 11.28.5、`pnpm verify`
   188 files / 1761 tests、`pnpm e2e` 全量结果见 §0.10、`pnpm bench` exit 0；读 TASKS 的 M5 验收
   记录、报告 `docs/reports/m5/REPORT.md`、`docs/reports/t6.0/REPORT.md`、
   `docs/reports/t6.1/REPORT.md`、`docs/reports/t6.2/REPORT.md` 与 §0.7–§0.11。
2. 只有收到用户明确的“开始 M6 下一任务”指令后，才领取 TASKS 的 `T6.3`（插件接入 UI 与隔离）；
   先读 SPEC §14.3、ADR-010（插件静态加载）、ADR-015（存储类型）、ADR-052（注册表/宿主语义）、
   ADR-053（T6.2 接线）与 TASKS 的 M6 顺序。
3. 若用户要求重跑 M5 演示：独占 CPU 执行
   `pnpm exec playwright test --config apps/desktop/playwright.config.ts apps/desktop/e2e/m5-acceptance.spec.ts`，
   截图/指标会重写到 `test-results/`，复制回 `docs/reports/m5/`，`m0` 截图提交前还原。
4. 不要回退：T5.3 的 SaveQueue 窗口/flush、T5.4 的快捷键表、T5.5 的 `settings.json`/
   `app:settings`/`SettingsProvider`、T3.1 内置模板、M4 图表契约、T5.1 的 layout 契约、
   T6.0 的 `APP_NAME` 单一来源与品牌一致性测试、T6.1 的注册表/宿主语义（`subscribe`、`source`、
   owner 化 `replace`、错误隔离与 `E_PLUGIN_*`）、T6.2 的字段类型 id 与
   `parseText`/`validate` 分工、`ColumnDraft.fieldTypeId` 三态、`FieldTypeLookup` 端口、
   `formatField` 回调与 `plugin.spec.ts` 的 data 契约。
5. 演示说明：M5 demo 的 999 丢失是 SPEC §13.3 允许的最后 1.5s 窗口；恢复对话框提示已断言。
6. M5 报告里的 7 张截图是证据，不做像素基线；`m5-metrics.json` 是结构化指标。

### 0.4 T5.3 结果（2026-10-28 完成）

1. 用例：`apps/desktop/e2e/autosave.spec.ts` 4 条——1.5s 窗口 + Ctrl+S 立即写（5.0s）、
   去抖窗口内退出仍保存且下次启动无恢复提示（3.8s）、只读表文件“保存失败”→取消退出→恢复可写
   重试（4.1s）、最近列表移除/清空（2.8s）；`apps/desktop/e2e/recovery.spec.ts` 4 条——
   `taskkill /F /T` 强杀恢复（6.0s）、stale/corrupt 锁的“尝试恢复/直接打开”（2.8s）、
   200% 缩放 + 纯键盘恢复对话框（2.7s）、损坏 manifest 的取消/备份重建（2.8s）。
   报告 `docs/reports/t5.3/REPORT.md`。
2. 保存：`SaveQueue` 1.5s trailing 去抖 + 10s 上限；`flush()`/`retry()` 立即写；布局 500ms
   去抖仍只调 `enqueueManifest()`；失败保留 dirty 与 `ui.save.error`，状态栏可重试。
3. 退出：`quit-guard.ts` 拦截 close/before-quit，`app:quit-requested` → renderer flush ≤3s →
   成功时 `workspace.close` 删除 `.lock` → `app:quit-response`；失败/超时原生“退出/取消”确认，
   取消保持应用打开；flush 失败后确认退出故意保留锁。新增单实例锁与 E2E 确认替身。
4. 恢复：`workspace:inspect`（只读）+ `workspace:open({ recovery })`；显式 manifest 备份重建、
   stale/corrupt 锁 + 损坏 manifest 的最新备份自动恢复、active lock 拒绝；UI 两个对话框；
   打开时表读取失败会 close 工作区。
5. 最近列表：`recent.json` 的 remove/clear、`workspace:recent:remove|clear`、preload
   `recentRemove/recentClear`、欢迎页移除/清空。
6. 证据：报告 + **5 张截图**（`t5.3-autosave-status.png`、`t5.3-save-failure.png`、
   `t5.3-recovery-stale-lock.png`、`t5.3-recovery-lock-choices.png`、
   `t5.3-recovery-manifest.png`）。
7. 提交：**`02e30a8`**（`feat(ws): add autosave, quit flush and crash recovery (T5.3)`）。
8. 残留：强杀仍可能丢最后 1.5s；flush 失败后确认退出留 stale lock；原生退出确认/恢复提示为
   英文（main 无 i18n）；`inspect` 多读一次 manifest；自动重建只尝试最新备份；自动保存关闭后的
   “保存/放弃/取消”三选一留 T5.5。详见报告 §8 与 ADR-048“复核条件”。

### 0.5 T5.4 结果（2026-10-28 完成）

1. 用例：`apps/desktop/e2e/palette.spec.ts` 3 条——Ctrl+K 过滤“分栏”→执行水平分栏→最近使用
   排第一→从面板撤销（3.1s）；编辑器内 Ctrl+K 不打开、F1 帮助快捷键表、表格视图下“复制当前
   图表”禁用原因、面板内 Ctrl+V 原生、Ctrl+Alt+H 分栏/Ctrl+Z 撤销、Ctrl+Shift+D 复制表视图
   （3.4s）；200% 缩放 ↑↓/Home/End、无结果态、执行“切换侧栏”（3.1s）。报告
   `docs/reports/t5.4/REPORT.md`。
2. 注册表：`features/keymap/commands.ts` 的 `APP_COMMANDS`（17 条）只调用既有 actions/Shell
   回调；`shortcut.ts` 归一 Ctrl/Cmd、Shift、Alt 与 F1，`keymap.ts` 按作用域交集检测冲突并抛
   `KeymapConflictError`，`isEditableTarget` 排除 input/textarea/select/contenteditable/
   `[role=dialog]`，全局监听在 `window` 冒泡阶段跳过 `defaultPrevented`/`repeat`/`isComposing`。
   快捷键表见 SPEC §13.4；`grid`/`chart` 在互斥作用域复用 Ctrl/Cmd+Shift+D。
3. 面板：`CommandPalette.tsx` = `Dialog` + `Input(ref)` + `role=listbox/option` +
   `aria-activedescendant`；`command-search.ts` 对标签/命令 id 做子序列匹配（空查询最近优先，
   非空按分数）；`recent-commands.ts` 最多 8 条写 `localStorage`，只在打开面板时读取；
   禁用项保留并显示 `command.reason.*`；E2E 契约 `data-testid="command-palette"`、
   `command-palette-input`、`command-palette-list`、`data-command-id`、`data-command-recent`。
4. 帮助：`HelpDialog` 的命令表来自同一注册表（F1 打开）；关闭时与面板一样按需挂载。
5. **性能**：第一版常驻面板/AppShell 订阅 store 使 chart-perf 100k 切换 private 到
   605–615MB（门禁 600MB）；改为 **AppShell 不订阅 store + 面板打开时快照/条件挂载 +
   执行前复查 + 最近使用延迟读取** 后，全量 E2E 该场景 **506MB**（isolated 509–519MB）。
   不要改回常驻面板或让 `useCommandKeymap` 引入 `useAppState` 订阅。
6. 实测：`pnpm verify` **174 files / 1634 tests**；depcruise 481 modules / 2028 deps /
   0 violations；coverage 全局 lines **76.74%** / statements 76.59% / branches 69.41% /
   functions 75.18%（`features/keymap` lines **90.27%**、branches 82.37%）；`pnpm build`
   exit 0（renderer **3,342.56 kB**、CSS **77.49 kB**）；`pnpm e2e` **99 passed**（7.4m）；
   `pnpm bench` exit 0。
7. 证据：报告 + **3 张截图**（`t5.4-palette-search.png`、`t5.4-palette-disabled.png`、
   `t5.4-palette-empty-200.png`）；E2E 仍会重写 `docs/reports/m0/*.png`，提交前已还原。
8. 提交：**`fb53d9b`**（`feat(keymap): add shortcuts and command palette (T5.4)`）；工作树干净。
9. 残留：快捷键不可自定义；Ctrl/Cmd+Alt 在部分 AltGr/输入法布局可能被占用；面板可用性是
   打开时快照（模态期间文档不变，执行前复查）；新建表/导入/筛选/导出/图表向导等局部对话框
   未进入面板（ADR-049 复核条件）。详见报告 §8 与 ADR-049“复核条件”。

### 0.6 T5.5 结果（2026-10-29 完成）

1. 用例：`apps/desktop/e2e/settings.spec.ts` 4 条——语言/主题/自动保存改后重启保留（3.9s）、
   自动保存关闭时关闭工作区的保存/放弃/取消（5.0s）、退出时取消保持窗口/保存后退出并重启
   读回（3.6s）、+30% 伪本地化 + 200% 缩放布局（1.7s）。报告 `docs/reports/t5.5/REPORT.md`。
2. 设置：`userData/settings.json` 的 `AppSettings { version, theme, locale, autosave,
   defaultTableStyleId }`；新增 `app:settings`/`app:settings:update`（ALL 22→24、已实现
   19→21），main 逐字段回退、原子串行写；`main.tsx` 首帧前读取（1.5s 兜底）。新工作区从应用
   设置继承 manifest `settings`；已有工作区保留自己的默认样式。
3. Provider：`SettingsProvider` 最外层，`I18nProvider`/`ThemeProvider` 受控；标题栏“设置”与
   命令面板 `app.settings` 打开对话框。默认表格样式在有工作区时走
   `style.apply { target:'default' }`，无工作区时作为新工作区种子。
4. 自动保存关闭：`SaveQueue` 不安排定时器，`SaveState.unsaved` 标记；关闭窗口/工作区弹
   “保存并继续 / 放弃修改 / 取消”。保存走 `flush()`；放弃走 `closeWorkspace({ save:false })`
   （不写盘、删 `.lock`）；取消保持打开。main 退出握手超时关闭时 60s、开启时 3s。
5. i18n：en-US 与 zh-CN key 集一致、无空文案、除 `language.zh-CN` 外无 CJK；`translateKey`
   开发构建缺 key 抛错、生产回退；文案门禁扩展到 `aria-label`/`title`/`placeholder` 等属性。
6. **不要回退**：`settings.json` 形状与 `app:settings*` 名称、`SettingsProvider` 受控
   provider 组合、`SaveState.unsaved`/`'unsaved'` 阶段、`closeWorkspace({save:false})`、
   `UNSAVED_QUIT_TIMEOUT_MS`、`data-testid="settings-*"`/`open-settings` 契约。
7. 实测：`pnpm verify` **179 files / 1682 tests**；depcruise 492 modules / 2118 deps /
   0 violations；coverage statements 76.86% / branches 69.64% / functions 75.55% / lines 77.01%；
   `pnpm build` exit 0（renderer **3,365.14 kB**、CSS **77.89 kB**）；
   `pnpm e2e` **103 passed**；`pnpm bench` exit 0。
8. 残留：应用设置与 manifest 为两份快照；自动保存关闭时显式 action 仍 flush；设置写失败只在
   对话框提示；main 原生对话框仍英文；+30% 是 DOM 伪本地化。详见报告 §8 与 ADR-050
   “复核条件”。

### 0.7 M5 验收演示结果（2026-10-29 执行并获接受，M5 已关闭）

1. 用例：`apps/desktop/e2e/m5-acceptance.spec.ts` 1 条、**20.2s**、三次启动 + 一次
   `taskkill /F /T`。报告 `docs/reports/m5/REPORT.md` + 7 张截图 + `m5-metrics.json`。
2. 结果：2 表 3 视图（复制视图）→ 水平分栏 2 pane → 移动标签（pane0 Sensors+Readings，
   pane1 Sensors (2)）；5 次编辑（间隔 >800ms）后历史深度 3→8，撤销 5 次回 3/值 5，重做 5 次
   回 8/值 105；提交 200 落盘后编辑 999 强杀 → 恢复提示“最后 1.5 秒”；尝试恢复后 2 pane/3 标签
   与 200 保留、999 丢弃；关闭后最近列表重开无提示；设置 en-US/dark 后重启全部还原。
3. 指标：`baseDepth=3`、`editDepth=8`、`redoDepth=0`、`recoveredValue=200`、
   `recentEntries=1`、`finalPanes=2`、`finalTabs=3`、`manifestTables=2`、`manifestViews=3`。
4. 全量 E2E **104 passed**（6.2m，含 M5 1 条 20.2s；chart-perf private **503MB**）。
   `pnpm verify` **179 files / 1682 tests**；depcruise 493/2126；`pnpm build` exit 0
   （renderer 3,365.14 kB、CSS 77.89 kB）；`pnpm bench` exit 0。
5. 证据：`docs/reports/m5/m5-01-two-panes.png`、`m5-02-history.png`、`m5-03-before-kill.png`、
   `m5-04-recovery.png`、`m5-05-restored-layout.png`、`m5-06-english-dark.png`、
   `m5-07-restart-restored.png`。`m0` 截图已还原。
6. **验收**：用户于 2026-10-29 接受 M5；**M5 已关闭**。M6 后续进展见 §0.8（T6.0）、
   §0.9（T6.1）与 §0.10（T6.2）。

### 0.8 T6.0 结果（2026-10-29 完成）

1. 证据：`docs/reports/t6.0/REPORT.md` + `t6.0-window.png`；品牌一致性测试
   `apps/desktop/src/main/brand.test.ts` 2 条、`i18n.test.ts` 1 条（旧名不得出现在消息表）。
2. 实测：`pnpm verify` **180 files / 1685 tests**；depcruise 494 modules / 2138 deps /
   0 violations；coverage statements 76.86% / branches 69.65% / functions 75.55% / lines 77.01%；
   `pnpm build` exit 0（renderer **3,365.92 kB**、CSS 77.89 kB）；定向 e2e **11 passed**
   （smoke 5 + shell 6，26.2s）。
3. 变更：`shared/brand.ts` 的 `APP_NAME` 是唯一来源；`productName`、窗口标题、`<title>`、
   `app.name`、关于菜单、退出确认、日志、欢迎页/模板文案均引用；新建默认父目录
   `Documents/Curve Almanac`；userData `%APPDATA%/Curve Almanac`（v1 未发布，不迁移）；
   T6.4 的 `appId` 计划改为 `com.curvealmanac.app`。
4. **不要回退**：`APP_NAME` 常量与 `productName`/`<title>` 的一致性测试；旧名只允许出现在
   历史 ADR/报告与测试的“不得包含”断言里。
5. 提交：`feat(brand): rename product to Curve Almanac (T6.0)`（hash 见
   `git log -1 -- docs/HANDOFF.md`）。
6. 残留：userData 偏好一次性重置；旧默认目录不再预填；main 原生对话框仍英文；`appId` 只在
   文档/T6.4 计划中更新。详见报告 §5 与 ADR-051“复核条件”。

### 0.9 T6.1 结果（2026-10-29 完成）

1. 交付：`packages/plugin-sdk/src/{types,registry,host,logging}.ts`；`index.ts` 只导出
   `PLUGIN_API_VERSION`、`createPluginHost`、`isCompatibleApiVersion` 与公开类型。
   `Registry<T>` 增加 `subscribe` 与带 `source` 的 `list`；插件视图绑定自身 id；宿主激活器
   做版本/定义/贡献校验、失败回滚、禁用列表与 deactivate。ADR-052、报告
   `docs/reports/t6.1/REPORT.md`。
2. 实测：`pnpm exec vitest run packages/plugin-sdk` **3 files / 26 tests**；`pnpm verify`
   **182 files / 1710 tests**；depcruise 500 modules / 2156 deps / 0 violations；coverage
   statements 77.08% / branches 69.85% / functions 75.93% / lines 77.24%（plugin-sdk lines
   87.96%）；`pnpm build` exit 0（renderer 3,365.92 kB 不变）。
3. **不要回退**：`subscribe` 同步快照 + 监听器异常隔离；`source`/owner 规则；插件只能替换自己
   的贡献；宿主 `dispose` 关闭注册表、插件 `dispose` 只清自己；`E_PLUGIN_*` 语义；禁用列表
   仅内存。
4. 提交：`feat(plugin): add plugin SDK registries and host (T6.1)`（hash 见
   `git log -1 -- docs/HANDOFF.md`）。
5. 残留：未接 UI/命令总线（T6.3）；禁用列表不持久化；`ImportResult` 与 table-engine 的
   `ImportDataset` 仅结构兼容；`lib` 增加 DOM 仅为 `AbortSignal`。详见报告 §5 与 ADR-052。

### 0.10 T6.2 结果（2026-10-30 完成）

1. 交付：`plugins/plugin-sample`（`@curve/plugin-sample`）——`rating` 字段类型
   （`com.curvealmanac.rating`，storageType number，`★` 格式化，1–5 校验，nulls-last 比较）与
   points 导入器（`com.curvealmanac.points`，接受 `{"points":[…]}` 或点数组）；插件定义
   `com.curvealmanac.sample` 由 `apps/desktop/src/renderer/plugins/index.ts` 静态导入并在首帧前
   `activateAll()`。列对话框“语义类型”（只列 storageType 匹配的类型、换类型清空、可显式清除）+
   列表徽标（`data-field-type`）；导入向导“导入器”（插件导入器在渲染进程解码+解析、内联规划，
   内置 CSV/JSON 仍走 Worker）；网格/自动列宽/样式预览使用字段类型 `format`；app-core 结构化
   `FieldTypeLookup`（命令层与编辑器同规则）；主进程只读 `sampleFieldTypes` 严格解析
   `fieldTypeId`。ADR-053、报告 `docs/reports/t6.2/REPORT.md`（2 张截图）。
2. 实测：`pnpm exec vitest run plugins/plugin-sample` **3 files / 29 tests**；`pnpm verify`
   **188 files / 1761 tests**；depcruise 514 modules / 2209 deps / 0 violations；coverage
   statements 77.11% / branches 69.95% / functions 76.23% / lines 77.25%（plugin-sample lines
   97.64%）；`pnpm build` exit 0（renderer 3,394.50 kB、CSS 77.89 kB、main 338.76 kB）；定向
   e2e **3 passed**（13.0s）；全量 e2e **107 passed**（6.5m）；`pnpm bench` exit 0（全部预算内）；
   `pnpm format:check` 通过。
3. **不要回退**：两个贡献 id；`parseText` 只做类型解析、值域在 `validate`（0/6 必须报“超出允许
   范围”）；`ColumnDraft.fieldTypeId` 三态（`undefined` 保留 / `null` 清除 / 字符串选择）；
   `FieldTypeLookup` 结构化端口（app-core 不 import plugin-sdk）；`formatField` 回调（ui 不 import
   plugin-sdk）；`plugin.spec.ts` 依赖的 `column-form-field-type`、`import-importer`、
   `data-field-type` 属性名；导入器切换前的字节副本（Worker transfer 会 detach）。
4. 提交：**`15e43ed`**（`feat(plugin): add sample plugin and semantic field types (T6.2)`）。
5. 残留：插件导入在主线程解析与规划（大文件需迁移 Worker）；每次导入多一份字节副本；字段类型
   label 不本地化；CSV 导出未接语义格式化；UI 只在启动时读共享注册表快照，运行时启用/禁用、
   来源徽标、错误 toast 与手动禁用仍属 T6.3。详见报告 §6 与 ADR-053“复核条件”。

### 0.11 T6.3 接手要点（未领取，等用户明确指示）

> 本节只记录 **T6.3 的起点与约束**，不代表任务已开始。T6.3 依赖 T6.2、T2.5、T3.2 已满足。

1. **范围（TASKS T6.3，覆盖 FR-EXT-01/02）**：
   - 列类型选择器/导入器列表/图表类型列表**全部**改为读取插件宿主注册表；
   - 移除剩余硬编码内置列表，改为“注册表 + 内置注册”（内置字段类型 5 种、CSV/TSV + JSON 导入器、
     line/scatter/bar 图表类型、§13.1 的命令）；
   - 插件贡献的菜单项/选项加**来源标识**（`source` 已由 T6.1 提供）；错误 toast 带插件名、可跳日志；
   - **错误边界**与“禁用插件”入口（手动禁用/持久化在此决定，ADR-052 复核条件）；
   - 贡献点变更后的 **UI 刷新**（使用 `Registry.subscribe`）。
2. **T6.2 留下的确切状态**：
   - 字段类型：列对话框只读 `listFieldTypes()`（插件贡献）；**内置 5 种存储类型仍是硬编码**
     `COLUMN_TYPES`（`features/columns/column-form.ts`）。
   - 导入：向导的插件分支已读 `listImporters()`；内置 CSV/JSON 仍由 Worker 的自动检测驱动，
     **没有内置 ImporterDef 注册**。
   - 图表类型/命令：**尚未**读 `chartKinds`/`commands`（T6.2 未接）。
   - 激活：只在 `main.tsx` 首帧前 `activateAll()` 一次；没有运行时启用/禁用、没有订阅刷新、
     没有来源徽标/错误 toast/插件管理面板。
3. **不要破坏的 T6.2 契约**：`com.curvealmanac.rating`/`com.curvealmanac.points` id、
   `parseText` 只做类型而 `validate` 管值域（0/6 → “超出允许范围”）、`ColumnDraft.fieldTypeId`
   三态、app-core 的 `FieldTypeLookup` 结构化端口、`@curve/ui` 的 `formatField` 回调、
   `plugin.spec.ts` 的 `column-form-field-type`/`import-importer`/`data-field-type`。
4. **性能与架构约束**：`subscribe` 是同步快照，UI 监听器必须合并刷新且只在面板打开时快照
   （T5.4 的 AppShell 不订阅 store、chart-perf 600MB 门禁）；不要常驻订阅文档 store。
5. **已知可回收的点（T6.3 决定）**：插件导入在主线程规划 + 字节副本（ADR-053 复核条件：
   需要大文件时把数据集送入 Worker 或拆 Worker）；主进程/渲染进程字段类型集合分离（主进程按
   编译进包定义严格校验、渲染进程按实际激活解析）；`ImportResult` ↔ `ImportDataset` 的映射已在
   `features/import/plugin-import.ts`，内置注册时复用同一映射。
6. **验证形态（预期）**：`pnpm e2e -- --grep "plugin-ui"`（TASKS 指定）新增 `plugin-ui` spec，覆盖
   “移除示例插件后 UI 不残留选项”“插件抛错只影响自身”“贡献点全部来自注册表（grep 无硬编码）”；
   同时保持 `plugin.spec.ts` 3 条与全量套件为绿（T6.2 基线 107 passed，新增 spec 后计数会变）。

---

## 1. 当前进度快照

| 项 | 状态 |
|---|---|
| 方案文档 | v1.0 已锁定（SPEC / TASKS / TESTPLAN / DECISIONS） |
| M0 基建（T0.1–T0.5） | **已完成**；验收报告 `docs/reports/m0/REPORT.md` |
| M1 领域与持久化（T1.1–T1.5） | **已完成并经用户验收**（2026-10-21）；报告 `docs/reports/m1/REPORT.md` |
| `T1.5` app-core 状态与命令总线 | **已完成**（`c077cf2`）；T2.1–T5.3 扩展了命令、actions、历史与保存 |
| `T2.1` 工作区入口、表管理与网格 | **已完成**（`07c4763`）；报告 `docs/reports/t2.1/REPORT.md`；ADR-027 |
| `T2.2` 单元格编辑与校验 | **已完成**（`641cd86`）；报告 `docs/reports/t2.2/REPORT.md`；ADR-028 |
| `T2.3` 列管理、结构变更与迁移 | **已完成**（`213fab4`）；报告 `docs/reports/t2.3/REPORT.md`；ADR-029 |
| `T2.4` 区域粘贴 | **已完成**（`14c4816`）；报告 `docs/reports/t2.4/REPORT.md`；ADR-030 |
| `T2.5` CSV/JSON 导入向导 | **已完成**（`16ba035`）；报告 `docs/reports/t2.5/REPORT.md`；ADR-031 |
| `T2.6` 筛选、排序与视图状态 | **已完成**（`1149100`）；报告 `docs/reports/t2.6/REPORT.md`；ADR-032 |
| `T2.7` 10 万行性能硬化 | **已完成**（`553f71b`）；报告 `docs/reports/t2.7/REPORT.md`；ADR-033 |
| M2 验收演示 | **已获用户接受**（2026-10-23）；`e2e/m2-acceptance.spec.ts` + `docs/reports/m2/REPORT.md` |
| `T3.1` 表格样式模型与内置模板 | **已完成**（2026-10-23，`b75fff1`）；报告 `docs/reports/t3.1/REPORT.md`；ADR-034 |
| `T3.2` 样式渲染管线 | **已完成**（2026-10-23，`cd415d6`）；报告 `docs/reports/t3.2/REPORT.md`；ADR-035 |
| `T3.3` 条件格式引擎 | **已完成**（2026-10-24，`0a6bedf`）；报告 `docs/reports/t3.3/REPORT.md`；ADR-036 |
| `T3.4` 样式编辑器与实时预览 | **已完成**（2026-10-24，`7e695bb`）；报告 `docs/reports/t3.4/REPORT.md`；ADR-037 |
| `T3.5` 模板管理与导入导出 | **已完成**（2026-10-24）；报告 `docs/reports/t3.5/REPORT.md`；ADR-038 |
| `T3.6` CSV 导出 | **已完成**（2026-10-24）；报告 `docs/reports/t3.6/REPORT.md`；ADR-039 |
| M3 验收演示 | **已获用户接受**（2026-10-24）；`e2e/m3-acceptance.spec.ts` + `docs/reports/m3/REPORT.md`（10 张截图） |
| `T4.1` RenderModel 与宽/长表映射 | **已完成**（2026-10-24，`06858d4`）；报告 `docs/reports/t4.1/REPORT.md`；ADR-040 |
| `T4.2` LTTB 采样与缺失值语义 | **已完成**（2026-10-25，`247093d`）；报告 `docs/reports/t4.2/REPORT.md`；ADR-041 |
| `T4.3` ECharts 适配器 | **已完成**（2026-10-25，`7a9b665`）；报告 `docs/reports/t4.3/REPORT.md`；ADR-042 |
| `T4.4` 图表创建与检查器 | **已完成**（2026-10-25，`862063f`）；报告 `docs/reports/t4.4/REPORT.md`；ADR-043 |
| `T4.5` 图表交互、空态与 PNG 导出 | **已完成**（2026-10-26，`fd68789`）；报告 `docs/reports/t4.5/REPORT.md`；ADR-044 |
| `T4.6` 图表性能硬化 | **已完成**（2026-10-26，`0fc37aa`）；报告 `docs/reports/t4.6/REPORT.md`；ADR-045 |
| M4 验收演示 | **已获用户接受**（2026-10-27）；`e2e/m4-acceptance.spec.ts` + `docs/reports/m4/REPORT.md`（7 张截图）；全量 E2E 82 passed |
| `T5.1` 分栏布局与标签页 | **已完成**（2026-10-27，`eb152b4`）；报告 `docs/reports/t5.1/REPORT.md`；ADR-046；4 张截图 |
| `T5.2` 撤销/重做 | **已完成**（2026-10-28，`a9dcf75`）；报告 `docs/reports/t5.2/REPORT.md`；ADR-047；2 张截图 |
| `T5.3` 自动保存、恢复与最近打开 | **已完成**（2026-10-28，`02e30a8`）；报告 `docs/reports/t5.3/REPORT.md`；ADR-048；5 张截图 |
| `T5.4` 快捷键与命令面板 | **已完成**（2026-10-28，`fb53d9b`）；报告 `docs/reports/t5.4/REPORT.md`；ADR-049；3 张截图 |
| `T5.5` 设置与国际化 | **已完成**（2026-10-29，`f80acaa`）；报告 `docs/reports/t5.5/REPORT.md`；ADR-050；4 张截图 |
| M5 验收演示 | **已获用户接受并关闭**（2026-10-29）；`e2e/m5-acceptance.spec.ts` + `docs/reports/m5/REPORT.md`（7 张截图 + metrics） |
| `T6.0` 品牌更名 | **已完成**（2026-10-29）；`docs/reports/t6.0/REPORT.md`；ADR-051；默认目录 `Documents/Curve Almanac` |
| `T6.1` 插件 SDK 与注册表 | **已完成**（2026-10-29）；`docs/reports/t6.1/REPORT.md`；ADR-052；`packages/plugin-sdk` 26 条单测 |
| `T6.2` 示例插件 | **已完成**（2026-10-30）；`docs/reports/t6.2/REPORT.md`；ADR-053；`plugins/plugin-sample` 29 条单测 + 3 条 E2E |
| 当前里程碑 | **M6 扩展与发布**：`T6.0`/`T6.1`/`T6.2` 已完成；`T6.3`–`T6.5` 尚未开始 |
| 下一步 | 等用户明确指示后领取 **`T6.3`**（插件接入 UI 与隔离）；**不要自动开始** |
| `pnpm verify` 基线 | **188 files / 1761 tests**；ESLint 0；depcruise 514 modules / 2209 deps / 0 violations |
| `pnpm test:coverage` 基线 | 全局 statements **77.11%** / branches **69.95%** / functions **76.23%** / lines **77.25%**；`plugins/plugin-sample/src` lines **97.64%**；阈值 70/60 未下调 |
| `pnpm e2e` 基线 | **107 passed**（6.5m；含 T6.2 3 条 13.0s、M5 1 条 20.2s）；chart-perf 100k 切换单独复跑 privatePeak **505 / 516MB**（≤600MB；全量通过） |
| `pnpm bench` 基线 | **exit 0**；table.open 486ms/3s、table.save 365ms/500ms、edit 0ms/50ms、query 183ms/400ms、text-sort 315ms/400ms、cjk-sort 575ms/800ms、import 890ms/8s、condition 1ms/16ms；chart.resolve-sample P95 **58ms**/300ms、chart.sample 2ms/50ms、chart.option.2k 0ms/50ms、chart.restyle.100k 0ms/20ms；memoryPeakMB 923（Node 趋势，非应用门禁） |
| `pnpm format:check` | 通过（提交前对新增文件跑过 Prettier） |
| 构建 | `pnpm build` exit 0；renderer **3,394.50 kB** + 懒加载 ImportSession 87.80 kB；CSS **77.89 kB**；main 338.76 kB；table/query/import worker 220.68/236.16/270.16 kB（T6.4 评估拆包） |
| 夹具 | `fixtures/workspaces/{v1-min,corrupt-manifest,future-version,stale-lock}/`；`fixtures/csv/{small,quoted,types,bad-rows}.csv`；`fixtures/json/points.json`；`fixtures/csv/gbk-100k.csv` 与 `bench/.fixtures/100k-workspace/` 由脚本生成、gitignore |

**用户明确要求**：

- 一次只做一个任务；每个任务先复述目标/产出/验收，再写测试、实现、跑 `pnpm verify` 与任务指定
  e2e/bench，最后勾选 TASKS、更新 CHANGELOG、必要时 ADR、Conventional Commit。
- **M1/M2/M3/M4/M5 均已获用户接受；T3.1–T3.6、M3 验收演示、T4.1–T4.6、M4 验收演示、
  T5.1–T5.5、M5 验收演示、T6.0 品牌更名、T6.1 插件 SDK/注册表与 T6.2 示例插件已完成**；M5 已
  关闭，M6 的 `T6.3`–`T6.5` 未开始。
- 不得跨任务/里程碑；**`T6.3` 必须等用户明确指示后再开始**，不要自动领取 M6 任务。

---

## 2. 新会话开场提示词（可直接粘贴）

```text
工作目录：D:\DSH_Work_Space\curve-studio（仓库根）。

先读 AGENTS.md、docs/HANDOFF.md（尤其 §0.3/§0.10）、docs/TASKS.md 的 M5/M6、
docs/reports/m5/REPORT.md、docs/reports/t6.0/REPORT.md、docs/reports/t6.1/REPORT.md、
docs/reports/t6.2/REPORT.md、docs/SPEC.md §14、ADR-053/052/051/050/048。

现状：M0–M5（均已验收）、T1.1–T4.6、T5.1–T5.5、M5 验收演示、T6.0 品牌更名（Curve Almanac）、
T6.1 插件 SDK/注册表与 T6.2 示例插件已完成；M5 已于 2026-10-29 关闭；M6 的 T6.3–T6.5 未开始。
pnpm verify 188 files / 1761 tests、pnpm e2e 全量见 HANDOFF §0.10、pnpm bench exit 0。

下一步：等待用户明确指示后再开始 M6 剩余任务（下一个是 T6.3，插件接入 UI 与隔离）。
不要自动领取 M6 任务，一次只推进一个任务。
```

---

## 3. 本机环境事实（很重要）

### 3.1 路径与版本

| 项 | 值 |
|---|---|
| 仓库根 | `D:\DSH_Work_Space\curve-studio` |
| Node | `C:\Users\MECHREVO\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe`（**v24.21.0**） |
| pnpm | `C:\Users\MECHREVO\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\pnpm\bin\pnpm.mjs`（**11.28.5**） |
| pnpm 命令垫片 | `D:\DSH_Work_Space\tools\bin\pnpm.cmd`（仓库外，未提交） |
| git | `D:\DSH_Work_Space\tools\mingit\cmd\git.exe`（MinGit **2.56.0.windows.2**，仓库外） |
| pnpm store | `D:\.pnpm-store\v11` |
| Electron 二进制 | `apps/desktop/node_modules/electron/dist/electron.exe`（**44.9.0**，内置 Node 24.22.0） |

Node/pnpm **不在 PATH**。每条命令前先注入：

```powershell
$env:PATH = "D:\DSH_Work_Space\tools\bin;C:\Users\MECHREVO\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin;$env:PATH"
$git = 'D:\DSH_Work_Space\tools\mingit\cmd\git.exe'
cd D:\DSH_Work_Space\curve-studio
```

### 3.2 DSH 会话策略：必须是 `danger-full-access`

`workspace-write` 下 `pnpm verify` 会因 Vite 的 `spawn EPERM` 失败（HANDOFF 旧记录）。
T2.1–T2.5 全程 `danger-full-access`，审批提示已关闭——**不要使用 `sandbox_permissions` 参数**。
这不是代码问题，不要改项目配置或加 workaround。

### 3.3 受限 shell 里的 Electron / E2E

- 直接启动 Electron 默认会因 Chromium OS 沙箱退出；E2E 必须删除 `ELECTRON_RUN_AS_NODE` 并设置
  `$env:CURVE_E2E_NO_SANDBOX = '1'`（只被 `apps/desktop/e2e/fixtures.ts` 读取，不影响应用
  `webPreferences.sandbox`）。
- 跑 E2E 前先 `pnpm build`（`pnpm e2e` 自带 build）。
- 全量 E2E 必须独占 CPU：跑之前确认没有外部程序占用（T4.2 实测外部游戏占 ~7.7 核时
  `grid.spec` 的 100k 首帧 1045/1062ms 超 1000ms 预算，暂停后 72 passed）。不要为通过改预算。
- `pnpm exec playwright test --config apps/desktop/playwright.config.ts <spec>` 可直接跑单个 spec；
  PowerShell 下 `--grep "a|b"` 会被 cmd 拆开，一次只跑一个模式。
- E2E 会重写 `docs/reports/m0/*.png`。提交前用
  `git checkout -- docs/reports/m0/t0.2-window.png docs/reports/m0/t0.4-shell-dark.png docs/reports/m0/t0.4-shell-light.png`
  还原，未提交的探针/截图不要带入提交。
- E2E 会创建/清理 `apps/desktop/test-results/`；该目录已 gitignore。

### 3.4 Windows 符号链接权限（本机必读）

本机**没有创建符号链接的权限**。T2.1 新增依赖时出现过 `ERR_PNPM_EPERM [symlinkAllModules]`；
处理（不要删 `node_modules`、不要切 hoisted linker、不要 `--ignore-scripts`）：

1. 从 pnpm 报错里取 `<target>` 与 `<link>`；
2. `cmd /c mklink /J "<link>" "<target>"`；
3. 重跑 `pnpm install`，直到退出码为 0；
4. 若报错是直接依赖链接（`apps/desktop/node_modules/...`），同样用 junction 补齐。

T2.5 新增 `papaparse` 运行时依赖（`@curve/table-engine`）与 `iconv-lite` devDependency（仅
`scripts/gen-100k.ts` 与 E2E 夹具生成）；不引入 jschardet/iconv-lite 运行时依赖。后续新增依赖
仍先按 AGENTS §4 写 ADR；能复用已有依赖就不要新增。

T2.7 在根 `package.json` 的 devDependencies 增加了 `@curve/app-core` 与 `@curve/persistence`
（workspace 包，供 `scripts/bench.ts` 使用；不是运行时依赖）。本机安装时先用
`cmd /c mklink /J` 预建 `node_modules\@curve\{app-core,persistence}` 再 `pnpm install`，
一次通过；`pnpm-lock.yaml` 已同步提交。

T4.6 又在根 `package.json` 的 devDependencies 增加了 `@curve/chart-echarts`（workspace 包，
**仅 bench** 读 `toEChartsOption`；不是运行时依赖），并给 `scripts/tsconfig.json` 加了
`chart-echarts` project reference 与 `DOM` lib（引用包的声明里有 `HTMLElement`）。本机做法：
先 `cmd /c mklink /J node_modules\@curve\chart-echarts packages\chart-echarts`，再
`pnpm install`（一次通过；`pnpm-lock.yaml` 已同步）。不要把它加到其他包或 `apps/desktop`
运行时依赖里；`echarts` 仍只属于 `packages/chart-echarts`。

### 3.5 文本编码与路径陷阱

- DSH 的 shell 是 **Windows PowerShell 5.1**：`Get-Content` 默认按 GBK 解码无 BOM 的 UTF-8 文件；
  `Set-Content -Encoding UTF8` 会写入 BOM。源码与文档一律用 `read`/`write`/`edit` 工具修改。
- T4.3 实测：用 `Get-Content | Set-Content` 往返改写一个 UTF-8 无 BOM 的 `.ts`，即使事后用 .NET
  去掉 BOM，文件里的中文/`§`/`→` 注释也会变成乱码（GBK 解码后写回）。万不得已用 PowerShell 时，
  必须用 `[System.IO.File]::ReadAllText/WriteAllText` + `UTF8Encoding($false)`，按 `\n` 拆分以保持
  LF，改完用 `read` 复查含非 ASCII 的行（或跑一遍 U+FFFD 扫描）。
- `[System.IO.File]::ReadAllBytes('相对路径')` 按**进程 CWD**（`D:\DSH_Work_Space`）解析；需要绝对路径。
- pnpm 的 stdout 被 PowerShell 当成错误流时会打印红字，**结论看 `$LASTEXITCODE`**；必要时重定向到文件再检索。
- 截图是设备像素（125% DPI）：窗口 1440×816 → 页面 1426×779 CSS px → PNG 1783×943。

### 3.6 已知测试/依赖行为

- `pnpm verify` = `pnpm lint && pnpm typecheck && pnpm test`；`format:check` 单独跑。
- Vitest 覆盖率排除：domain/persistence/app-core 的纯类型模块、三个进程入口、Worker 入口。
  app-core 排除 `state/types.ts` 与 `commands/types.ts`。
- 纯逻辑门禁：domain/table-engine/chart-model 行覆盖 ≥85%；全局 lines/statements/functions 70%、branches 60。
- `apps/desktop/src/main/workspace/recent-list.test.ts` 的 “caps the list” 用例在 66 个 worker 并行、
  机器繁忙时偶发 5s 超时；重跑即过，不要放宽全局超时。
- 全量 E2E 若偶发 `grid.spec.ts` 的 `Control+End`、200% 缩放焦点或 `edit.spec.ts` 的 F2
  编辑器超时：先单跑确认；T2.4 已修复虚拟行未挂载时焦点丢失（100ms 安全重试，编辑器打开时
  不抢焦点）。**跑全量 E2E 时不要同时跑 verify/coverage/另一套 Electron**：T3.2 实测并发时
  200% 缩放用例会因焦点重试延迟失败，独占 CPU 后 65 passed。不要放宽超时或删除断言。
- Vitest 过滤用 `pnpm exec vitest run <path> --testNamePattern <pattern>`，不要写成
  `-- --grep`（Vitest 5 不报错但也不过滤，会把整包都跑一遍；T3.4/T4.2 都踩过）。
- E2E 在 UI 更新后等 manifest/JSONL 落盘时使用 `expect.poll`；新增编辑/保存测试也要这样等
  磁盘，不要直接读文件后立刻断言（渲染状态先于异步写盘）。
- E2E 粘贴用 `page.evaluate` 派发带 `DataTransfer` 的合成 `ClipboardEvent`（`e2e/paste.spec.ts`
  的 `pasteText`），不依赖 OS 剪贴板；10k 取消用例通过临时放慢页面 `setTimeout(0)` 制造确定
  的可取消窗口，不修改生产代码。
- T2.5 的 E2E 文件替身由 `e2e/fixtures.ts` 设置：`CURVE_E2E_IMPORT` 指向按用例选择的夹具，
  `CURVE_E2E_SAVE` 指向 `userDataDir/import-errors.csv`；`gbk-100k.csv` 在导入用例内按需生成
  （不在 worker fixture 生成，避免影响 100k grid 首帧预算），不提交。
- 结构变更保存：行数据命令走保存队列（表 → manifest），纯 schema 命令只写 manifest；E2E 断言前用
  `expect.poll` 读 manifest。
- E2E 截图证据字节不稳定；断言不依赖像素。
- Worker 产物名现在是 `assets/table.worker-<hash>.js`、`assets/import.worker-<hash>.js`、
  `assets/query.worker-<hash>.js`。
- `packages/plugin-sdk` 的 tsconfig 只增加 `lib: DOM`（仅 `AbortSignal` 类型）与
  `references: ../domain`；不要给它加 Node types，也不要让它 import table-engine/React/
  Electron/fs（`ImportResult` 与 `ImportDataset` 只是结构兼容，映射在 T6.2 的
  `plugin-import.ts`）。
- T6.2 的插件接线：`plugins/plugin-sample` 是源码包（`tsconfig` 带 `references` 到 domain/plugin-sdk、
  `lib: DOM`），`@curve/plugin-sample` 只被 `apps/desktop`（renderer 组装点 + main 的字段类型映射）
  和测试引用；不要把它加到其它包。`app-core` **不** import plugin-sdk，用的是结构化
  `FieldTypeLookup`；`ui` 用的是 `formatField` 回调。`main.tsx` 在首帧前 `await
  activateRendererPlugins()`；插件测试不依赖桌面（`pnpm exec vitest run plugins/plugin-sample`）。
- T6.2 的 `parseText` 只负责类型解析（整数），值域在 `validate`；所以 0/6 报 `range` 而不是 `type`。
  改这两者的分工会让 E2E 的「超出允许范围」断言失配。
- T6.2 的导入：`client.open` 用 transfer 把字节交给 Worker（会 detach renderer 的 buffer），
  `use-import` 在 transfer 前保留 `bytes` 副本给插件导入器；插件导入的 **规划在渲染进程**
  （`planInRenderer`，载荷与 Worker 相同），内置 CSV/JSON 仍走 Worker。选择插件导入器时编码下拉
  禁用、`ImportPreview.importerLabel` 为渲染进程内部字段（不是 IPC）。
- T6.2 的 `pnpm lint:boundaries` 现在扫描 `apps packages plugins`；新增插件包必须满足
  `plugins-only-sdk-and-domain`（只能 import `@curve/plugin-sdk` 与 `@curve/domain`）。
- T6.2 的 `plugin.spec.ts` 依赖 `column-form-field-type`、`import-importer` 选择器与列行的
  `data-field-type` 属性；`docs/reports/m0/*.png` 仍会被 E2E 重写，提交前还原。
- T2.6 的筛选/排序 E2E 依赖网格上的 `data-query-mode`/`data-query-busy`/`data-query-ms`/
  `data-visible-rows` 属性断言 Worker 完成与预算；不要移除这些属性。
- T2.6 的 text sort bench 使用打乱后的 100k 文本主键；若机器繁忙 P95 可能接近 400ms，
  先确认 CPU 后重跑，不放宽预算。
- T3.3 的 `condition.rules.50x100` 在 query suite 内；预算 16ms 是**纯求值**（50 规则 × 100 行），
  不含 DOM。实测 P95 1ms；不要把 `GridCell` 渲染或截图耗时算进去。
- T3.3 的 `style.spec.ts` 打开视图时首行首列处于选中态，选中背景会覆盖条件背景；断言条件背景
  请选未选中的单元格（如 `grid-cell-0-1`），选中优先级本身也有断言。
- `style.update` 是 manifest-only 命令：`SaveQueue.enqueueManifest` 串行写 manifest，失败可重试；
  历史条目 `tableId: null`，undo/redo 走 `onWorkspaceChanged`，不标记脏表。不要另写一条写盘路径。
- **T2.7 的 bench 每个 suite 独立子进程**（`process.execPath --expose-gc --import tsx ...`），
  结果写到 `bench/.tmp/suite-<name>.json` 再由父进程汇总；不要把多个 suite 塞回一个进程，
  否则后跑的 `query.text-sort.100k` 会被前序堆状态顶到 400ms 以上。
- `pnpm e2e` 会先执行 `tsx scripts/gen-100k.ts --workspace bench/.fixtures/100k-workspace`
  生成 100k×10 夹具（约 15MB，gitignore）；`perf.spec.ts` 把它复制到 `testInfo.outputPath` 再打开。
  单独跑 perf spec 前必须先执行该生成命令。
- `perf.spec.ts` 的内存门禁用 `app.getAppMetrics().memory.privateBytes`（不含 GPU）；
  `workingSetSize` 会重复计算共享页，只作诊断。T6.2 后 100k 图表切换实测 **505 / 516MB**（门禁
  600MB）；T5.5/M5 时 503MB。紧接一次全量 E2E 之后单跑曾出现 602MB 离群值（随后复跑正常），
  遇到时先确认 CPU/内存环境再重跑，不放宽门槛。
- `pnpm bench` 的 `memoryPeakMB` 是 Node 管线 RSS 趋势（约 900MB），**不是**应用内存门禁；
  600MB 只由 E2E 判定。
- `bench/baseline.json` 需由 CI Windows runner 的 `pnpm bench -- --write-baseline` 生成后提交；
  缺失时报告 `baseline: "missing"` 并打印 `::notice`，回归比较跳过。损坏的基线直接让 bench 失败。
- T3.5 的 `template.spec.ts` 用 `launchCurveApp({ saveFile })` 把导出落到 `.curvestyle.json`；
  `saveFile` 是**仅测试**的 fixture 选项，默认仍是 `userDataDir/import-errors.csv`。导出走
  `file:exportText` 的保存对话框替身，导入走 `file:importText`（`CURVE_E2E_IMPORT`）。
- `.curvestyle.json` 导入不进入 `imports/` 归档；领域层 `MAX_STYLE_EXPORT_LENGTH` 在 JSON.parse
  前短路，main 的 100MB 上限仍然有效。
- `style.delete` 按 SPEC §13.1 可撤销：管理对话框的删除确认不能改写成“不可撤销”，撤销要同时
  恢复样式、所有视图 `styleId` 与工作区默认。删除确认/模板列表使用固定 test id，
  E2E 依赖 `style-template-*` / `style-import-*`，不要重命名。
- 模板管理是模态对话框；导入预览复用 `StylePreview`（前 50 行），不挂 DataGrid/查询/虚拟滚动。
  名称冲突与 ` (2)` 规则在 domain（`styleCopyName`/`resolveStyleName`），UI 只做展示与校验。
- T3.6 的 `file:exportCsv` 是**单通道四步协议**（begin/append/finish/cancel），不是四个通道；
  `ipc.spec.ts` 的 fileMethods 顺序为 `archiveImport, exportCsv, exportText, importText`。
- `file:exportCsv` 的 `begin` 复用 `CURVE_E2E_SAVE` 保存对话框替身；E2E 用
  `launchCurveApp({ saveFile })` 指定目标。`append/finish/cancel` 只收 token，渲染层不碰路径。
- 100k 导出预算 5s；实测 1,716ms。`formatCellValue` 的 Intl formatter 缓存（domain）是达标关键，
  不要改回每单元格 `new Intl.*`；否则日期列 100k 会退到 10s 量级。
- 取消 E2E 在页面内把 `setTimeout(0)` 放慢到 20ms 制造确定窗口（测试替身），不修改生产代码；
  `before-quit` 会清理未完成临时文件，取消路径也会 `unlink`。
- 导出对话框每次打开重置为“显示格式 + 当前筛选排序”；一次只允许一个导出任务；`ExportCsvDialog`
  的容器（IPC/流式）未做组件测试，视图与 hook 有单测，完整路径由 E2E 覆盖。
- M3 的 `m3-acceptance.spec.ts` 用 3 次 `launchCurveApp`（源工作区 → 新工作区导入 → 重启还原）；
  每次启动只有一个 `CURVE_E2E_SAVE`，源启动先导出模板再导出 CSV（覆盖同一路径），模板先复制
  到 `m3-report.curvestyle.json` 供第二次启动导入。
- 模板应用/密度编辑会改变行高：`DataGrid` 在 `rowHeight` 变化时调用 `virtualizer.measure()`，
  否则 TanStack Virtual 沿用旧测量值，行高停留旧值直到滚动/缩放。断言计算样式时用
  `expect.poll`（属性切换与虚拟化重测差一帧），不要删掉这次重测。
- 表头单元格文本包含排序指示器（如 `Sensor A↓`）；读取显示名请用
  `[role="columnheader"] .cs-grid__header-label`，不要对整个单元格取 `textContent`。
- 模板导入确认后**导入对话框与模板管理对话框同时关闭**；不要再点 `style-templates-close`。
- 每个 Dialog 的 icon 关闭按钮都带 `aria-label="关闭"`；导出对话框的 footer 也叫“关闭”，
  `getByRole('button', { name: '关闭' })` 会命中两个，需要 footer 时用 `.last()`。
- T4.1 的 RenderModel 黄金快照在 `packages/chart-model/src/__snapshots__/`；只有在**有意**改
  `RenderModel` 契约时才用 `pnpm exec vitest run packages/chart-model -u` 更新，并在任务报告里
  写明变化，不要用更新快照掩盖回归。
- T4.2 的采样语义见 ADR-041：`lttbIndices`/`sampleSeriesIndices` 只接受**对齐**的 x/y 数组
  （长度不一致抛 `RangeError`），返回升序原始下标；`null` 永不被保留。
- 采样后 `RenderModel.x.values` 是**各系列保留下标的并集**，不是 target 长度；断言点数请按
  "每个系列的非空点数 ≤ target"，不要断言 `x.values.length ≤ target`。
- `meta.sampled` 只在**至少一个系列真的被降采样**时为 true；阈值内/target 不小于点数/关闭
  采样时模型与 T4.1 完全一致（含 x 长度与 null 位置），别把"启用采样"当成"已采样"。
- `pnpm bench -- --chart`（T4.6 起；`--sample` 仍可用，是别名）的 suite 名是 `chart`；
  `pnpm bench` 全量已包含它。`chart.resolve-sample.100k` 是 100k×10 + 2 个 Y 系列的
  **解析+采样**，纯采样看 `chart.sample.100k`；`chart.option.2k`/`chart.restyle.100k` 是 T4.6
  新增的 option 与样式复用门禁；`chart.resolve-unsampled.100k` 只是诊断，不设门禁。
- `scripts/bench.ts` 依赖 workspace 包 `@curve/chart-model` 与 `@curve/chart-echarts`（根
  `devDependencies`，仅 bench；后者用于 `toEChartsOption`）；若本机重装依赖出现
  `ERR_PNPM_EPERM`，按 §3.4 先 `cmd /c mklink /J` 预建 `node_modules\@curve\chart-*` 再
  `pnpm install`。
- T4.3 已安装 `echarts@6.1.0`（`packages/chart-echarts` 的唯一运行时依赖，`pnpm-lock.yaml` 已
  同步）；本机安装没有触发 symlink 权限问题。**不要**把 `echarts` 加到其他包或根 `package.json`。
- 只有 `packages/chart-echarts` 可以 import echarts：新增 depcruise 规则
  `only-chart-echarts-imports-echarts`，另有 `src/boundary.test.ts` 扫描 `packages/*/src`、
  `apps/*/src`、`plugins/*/src`、`scripts` 与所有 workspace `package.json`。不要用注释豁免。
- option **只能**在 `option.ts` 构造（T4.4 的组件/检查器只调 `toEChartsOption` 或 renderer，
  不得拼 option）；适配器不得再采样（ADR-041 §6）、不得读表/Store。
- `x.type` 映射：`number` → ECharts `value`、`time` → `time`、`text` → `category`；类目轴用
  `xAxis.data` + 对齐数组，数值/时间轴用 `[x, y]` 对（`null` 是空点）。别把 `number` 直接写进
  `xAxis.type`（ECharts 不认）。
- 断点策略（ADR-042 §3，解决 TASKS 与 ADR-041 的冲突）：`meta.sampled === false` →
  `connectNulls: false`（真实缺口断开）；`meta.sampled === true` → `connectNulls: true`（采样后
  的 null 与真实缺口不可区分，采样图必须跨过）。**不要**为了"看起来连续"改成永远 true，也不要
  在采样图上改回 false（线会被打碎）。
- tooltip 是 `renderMode: 'html'`：进入 tooltip 的用户可控文本必须走 `escapeHtmlText`；不要透传
  ECharts 的 `marker` HTML（适配器用模型系列色自绘色点）。`tooltip.formatter` 用模型的
  `x.values`/`series.values` 取值，不用 ECharts 参数里的原始值。
- 主题由 `resolveChartTheme(background)` 按 WCAG 相对亮度推导；颜色常量与 `@curve/ui` 令牌同值，
  但 `chart-echarts` **不得 import `@curve/ui`**（依赖方向）。token 改动需手动同步常量。
- 生命周期：`createChartRenderer({ locale? })` 惰性 `init`；`render(container, model)` 会先
  dispose 旧实例再挂载（同一容器再次 render = 重新挂载，不是 update）；`update` 用
  `setOption(option, { notMerge:false, replaceMerge:['series','xAxis','yAxis'] })`（保留 dataZoom
  缩放）；空模型（无系列 / x 为空 / `sourcePoints=0`）不创建实例；错误返回
  `{ ok:false, error }`（渲染 `E_UNKNOWN`、PNG `E_EXPORT_FAILED`）；`activeChartInstanceCount()`
  用于泄漏断言，dispose 幂等。
- `toPNG({ scale=2, background })` 返回 data URL（2x 默认、`excludeComponents:['toolbox']`）；
  文件名与写盘是 T4.5 的事，适配器不落盘。
- 图表单测：`option.test.ts` 6 条黄金快照（4 调色板 + 深色 + 采样缺口），**只在有意改 option
  契约时**用 `pnpm exec vitest run packages/chart-echarts -u` 更新并在报告写明；`option.ssr.test.ts`
  用真实 ECharts（SVG/SSR，无 DOM）验证 option 被接受、未采样 2 个子路径 / 已采样 1 个子路径；
  `renderer.test.ts` 在 jsdom 里 `vi.mock('echarts/core')`（`vi.hoisted`），不初始化真实 canvas。
  jsdom 没有 canvas 2D，**不要**尝试在 jsdom 里 `init` 真实 canvas 渲染器。
- ECharts 的 `use` 名字会触发 `react-hooks/rules-of-hooks`：注册模块/测试里必须 `use as
  registerWithECharts` 别名，不要加 eslint-disable。
- `chart-echarts` 的 `tsconfig.json` 需要 `references`（domain、chart-model）、`lib: DOM` 与
  `types: ["node"]`（边界测试读源码）；缺 references 会让 `tsc -b` 把兄弟包 `.d.ts` 生成到
  `src/` 并让 lint 报错（T4.1 的教训）。
- T4.4 已把 `chart-model`/`chart-echarts` 接进 renderer（desktop 的 workspace 依赖与
  `tsconfig.web.json` references），`pnpm build` 主 chunk 从 1,618.04 kB 增至 **3,209.97 kB**、
  CSS 70.66 kB；T6.4 评估拆包。renderer 运行时**只**通过 `ChartCanvas`/`chart-view-model` 接触
  `chart-echarts`，组件里不得拼 option。
- 图表视图的断言契约是 `data-chart-*`（`chart-view` section）：kind/layout/x 类型与标签、
  Y 标签、系列名（`|` 分隔）与数量、source/rendered points、sampled、palette 首色、背景、
  图例、网格、平滑、点、线宽、精度、Y 从零。E2E 用它替代像素断言；T4.5 的 aria 摘要可复用。
- `RenderModel` 自 T4.4 起有 `y?: { label?: string }` 与 `style.connectNulls`：
  `connectNulls = sampled || layout === 'long'`；宽表未采样仍断开真实缺口。适配器只读
  `style.connectNulls`，不要再改成读 `meta.sampled`。
- 图表黄金快照在 T4.4 **有意更新**：`chart-model/__snapshots__` 增加 `connectNulls`（宽 false/
  长 true），`chart-echarts/__snapshots__` 的 6 条 option 快照改 `grid.bottom` 56→72 与采样
  模型的 `connectNulls` 来源。后续只有再次有意改契约时才 `-u`，并在报告写明。
- 图表 E2E 是 `apps/desktop/e2e/chart.spec.ts` 4 条（向导+四组检查器+重启、删列重映射、复制、
  200% 键盘）与 `chart-interaction.spec.ts` 3 条（100k 图例/缩放/tooltip/resize + axe、PNG、
  空态）。`schema.spec.ts` 的图表错误态断言已从 `chart-placeholder` 改为
  `chart-view[data-chart-state=missing-columns]` + `chart-error`。
- `ChartList`/`ChartDialogs` 的容器逻辑（IPC/命令接线）没有组件测试，由 E2E 覆盖；纯逻辑
  （`chart-view-model.ts`）、映射编辑器、检查器、Canvas 生命周期与错误态有 39 条单测。
- 全量 E2E 现为 **99 passed**（7.4m；含 chart.spec 4 + chart-interaction 3 +
  chart-perf 2 + layout 3 + undo 3 + autosave 4 + recovery 4 + palette 3 +
  `m4-acceptance` 1）。T4.4/T4.5/T4.6/T5.4 全量运行曾偶发
  `grid.spec.ts` 的“stays usable at 200% zoom”焦点失败（单跑约 2.2s 通过），与 HANDOFF
  §3.6 的既有 flake 一致；重跑全量前确认 CPU 空闲，不要放宽断言。
- `chart.update` 允许悬空映射（列删除后的修复路径），因此命令层不能保证图表映射有效；
  `chart.create`（含复制/向导）仍严格校验。不要给 `chart.update` 加严格映射校验，否则重映射
  无法逐步进行。
- T4.5 的交互 API 在 `ChartRenderer` 上：`getInteractionState()` 读 `instance.getOption()` 的
  dataZoom 窗口与 legend `selected`；`dispatchInteraction()` 只调 `dispatchAction`
  （`legendToggleSelect`/`dataZoom`/`legendAllSelect`），异常吞掉、不重建实例；`onInteractionChange`
  订阅 ECharts `datazoom`/`legendselectchanged`。不要把这些状态写进 `ChartSpec`/manifest
  （ADR-044：瞬态、不进撤销）。
- 图表视图工具栏（`ChartView`）拥有图例/缩放/查看数据表/导出；导出对话框在视图内，检查器仍是
  数据/映射/外观/坐标轴四组（SPEC §11.5 已按 ADR-044 改措辞）。不要为了“检查器导出”引入隐式
  全局注册表。
- `ChartCanvas` 的 ref 句柄是 `ChartCanvasHandle`：`exportPng` 会 flush 120ms 防抖 + 等两个
  `requestAnimationFrame` 再调同步 `toPNG`；`subscribeInteraction` 是组件级（跨 locale 重建
  renderer 仍有效）。E2E 用 `data-chart-zoom-start/end`、`data-chart-hidden-series` 断言状态。
- 空态契约：`data-chart-empty` = `no-table`/`unmapped`/`no-data`；无数据时 `data-chart-state="empty"`
  （不再渲染空 canvas）。`no-table` 是防御态：`checkChartInto` 把缺失表当 **error**，合法
  manifest 打不开，所以 E2E 只覆盖 `no-data`/`unmapped`，三态由 `ChartView.test.tsx` 覆盖。
- PNG 保存复用 `file:exportText` 的新可选 `encoding:'base64'`（main 严格 base64 校验后
  `atomicWriteBytes`），不新增 IPC 通道。E2E 的 `saveFile` 替身仍指向唯一路径；建议文件名只能在
  对话框的 `chart-export-filename` 断言，不要从落盘路径推断。
- PNG E2E 用页面内 `Image` + canvas 读像素（CSP 允许 `data:` 图片）：透明 alpha 0、白
  `#ffffff`、深 `#1e1e1e`；尺寸用 IHDR 与 canvas CSS 尺寸 ×2 比较，允许 ±4px 的取整差。
- `option` 的 tooltip 新增 `className:'cs-chart-tooltip'`，6 条黄金快照已有意更新；toolbox
  标题由 `ChartCanvas` 经 `labels` 传入，直接调用适配器不传时仍是 ECharts 英文默认值。
- T4.5 新增 `e2e/chart-interaction.spec.ts` 3 条（100k 交互/axe、PNG、空态）；截图在
  `docs/reports/t4.5/`（3 张，E2E 生成后复制）。
- T4.6（ADR-045）把解析拆成 `resolveChartData`（行集 → x/系列值/meta）与 `renderChartModel`
  （样式段）；`resolveSeries` 仍是二者组合，**输出与黄金快照不变**。样式字段（palette/
  background/线宽/平滑/点/图例/网格/精度/从零/Y 轴名/kind/`xLabel`）不再进入数据段；`xLabel`
  改为样式段应用，所以数据键里没有它。
- 数据缓存 `chart-data-cache.ts`：容量 2、LRU；命中要求 **数据键 + `rows` 引用**同时相同。
  键包含表结构签名（id/label/type/role/unit/precision/enumOptions）、mapping/filter/sort/
  sampling/locale。**不要**把样式字段或 `xLabel` 加进键，否则样式提交会重新解析 100k 行；也
  **不要**只按数据键命中（行编辑后 Immer 会给新数组，引用校验防脏读）。
- `useChartRenderStatus`：`rows.length > CHART_DEFER_RESOLVE_ROW_THRESHOLD (20_000)` 且缓存
  未命中时先 commit `pending`，`setTimeout(0)` 解析；小表/缓存命中/缺 chart/table 同步。输入
  再次变化会 `clearTimeout`（防旧结果覆盖）。`ChartView` 的缺失表分支必须继续传共享的
  `NO_ROWS` 空数组，否则每次渲染都是新引用 → effect 循环。
- T4.6 诊断契约（只读，非持久化）：`chart-view` 的 `data-chart-pending`/`data-chart-resolve-ms`，
  `chart-canvas` 的 `data-chart-update-ms`/`data-chart-update-count`/`data-chart-instances`。
  `chart-perf.spec.ts` 依赖它们；不要改名或改语义。
- 首次打开/切换 100k 图表会先出现 `data-chart-state="loading"`（约一帧 + 解析时间）；E2E 必须
  用 `expect.poll`/`toHaveAttribute` 等 `ready`，不要按“挂载即 ready”写断言。
- 交互合并：ECharts 的 `datazoom`/`legendselectchanged` 发布经 `requestAnimationFrame` 合并
  （每帧一次、发布最新值）；`dispatchInteraction`/`update()` 后的刷新是立即的。单测用
  `vi.stubGlobal('requestAnimationFrame', …)` 观察合并；不要改成逐事件 setState。
- T4.6 的解析分配优化：默认数值/时间 X 用“坐标数组 + 下标排序”（稳定：相等 x 保原序），
  不再给每行建 `{row,index,value}`；无筛选时直接把 `rows` 交给 `collectRows`（不先复制）。
  语义与顺序已由既有的排序/快照测试锁定，不要再加装饰对象。
- bench：`sample` suite 更名 **`chart`**（`pnpm bench -- --chart`；`--sample` 保留别名），新增
  `chart.option.2k`（50ms）与 `chart.restyle.100k`（20ms）。bench 现在 import
  `@curve/chart-echarts`（根 devDependency，仅 bench），会加载 ECharts：`chart` 子进程
  `memoryPeakMB` 趋势上升是正常的，不是应用内存门禁。`scripts/tsconfig.json` 因此带 `DOM` lib。
- `chart.restyle.100k` 校验 `renderChartModel` 复用 `values` 数组（`toBe` 断言）；如果有人把它
  改成复制数组，这个用例会失败——这是有意的“不重复解析”证据。
- T4.6 的 E2E `chart-perf.spec.ts` 2 条：①预算（resolve ≤300、update ≤200）、样式提交缓存命中
  （resolve ≤20ms）、10 次连点缩放无 >200ms `longtask`；②5 次映射 + 6 次标签切换后
  `data-chart-instances=1`、loading 出现（MutationObserver 捕获 `data-chart-pending`）、
  切换后 private 峰值 584–592MB（≤600MB）。修复备份目录缺陷后该场景稳定在 600MB 以内；
  修复前会到 605–612MB。
- **T4.6 顺带修复的主进程缺陷**：`FileWorkspaceStore.copyToBackup` 以前直接写 `backups/`，
  而复制/恢复的工作区可能没有该目录 → 每次 `manifest:write`/`table:write` 备份失败
  （`E_FS_WRITE`/ENOENT），UI 只弹“文件写入失败”Toast、修改不落盘。现在备份前
  `mkdir(recursive)`；`file-workspace-store.test.ts` 有“备份目录缺失时 manifest/table 保存
  仍成功”的回归测试。E2E 里复制 `bench/.fixtures/100k-workspace` 的场景必须先有这条修复，
  否则图表修改永远无法持久化。
- 切换标签页会 unmount/remount `ChartView`（`key={view.id}`），因此每次切换都是一次
  dispose→mount 与全新数据缓存；期望实例数始终为 1。不要用“模块级全局缓存”把实例留住。
- T5.2 的 `EditHistory.record()` 不再有命令白名单：所有 `patches.length > 0` 的命令默认入栈；
  唯一瞬态是 `view.layout` 且仅当布局树忽略 `activeViewId` 后不变。**不要**再加回白名单、
  不要给 `view.layout` 单独清 redo，也不要把纯标签/焦点切换写进历史。
- 100 条 / 256MB 是**估算**上限：`DEFAULT_HISTORY_MAX_BYTES`；行数组与当前表共享时只计数组
  （100k 行 ~800KB），独特旧行数组（import replace/删表/删列）抽样 16 行外推；大数组抽样 24 项。
  不要在 `record()` 里 `JSON.stringify` 整表或在每次编辑遍历 100k 行。
- 撤销/重做落盘由 `tableShouldBeWritten` 决定：条目含 `tables/<id>/rows` 且表存在 → 表 + manifest；
  整表删除 redo/空表 redo/纯 manifest 命令 → 只写 manifest。删除表 redo 不重复 `trash`，可能留下
  无害孤儿文件；不要为它让 `EditHistory` 直接做 IO。
- `ui.history` 是 UI-only 快照（`canUndo/canRedo/undoAction/redoAction/depth`），由
  `onStateChange` 发布；不进命令 patches、不写 manifest。TitleBar 的 `HistoryMenu` 依赖它；
  E2E 契约是 `data-can-undo`/`data-can-redo`/`data-undo-action`/`data-redo-action`/
  `data-undo-depth`/`data-redo-depth`。不要改名或改成只读 `aria` 文案。
- `historyActionKey` 在 renderer；app-core 只返回命令名，不得 import i18n/React。
- 合并只在 redo 栈为空时进行：撤销后同一格再编辑必须产生新条目。`table.cell.set` 的 800ms
  与 `mergeKey` 语义不变；粘贴/导入/列/表/视图/样式/图表各一条。
- 打开/关闭工作区会 `history.clear()` 并重置 `ui.history`；E2E 断言 `data-undo-depth=0`。
- T5.2 的 E2E `undo.spec.ts` 3 条（7.6s/3.7s/2.9s）会写截图到 `docs/reports/t5.2/`；不要删除
  `data-undo-*` 属性或把间隔改到 <800ms（否则 5 条会合并）。
- T5.3 的自动保存窗口在 `SaveQueue` 内：1.5s trailing 去抖 + 10s 上限；**`flush()`/`retry()`
  必须立即写**。不要在其他位置再加定时器或第二条写表路径；布局的 500ms 去抖仍然只调用
  `enqueueManifest()`，因此布局落盘最迟约 2s（或被 Ctrl+S/退出 flush 冲掉）。
- T5.3 的退出握手：main 在 `close`/`before-quit` 中发送 `app:quit-requested`，renderer 的
  `useQuitGuard` flush ≤3s 后回复 `app:quit-response`；**clean quit 必须调用
  `workspace.close` 删除 `.lock`**，flush 失败则故意保留。不要改成 main 直接写盘或删除锁。
- 原生退出确认由 main 的 `quit-guard.ts` 管理；E2E 用 `CURVE_E2E_QUIT_CONFIRM=quit|cancel`
  （仅未打包 + `CURVE_E2E=1`）。`electronApp.close()` 会走同一握手，因此测试 teardown 不会挂。
- T5.3 的强杀 E2E 必须用 `electronApp.evaluate(() => process.pid)` 取 **main** PID 再
  `taskkill /F /T`；`electronApp.process().pid` 是 launcher，删错进程会留下仍运行的 app 并让
  `.lock` 被优雅清理，测试会看不到恢复对话框。
- `workspace:inspect` 是只读的；恢复对话框的“取消”绝不能调用 `open`（否则原文件字节会变）。
  `workspace:open({ recovery: { manifestBackup } })` 会先备份损坏 manifest 再原子重建。
- 最近列表 API 名称是 SPEC §15.4 的 `workspace.recentRemove` / `workspace.recentClear`
  （不是 `removeRecent/clearRecent`）；`ipc.spec.ts` 的 bridge 白名单按字母排序断言。
- `grid.spec.ts` 的“surfaces open warnings”用例现在先经过恢复对话框再断言 stale lock warning；
  不要再改回直接等待 `workspace-view`（T5.3 起会超时）。
- T5.3 的 E2E 会写 `docs/reports/m0/*.png`（既有行为）；提交前照旧用 `git checkout --` 还原。
- T5.4 的 keymap 单测在 `apps/desktop/src/renderer/features/keymap/`（8 个文件 / 75 条含
  CommandPalette 与 App 集成）；`pnpm exec vitest run apps/desktop` 可跑全量 renderer，
  Vitest 5 不支持 `--grep`。E2E 是 `e2e/palette.spec.ts` 3 条（3.1s/3.4s/3.1s）。
- T5.4 的 `APP_COMMANDS` 是唯一快捷键表：改键位要同时改 `commands.test.ts` 的锁定表、
  `docs/SPEC.md §13.4` 与 ADR-049；`createKeymap` 冲突会在启动时抛错，不要靠注册顺序。
- T5.4 的 `CommandPalette`/`HelpDialog` 用条件挂载；`useCommandKeymap` 故意**不**调用
  `useAppState`，keymap 在 keydown 时读 `core.store.getState()`，面板打开时 `buildPaletteItems`
  快照并 `runCommand` 前复查。不要为了“实时可用性”把订阅搬回 AppShell（chart-perf 门禁）。
- T5.4 的 E2E 契约：`data-testid="command-palette"`/`command-palette-input`/
  `command-palette-list`、`data-command-id`、`data-command-recent`、dialog 名称“命令面板”/
  “键盘快捷键”；`getByRole('option')` 会误匹配原生 `<select><option>`，必须限定在
  `command-palette-list` 内。
- T5.5 的 E2E 契约：`data-testid="open-settings"`、`settings-dialog`、`settings-theme`、
  `settings-language`、`settings-autosave`、`settings-default-style`、`settings-close`、
  `settings-error`、`settings-style-error`；未保存对话框名称“有未保存的修改”/“Unsaved
  changes”，按钮“保存并继续/放弃修改/取消”。设置文件路径是 `join(userDataDir, 'settings.json')`。
- T5.5 的 `settings.spec.ts` 用 `writeSettings()` 预写 `autosave:false` 再启动；不要通过修改
  `localStorage` 来模拟设置（已不是持久化来源）。`settings-i18n-layout` 的伪本地化是 DOM 文本
  注入，不是真实语言包；断言用 `[role="dialog"]` 面板的 `boundingBox` 与 document 的
  `scrollWidth`，不要按截图像素断言。
- T5.5 修改了 `ipc.spec.ts` 的 bridge 白名单：`appMethods` 现在是
  `info, settings, updateSettings, onQuitRequested, respondToQuit`（插入顺序）；新增 bridge
  方法时同步该数组与 preload `api.test.ts`。
- M5 验收演示是 `apps/desktop/e2e/m5-acceptance.spec.ts` 1 条（20.2s，三次
  `launchCurveApp` + 一次 `taskkill /F /T`）：seed 2 表后，复制视图/水平分栏/移动标签、
  5 次编辑 + 撤销/重做、提交 200 后强杀、尝试恢复、关闭后最近列表重开、英文/深色、重启还原。
  多 pane 下编辑单元格必须先 `locator.focus()` 再按 F2（pane 聚焦会重建网格子树）；不要把它
  改回单 pane 的 `editCell` helper。
- M5 证据在 `docs/reports/m5/`（7 张 PNG + `m5-metrics.json`）；`m5-metrics.json` 的
  `baseDepth=3`（复制视图+分栏+移动）、`editDepth=8`、`recoveredValue=200` 是重跑时的对照值。

---

## 4. 已交付的关键接口（直接消费，不要回退）

### 4.1 `@curve/domain`

```ts
Cell, ColumnDef, TableMeta, Row, ViewDef, ChartSpec, TableStyle, LayoutNode, WorkspaceManifest …
parseManifest/parseTableMeta/parseColumnDef/parseRow/parseCell
coerceCell(raw, column): CellResult
formatCellValue(value, column, options?): string
checkTable/checkInvariants/assertInvariants
createId/createWorkspaceId/createColumnId/…/createTimestamp
ERROR_CODES/createAppError/isAppError/toAppError
CURRENT_FORMAT_VERSION = 1
MIGRATIONS = createMigrationRegistry([])     // 生产为空（ADR-024）
MAX_COLUMNS_PER_TABLE = 100 / MAX_ROWS_PER_TABLE 在 table-engine
```

T2.3 新增：

```ts
ColumnChangeFailure, ColumnChangeSuccess, ColumnChangeError, ColumnChangePlan
planColumnAdd(table, rows, column, index?): ColumnChangePlan
planColumnUpdate(table, rows, column): ColumnChangePlan
planColumnDelete(table, rows, columnId): ColumnChangePlan
planColumnReorder(table, rows, columnIds): ColumnChangePlan
planPrimaryKeyChange(table, rows, columnId): ColumnChangePlan
```

- `coerceCell` 覆盖 SPEC §8.1 的全部归一规则；T2.4 粘贴、T2.5 导入必须复用它，不要另写解析。
- 列计划全有或全无：失败返回前 100 条 `ColumnChangeFailure` + `totalFailures`，不返回半迁移行集。

### 4.1a `@curve/table-engine` import（T2.5）

```ts
sniffCsv(text): { delimiter, hasHeader }
parseCsv(text, { delimiter?, hasHeader?, sampleSize? }): ParsedImportData
parseJson(text): ParsedImportData
buildImportColumns(headers, rows, sampleSize?): ImportedColumn[]
inferColumnType(values, sampleSize?): { type, confidence, sampleSize }
planImport(request): ImportPlan
ImportDelimiter, ImportFormat, ImportMode, ImportColumnType, ImportCellValue,
ParsedImportData, ImportedColumn, ImportDataset, ImportTarget, ImportColumnMapping,
ImportIssue, ImportStats, ImportPlanRequest, ImportPlanSuccess, ImportPlanFailure
```

- 编码解码不在 table-engine；在 `apps/desktop/src/renderer/import/encoding.ts`，使用平台
  `TextDecoder`（严格 UTF-8 → GB18030）。`Papaparse` 是 table-engine 唯一新增运行时依赖。
- `planImport` 整批校验；`skipInvalid=false` 时有 issue 返回 failure；`true` 时只返回合法行。
  统计口径 `total/accepted/skipped`，issue 的 `row` 是 1-based 数据行（不含表头）。
- 100k 行 `parse+plan+encode` bench P95 **659ms**（本机）。

### 4.2 `@curve/table-engine`

```ts
decodeJsonl(jsonl, table): { rows, issues, stats }
encodeJsonl(rows): string
encodeJsonlWithStats(rows): { jsonl, bytes }
countJsonlRows(jsonl): number
toJsonlAppError(result): AppError | null
TableData = { table: TableMeta; rows: Row[] }
DirtyTableTracker: mark/markAll/clear/clearAll/has/get/list/ids/size
TableWorkerRequest/Response; createDecodeRequest/createEncodeRequest
```

T2.4 新增：

```ts
PasteDelimiter = 'tab' | 'comma'
ClipboardMatrix = { delimiter, cells: string[][], rows, columns }
parseClipboardText(text): { ok: true; data: ClipboardMatrix } | { ok: false; error: AppError }
```

- 规则见 ADR-030：TSV 优先；单列含逗号回退 CSV；引号/`""`/内嵌换行、CRLF、BOM、单尾随换行、
  矩形化；未闭合引号返回 `E_IMPORT_FORMAT`。
- T2.5 可复用 `parseClipboardText` 的引号/换行处理思路，但导入向导的编码/分隔符嗅探/表头是
  独立实现；不要把粘贴解析器硬套到文件导入（T2.5 使用 Papa Parse + 独立嗅探）。

T2.6 新增：

```ts
QueryOptions { locale?: string }
QueryRequest { filter?: FilterPredicate; sort?: readonly SortSpec[] }
QueryResult { rowIds: string[]; visibleRows: number }
QueryContext; QueryIssue
createQueryContext(table, options?): QueryContext
queryRowIds(rows, table, request, options?): QueryResult
queryRowIdsWithContext(rows, context, request): QueryResult
applyFilter(rows, table, predicate, options?): Row[]
applySort(rows, table, sort, options?): Row[]
validateFilterPredicate(table, predicate): QueryIssue[]
validateSortSpecs(table, sort): QueryIssue[]
allowedCompareOps(column); compareOpNeedsValue(op); compareOpNeedsSecondValue(op)
matchesFilterPredicate(row, context, predicate): boolean
QUERY_WORKER_ROW_THRESHOLD = 20_000; DEFAULT_QUERY_LOCALE = 'en-US'
QuerySyncPayload; QueryRowsPayload; QueryRowsResult
QueryWorkerRequest/Response; isQueryWorkerRequest/isQueryWorkerResponse
```

- 12 种操作符、all/any 递归、空值最后、三级稳定排序；文本 `Intl.Collator` 语义（自然键快速路径，
  非 ASCII/不安全值回退）。查询返回**有序 rowId**，调用方负责映射到行对象。
- `QUERY_WORKER_ROW_THRESHOLD` 以上由 renderer 注入专用 query Worker；协议见
  `query-protocol.ts`，缓存/守卫在 `apps/desktop/src/renderer/query/handler.ts`。

T3.6 新增（CSV 导出纯函数）：

```ts
CSV_BOM; CSV_CRLF; CSV_CHUNK_ROWS = 1_000; CSV_FILE_BASE_MAX_LENGTH = 80
CsvValueMode = 'display' | 'raw'
CsvExportColumn { column; valueIndex; header }
CsvExportOptions { columns; rows; formatCell; chunkRows? }
CsvChunk { text; rows }
escapeCsvField(text): string
rawCsvCellText(value, column): string
sanitizeCsvFileNameBase(tableName): string
csvExportFileName(tableName, now): string
encodeCsvChunks(options): Generator<CsvChunk>
```

- `encodeCsvChunks` 首块是 BOM+表头，之后按完整行分块；`formatCell` 由 renderer 注入
  （显示格式用 `formatStyledCellValue`，原始值用 `rawCsvCellText`），table-engine 不 import UI。
- `packages/domain/src/format.ts` 的 `Intl.DateTimeFormat`/`NumberFormat` 按 locale/格式缓存；
  100k 日期导出从 10s 量级降到 1.7s，不要移除缓存。

### 4.3 `@curve/persistence`

`WorkspaceStore` 端口（create/open/close/readTable/writeTable/writeManifest/trash/listBackups/restore）、
`MemoryWorkspaceStore`、布局/备份/迁移快照命名纯函数、`createEmptyManifest`/`validateManifest`/
`parseManifestDocument`/`serializeManifest`。

- `readTable` 缺文件语义（ADR-022）：`rowCount === 0` → `{jsonl:'', bytes:0}`；`rowCount > 0` →
  `E_TABLE_NOT_FOUND`。
- `@curve/persistence` 无 Electron/Node 内建；不要往这个包放 `node:fs`。
- 迁移框架（`runMigrations`/`migration-backup`）仍未接生产打开路径（ADR-024/029）。

### 4.4 main：`FileWorkspaceStore`

- 路径白名单、原子写、表/manifest 备份、`.lock`、最近列表、打开时按磁盘重算 `rowCount`。
- `trash` 按 `tableId` 解析文件，不要求表仍在 manifest 中（T2.1 删除顺序，ADR-027）。
- 迁移快照 `migration-backup.ts` 仍只被测试调用。

### 4.5 IPC / preload / renderer

`IMPLEMENTED_IPC_CHANNELS` 共 **21** 个：`app:info`、`app:settings`、`app:settings:update`、
`app:quit-response`、`dialog:pickDirectory`、`log:write`、`workspace:create/open/inspect/close/recent`、
`workspace:recent:remove|clear`、`manifest:write`、`table:read/write/trash`、`file:importText`、
`file:exportText`、`file:exportCsv`、`file:archiveImport`；另有 1 个 main→renderer 事件
`app:quit-requested`（`IPC_EVENT_CHANNELS`，不在 `ALL_IPC_CHANNELS` 的 handle 探针里）。

- `dialog:saveFile` / `backup:*` 仍只有通道名。
- `file:importText` 返回 `{ token, name, bytes, sha256, size, format }`（原始字节，供 Worker 解码）；
  `file:archiveImport` 只用 token 对应的已选路径，把原文复制/记录到 `imports/`。
- `file:exportCsv` 返回 `begin/append/finish/cancel` 的 op 联合；`begin` 返回 `{ token, path }`
  或 `null`（用户取消保存对话框），其余 op 只接受 token。
- `file:exportText` 的 `encoding` 可以是 `'utf8'`（缺省）或 `'base64'`（T4.5，ADR-044）：
  main 对 base64 严格校验后解码成字节，走 `atomicWriteBytes`（临时文件 + fsync + rename）。
  PNG 导出复用它，**没有新增通道**；renderer 不传路径，仍只传 `suggestedName`/`filters`。
- `apps/desktop/src/renderer/api-client.ts` 提供 `app`、`dialog`、`workspace`、`manifest`、`table`、
  `file`，所有方法返回 `IpcResult<T>`，入参与响应双向 Zod 校验；`app.onQuitRequested` 是唯一的
  订阅方法（事件负载也过 Zod），不暴露 `ipcRenderer.on/invoke`。
- `table:write` 写盘前校验 200k 行 / 256MB 上限；导入保存仍走该通道（256MB 在保存时强制）。
- T2.5 新增 3 个已实现通道（`ALL_IPC_CHANNELS` 18 → 19）；T3.6 新增 `file:exportCsv`
  （19 → 20；已实现 14 → 15）；T4.5 只扩展 `file:exportText` 请求（仍是 20/15）；T5.3 新增
  `workspace:inspect`、`app:quit-response` 并实现 `workspace:recent:remove|clear`
  （ALL 20 → 22；已实现 15 → 19；另有 `app:quit-requested` 事件）。
- `workspace:open` 请求新增可选 `recovery: { acceptStaleLock?, manifestBackup? }`；
  `workspace:inspect` 返回 `{ dir, name, lock, manifest, errorCode?, backups }`（T5.3，ADR-048）。
- T5.5 新增 `app:settings`（读 `userData/settings.json`）与 `app:settings:update`（完整
  `AppSettings`，Zod 校验后原子串行写）；preload 暴露 `app.settings()/app.updateSettings()`，
  不传路径。事件/退出握手不变，只有关闭时超时放宽到 60s。
  （ALL 22 → 24；已实现 19 → 21。）
- `AppInfo` 不变；`AppSettings`/`normalizeAppSettings`/`DEFAULT_APP_SETTINGS` 在
  `shared/contracts/settings.ts`，`ipc.ts` 重新导出类型与 `appSettingsSchema`。

### 4.6 `@curve/app-core`（T1.5 + T2.1 + T2.2 + T2.3 + T2.4 + T2.5 + T2.6 + T2.7）

```ts
createAppCore({
  workspaceStore, logger?, now?, uuid?, decodeTable?, encodeTable?, archiveImport?
}): {
  store: AppStore;
  commands: CommandBus;
  openWorkspace(request): Promise<OpenWorkspaceOutcome>;
  actions: WorkspaceActions;
  history: EditHistory;
}
```

已注册命令（全部同步、走 Immer patches）：

| 命令 | 载荷 | 说明 |
|---|---|---|
| `table.cell.set` | `{ tableId, rowId, columnId, value }` | T2.2 单元格编辑；最小历史 |
| `table.paste` | `{ tableId, anchor, columnIds, matrix, newColumns? }` | T2.4 区域粘贴；原子、可选新增列 |
| `table.import` | `{ tableId, mode, rows, newColumns? }` | T2.5 导入；原子追加/替换、可选新列 |
| `table.rows.insert` | `{ tableId, index, rows }` | T2.4 插入整行；空 text 主键生成 |
| `table.create` | `{ table, view }` | 新表 + 表视图 + 标签 |
| `table.delete` | `{ tableId }` | 级联删除 chart/view/layout 引用 |
| `table.meta.update` | `{ tableId, name?, primaryKey? }` | 至少一个；换主键走 `planPrimaryKeyChange` |
| `table.column.add` | `{ tableId, column, index? }` | 旧行补 `null`；所有视图插入顺序 |
| `table.column.update` | `{ tableId, column }` | 完整列定义；类型/必填/枚举逐行校验/转换 |
| `table.column.delete` | `{ tableId, columnId }` | 主键拒绝；清理所有视图状态 |
| `table.column.reorder` | `{ tableId, columnIds }` | 精确排列；同步 schema/行/所有视图顺序 |
| `view.create/delete/update/layout` | … | T2.1 视图与布局 |

T2.4 新增公开 API：

```ts
PasteAnchor, PastePlanRequest, PasteIssue, PasteSummary, PastePlanSuccess, PastePlanFailure,
PastePlan, PastePlanner, createPastePlanner, planPaste
PasteColumnType, PasteColumnDraft, PasteColumnIssue, PasteColumnsResult, createPasteColumns
createPasteCommand, PastePayload, PasteCommandOptions
createRowInsertCommand, RowsInsertPayload, RowInsertItem, RowsInsertCommandOptions
PASTE_PROGRESS_THRESHOLD = 10_000, DEFAULT_PASTE_CHUNK_CELLS = 2_000
PasteRequestBase, PastePrepareRequest, PasteApplyRequest, PasteProgress, PastePrepareOptions,
PasteBlockReason, PastePrepareOutcome, PasteApplyOutcome
```

T2.5 新增公开 API：

```ts
ImportSource, ImportArchiveRequest, ImportArchiveResult, ImportApplyRequest, ImportApplyOutcome
WorkspaceActions.applyImport(request): Promise<ImportApplyOutcome>
archiveImport?: (request: ImportArchiveRequest) => Promise<ImportArchiveResult>
```

T2.6 新增公开 API：

```ts
ViewPatch（既有；filter/sort/hidden/widths/frozen/columnOrder）
validateTableViewState(table, tableView): ViewStateIssue[]
assertValidTableView(table, tableView): void
FilterDraft, FilterDraftCondition, FilterDraftIssue, FilterDraftIssueReason,
BuildFilterResult, buildFilterPredicate(table, draft),
createEmptyFilterDraft(table), filterDraftFromPredicate(table, filter),
defaultOperatorFor(column), defaultFilterValueFor(column), dateFilterInputValue(epochMs)
createDuplicateTableView({ source, existingTitles, uuid? }), duplicateViewTitle(base, titles)
WorkspaceActions.duplicateView(viewId): Promise<ActionOutcome<{ viewId }>>
PasteRequestBase.rowIds?: readonly string[]
PasteBlockReason = 'filter-active' | 'filter-visible-exceeded' | 'filter-anchor-hidden'
```

`WorkspaceActions`（T2.6 新增部分）：

```ts
duplicateView(viewId): Promise<ActionOutcome<{ viewId: string }>>;
```

- `view.create/update` 现在校验筛选操作符/值类型、排序 ≤3 层且列唯一、隐藏列属于
  `columnOrder`；筛选/排序/隐藏/宽度都只写 manifest，不进撤销。
- `table.paste` 增加可选 `rowIds/viewId`：筛选下只写可见行、超出 `filter-visible-exceeded`、
  锚点不可见 `filter-anchor-hidden`、预览后筛选变化 `filter-stale`；省略时保持 T2.4 行为。
- `preparePaste` 的 `blocked` 原因新增 `filter-visible-exceeded`/`filter-anchor-hidden`；
  UI 分别显示“超出可见行”/“锚点行不可见”。

`WorkspaceActions`（T2.5 新增部分）：

```ts
applyImport(request): Promise<ImportApplyOutcome>;
```

`WorkspaceActions`（T2.4 新增部分）：

```ts
preparePaste(request, options?): Promise<PastePrepareOutcome>;
applyPaste(request): Promise<PasteApplyOutcome>;
```

- 行数据命令（`table.cell.set`/`table.paste`/`table.import`/`table.rows.insert`）走保存队列
  （表 → manifest）；纯 schema 命令只写 manifest。T5.3 起队列按 1.5s / 10s 窗口合并写盘，
  `flushSaves()`（Ctrl/Cmd+S、关闭工作区、退出握手）取消定时器立即写；粘贴/导入/样式/图表
  action 仍会在返回前 `flush()`。
- 保存失败返回 `{ ok: false, error, committed: true }`：内存已变更，UI 关闭对话框，状态栏/Toast 重试。
- T5.2 起 `EditHistory` 默认记录所有带 patches 的命令（含表/列/行/视图/工作区），
  `view.layout` 仅结构变更入栈；`table.cell.set` 的 800ms/`mergeKey` 合并不变，粘贴/导入/
  各控件提交各一条。历史 API/保存语义见 §4.25。
- 结构命令（T2.3/T5.2）与视图/样式/图表命令均可撤销；纯布局焦点切换是瞬态，不清 redo。
- 其他导出：`checkColumnDraft`、`ColumnDraft/ColumnDraftIssue`、`ColumnChange/ColumnChangeSummary`、
  `listChartColumnReferences`/`findMissingChartColumns`/`chartReferencesColumn`、
  `insertColumnIntoView`/`removeColumnFromView`/`removeColumnFromFilter`/`reorderViewColumns`。

### 4.7 renderer 结构

```text
apps/desktop/src/renderer/
├─ app-core/                    # 组合根 / Provider / IPC Store 适配
├─ features/workspace/          # Welcome/New/Open/TabBar/WorkspaceView
├─ features/tables/             # TableList/New/Rename/Delete dialogs
├─ features/grid/               # DataGrid/GridCell/GridHeader/editors/…
│  ├─ grid-navigation.ts        # 移动/矩形选择 + T2.4 pasteTarget
│  ├─ grid-sort.ts              # T2.6 表头 asc→desc→none / Shift 多级
│  ├─ use-view-rows.ts          # T2.6 可见行解析（≤20k 主线程 / >20k Worker）
│  └─ use-cell-editing.ts
├─ features/filter/             # T2.6：FilterDialog + filter-builder 文案
├─ features/export/             # T3.6：ExportCsvDialog/use-export-csv/export-csv-plan
├─ features/columns/            # T2.3：ColumnsPanel/ColumnFormDialog/ColumnChangeDialog
├─ features/paste/              # T2.4：PasteColumnsDialog/PasteErrorDialog/PasteProgressDialog
│  ├─ use-paste.tsx             # idle→preparing→columns/errors/applying；T2.6 传 rowIds
│  └─ paste-issue-text.ts
├─ features/import/             # T2.5：ImportWizardDialog/use-import/import-error-csv
│  └─ ImportSession.tsx          # 懒加载入口；避免进入初始 TableList chunk
├─ import/                      # T2.5：encoding/client/worker-protocol/worker-handler
├─ query/                       # T2.6：query Worker client/handler（缓存/增量/守卫）
├─ workers/{import,query}.worker.ts  # T2.5/T2.6 专用 Worker
├─ features/charts/                # T4.4/T4.5：图表列表/向导/检查器/视图/Canvas/导出
│  ├─ ChartList.tsx / ChartDialogs.tsx
│  ├─ NewChartDialog.tsx           # 选表→映射→列→实时预览
│  ├─ ChartView.tsx                # 状态机/空态/工具栏/aria 摘要/重映射/data-chart-* 契约
│  ├─ ChartCanvas.tsx              # render + 120ms 防抖 update + resize + dispose + 交互/导出句柄
│  ├─ ChartExportDialog.tsx / ChartEmptyState.tsx   # PNG 导出对话框、三态空态卡片
│  ├─ ChartInspector.tsx / ChartMappingFields.tsx / chart-fields.tsx
│  └─ chart-view-model.ts / chart-text.ts / chart-export.ts / use-chart-editor.ts
├─ features/history/              # T5.2：TitleBar Edit 菜单 + 命令名 → i18n 映射
├─ shell/                       # AppShell/TitleBar/Sidebar/Inspector/StatusBar/HelpDialog
├─ i18n/messages/{zh-CN,en-US}.ts
```

- `DataGrid` 监听 `onPaste`，读 `text/plain`；编辑器打开/事件源是可编辑控件时走原生粘贴。
  锚点为选择矩形左上角；`locate` prop 让网格滚动并临时高亮第一个错误。
- `DataGrid` 工具条还渲染“导出 CSV…”按钮与 `ExportCsvDialog`；`WorkspaceView` 传
  `allRows={tableData.rows}` 供“全部行”范围使用。
- `WorkspaceView` 渲染 `paste.dialogs`；`onLocate` 把错误行/列传给 `DataGrid`。
- 所有文案走消息表；`apps/desktop/test/ui-conventions.test.ts` 会拦硬编码中文/颜色字面量/未声明令牌。

### 4.8 E2E 证据

`apps/desktop/e2e/paste.spec.ts` 7 条：5×4 引号/内嵌换行 + 重开；类型错误 + 定位 + 磁盘不变；
超列确认 + 新增列 + 重开；10k/100k 格取消 + 磁盘不变；撤销/重做；筛选守卫；200% 缩放键盘可达。

T2.5 新增 `apps/desktop/e2e/import.spec.ts` 6 条：100k GBK 分号 + 3 坏行 + 错误 CSV；错编码
覆盖；150k 取消/100k 提示；JSON 替换 + 备份 + 原文归档 + 撤销；200k 拒绝；200% 缩放键盘。

完整 E2E 现为 **99 passed**；T2.1 的 `grid.spec.ts`、T2.2 的 `edit.spec.ts`、T2.3 的
`schema.spec.ts`、T2.4 的 `paste.spec.ts`、T2.5 的 `import.spec.ts`、T2.6 的
`filter.spec.ts`、T2.7 的 `perf.spec.ts`、T3.2/T3.4 的 `style.spec.ts`、T3.5 的
`template.spec.ts`、T3.6 的 `export-csv.spec.ts`、T4.4 的 `chart.spec.ts`、T4.5 的
`chart-interaction.spec.ts`、T4.6 的 `chart-perf.spec.ts`、T5.1 的 `layout.spec.ts`、
T5.2 的 `undo.spec.ts`、T5.3 的 `autosave.spec.ts`/`recovery.spec.ts`、T5.4 的
`palette.spec.ts`、M2 的 `m2-acceptance.spec.ts`、M3 的 `m3-acceptance.spec.ts`、M4 的
`m4-acceptance.spec.ts` 与既有 shell/ipc/smoke/workspace/table-io 全绿。

T5.2 新增 `apps/desktop/e2e/undo.spec.ts` 3 条：5 次间隔 900ms 的编辑 → 撤销 5 次/重做 3 次
+ JSONL + Edit 菜单（7.6s）；标签/选择/滚动不入历史 + 焦点切换保留 redo + 关闭/重开清空
（3.7s）；键盘打开菜单 + 200% 缩放不越界（2.9s）。截图在 `docs/reports/t5.2/`。

T5.3 新增 `apps/desktop/e2e/autosave.spec.ts` 4 条（1.5s 窗口 + Ctrl+S，5.0s；去抖窗口内退出
仍保存且下次启动无恢复提示，3.8s；只读表文件“保存失败”→取消退出→恢复重试，4.1s；最近列表
移除/清空，2.8s）与 `recovery.spec.ts` 4 条（`taskkill /F /T` 强杀恢复，6.0s；stale/corrupt 锁
的“尝试恢复/直接打开”，2.8s；200% 缩放 + 纯键盘恢复对话框，2.7s；损坏 manifest 的取消/备份
重建，2.8s）；共用夹具 `e2e/workspace-seed.ts`。`grid.spec.ts` 的 stale-lock 用例改为先经过
恢复对话框。截图在 `docs/reports/t5.3/`（5 张）。

T2.6 新增 `apps/desktop/e2e/filter.spec.ts` 6 条：2k 行筛选 + 三级排序；重开恢复筛选/排序与
清除；同表双视图互不影响；隐藏列/恢复；100k 行 Worker 筛选+排序（`data-query-ms <= 400`）；
200% 缩放筛选对话框键盘可达。`paste.spec.ts` 的筛选守卫改写为“只写可见行 + 超出整批拒绝”。

T2.7 新增 `apps/desktop/e2e/perf.spec.ts` 3 条：冷启动 ≤2.5s（`curve:app-ready`）、
100k 打开 ≤3s（`performance.measure('curve:open')`）、整应用 private 内存 ≤600MB
（`app.getAppMetrics()`，含 Worker 排序后的 `data-query-total-ms` 趋势）。三条都 attach 计时/
内存明细，失败时保留 trace 与截图。

M2 新增 `apps/desktop/e2e/m2-acceptance.spec.ts` 1 条（新建表 → 粘贴 200 行 → 导入 100k
GBK CSV（3 坏行）→ 筛选/3 级排序 → 列宽/冻结 → 退出并重启 Electron → 界面/磁盘还原 +
预算）；`e2e/fixtures.ts` 新增 `launchCurveApp()` 以同一 `userData` 重启。实测导入 824ms、
100k 打开 624ms、筛选 19ms、排序 63ms、内存 497MB；报告 `docs/reports/m2/REPORT.md`；
2026-10-23 已获用户接受。

T3.2 新增 `apps/desktop/e2e/style.spec.ts` 1 条：seed 1 表 7 列 + 5 视图（report-light/
compact-light/dark/finance + 持久化 `sty_bars`），断言计算后的颜色/行高/字族/对齐、数字/
日期/布尔/枚举文本、列覆盖 label/width/numberFormat、bar 比例与切回内置视图不受影响；
每个模板 attach 一张网格截图到 `docs/reports/t3.2/`。不提交像素基线。

T3.6 新增 `apps/desktop/e2e/export-csv.spec.ts` 3 条：3 行 × 6 列夹具（筛选/排序/隐藏列）验证
BOM/CRLF/RFC 4180 与原始值切换；100k 工作区默认显示格式导出 ≤5s（T3.6 实测 1,716ms，M3 复跑
1,646ms）并在进度出现后取消、断言目标与临时文件均不存在；200% 缩放纯键盘 Enter 打开/Esc 关闭
并断言对话框在视口内。截图 `docs/reports/t3.6/t3.6-export-dialog.png`。

M3 新增 `apps/desktop/e2e/m3-acceptance.spec.ts` 1 条（3 次启动）：seed 源/目标工作区 →
应用 4 个内置模板（行高/颜色/字族/斑马纹）→ 编辑器改密度/表头色/列覆盖（`sensor_a` 180px、
1 位小数，预览 2ms）→ Ctrl+Z/重做验证一次控件一条撤销 → “高温”条件规则（`> 30`，命中/未命中）
→ 另存 `M3 Report` → 筛选/降序/冻结 2 列/Note 自适应 116px/设为默认 → 导出 `.curvestyle.json`
与 CSV（4 行 × 6 列）→ 重启导入新工作区（12 项计算样式逐项相等 + 目标 CSV）→ 再重启验证两个
工作区还原。报告 `docs/reports/m3/REPORT.md` 与 10 张截图；用例全量内 **11.2s**。

T4.4 新增 `apps/desktop/e2e/chart.spec.ts` 4 条：①向导建宽表 2 个 Y → 检查器切长表 3 系列 →
外观/坐标轴/排序逐项生效 → 同一 userData 重启后 `data-chart-*` 逐属性相等（6.2s）；
②UI 删除映射列 → `missing-columns` + 内嵌重映射 → 修复/重启仍正常（3.9s）；
③复制图表新 id/新视图、标题 ` (2)`、源/副本调色板互不影响（2.8s）；
④200% 缩放下 Enter 开向导（对话框不越界）、方向键/End 切检查器标签（2.8s）。
截图由 `testInfo.outputPath` 生成后复制到 `docs/reports/t4.4/`（4 张），不提交像素基线。

T4.5 新增 `apps/desktop/e2e/chart-interaction.spec.ts` 3 条：①100k 采样图（`sampled=true`、
rendered ≤2k）上的图例切换、放大/缩小/重置（`data-chart-zoom-start/end`）、tooltip
（`.cs-chart-tooltip`）、缩窗后 canvas 变窄，并跑 axe wcag2a/aa（critical 0）（4.0s）；
②PNG 导出透明/白/深三背景（IHDR 尺寸 = canvas ×2、像素 alpha 0/`#ffffff`/`#1e1e1e`、文件名
`<标题>-<yyyyMMdd-HHmm>.png`）与 200% 键盘冒烟（2.4s）；③`no-data`/`unmapped` 空态与行动按钮
（2.4s）。截图复制到 `docs/reports/t4.5/`（3 张）。`no-table` 是防御态，由组件测试覆盖。

### 4.9 `@curve/domain` 表格样式（T3.1）

```ts
BUILTIN_STYLE_IDS
DEFAULT_TABLE_STYLE_ID                 // 'builtin.report-light'
DEFAULT_TABLE_STYLE
DEFAULT_TABLE_STYLE_TOKENS
listBuiltinStyles(): readonly TableStyle[]
getBuiltinStyle(id): TableStyle | undefined
isBuiltinStyleId(value): value is BuiltinStyleId
isResolvableStyleId(styleId, userStyleIds): boolean
unresolvedStyleWarning(styleId): string
resolveStyle(styleId, userStyles?): { style; fallback; warning? }
createTableStyle(options): TableStyle
forkTableStyle(style, options?): TableStyle
tableStyleColorSchema
```

- 4 个内置模板是深度冻结常量、`builtin: true`、不写入 manifest；id 稳定。
- 未知 id（含未知 `builtin.*`）→ `builtin.report-light` + warning；视图与工作区默认样式在
  `checkInvariants` 中告警，不阻断加载。
- `forkTableStyle` 深拷贝 tokens/overrides/嵌套 `FilterPredicate`，分配 `sty_<uuid>`，
  `builtin: false`，名称默认 `Name (2)`；条件规则 id 暂时保留。
- 颜色只接受 `#RGB/#RGBA/#RRGGBB/#RRGGBBAA`；`builtin.finance` 的数字右对齐/千分位由
  T3.2 的全局数字规则实现（ADR-035），T3.1 只提供等宽字体 + 斑马纹令牌。
- 模型、决策与残留见 `docs/adr/034-t31-table-style-model.md` 与
  `docs/reports/t3.1/REPORT.md`。

### 4.10 `@curve/ui` 表格样式渲染（T3.2）

```ts
TABLE_STYLE_CSS_VARIABLES
TableStyleCssVariable / TableStyleCssVars
styleToCssVars(style): TableStyleCssVars   // 20 个 --cs-table-*
tableRowHeight(tokens): number
TableStyleProvider({ tableStyle, ...sectionProps })
formatStyledCellValue(value, column, style, options?)
resolveCellAlign(column, style): CellAlign
resolveCellRender(column, style): CellRenderMode
columnDisplayLabel(column, style): string
computeBarRanges(rows, columns, style)
barRatioForValue(value, range)
enumBadgeTone(value): 0 | 1 | 2 | 3
presentStyledCell(value, column, style, barRanges, options?)
```

- `WorkspaceView` 用 `resolveStyle(view.tableView.styleId, Object.values(state.tableStyles))`
  解析样式；`TableStyleProvider` 直接渲染 `DataGrid` 的 `<section>`，`data-table-style` 暴露
  id，`data-style-fallback` 标记回退。
- 网格只读 `--cs-table-*`；工具栏局部映射应用控件令牌；`ui-conventions.test.ts` 校验样式表
  只消费 `TABLE_STYLE_CSS_VARIABLES` 中的变量。
- 数字统一千分位；数字/日期默认右对齐；布尔本地化；列覆盖 label/width/align/numberFormat/
  dateFormat/cellRender 只影响显示；bar 的 min/max 来自当前可见行并缓存；badge 哈希到 4 个
  样式 tone。
- 真实渲染验证：`apps/desktop/e2e/style.spec.ts`；决策与代价见
  `docs/adr/035-t32-style-rendering.md` 与 `docs/reports/t3.2/REPORT.md`。

### 4.11 `@curve/domain` 条件格式（T3.3）

```ts
CompareMode = 'filter' | 'condition'
DEFAULT_COMPARE_LOCALE
allowedCompareOps(column) / conditionCompareOps(column)
compareOpNeedsValue(op) / compareOpNeedsSecondValue(op)
PreparedComparison
prepareComparison(column, predicate, { locale?, mode? })
matchesPreparedComparison(cell, prepared)
ConditionalRuleMatch / RowConditionalFormat / ConditionalFormat
createConditionalFormat(rules, columns, { locale? })
evaluateRules(rules, row, columns, { locale? })
```

- `prepareComparison`/`matchesPreparedComparison` 是筛选与条件规则唯一的比较实现；
  `conditionCompareOps` 只比过滤器多 number/date 的 `contains`（SPEC §10.4）。
- `createConditionalFormat` 一次准备列索引/谓词/needle；`evaluateRow` 返回 `rowRule` 和
  `cellRule(columnId)`，混合目标按数组下标取最早命中；`evaluateRules` 是一次性入口。
- 缺失列分支忽略、全缺失规则不命中；空值/类型不匹配返回 false；禁用规则在准备阶段丢弃。
- `GridCell` 用 `conditionalCellStyle`（`@curve/ui`）复制 rule style；条件样式只在没有
  选中/错误/冲突/粘贴错误时应用，条件背景存在时不画 bar，行 icon 只在首个可见列。

### 4.12 `@curve/app-core` `style.update` 与 workspace 历史（T3.3）

```ts
createStyleUpdateCommand(options?)
StyleUpdatePayload { style }
WorkspaceActions.updateTableStyle(style): Promise<ActionOutcome>
SaveQueue.enqueueManifest(): void
```

- 只接受 `sty_` 用户样式；`tableStyleSchema`、样式存在性、重复规则 id 都在命令内校验；
  只写 `state.tableStyles[id]` 与 workspace `updatedAt`，不写 JSONL。
- `SaveQueue.enqueueManifest` 与表保存共用串行队列；表保存会顺带写 manifest，写盘期间新到的
  manifest 任务会再写一次；失败保留可重试状态。
- `EditHistory` 条目 `tableId` 可为 `null`；`style.update` 的 undo/redo 通过
  `onWorkspaceChanged` 入队 manifest。T3.4 的编辑器继续复用该命令。

### 4.13 `@curve/app-core` `style.create`（T3.4）

```ts
createStyleCreateCommand(options?)
StyleCreatePayload { style: TableStyle; viewId?: string }
WorkspaceActions.createTableStyle(style, viewId?): Promise<ActionOutcome<{ styleId: string }>>
```

- 只接受新的 `sty_`、`builtin: false` 样式；`viewId` 必须是现有表视图。
- 在同一命令内写 `state.tableStyles[id]`，并可选把 `view.tableView.styleId` 指向它；随后
  `SaveQueue.enqueueManifest`。`style.create`/`style.update` 都是 workspace 作用域历史。
- T3.4 编辑器懒 fork：首次提交内置模板时调用该命令；之后用 `style.update`。T3.5 的模板
  导入/复制/另存为已复用这两个命令，未另起写盘路径。

### 4.14 renderer 样式编辑器（T3.4）

```text
apps/desktop/src/renderer/features/style/
├─ StylePanel.tsx             # 检查器“样式”标签摘要 + 打开编辑器
├─ StyleEditorDialog.tsx      # 本地草稿、提交队列、四组标签、前 50 行预览
├─ StylePreview.tsx           # TableStyleProvider + GridCell + presentStyledCell
├─ StyleTokensTab.tsx         # 令牌（密度联动 SPEC §10.2 垂直内边距）
├─ StyleColumnsTab.tsx        # 列覆盖
├─ StyleRulesTab.tsx          # 规则列表 + 两层 all/any 构建器
├─ StyleFieldControls.tsx     # 文本/数字/颜色/复选框
└─ style-text.ts              # 内置模板名称/密度/网格本地化
```

- 检查器 `Inspector` 现在是“列 / 样式”两个标签；`GridCell` 增加可选 `testIdPrefix`，预览用
  `preview-cell-*`，主网格仍为 `grid-cell-*`。
- 文本/数字/颜色在合法输入时更新草稿（即时预览），失焦/Enter 提交；下拉/复选框/规则保存
  各一次提交。字段错误禁用“完成”。相同草稿签名去重，提交队列串行。
- 预览取物理前 50 行、当前视图列顺序/隐藏/宽度；不挂载 DataGrid 编辑器、筛选/排序工具条、
  选择层、查询 Worker 或虚拟滚动。`data-preview-ms` 供 E2E 读取，实测 3ms。
- 规则构建器在 `@curve/app-core` 的 `condition-builder.ts`；操作符用 `conditionCompareOps`，
  超过两层/缺失列/不支持操作符的规则只读。
- E2E `style.spec.ts` 第二条覆盖：键盘改密度、字号一次撤销、键盘加规则、manifest 落盘、
  200% 缩放、两张截图；不提交像素基线。

### 4.15 `@curve/domain` 模板导出与身份重分配（T3.5）

```ts
STYLE_EXPORT_KIND = 'curve-table-style'; STYLE_EXPORT_VERSION = 1
MAX_STYLE_EXPORT_LENGTH = 2_000_000
StyleExportDocument { kind; version; exportedAt; style }
styleExportDocumentSchema
createStyleExportDocument(style, { now? }): StyleExportDocument
serializeStyleExportDocument(document): string
parseStyleExportDocument(text): { ok: true; document } | { ok: false; reason; detail? }
cloneTableStyle(style): TableStyle
reassignStyleIdentity(style, { name?, uuid? }): TableStyle
styleCopyName(base, existingNames): string
resolveStyleName(base, existingNames): string
```

- 导出文档是 `TableStyle` 的深拷贝快照；`exportedAt` 用 `isoTimestampSchema`，序列化为
  2 空格缩进 + 结尾换行。
- 失败原因 `json`/`tooLarge`/`version`/`document` 由解析器返回，不抛跨进程错误。
- `reassignStyleIdentity` 生成新 `sty_`、`builtin:false`、每条规则新 `rule_`；tokens/覆盖/
  谓词/列 ID 原样保留。`styleCopyName` 总是加后缀，`resolveStyleName` 原名空闲则保留。

### 4.16 `@curve/app-core` 模板命令与 actions（T3.5）

```ts
createStyleDeleteCommand(options?): CommandDefinition<{ styleId }>
createStyleApplyCommand(options?): CommandDefinition<{ styleId, target }>
StyleApplyTarget = { kind: 'view'; viewId } | { kind: 'default' }
styleFallbackId(state, deletedStyleId): string
prepareStyleImport(text, { existingNames, uuid? }): PrepareStyleImportResult
collectStyleColumnIds(style): string[]
missingStyleColumns(style, table): string[]

WorkspaceActions.deleteTableStyle(styleId):
  Promise<ActionOutcome<{ fallbackStyleId; affectedViewIds }>>
WorkspaceActions.applyTableStyle(styleId, target): Promise<ActionOutcome>
WorkspaceActions.duplicateTableStyle(styleId):
  Promise<ActionOutcome<{ styleId; name }>>
```

- `style.delete` 仅接受 `sty_`；同一 Immer 事务内回退所有引用视图、重置默认、删除样式。
- `style.apply` 校验样式可解析与目标合法；`view` 只接受表视图，`default` 写工作区设置。
- 两条命令都加入 `MANIFEST_SAVING_COMMANDS` 与 `EditHistory` 的 workspace 作用域；action 等待
  `saveQueue.flush()`，失败返回 `committed: true`。`duplicateTableStyle` 用 domain 的名称辅助。

### 4.17 renderer 模板管理与导入导出（T3.5）

```text
apps/desktop/src/renderer/features/style/
├─ TemplateManagerDialog.tsx  # 列表、应用/默认/重命名/复制/导出/删除确认/导入入口
├─ TemplateImportDialog.tsx   # 选择文件、解析校验、前 50 行预览、缺失列、应用选项
├─ style-transfer.ts          # 建议文件名、BOM/UTF-8 解码、文件名提取
├─ StylePanel.tsx             # 对话框状态 + action/IPC 接线
└─ StyleEditorDialog.tsx      # “另存为模板…”并切换到新副本
```

- 管理对话框是模态框；删除确认在同一对话框内切换内容与 footer，不叠加第二个模态框。
- 导入/exports 复用 `core.api.file.importText/exportText`；导出前先 `styleExportDocumentSchema`
  构造并序列化，导入文本在领域层解析、在 app-core 做身份重分配。
- `.curvestyle.json` 不写 `imports/`；`file:importText` 的 `.json` 扩展名判断已足够。
- E2E `template.spec.ts` 覆盖：导出 → 重启 → 新工作区导入 → 应用（12 项计算样式一致）、
  删除回退与 `Ctrl+Z`、坏文件 manifest 字节不变、200% 与键盘打开；截图在
  `docs/reports/t3.5/`。

### 4.18 renderer CSV 导出（T3.6）

```text
apps/desktop/src/renderer/features/export/
├─ ExportCsvDialog.tsx   # 容器（hook/IPC）+ 可测试的 ExportCsvDialogView
├─ use-export-csv.ts     # 列/行计划 → 分块 append → finish/cancel、进度/错误
└─ export-csv-plan.ts    # buildCsvExportColumns / selectCsvExportRows
```

- 入口在 `DataGrid` 工具条，`allRows` 由 `WorkspaceView` 传入；导出只读，不发命令、不进撤销、
  不写 manifest/JSONL。
- `useCsvExport` 用 `encodeCsvChunks`（约 1,000 行/块），每块 `await file.exportCsv({op:'append'})`
  后 `setTimeout(0)` 让出；取消设置标志位，下一次循环调用 `cancel` 并进入 `cancelled`。
- `file:exportCsv` 的 `begin` 返回 token/path；`finish` 返回 path/bytes/rows；`cancel` 幂等。
  main 侧 token 只在内存，`before-quit` 清理。
- 对话框每次打开重置为“显示格式 + 当前筛选排序”；Esc/X 关闭会取消进行中的会话（不叠加确认框）。
- 完整 E2E 见 §4.8；100k 预算与取消见 `e2e/export-csv.spec.ts`。

### 4.19 `@curve/chart-model` RenderModel（T4.1）

```ts
MAX_CHART_SERIES = 20
EMPTY_SERIES_NAME = '(空)'
CHART_PALETTES / CHART_BACKGROUNDS
resolvePalette(paletteId) / resolveChartBackground(option, { theme?, background? })
canBeChartX(column) / canBeChartY(column) / canBeChartSeries(column)
validateChartMapping(table, mapping): ChartIssue[]
resolveSeries(table, rows, spec, options?): { ok: true; model } | { ok: false; issues }

RenderModel { kind; x; series; style; meta }   // SPEC §11.3
RenderSeries / RenderXAxis / RenderStyle / RenderMeta
ChartIssue { path; code: ValidationIssueCode; message }
ChartResolveOptions { locale?; theme?: 'light' | 'dark'; background? }
```

- 纯函数、无状态；只依赖 `@curve/domain` 与 `@curve/table-engine`，禁止 ECharts/React/Electron。
- 失败一次返回全部 issue（不抛异常）；warning 走 `meta.warnings`（英文聚合文案）。
- 宽表 `id=列 id`、长表 `id=<seriesColumnId>:<存储值>`；`(空)` 组合并 null 与空串；
  `> MAX_CHART_SERIES` 截断并 warning。
- `sourcePoints` = 非空 Y 值数；T4.2 起 `sampled`/`renderedPoints` 由采样器改写（见 §4.20）。
- 完整语义、代价与复核条件见 `docs/adr/040-t41-render-model.md` 与
  `docs/reports/t4.1/REPORT.md`；2 条黄金快照在 `packages/chart-model/src/__snapshots__/`。

### 4.20 `@curve/chart-model` LTTB 采样（T4.2）

```ts
SamplingOptions { enabled; threshold; target }            // = ChartOptions['sampling']
lttbIndices(x: readonly number[], y: readonly (number | null)[], target: number): number[]
sampleSeriesIndices(
  x: readonly number[],
  values: readonly (number | null)[],
  options: SamplingOptions,
): number[] | null
```

- `lttbIndices`：升序原始下标、保留首尾**非空**点、null 不参与三角面积、`target<3` 退化、
  `target ≥ 非空点数` 返回全部非空下标；target 非法/数组长度不一致抛 `RangeError`。
- `sampleSeriesIndices`：`enabled && 非空点数 > threshold && 非空点数 > target` 才返回下标，
  否则 `null`（原样渲染）。
- `resolveSeries` 的接入：number/time 用存储数值（date epoch ms）、category 用行下标；采样
  只取子序列；采样后 `x.values` = 各系列保留下标的**升序并集**（未采样系列贡献全部非空下标，
  被采样系列在其它系列位置为 null）；`meta.sampled=true`、`renderedPoints ≤ sourcePoints`；
  warning 文本与顺序不变。未触发采样时模型与 T4.1 完全一致。
- 采样只在 `resolveSeries` 内做一次（T4.6 起 `resolveSeries` = `resolveChartData` +
  `renderChartModel` 的组合，采样仍在数据段）；`chart-echarts` 不得再采样。
- 完整决策、代价与复核条件见 `docs/adr/041-t42-lttb-sampling.md` 与
  `docs/reports/t4.2/REPORT.md`；基准见 `pnpm bench -- --chart`（`--sample` 是别名）。

### 4.21 `@curve/chart-echarts` ECharts 适配器（T4.3）

```ts
PACKAGE_NAME

// option（纯函数，唯一 option 构造点）
type ChartOption / ChartSeriesOption
interface ChartToolboxLabels { zoom?: string; zoomBack?: string }
interface ChartOptionOptions { locale?: string; labels?: ChartToolboxLabels }
toEChartsOption(model: RenderModel, options?: ChartOptionOptions): ChartOption
isEmptyModel(model: RenderModel): boolean
CHART_TOOLTIP_CLASS = 'cs-chart-tooltip'   // T4.5 稳定 DOM 类名

// 主题（background → light/dark；颜色与 @curve/ui 令牌同值，但不 import @curve/ui）
type ChartThemeMode = 'light' | 'dark'
interface ChartTheme { mode; text; mutedText; axisLine; splitLine; tooltipBackground; tooltipBorder; zoomFill }
CHART_THEMES / resolveChartTheme(background): ChartTheme

// 格式化
DEFAULT_CHART_LOCALE = 'en-US'
createChartFormatters(model, options?): ChartFormatters   // formatAxisNumber/formatXValue/formatYValue/formatTooltip
escapeHtmlText(value: string): string

// 注册
registerEChartsModules(): void        // 幂等（Line/Scatter/Bar + Grid/Tooltip/Legend/DataZoom/Toolbox + Canvas）
areEChartsModulesRegistered(): boolean

// 生命周期
type ChartRendererState = 'idle' | 'ready' | 'empty' | 'error'
type ChartPngBackground = 'transparent' | 'light' | 'dark'
interface ChartPngOptions { scale?: number; background?: ChartPngBackground }
interface ChartRendererOptions { locale?: string; labels?: ChartToolboxLabels }
type ChartRenderOutcome = { ok: true; state: 'ready' | 'empty' } | { ok: false; error: AppError }
type ChartPngOutcome = { ok: true; dataUrl: string } | { ok: false; error: AppError }

// 交互（T4.5，ADR-044；瞬态，不写文档）
type ChartInteractionAction =
  | { type: 'toggle-series'; name: string }
  | { type: 'zoom-by'; factor: number }
  | { type: 'reset-view' }
interface ChartZoomWindow { start: number; end: number }
interface ChartInteractionState { zoom: ChartZoomWindow | null; hiddenSeries: string[] }

interface ChartRenderer {
  state; render(container, model); update(model); resize(); toPNG(options?); dispose();
  getInteractionState(): ChartInteractionState;
  dispatchInteraction(action: ChartInteractionAction): void;
  onInteractionChange(listener: (state: ChartInteractionState) => void): () => void;
}
createChartRenderer(options?: ChartRendererOptions): ChartRenderer
activeChartInstanceCount(): number   // 泄漏断言用
```

- `x.type` 映射 `number→value`、`time→time`、`text→category`；类目轴 `xAxis.data` + 对齐数组，
  数值/时间轴 `[x, y]` 对；`null` 保留为空点。
- 断点：T4.4 起由 `RenderStyle.connectNulls` 决定（采样图与长表 true、宽表未采样 false），
  适配器不再读 `meta.sampled`（ADR-043）。适配器不采样。
- `RenderModel.y.label` 映射为 `yAxis.name`；`grid.bottom` 72 让 X 轴名避开 dataZoom 滑块。
- 空模型不创建实例；`render` 重新挂载、`update` merge + `replaceMerge`；错误返回结构化
  `AppError`；`dispose` 幂等；`toPNG` 默认 2x/透明并排除 toolbox。
- T4.5：`getInteractionState()` 从 `getOption()` 读 dataZoom 窗口与 legend `selected`，
  `hiddenSeries` 只含当前渲染的系列名；`dispatchInteraction` 只调 `dispatchAction`
  （`legendToggleSelect` / `dataZoom` / `legendAllSelect`+dataZoom），异常吞掉、不重建实例；
  `onInteractionChange` 在 `datazoom`/`legendselectchanged` 时通知，`dispose` 清空订阅。
- T4.5：`labels` 只映射 `toolbox.feature.dataZoom.title.zoom/back`，不传时保持 ECharts 默认值；
  tooltip 带 `className='cs-chart-tooltip'`（`renderMode:'html'` 不变）。
- 按需注册子集 606.0 kB minified / 206 kB gzip；T4.4 起被 renderer 引用，T4.5 主 chunk 3,238.36 kB。
- 完整决策/代价/复核条件见 `docs/adr/042-t43-echarts-adapter.md`、ADR-043、ADR-044 与
  `docs/reports/t4.3/REPORT.md`、`docs/reports/t4.4/REPORT.md`、`docs/reports/t4.5/REPORT.md`。

### 4.22 `@curve/app-core` 图表命令与 actions（T4.4）

```ts
DEFAULT_CHART_OPTIONS                // smooth/showSymbol off、lineWidth 2、default、auto、grid/legend on、
                                     // numberDigits 2、sampling { enabled, 5000, 2000 }
defaultChartOptions(): ChartOptions
ChartCreatePayload { chart; view }   // view 必填，kind='chart'、无 tableView、refId=chart.id
ChartUpdatePayload { chart }
ChartDeletePayload { chartId }
ChartCreateRequest { tableId; title; kind; mapping; options?; filter?; sort? }
createNewChartPayload(options: NewChartOptions): ChartCreatePayload
duplicateChartTitle(base, existingTitles): string
createChartCreateCommand({ now?, uuid? })
createChartUpdateCommand({ now?, uuid? })
createChartDeleteCommand({ now?, uuid? })

WorkspaceActions
  createChart(request): Promise<ActionOutcome<{ chartId; viewId }>>
  updateChart(chart): Promise<ActionOutcome>
  deleteChart(chartId): Promise<ActionOutcome>
  duplicateChart(chartId): Promise<ActionOutcome<{ chartId; viewId }>>
  openChart(chartId): Promise<ActionOutcome<{ viewId; created }>>
```

- 三条命令 manifest-only、进入 `MANIFEST_SAVING_COMMANDS` 与 workspace 作用域历史；`chart.create`
  严格校验映射/筛选/排序并在同一事务内建视图入 layout；`chart.update` 允许悬空映射（修复路径）、
  覆盖 `createdAt`、刷新 `updatedAt`、标题变化同步视图标题；`chart.delete` 级联视图/layout。
- actions 都等待 `saveQueue.flush()`，写盘失败返回 `committed: true`；复制用新 `cht_`/`viw_`
  与 ` (2)` 标题；`openChart` 复用 `view.layout`/`view.create`。
- 完整决策/代价见 `docs/adr/043-t44-chart-creation-inspector.md` 与 `docs/reports/t4.4/REPORT.md`。

### 4.23 renderer 图表 UI（T4.4 + T4.5）

```ts
// features/charts/chart-view-model.ts（纯逻辑）
CHART_PREVIEW_TIMESTAMP
ChartRenderStatus = ready | missing-chart | missing-table | missing-columns | invalid | error
chartRenderStatus(input): ChartRenderStatus
buildChartMapping(table, layout, current?): ChartMapping | null
canUseChartLayout(table, layout): boolean
createPreviewChart(input): ChartSpec

// chart-export.ts（T4.5 纯逻辑）
CHART_PNG_SCALE = 2
sanitizeChartFileBase(title): string
chartPngFileName(title, now): string        // <title>-<yyyyMMdd-HHmm>.png
pngDataUrlToBase64(dataUrl): string | null

// chart-text.ts
chartSummaryText(model, t): string          // 类型/系列数/点数（采样含 rendered）

// ChartCanvas（唯一 ECharts 挂载点）
CHART_UPDATE_DEBOUNCE_MS = 120
interface ChartCanvasHandle {
  exportPng(options?: ChartPngOptions): Promise<ChartPngOutcome>;
  getInteractionState(): ChartInteractionState;
  dispatchInteraction(action: ChartInteractionAction): void;
  subscribeInteraction(listener: (state: ChartInteractionState) => void): () => void;
}
ChartCanvas({ ref, model, label, testId?, renderer? })   // renderer 仅测试注入

// ChartView / Inspector / 列表 / 空态 / 导出
ChartView({ view })                  // data-testid="chart-view" + data-chart-* / data-chart-empty
ChartEmptyState({ kind: 'no-table'|'unmapped'|'no-data', title, body, actionLabel, onAction, children? })
ChartExportDialog({ open, title, disabled, canvas, onClose })
ChartInspector({ chart, table, rowCount })
ChartMappingFields({ chart, table, onChange, testIdPrefix? })
ChartList()                          // 侧栏图表标签
NewChartDialog({ open, onClose }) / RenameChartDialog / DeleteChartDialog
useChartEditor(): (chart: ChartSpec) => void
```

- 首次 `renderer.render()`；之后 120ms 防抖 `renderer.update()`，不重建实例；`ResizeObserver`
  → `resize()`；卸载 `dispose()`；适配器错误内联 alert。
- T4.5 工具栏：逐系列 `aria-pressed` 图例、放大/缩小/重置缩放、“查看数据表”、“导出 PNG…”。
  全部原生按钮；`data-chart-zoom-start/end`、`data-chart-hidden-series` 暴露瞬态状态；
  交互不持久化、不进撤销。
- T4.5 空态：`no-table`（删除图表…）、`unmapped`（配置映射，聚焦内嵌编辑器）、`no-data`
  （`data-chart-state="empty"` + 查看数据表）；`no-table` 是防御态（合法 manifest 无法打开）。
- T4.5 导出：`ChartCanvas.exportPng` flush 防抖 + 两帧 → `toPNG`；对话框选透明/白/深背景，
  固定 2x，文件名 `<标题>-<yyyyMMdd-HHmm>.png`；保存走 `file:exportText` + base64，
  main 原子写字节；取消/失败在对话框内处理，不落半成品。
- 无障碍：canvas 宿主 `role="img"` 的 `aria-label` 为标题+类型+系列数+点数摘要。
- 检查器四组（数据/映射/外观/坐标轴）；映射编辑器与错误态重映射共用；`data-chart-*` 是
  E2E/无障碍契约。`ChartPlaceholder.tsx` 已删除，`WorkspaceView` 对 chart 视图渲染 `ChartView`。

### 4.24 图表性能：数据缓存、延迟解析与诊断（T4.6）

```ts
// @curve/chart-model — 解析/样式拆分（resolveSeries = compose，输出不变）
interface ResolvedSeries { id: string; name: string; values: (number | null)[] }
interface ResolvedXAxis { values: (number | string)[]; type: RenderXAxis['type']; columnLabel: string; unit?: string }
interface ResolvedChartData { x: ResolvedXAxis; series: ResolvedSeries[]; meta: RenderMeta }
type ChartDataResult = { ok: true; data: ResolvedChartData } | { ok: false; issues: ChartIssue[] };
resolveChartData(table, rows, spec, options?): ChartDataResult
renderChartModel(data, spec, options?): RenderModel

// features/charts/chart-data-cache.ts
CHART_DATA_CACHE_CAPACITY = 2
createChartDataCache(capacity?): ChartDataCache       // { size, get, set, clear }；LRU
chartDataKey(table, rows, spec, locale?): string
hasCachedChartData(cache, table, rows, spec, options?): boolean
resolveChartDataCached(cache, table, rows, spec, options?): ChartDataResult

// features/charts/use-chart-render-status.ts
CHART_DEFER_RESOLVE_ROW_THRESHOLD = 20_000
useChartRenderStatus(input): { status: ChartRenderStatus | null; pending; resolveMs }

// chart-view-model.ts（新增可选缓存参数；省略时保持旧行为）
chartRenderStatus(input, options?: { cache?: ChartDataCache }): ChartRenderStatus
```

- 数据缓存键：表 id + 列签名 + 行数 + mapping + filter + sort + sampling + locale；不含样式字段
  与 `xLabel`。命中还要求 `rows` 引用相同；失败结果不缓存。
- 延迟解析：>20k 行且缓存未命中 → 先渲染 loading（`chart-view[data-chart-state=loading]`，
  `data-chart-pending="true"`，`role="status"`），`setTimeout(0)` 后解析；小表/缓存命中同步。
  首次挂载、映射切换与标签切换都走同一逻辑。单次解析仍不可中断（ADR-045 代价）。
- 诊断：`chart-view` 的 `data-chart-pending`/`data-chart-resolve-ms`；`chart-canvas` 的
  `data-chart-update-ms`（render/update 同步耗时）、`data-chart-update-count`（单调递增）、
  `data-chart-instances`（`activeChartInstanceCount()`）。只读、非持久化。
- 交互发布：事件驱动 → rAF 合并（每帧一次，取最新值）；工具栏动作与 `update()` 后的刷新立即发布。
- 基准：`pnpm bench -- --chart`（`sample` 更名，`--sample` 别名）；渲染/更新预算由
  `e2e/chart-perf.spec.ts` 的 `data-chart-update-ms ≤ 200` 判定。决策见
  `docs/adr/045-t46-chart-performance.md` 与 `docs/reports/t4.6/REPORT.md`。

### 4.25 撤销/重做与 Edit 菜单（T5.2）

```ts
// @curve/app-core — history/edit-history.ts
DEFAULT_MERGE_WINDOW_MS = 800
DEFAULT_HISTORY_LIMIT = 100
DEFAULT_HISTORY_MAX_BYTES = 256 * 1024 * 1024
interface HistoryState { canUndo; canRedo; undoAction; redoAction; undoDepth; redoDepth }
interface EditHistory {
  record(result: CommandResult): void
  undo(): boolean
  redo(): boolean
  canUndo(): boolean
  canRedo(): boolean
  size(): number
  sizeBytes(): number
  snapshot(): HistoryState
  clear(): void
}
createEditHistory({ store, now?, mergeWindowMs?, limit?, maxBytes?, onChanged?,
                    onWorkspaceChanged?, onStateChange? })

// @curve/app-core — state
createEmptyHistoryState(): HistoryState
AppState.ui.history: HistoryState
AppActions.setHistoryState(history): void

// renderer
HistoryMenu()                              // TitleBar 的“编辑”Menu
historyActionKey(command): MessageKey      // features/history/history-action-label.ts
```

- 记录：所有带 patches 的命令默认入栈；`view.layout` 仅结构变更入栈（忽略 `activeViewId` 比较），
  纯标签/焦点切换是瞬态且不清 redo；`table.cell.set` 800ms/`mergeKey` 合并，redo 非空时不合并。
- 上限：100 条或 256MB 结构估算。行数组与当前表共享 → 只计数组；独特行数组抽样 16 行外推；
  大数组抽样 24 项；超限丢最旧，单条超限也丢。`sizeBytes()` 返回两栈估算总和。
- 保存：行补丁 → `onChanged`（表 + manifest）；纯 manifest/删除表 redo → `onWorkspaceChanged`。
  不新增写盘路径，不直接碰 `WorkspaceStore`。
- UI：`ui.history` 快照由 `onStateChange` 发布；TitleBar 的 `HistoryMenu` 显示命令名/禁用态；
  E2E 契约 `data-can-undo`/`data-can-redo`/`data-undo-action`/`data-redo-action`/
  `data-undo-depth`/`data-redo-depth`。快捷键仍在 `WorkspaceView`。
- 打开/关闭工作区清空两栈并把 `ui.history` 置空。完整决策/代价见 ADR-047 与
  `docs/reports/t5.2/REPORT.md`。

### 4.26 应用设置、自动保存开关与 i18n（T5.5）

```ts
// shared/contracts/settings.ts
type AppSettingsTheme = 'light' | 'dark' | 'system';
type AppSettingsLocale = 'zh-CN' | 'en-US';
interface AppSettings {
  version: 1;
  theme: AppSettingsTheme;
  locale: AppSettingsLocale;
  autosave: boolean;
  defaultTableStyleId: string;   // 仅 builtin.*
}
DEFAULT_APP_SETTINGS;
normalizeAppSettings(value): AppSettings;  // 逐字段回退
appSettingsEqual(a, b): boolean;

// main/settings/app-settings-store.ts
SETTINGS_FILE_NAME = 'settings.json';
createAppSettingsStore({ userDataPath, logger?, write? }): {
  get(); load(); update(next);
}

// IPC / preload
app:settings         {}            -> AppSettings
app:settings:update  { settings }  -> AppSettings
window.api.app.settings() / updateSettings(settings)

// @curve/app-core
AppCore.setAutosaveEnabled(enabled): void;
AppCore.hasUnsavedChanges(): boolean;
SaveQueue.setAutosaveEnabled(enabled): void;
SaveQueue.isAutosaveEnabled(): boolean;
SaveQueue.hasUnsavedChanges(): boolean;
SaveState.unsaved: boolean;
SavePhase = 'idle' | 'unsaved' | 'saving' | 'saved' | 'error';
WorkspaceActions.closeWorkspace(options?: { save?: boolean }): Promise<ActionOutcome>;

// renderer
SettingsProvider({ initialSettings?, api? }): ReactElement;
useSettings(): { settings; ready; error; update(patch) };
I18nProvider({ locale?, onLocaleChange?, initialLocale? }): ReactElement;
ThemeProvider({ mode?, onModeChange?, initialMode? }): ReactElement;
UnsavedChangesProvider({ children }): ReactElement;
useUnsavedChangesGuard(): { request(action: 'quit' | 'close-workspace'): Promise<'save'|'discard'|'cancel'> };
```

- `main.tsx` 在 `createRoot` 前 `await app.settings()`（1.5s 兜底）；`AppCoreProvider` 用
  `settings.autosave` 创建队列，并在变化时调用 `setAutosaveEnabled`。
- `SettingsDialog` 的主题/语言/自动保存即时写应用设置；默认样式有工作区时走
  `style.apply { target:'default' }`，无工作区时作为新工作区种子（`FileWorkspaceStore.create`
  → `createEmptyManifest({ settings })`）。
- 自动保存关闭时 `enqueue`/`enqueueManifest` 只发布 `'unsaved'`；`flush()`/`retry()`/Ctrl+S/
  显式 action 仍写。关闭窗口/工作区的三选一由 `UnsavedChangesProvider` 统一管理；放弃调用
  `closeWorkspace({ save:false })`，取消回复 `action:'cancel'`。main 的退出超时在关闭时
  **60s**、开启时 3s。
- i18n：`translateKey` 开发构建缺 key 抛错、生产回退 zh-CN；`ui-conventions.test.ts` 同时审计
  JSX 文本、中文字面量与用户可见属性字面量。完整决策/代价见 ADR-050 与
  `docs/reports/t5.5/REPORT.md`。

### 4.27 `@curve/plugin-sdk`（T6.1）

```ts
// packages/plugin-sdk/src/index.ts
PACKAGE_NAME = '@curve/plugin-sdk';
PLUGIN_API_VERSION = '1.0';
isCompatibleApiVersion(version: string, hostMajor = 1): boolean;
createPluginHost(options: { plugins; logger? }): PluginHost;

type ContributionSource =
  | { kind: 'builtin' }
  | { kind: 'plugin'; pluginId: string };
interface RegistryEntry<T> { id: string; def: T; source: ContributionSource }
interface Registry<T> {
  register(id, def): () => void;
  replace(id, def): void;
  get(id): T | undefined;
  list(): ReadonlyArray<RegistryEntry<T>>;
  subscribe(listener: (entries: ReadonlyArray<RegistryEntry<T>>) => void): () => void;
  dispose(): void;
}
interface PluginHost {
  readonly apiVersion: '1.0';
  readonly fields: Registry<FieldTypeDef>;
  readonly importers: Registry<ImporterDef>;
  readonly chartKinds: Registry<ChartKindDef>;
  readonly commands: Registry<CommandDef>;
  activateAll(): Promise<readonly PluginState[]>;
  activate(pluginId): Promise<PluginState>;
  deactivate(pluginId): Promise<PluginState>;
  getPlugins(): readonly PluginState[];
  getDisabled(): readonly PluginState[];
  dispose(): void;
}
```

- `register` 任何已存在 id（含自己的）→ `E_PLUGIN_INVALID`；`replace` 只能覆盖同 owner（插件不能
  替换内置或他人贡献）。`list()` 内置在前、插件按注册顺序，`replace` 保持位置，每项带 `source`；
  `subscribe` 每次变更同步发快照，监听器异常被隔离，取消订阅幂等。
- 插件上下文拿到的是绑定自身 id 的注册表视图；宿主 `dispose` 关闭全部注册表并拒绝后续注册，
  插件 `dispose` 只移除自己的贡献（回滚与 deactivate 用它）。
- `createPluginHost` 顺序激活：定义非法/重复插件 id → `disabled` + `E_PLUGIN_INVALID`；
  `apiVersion` 主版本 ≠ 1 → `disabled` + `E_PLUGIN_INCOMPATIBLE`（不调用 activate）；activate
  抛错/拒绝 → 回滚该插件贡献 + `disabled`，保留 AppError 原 code（否则 `E_PLUGIN_ACTIVATE`），
  其他插件继续。`deactivate` 先调 hook（抛错只记日志），再移除贡献。
- 字段类型在登记时校验 `storageType`（复用 `builtinColumnTypeSchema`）、必需函数与正
  `defaultWidth`；导入器/图表类型/命令校验 label、函数与枚举值。
- 禁用列表只在内存（`getDisabled()` + 日志）；UI、命令总线、手动禁用/持久化留 T6.3。
- 详情：ADR-052、`docs/reports/t6.1/REPORT.md`；测试 `registry.test.ts` 10 条、
  `host.test.ts` 15 条。

### 4.28 `@curve/plugin-sample`、渲染进程字段类型接线与插件导入（T6.2）

```ts
// plugins/plugin-sample/src/index.ts
PACKAGE_NAME = '@curve/plugin-sample';
SAMPLE_PLUGIN_ID = 'com.curvealmanac.sample';
RATING_FIELD_TYPE_ID = 'com.curvealmanac.rating';   // storageType 'number'
POINTS_IMPORTER_ID = 'com.curvealmanac.points';     // extensions ['.json']
ratingFieldType: FieldTypeDef;
pointsImporter: ImporterDef;
samplePlugin: PluginDefinition;                     // apiVersion '1.0'
sampleFieldTypes: readonly FieldTypeDef[];          // 主进程校验共用
parseRatingText / formatRating / validateRating / compareRatings;
parsePointsJson(text: string): ImportResult;
registerSampleContributions(ctx): void;

// apps/desktop/src/renderer/plugins/index.ts
pluginHost: PluginHost;                             // 模块单例
activateRendererPlugins(): Promise<readonly PluginState[]>;   // 幂等，main.tsx 首帧前
listFieldTypes() / listImporters() / findFieldType / findImporter;
fieldTypeLookup: FieldTypeLookup;                   // 交给 createAppCore
formatFieldCell(value, column, locale): string | null;

// apps/desktop/src/main/plugins.ts
resolveFieldTypeStorage(fieldTypeId): ColumnType | undefined;  // 只读 sampleFieldTypes

// apps/desktop/src/renderer/features/import/plugin-import.ts
runPluginImport({ importer, bytes, fileName, locale, signal }):
  | { ok: true; session: { importerId; importerLabel; dataset: ParsedImportData; preview } }
  | { ok: false; error: AppError };
```

- **rating 语义**：`parseText` 接受整数文本（`0`/`6` 也解析为数字，空文本 → `null`）；
  `validate` 收口 1–5 整数（越界/小数 → issue reason `range`），`required` 仍来自列定义；
  `format` → `★` 重复，`null` → 空；`compare` 数值升序、`null` 最后。
- **三态 `ColumnDraft.fieldTypeId`**：字符串=选择；`null`=显式清除（`draftFromColumn` 对无字段
  类型的列写 `null`）；`undefined`=保留现有（仅存储类型未变）。换存储类型时对话框清空。
- **app-core 端口**：`packages/app-core/src/validation/field-types.ts` 的
  `FieldTypeRule`/`FieldTypeLookup`（结构兼容 `FieldTypeDef`，app-core 不 import plugin-sdk）；
  `checkTableCellSet`/`validateCellBatch` 先 `coerceCell` 再 `parseText`/`validate`，
  `createAppCore({ fieldTypes })` 注入，命令层与编辑器同规则。
- **`@curve/ui`**：`StyledCellOptions.formatField?: (value, column) => string | null`，返回 `null`
  回退存储格式化；网格、自动列宽、样式预览都传入 `formatFieldCell`。
- **导入器**：插件导入器在渲染进程 `decodeImportBytes` + `ImporterDef.parse`，转
  `ParsedImportData`（缺省 `columns` 用 `buildImportColumns`），再以与 Worker 相同的
  `planImport` 载荷**内联规划**；`client.open` 以 transfer 交出字节，`use-import` 在 transfer
  前保留 `bytes` 副本。`ImportPreview.importerLabel` 是渲染进程内部字段（非 IPC）。
- **主进程**：`FileWorkspaceStore` 接收 `resolveFieldTypeStorage`，打开/写 manifest/恢复备份三处
  严格校验；不再对含 `fieldTypeId` 的表格产生 “cannot verify field type” 警告。
- **UI 契约**：列对话框 `data-testid="column-form-field-type"`（option value = 字段类型 id）、
  导入向导 `data-testid="import-importer"`、列行 `data-field-type`。
- 详情：ADR-053、`docs/reports/t6.2/REPORT.md`；测试 `plugins/plugin-sample` 3 files / 29 tests、
  `e2e/plugin.spec.ts` 3 条。

---

## 5. T2.4 决策与实现记录（已完成）

11 项决策全部由用户确认，详见 `docs/adr/030-t24-region-paste.md`：

1. TSV 优先，单列含逗号回退 CSV；网格 `paste` 直读 `text/plain`，无新 IPC；编辑器原生粘贴。
2. 选择矩形左上角为锚点，向右下覆盖/扩容；命令按 rowId 定位，排序 UI 留 T2.6。
3. 筛选存在时整批拒绝，隐藏行不修改；完整可见行语义按 ADR-030 延后 T2.6。
4. `table.rows.insert` + 空 text 主键生成；粘贴自动追加；不加独立“新增行”UI。
5. 单条原子 `table.paste` 携带 `newColumns`；默认 text/非必填、可改 label/type；100 列硬拒绝。
6. 整批预检失败列前 100 条 + 定位首错；不支持对话框内编辑。
7. ≥10,000 格可取消进度；async 分块（默认 2,000 格）；取消不 dispatch；不引入 Worker。
8. 粘贴接入最小历史，一次一条、不合并；撤销回滚新增行/列。
9. 保存走 T2.2 队列（表 → manifest），flush ≤3s；失败 `committed: true`。
10. 批量替换行 + 一次 `splice`；10k 端到端 P95 ≤1s 软预算，硬门禁留 T2.7。
11. 不做区域复制。

关键文件：

```text
packages/table-engine/src/paste.ts (+test)
packages/app-core/src/
├─ commands/{paste,rows}.ts (+test)
├─ validation/{paste-plan,paste-columns}.ts (+test)
├─ usecases/workspace-actions.ts（preparePaste/applyPaste）
├─ usecases/paste-actions.test.ts
├─ history/edit-history.ts (+test)
└─ app-core.ts（命令注册 + row-command 保存集合）
apps/desktop/src/renderer/features/paste/*
apps/desktop/e2e/paste.spec.ts
docs/adr/030-t24-region-paste.md
docs/reports/t2.4/REPORT.md
```

实测（2026-10-22）：

```text
pnpm verify         99 files / 813 tests；depcruise 286 modules / 1073 deps / 0 violations
pnpm test:coverage  全局 lines 76.34% / statements 76.17% / branches 68.45% / functions 77.92%
pnpm format:check   通过
pnpm build          exit 0；renderer 1,308.67 kB
pnpm e2e            48 passed
e2e/paste.spec.ts   7 passed
10k parse+plan      P50 5.01ms / P95 7.75ms（本机，非 CI 门禁）
```

残留：

- 筛选视图只能整批拒绝；完整“只写可见行/超出整批拒绝”由 T2.6 闭环（TASKS T2.6 已承接）。
- 独立“新增行”按钮/快捷键未实现；`table.rows.insert` 命令可用，E3 键盘新增一行仍待后续任务。
- 10 万级矩阵命令阶段仍同步；T2.7 未改命令阶段（结论见 §5C）。
- 256MB 写盘上限在保存时强制（`committed: true`），未在 dispatch 前编码整表。
- 隐藏列/视图级列顺序的完整映射依赖 T2.6；T2.4 只处理传入的可见列顺序。
- 新增列不支持 enum 等需要额外选项的类型，仍走 T2.3 列面板。

---

## 5A. T2.5 决策与实现记录（已完成）

12 项决策全部由用户确认，详见 `docs/adr/031-t25-csv-json-import.md`：

1. `file:importText` 返回原始字节 + token；Worker 用 TextDecoder 严格 UTF-8 → GB18030，UI 覆盖；
2. 新增 Papa Parse 运行时依赖；不引入 jschardet/iconv-lite 运行时依赖（iconv 仅生成夹具）；
3. 分隔符前 20 条稳定性嗅探；表头启发式，默认歧义 true；均可覆盖；
4. 当前表内导入；按 key/label 自动映射；已有/新列/忽略；required 未映射阻止提交；
5. 新列推断抽样 1000 行，置信度 <80% 回退 text；JSON 对象数组/`{rows}`、键并集；
6. 坏行整行跳过/取消；前 100 条 issue + 按坏行聚合的错误 CSV；
7. 追加默认、替换二次确认；复用旧表备份；≤50MB 原文复制 + sidecar SHA-256；
8. 专用 import Worker；取消即 terminate；只把 20 行预览、统计和最终 rows 传回；
9. 最终行数 >200k 拒绝、>100k 确认；256MB 写盘守卫兜底；
10. 成功后等保存队列 flush ≤3s；失败 `committed:true`；
11. `table.import` 一条撤销，不合并；100k 逆补丁由 T5.2 的 256MB 估算计入（ADR-047）；
12. 小夹具提交；100k GBK 由 `scripts/gen-100k.ts` 生成；bench `--import` 8s 门禁。

关键文件：

```text
packages/table-engine/src/import.ts (+test)
packages/app-core/src/
├─ commands/import.ts (+test)
├─ validation/import-planning.ts (+test)
├─ usecases/workspace-actions.ts（applyImport）
├─ usecases/import-actions.test.ts
├─ history/edit-history.ts（table.import）
└─ app-core.ts（命令注册、保存集合、archiveImport 注入）
apps/desktop/src/
├─ main/import/{import-files,import-token-store}.ts (+test)
├─ main/ipc/{handlers,handlers.test}.ts
├─ main/workspace/file-workspace-store.ts（archiveImport）
├─ renderer/features/import/{ImportSession,ImportWizardDialog,use-import,import-error-csv,import-issue-text}
├─ renderer/import/{encoding,client,worker-handler,worker-protocol}.ts (+test)
├─ renderer/workers/import.worker.ts
└─ shared/contracts/{channels,ipc}.ts
apps/desktop/e2e/{import-fixtures,import.spec}.ts
scripts/gen-100k.ts
docs/adr/031-t25-csv-json-import.md
docs/reports/t2.5/REPORT.md
```

实测（2026-10-22）：

```text
pnpm verify         111 files / 880 tests；depcruise 319 modules / 1213 deps / 0 violations
pnpm test:coverage  lines 74.12% / statements 74.06% / branches 66.03% / functions 76.11%
pnpm format:check   通过
pnpm build          exit 0；renderer 1,339.13 kB + ImportSession 42.82 kB；import.worker 266.08 kB
pnpm e2e            54 passed；import.spec.ts 6 passed
pnpm bench -- --import import.100k P50 645ms / P95 659ms
```

残留：

- `table.import` 命令阶段仍同步校验 100k 行；T2.7 未改命令阶段（结论见 §5C）。
- 100k 导入逆补丁已由 T5.2 计入 256MB 估算（独特旧行数组抽样 16 行外推；超限丢最旧，ADR-047）。
- >50MB 原文只写 sidecar（路径 + hash），不复制；替换备份复用 `writeTable`。
- 错误 CSV 一行合并多个 issue；JSON 嵌套对象/数组不支持；新列不支持 enum。
- `file:archiveImport` 是 T2.5 新增通道（声明 18→19，已实现 11→14）；后续任务不得再扩
  preload 白名单而不写 ADR。

---

## 5B. T2.6 决策与实现记录（已完成）

12 项决策全部由用户确认，详见 `docs/adr/032-t26-filter-sort-view-state.md`：

1. 工具条筛选按钮 + 对话框；Inspector 仍只放列管理；
2. 单层 all/any、最多 20 条；嵌套筛选只读、不静默拍平；
3. 操作符按列类型白名单（text 7 种、number/date 9 种、boolean/enum 4 种）；
4. 文本大小写不敏感、空串按 null、number/date 数值、between 含边界、enum 按 value；
5. 表头点击 asc→desc→none；Shift+点击最多 3 级；工具条排序菜单可逐层移除/清空；
6. 空值固定最后；文本 `Intl.Collator` 语义；并列保持物理顺序；
7. 每个确认动作立即 `view.update` + manifest，不写 JSONL、不标脏表、不进撤销；
8. TabBar “+ 复制当前视图”，复制 filter/sort/widths/hidden/frozen；
9. Inspector 列面板隐藏/显示 + 已隐藏列表，至少保留一列；
10. 专用 query Worker（≤20k 主线程，>20k Worker，快照/增量缓存，失败回退）；
11. 粘贴按当前可见行写入；筛选下超出整批拒绝；命令复核 stale/可见行；
12. `bench query.100k` + `query.text-sort.100k` + E2E Worker 计时。

关键文件：

```text
packages/table-engine/src/query.ts (+test)
packages/table-engine/src/query-protocol.ts (+test)
packages/app-core/src/validation/{filter-builder,view-state}.ts (+test)
packages/app-core/src/commands/{view-copy,paste}.ts (+test)
packages/app-core/src/validation/paste-plan.ts (+paste-plan-visible.test)
packages/app-core/src/usecases/workspace-actions.ts（duplicateView、paste rowIds）
apps/desktop/src/renderer/query/{client,handler}.ts (+test)
apps/desktop/src/renderer/workers/query.worker.ts
apps/desktop/src/renderer/features/filter/FilterDialog.tsx (+test)
apps/desktop/src/renderer/features/grid/{grid-sort,use-view-rows}.ts (+test)
apps/desktop/src/renderer/features/grid/{DataGrid,GridHeader}.tsx
apps/desktop/src/renderer/features/columns/ColumnsPanel.tsx
apps/desktop/src/renderer/features/workspace/{TabBar,WorkspaceView}.tsx
apps/desktop/e2e/filter.spec.ts；apps/desktop/e2e/paste.spec.ts（筛选粘贴改写）
scripts/bench.ts（--query）
docs/adr/032-t26-filter-sort-view-state.md
docs/reports/t2.6/REPORT.md
```

实测（2026-10-23）：

```text
pnpm verify         122 files / 967 tests；depcruise 342 modules / 1309 deps / 0 violations
pnpm test:coverage  lines 75.00% / statements 74.89% / branches 66.85% / functions 76.03%
pnpm format:check   通过
pnpm build          exit 0；renderer 1,410.66 kB + ImportSession 42.82 kB；
                    query.worker 227.70 kB；import.worker 266.09 kB；table.worker 216.61 kB
pnpm e2e            60 passed；filter.spec.ts 6 passed；paste.spec.ts 7 passed
pnpm bench -- --query query.100k P50 30ms / P95 34ms；text-sort.100k P50 314ms / P95 347ms
```

残留：

- 筛选对话框只编辑单层条件；嵌套谓词只读。
- 100k 全中文/极端文本排序仍可能接近 400ms；自然键对 >12 位数字段/带符号数字回退 collator。
- query Worker 最多缓存 4 张表；首次 100k 快照克隆未计入 `data-query-ms`。
- 视图状态连续拖动列宽/快速排序会多次写 manifest；T5.3 未合并 `view.update`，仍立即写。
- 10 万级粘贴/导入命令阶段仍同步；T2.7 未改命令阶段（见 §5C）。
- `table.paste` 新增可选 `rowIds/viewId`，SPEC §9.3/§13.1 已同步；省略时保持 T2.4 保守行为。

---

## 5C. T2.7 决策与实现记录（已完成）

7 项决策由用户确认，中文排序预算单独追加确认，详见 `docs/adr/033-t27-performance-gates.md`：

1. CI 预算硬失败 + 20% 回归 `::warning`（基线 `bench/baseline.json` 由 CI Windows runner 生成后提交）；
2. bench 采打开/保存/编辑/筛选排序/导入，E2E 采冷启动/首帧/滚动/整应用内存；
3. 夹具共享 `scripts/gen-100k.ts`，临时目录、不提交；
4. 内存 600MB 用 E2E `app.getAppMetrics().memory.privateBytes`（main+renderer+worker，不含 GPU），
   bench 峰值只作趋势；
5. 中文排序先优化、仍超再确认；实测 644ms 后确认 **800ms 单列预算**；克隆只做诊断；
6. 优化范围限实现级 + Worker 内部；不改格式/IPC/公共 API/命令总线契约、不加运行时依赖；
7. M2 验收另写单条 `m2-acceptance.spec.ts`，T2.7 不执行。

关键文件：

```text
scripts/bench.ts / bench-report.ts (+test) / tsconfig.json / gen-100k.ts
bench/README.md
packages/app-core/src/commands/{frozen-rows.ts,table-cell-set.ts} (+test)
packages/table-engine/src/query.ts
apps/desktop/src/main/workspace/file-workspace-store.ts
apps/desktop/src/renderer/{main.tsx,app-core/use-workspace-controller.ts}
apps/desktop/src/renderer/features/workspace/WorkspaceView.tsx
apps/desktop/src/renderer/features/grid/{use-view-rows.ts,DataGrid.tsx}
apps/desktop/e2e/{fixtures.ts,perf.spec.ts}
.github/workflows/ci.yml；.gitignore；package.json；vitest.config.ts；tsconfig.json
docs/adr/033-t27-performance-gates.md
docs/reports/t2.7/REPORT.md
```

实测（2026-10-23）：

```text
pnpm verify         123 files / 978 tests；depcruise 344 modules / 1317 deps / 0 violations
pnpm test:coverage  lines 74.99% / statements 74.88% / branches 67.02% / functions 75.91%
pnpm format:check   通过
pnpm build          exit 0；renderer 1,415.85 kB + ImportSession 42.82 kB；
                    query.worker 229.63 kB；import.worker 266.09 kB；table.worker 216.61 kB
pnpm e2e            63 passed（perf.spec 3 条）；冷启动 1,063ms、打开 638ms、内存 574MB
pnpm bench          exit 0；open 667ms/3s、save 413ms/500ms、edit 0ms/50ms、
                    query 207ms/400ms、text-sort 253ms/400ms、cjk-sort 698ms/800ms、
                    import 878ms/8s；clone 363ms（诊断）
```

残留：

- `bench/baseline.json` 尚未提交，回归比较当前为 `missing`；需 CI Windows runner 生成。
- 整应用 private 峰值 574MB，距 600MB 约 4% 余量。
- 中文排序 698ms/800ms；更多组合字符、非 zh/en 文本可能更慢。
- `EditHistory` 的整数组撤销补丁每个 100k 行编辑约 1.6MB；T5.2 共享行数组只计数组，单测断言 100 条约 160MB，低于 256MB。
- bench `memoryPeakMB`（约 900MB RSS）是 Node 管线趋势，不是应用内存门禁。
- 10 万级粘贴/导入命令阶段仍同步（未纳入 T2.7 预算；T2.7 未改命令阶段）。
- M2 验收演示已执行（2026-10-23）并获用户接受，报告 `docs/reports/m2/REPORT.md`。

---

## 5D. T3.1 决策与实现记录（已完成）

ADR-034 记录 6 组决定：

1. 4 个内置模板是 domain 深度冻结常量（`builtin: true`），id 稳定、不入 manifest；
   report-light 默认；dark 使用 SPEC 指定的 `#1e1e1e`/`#d4d4d4`，finance 使用等宽字体 + 斑马纹。
2. `resolveStyle(id, userStyles?)` 返回 `{style, fallback, warning?}`；未知 id（含未知
   `builtin.*`）回退 `builtin.report-light` + warning；视图与工作区默认样式在
   `checkInvariants` 中告警，不阻断加载。
3. `forkTableStyle` 深拷贝 tokens/overrides/嵌套 predicate，分配 `sty_<uuid>`、
   `builtin: false`、名称默认 `Name (2)`；内置常量保持不变。
4. 颜色只接受 `#RGB/#RGBA/#RRGGBB/#RRGGBBAA`；数值范围沿用 SPEC。
5. 默认值集中到 domain；persistence/app-core 引用 `DEFAULT_TABLE_STYLE_ID`。
6. 不变量：持久化样式 `builtin` 必须 false、样式 id 唯一且不得 `builtin.`、同一样式规则 id
   唯一；`columnOverrides`/规则列引用允许悬空（SPEC §6.6.7）。

关键文件：

```text
packages/domain/src/table-style.ts (+18 tests)
packages/domain/src/schemas.ts（tableStyleColorSchema）
packages/domain/src/invariants.ts (+1 test)
packages/persistence/src/manifest.ts（默认常量）
packages/app-core/src/commands/tables.ts（默认常量）
docs/adr/034-t31-table-style-model.md
docs/reports/t3.1/REPORT.md
```

实测（2026-10-23）：

```text
pnpm verify         124 files / 997 tests；depcruise 347 modules / 1335 deps / 0 violations
pnpm test:coverage  lines 75.13% / statements 75.03% / branches 67.23% / functions 76.12%
                    table-style.ts lines 97.56%
pnpm format:check   通过
pnpm build          exit 0；renderer 1,419.17 kB + ImportSession 42.82 kB
```

残留：

- `builtin.finance` 的数字右对齐/千分位由 T3.2 的列格式化实现；实际视觉快照留 T3.2。
- 内置名称是中文规范名/回退标签；T3.4 已按 id 走 `t(key)` 本地化，T3.5 的模板管理器/导入预览
  继续按 id 显示内置名称。
- fork 保留条件规则 id；T3.5 的导入/复制/另存为已统一用 `reassignStyleIdentity` 重新分配规则 id。
- 颜色仅支持 hex，不支持 `transparent`/CSS 变量。

---

## 5E. T3.2 决策与实现记录（已完成）

ADR-035 记录 6 组决定：

1. `styleToCssVars` 输出 20 个 `--cs-table-*` 变量，`TableStyleProvider` 直接作为网格
   `<section>`；网格/工具栏/选择栏只消费变量；工具栏把应用控件令牌局部映射到表头配色。
2. 行高 = `max(密度基线, ceil(fontSize×1.25)+2×cellPaddingY)`；内置模板仍 24/32/40；虚拟化
   统一行高，不逐行测量。
3. 数字统一 `Intl.NumberFormat` + 千分位（覆盖 digits → 列 precision → 原始精度 20 位）；
   日期/布尔/枚举走 i18n/列定义；数字/日期默认右对齐。采用用户确认的**全局数字规则**，
   不扩展 `TableStyleTokens`（ADR-034 的 finance 分支不采用）。
4. 有效宽度 `view.widths > 覆盖 width > ColumnDef.width > 160`；label 只影响显示；`cellRender`
   的 badge 仅 enum、bar 仅 number，不兼容组合回退 text。
5. bar 只统计当前可见行并 `useMemo` 缓存；全等值 0 宽；badge 用 FNV-1a 哈希到样式自身的
   header/selection/alternate/body 四组令牌，不新增调色板模型。
6. 视觉验证用真实 Electron 网格 seed 4 个内置 + 1 个持久化用户样式，断言计算样式/格式化/
   宽度/bar，并 attach 5 张截图；不提交 PNG 像素基线（HANDOFF §3.6）。

关键文件：

```text
packages/ui/src/table-style.ts (+9 tests)
packages/ui/src/TableStyleProvider.tsx (+3 tests)
packages/ui/src/table-style-format.ts (+20 tests)
packages/ui/src/index.ts / package.json / tsconfig.json
apps/desktop/src/renderer/features/workspace/WorkspaceView.tsx
apps/desktop/src/renderer/features/grid/{DataGrid,GridCell,GridHeader,grid-sizing}.tsx/ts
apps/desktop/src/renderer/styles.css
apps/desktop/test/ui-conventions.test.ts
apps/desktop/e2e/style.spec.ts
apps/desktop/e2e/edit.spec.ts（布尔文案）
docs/adr/035-t32-style-rendering.md
docs/reports/t3.2/REPORT.md (+5 screenshots)
```

实测（2026-10-23）：

```text
pnpm verify         128 files / 1037 tests；depcruise 355 modules / 1363 deps / 0 violations
pnpm test:coverage  lines 75.39% / statements 75.29% / branches 67.97% / functions 76.37%
pnpm format:check   通过
pnpm build          exit 0；renderer 1,431.97 kB + ImportSession 42.82 kB
pnpm e2e            65 passed（style.spec.ts 1 passed）
pnpm bench          exit 0；open 572ms、save 358ms、edit 0ms、query 216ms、
                    text-sort 287ms、cjk-sort 648ms、import 945ms；clone 345ms（诊断）
```

残留：

- 所有模板数字带千分位、布尔显示“是/否”；显示层变化，不改变磁盘数据。
- 行高统一；极大字体/内边距按公式增高但不逐行测量。
- badge 四 tone 在样式颜色接近时区分度有限；不新增调色板模型。
- 未提交 PNG 像素基线；视觉验收使用计算样式契约 + 截图证据。
- T3.3 必须复用 `presentStyledCell`/`GridCell`，不要另起样式逻辑。

**交接注意（T3.2 实际踩过的坑）**：

- 单元格现在带 `data-column-id`，旧 E2E 的 `[data-column-id=...]` 会同时命中表头和所有行；
  查表头请用 `[role="columnheader"][data-column-id=...]`（`grid.spec.ts` 已修）。
- 全量 E2E 要独占 CPU。与 `verify`/`coverage`/另一套 Electron 并发时，`grid.spec.ts` 的
  200% 缩放焦点用例可能失败；独占重跑 65 passed。不要因此放宽超时或删断言。
- `@curve/ui` 现在运行时依赖 `@curve/domain`；新增 UI 包导入时同步 `package.json` 与
  `tsconfig.json` 的 domain project reference，否则 `tsc -b` 会出现 rootDir/6307 错误。
- `--cs-table-*` 是运行时变量，不在 `tokens.css`；`ui-conventions.test.ts` 从
  `table-style.ts` 的字符串常量里读取白名单。新增变量必须进 `TABLE_STYLE_CSS_VARIABLES`。
- 工具栏通过局部重映射 `--cs-color-*` 继承表头配色；不要在单元格里恢复应用主题令牌。
- 数字统一千分位、布尔显示“是/否”是有意的显示层变化；不要为了旧 E2E 改回 `String(value)`。

---

## 5F. T3.3 决策与实现记录（已完成）

ADR-036 记录 5 组决定：

1. **求值器归属**：12 种比较的语义原语下沉 `packages/domain/src/predicate.ts`；
   `@curve/table-engine` 保留 `QueryContext`/`compareCache`/排序，`matchesCompare` 改为调用
   domain 原语并继续导出 `allowedCompareOps` 等。`condition.ts` 的 `createConditionalFormat`
   一次准备、逐可见行求值；`evaluateRules` 为一次性入口。
2. **number/date contains**：只在 `condition` 模式启用，`String(value)` 后按 locale 不区分
   大小写；过滤器白名单与行为不变。日期按 epoch 字符串（不是显示文本）。
3. **撤销**：新增 `style.update`（只接受 `sty_` 用户样式、schema/存在性/规则 id 唯一校验、
   manifest-only）；`SaveQueue.enqueueManifest` 串行写 manifest；`EditHistory` 支持
   `tableId: null` 的 workspace 作用域，undo/redo 走 `onWorkspaceChanged`，不标记脏表；
   `WorkspaceActions.updateTableStyle` 等待 flush，失败 `committed: true`。
4. **优先级**：错误/冲突/粘贴错误 > 选中 > 条件规则（首条） > bar > 斑马纹/基础；
   条件背景覆盖 bar；行 icon 只在首个可见列；条件样式只影响显示。
5. **性能口径**：16ms 是纯求值（50 规则 × 100 行），domain best-of-3 + bench
   `condition.rules.50x100` 硬门禁；DOM 应用不计入。

关键文件：

```text
packages/domain/src/{predicate,condition}.ts (+test)
packages/table-engine/src/query.ts (+query.test.ts)
packages/app-core/src/commands/styles.ts (+test)
packages/app-core/src/{app-core.ts,history/edit-history.ts,usecases/save-queue.ts,usecases/workspace-actions.ts} (+tests)
packages/ui/src/{table-style-format.ts,index.ts} (+test)
apps/desktop/src/renderer/features/grid/{DataGrid,GridCell}.tsx (+GridCell.test.tsx)
apps/desktop/src/renderer/styles.css；i18n/messages/{zh-CN,en-US}.ts
apps/desktop/e2e/style.spec.ts；scripts/bench.ts
docs/adr/036-t33-conditional-format.md；docs/reports/t3.3/REPORT.md
```

实测（2026-10-24）：

```text
pnpm verify         131 files / 1123 tests；depcruise 361 modules / 1390 deps / 0 violations
pnpm test:coverage  lines 75.82% / statements 75.70% / branches 68.74% / functions 76.68%
pnpm format:check   通过
pnpm build          exit 0；renderer 1,446.60 kB + ImportSession 42.82 kB
pnpm e2e            65 passed（style.spec 含条件规则 + 200% 缩放）；内存 565MB/600MB
pnpm bench          exit 0；open 548ms、save 327ms、edit 0ms、query 224ms、
                    text-sort 302ms、cjk-sort 581ms、import 913ms、
                    condition.rules.50x100 P95 1ms/16ms；clone 309ms（诊断）
```

残留：

- number/date 的 `contains` 匹配 epoch 字符串而非显示日期；如需显示文本匹配，另写 ADR。
- 条件规则首条命中、不叠加；渲染层不做对比度自动校正。
- 条件背景覆盖 bar；如产品希望“背景 + 条”并存，需要新视觉规则。
- `style.update` 的 manifest 写入异步；撤销/重做后由保存队列落盘，与 T2.2 历史语义一致。
- T3.4 必须用 `conditionCompareOps` 构建条件规则操作符列表，复用 `style.update`；不得在
  组件里另写求值或写盘逻辑。

---

## 5G. T3.4 决策与实现记录（已完成）

ADR-037 记录 6 组决定：

1. **入口与表面**：检查器“列/样式”标签 + 宽对话框；左侧令牌/模板/列覆盖/规则，右侧前 50 行
   预览；≤1000px 上下堆叠。解决 260px 检查器放不下表单+预览的问题。
2. **懒 fork**：新增 `style.create { style, viewId? }`，首次提交内置模板时原子创建 `sty_` 副本
   并指向视图；取消不产生副本；后续用 `style.update`。`style.create`/`style.update` 都是
   workspace 作用域历史与 manifest-only 保存。
3. **提交粒度**：文本/数字/颜色合法输入即时更新草稿预览，失焦/Enter 提交；下拉/复选框一次
   交互一条；规则保存一条；字段错误禁用“完成”；提交签名去重、队列串行。
4. **预览**：物理前 50 行 + 当前视图列顺序/隐藏/宽度；复用 `TableStyleProvider`/`GridCell`/
   `presentStyledCell`/`createConditionalFormat`/`computeBarRanges`；不挂载 DataGrid 编辑器/
   查询/虚拟滚动；`data-preview-ms` 实测 3ms/100ms。
5. **规则构建器**：`@curve/app-core` 的 `condition-builder.ts`；操作符用 `conditionCompareOps`；
   单组拍平、多组两层 all/any、最多 2 组；超深/缺失列只读。
6. **范围**：不做 T3.5 模板 CRUD/导入导出；不改 `formatVersion`/manifest 字段/IPC/依赖。

关键文件：

```text
packages/app-core/src/{commands/styles.ts,validation/condition-builder.ts,app-core.ts}
packages/app-core/src/{history/edit-history.ts,usecases/workspace-actions.ts} (+tests)
apps/desktop/src/renderer/features/style/* (+StyleEditorDialog.test.tsx)
apps/desktop/src/renderer/{shell/Inspector.tsx,features/grid/GridCell.tsx,styles.css,i18n/messages/*}
apps/desktop/e2e/style.spec.ts
docs/adr/037-t34-style-editor.md；docs/reports/t3.4/REPORT.md (+2 screenshots)
```

实测（2026-10-24）：

```text
pnpm verify         133 files / 1140 tests；depcruise 372 modules / 1461 deps / 0 violations
pnpm test:coverage  lines 74.70% / statements 74.59% / branches 67.35% / functions 72.97%
pnpm format:check   通过
pnpm build          exit 0；renderer 1,545.42 kB + ImportSession 42.82 kB；CSS 59.59 kB
pnpm e2e            66 passed（style.spec 2 条；T3.4 含键盘/撤销/200%）
pnpm bench          exit 0；open 504ms、save 340ms、edit 0ms、query 192ms、
                    text-sort 234ms、cjk-sort 598ms、import 873ms、
                    condition.rules.50x100 P95 1ms/16ms；clone 304ms（诊断）
```

残留：

- T3.4 不做模板另存/重命名/复制/删除/设为默认/导入导出；全部留 T3.5。
- 预览只取物理前 50 行，不反映筛选后的行集。
- 规则编辑器最多 2 个条件组；更深/缺失列规则只读；规则列表不能拖拽排序，新规则追加末尾。
- 改密度会覆盖 `cellPaddingY` 为 SPEC §10.2 预设；自定义垂直内边距不保留为密度预设。
- 颜色仍只接受 hex；文本输入后按 Esc 会丢弃未提交值。
- 覆盖率 lines 74.70%（新增 UI 由 E2E 覆盖），仍高于 70/60；T3.5 起继续复用该组件测试基线。

## 5H. T3.5 决策与实现记录（已完成）

ADR-038 记录 6 组决定：

1. **命令面**：复用 `style.create`/`style.update`；新增 `style.delete { styleId }` 与
   `style.apply { styleId, target }`（`target` 为表视图或工作区默认）。不新增
   `style.setDefault`；另存为/复制/导入落库用 `style.create`，重命名用 `style.update`。
2. **删除可撤销（SPEC §13.1 优先）**：TASKS 原文“删除除外”与 SPEC 冲突，按 AGENTS §0 以 SPEC
   为准；删除保留 UI 二次确认，命令在同一事务内回退所有视图与默认，并可 Ctrl+Z 恢复。
3. **导入导出**：`kind/curve-table-style` + `version:1` + `exportedAt` + `style`；领域层
   `styleExportDocumentSchema`/`parseStyleExportDocument` 区分 `json/tooLarge/version/document`；
   导入总是重新分配 `sty_`/`rule_` id、强制 `builtin:false`、名称冲突 ` (2)`、缺失列只提示。
   复用 `file:importText`/`file:exportText`，不新增 IPC，不归档到 `imports/`。
4. **UI**：检查器“模板管理…”模态框（应用/默认/重命名/复制/导出/删除/导入）；删除确认在同一
   对话框内切换；导入预览复用 `StylePreview` 前 50 行并可选择应用到当前视图；编辑器“另存为”
   保存当前草稿并切换到新副本。
5. **撤销/保存**：一次操作一条 workspace 历史；导入/复制/另存为 = `style.create`，重命名 =
   `style.update`，应用/删除 = 新命令；全部 manifest-only，action 等待 flush，失败 `committed:true`。
6. **范围**：不新增运行时依赖，不改 `formatVersion`/manifest 字段/JSONL/IPC/preload/CSP；
   不做 T3.6 CSV 导出与 M3 验收。

关键文件：

```text
packages/domain/src/{style-export.ts,table-style.ts} (+tests)
packages/app-core/src/commands/styles.ts (+test)
packages/app-core/src/validation/style-import.ts (+test)
packages/app-core/src/{app-core.ts,history/edit-history.ts,usecases/workspace-actions.ts} (+tests)
apps/desktop/src/renderer/features/style/{TemplateManagerDialog,TemplateImportDialog,style-transfer}.tsx
apps/desktop/src/renderer/features/style/{StylePanel,StyleEditorDialog}.tsx (+tests)
apps/desktop/e2e/{template.spec.ts,fixtures.ts}
docs/adr/038-t35-template-management.md；docs/reports/t3.5/REPORT.md (+2 screenshots)
```

实测（2026-10-24）：

```text
pnpm verify         138 files / 1181 tests；ESLint 0；
                    depcruise 380 modules / 1503 deps / 0 violations
pnpm test:coverage  lines 74.94% / statements 74.81% / branches 67.53% / functions 73.00%
pnpm format:check   通过
pnpm build          exit 0；renderer 1,594.18 kB + ImportSession 42.82 kB；CSS 62.86 kB
pnpm e2e            68 passed（template.spec 2 条：5.4s / 1.9s；内存 568MB/600MB、冷启动 939ms）
pnpm bench          exit 0；open 352ms、save 254ms、edit 0ms、query 209ms、
                    text-sort 248ms、cjk-sort 434ms、import 623ms、condition P95 0ms；clone 236ms
```

提交：**`ac02ba8`**（`feat(tbl): add template management and style import/export (T3.5)`）；
本交接文档的提交见 `git log -1 -- docs/HANDOFF.md`；工作树干净。

残留：

- 导入总是新建模板，不合并/覆盖同一样式；导入预览只含前 50 行。
- 名称冲突按持久化 `style.name` 比较；英文界面下内置模板按 id 本地化，极少数显示名可能观感重复。
- 2,000,000 字符导入上限；模板管理为模态框，不能边看主网格边管理。
- renderer bundle 约 1.59MB（+48.8 kB），T6.4 打包阶段评估拆包。
- 删除可撤销的确认文案必须说明可撤销；如未来改回不可撤销，需改 SPEC §13.1 与 ADR-038。

**M3 验收交接清单（已执行，见 §6A）**：

- 已按 TASKS 的 M3 演示脚本执行：4 个内置模板对比 → 改令牌/列格式 → 加“高温标红” →
  另存模板 → 导出 CSV → 新工作区导入应用 → 重启还原；报告 `docs/reports/m3/REPORT.md`。
- 演示是单条 `apps/desktop/e2e/m3-acceptance.spec.ts`（3 次启动），复用 T3.1–T3.6 的 seed；
  未新增运行时依赖，未改 `formatVersion`/manifest 字段/JSONL/IPC。
- 演示中发现并修复“虚拟化行高不随样式令牌重测”（`DataGrid` 的 `virtualizer.measure()`），
  详见报告 §5 与 §7 风险表。

## 5I. T3.6 决策与实现记录（已完成）

ADR-039 记录 6 组决定：

1. **入口与归属**：网格工具条“导出 CSV…”→ `ExportCsvDialog`；导出只读，不发命令、不进
   `EditHistory`、不写 manifest/JSONL；一次只允许一个导出任务。
2. **行/列范围**：只导出当前视图可见列（`tableView.columnOrder`，隐藏列排除）；行默认当前
   筛选/排序结果，另提供“全部行（忽略筛选、保留排序）”；空表只导出表头。
3. **值格式**：默认“按显示格式”，复用 `formatStyledCellValue`（表头 `columnDisplayLabel`）；
   “原始值”用 text 原样、number 无千分位、date epoch ms、boolean `true/false`、enum 存储值
   （表头 `column.label`）；条件颜色/图标、bar/badge 形态不导出。
4. **传输**：新增单通道 `file:exportCsv`（`begin/append/finish/cancel`，19→20，已实现 14→15）；
   main 写同目录临时文件、`fsync` 后 rename；取消/退出删除临时文件；`append` 单块 ≤8MB，
   token 不透明、renderer 不传路径。
5. **格式/文件名**：UTF-8 BOM 只一次、CRLF、RFC 4180（含逗号/引号/CR/LF/首尾空白才加引号，
   `""` 转义）；默认文件名 `<清洗后表名>-<yyyyMMdd-HHmm>.csv`（本地时间），Windows 保留名
   加 `_`；不处理 CSV 公式注入，保持数据保真。
6. **UI/预算**：对话框显示“N 行 × M 列”和隐藏列/默认文件名提示；约 1,000 行/块、块间让出
   事件循环；进度/取消/完成/错误内联；100k ≤5s（实测 1,716ms），取消无残留文件。

关键文件：

```text
packages/table-engine/src/csv-export.ts (+test)        # RFC 4180/BOM/raw/分块/文件名
packages/domain/src/format.ts                          # Intl formatter 缓存（100k 日期导出）
apps/desktop/src/main/export/csv-export-file.ts (+test)# token/临时文件/fsync/rename/清理
apps/desktop/src/main/{index.ts,ipc/handlers.ts}
apps/desktop/src/shared/contracts/{channels,ipc}.ts (+tests)
apps/desktop/src/preload/api.ts；src/renderer/api-client.ts (+tests)
apps/desktop/src/renderer/features/export/{ExportCsvDialog,use-export-csv,export-csv-plan}.tsx/ts (+tests)
apps/desktop/src/renderer/features/grid/DataGrid.tsx；features/workspace/WorkspaceView.tsx
apps/desktop/src/renderer/{i18n/messages/*,styles.css}
apps/desktop/e2e/export-csv.spec.ts
docs/adr/039-t36-csv-export.md；docs/reports/t3.6/REPORT.md (+1 screenshot)
```

实测（2026-10-24）：

```text
pnpm verify         143 files / 1232 tests；ESLint 0；
                    depcruise 394 modules / 1584 deps / 0 violations
pnpm test:coverage  lines 74.90% / statements 74.78% / branches 67.66% / functions 73.20%
pnpm format:check   通过
pnpm build          exit 0；renderer 1,617.22 kB + ImportSession 42.82 kB；CSS 64.03 kB
pnpm e2e            71 passed（export-csv.spec 3 条；100k 导出 1,716ms；
                    内存 571MB/600MB、冷启动 1,025ms）
pnpm bench          exit 0；open 663ms、save 342ms、edit 0ms、query 213ms、
                    text-sort 260ms、cjk-sort 667ms、import 893ms、condition P95 1ms；clone 333ms
```

提交：**`45e5891`**（`feat(tbl): add CSV export with streaming IPC (T3.6)`）；
本交接文档的提交见 `git log -1 -- docs/HANDOFF.md`；工作树干净。

残留：

- 显示格式的千分位/本地化日期可能被 Excel 当作文本；数值语义请用“原始值”。
- 原始值日期是 epoch ms，不是 ISO/Excel 日期。
- 只导出可见列，不提供列选择器/隐藏列包含选项；需要时先调整视图。
- 不缓解 CSV 公式注入（`=`/`+`/`-`/`@` 不改写）；需要时另加显式选项与 ADR。
- 一次只允许一个导出任务；并发导出需要 token 级进度 UI，T3.6 不做。
- 导出流式/对话框容器主要由 E2E 覆盖（`ExportCsvDialog.tsx` 容器 lines 37.5%、hook 60%）；
  全局 lines 74.90% 仍高于 70/60。
- renderer bundle 增至约 1.62MB（+23 kB vs T3.5），T6.4 打包阶段评估拆包。

**不要做**：不要改 `formatVersion`/manifest 字段/JSONL；不要在 `file:exportCsv` 之外另写第二套
写盘路径或第二套显示格式化；M3 演示已完成，不要重复实现演示脚本。

---

## 5J. M3 验收演示记录（已获用户接受）

M3 演示不需要新的 ADR：不改变文件格式、IPC、公共 API 或运行时依赖，只新增一条 E2E 与一份报告。
演示暴露并修复了一个渲染缺陷（见第 2 条）。

1. **归属**：`apps/desktop/e2e/m3-acceptance.spec.ts` 单条用例、3 次启动（源工作区 → 新工作区
   导入 → 重启还原）。工作区用 `window.api` seed（源/目标同 schema、6 行 × 6 列），模板应用、
   样式编辑器、条件规则、另存、筛选/排序/冻结、CSV 导出、模板导入与重启全部走真实 UI。
2. **行高缺陷（已修）**：`DataGrid` 在 `rowHeight` 变化时调用 `virtualizer.measure()`。TanStack
   Virtual 在只有 `estimateSize` 变化时保留旧测量值，导致模板切换/密度编辑后行高停留旧值，
   直到滚动或缩放。M3 用例在应用 `compact-light` 后立即断言行高 24px（修复前稳定复现 32px）。
   不要删除这次重测，也不要把断言改成“滚动后再测”。
3. **保存对话框替身**：一次启动只有一个 `CURVE_E2E_SAVE`。源启动先导出模板（`m3-work`），
   复制为 `m3-report.curvestyle.json`，随后导出的 CSV 覆盖 `m3-work`；目标启动用独立
   `saveFile`。不要为了多目标导出去改 main 的替身逻辑。
4. **断言口径**：模板切换后属性与虚拟化重测差一帧，计算样式用 `expect.poll`；表头显示名读
   `.cs-grid__header-label`（单元格文本含排序指示器）；行内容按 id 单元格查找（排序/筛选后
   行下标会变），不要用固定 `grid-cell-<row>-<col>` 断言值。
5. **导入流程**：确认导入会同时关闭导入对话框与模板管理对话框；不要再调用
   `closeManager`（此时管理器已卸载）。
6. **对话框按钮**：每个 Dialog 都有 icon 关闭（aria-label “关闭”）与 footer 动作（取消/完成/
   导入）；导出对话框的 footer 也叫“关闭”，所以 `getByRole('button', { name: '关闭' })` 会命中
   两个，需要 footer 时用 `.last()`，其余场景用具体动作名，避免 strict mode 冲突。
7. **证据**：`docs/reports/m3/REPORT.md` + `m3-01`…`m3-10`（10 张 PNG）；Playwright attachment
   含 `m3-metrics.txt`（样式 id/预览耗时/列宽/CSV 字节/JSONL SHA-256）与 `m3-contract.json`
   （源/目标 12 项计算样式）；`test-results/` 为 gitignore。

实测（2026-10-24，全量 E2E 内）：用例 **11.2s**；预览 **2ms**/100ms；12 项计算样式源/目标
完全相等；源 CSV **211B**（5 条 CRLF 记录）、目标 **293B**（7 条）；Note 列宽 116px；
JSONL SHA-256 `2face74e…3843c5` 重启前后不变。

关键文件：

```text
apps/desktop/e2e/m3-acceptance.spec.ts
apps/desktop/src/renderer/features/grid/DataGrid.tsx   # rowHeight 变化时 measure()
docs/reports/m3/REPORT.md (+10 PNG)
docs/TASKS.md（M3 验收演示注记）、CHANGELOG、AGENTS §0
```

提交：**`9cac391`**（`test(m3): add milestone acceptance demo and report`）；本交接文档的
提交见 `git log -1 -- docs/HANDOFF.md`。

**不要做**：不要重跑/重写 M3 演示脚本（已验收）；不要改 `formatVersion`/manifest 字段/JSONL/IPC；
不要把演示脚本改成多个 test（跨启动状态必须留在同一条用例内）。

---

## 5K. T4.1 RenderModel 与宽/长表映射（已完成）

无需变更数据格式、IPC、UI 或依赖；新增 ADR-040 记录 SPEC 未覆盖的四个口径（调色板、auto
背景、空值/空系列、`sourcePoints`）。

1. **API**：`resolveSeries(table, rows, spec, { locale?, theme?, background? })` 返回
   `{ ok: true, model } | { ok: false, issues }`；`validateChartMapping` 与
   `canBeChartX/Y/Series` 供 T4.4 的检查器复用；`MAX_CHART_SERIES = 20`。
2. **校验**：X number/date/text + role x|none；Y number + role y|none，宽表 ≥1 且不重复；
   长表系列列 text/enum + role series|none；`spec.tableId` 必须匹配；filter/sort 直接复用
   `validateFilterPredicate`/`validateSortSpecs`（ADR-032），不另写比较语义。
3. **顺序**：filter → 丢弃 number/date 缺失 X 的行（聚合 warning）→ `spec.sort`；未配置时
   number/date 按 X 升序稳定排序、text 保持物理顺序（SPEC §11.2.1）。
4. **系列**：宽表 `id = 列 id`、`name = label`（重名 ` (2)`）；长表
   `id = "<seriesColumnId>:<存储值>"`、空值归 `(空)`（id 值部分为空串）、enum 用 option label；
   >20 截断 + warning；颜色 `palette[i % palette.length]`。
5. **值**：date → epoch ms（`x.type='time'`）、text → category；Y `null` 断点、非 number →
   null + 该列聚合 warning；重复 X 保留全部点 + warning；空行集返回空模型而不是错误。
6. **样式/调色板**：4×8 常量（`colorblind` = Okabe–Ito）；background 解析顺序
   `options.background` > `theme`(auto) > `light/dark` > `#ffffff`；其余令牌直传。
7. **meta**：`sampled=false`、`sourcePoints=renderedPoints=非空 Y 值数`；T4.2 采样后必须沿用
   这个口径，否则 5s/300ms 预算对不上。warnings 为英文聚合文案，按 X 丢行 → 重复 X →
   非数值 Y → 截断顺序排列。
8. **测试**：44 条单测 + 2 条 `toMatchSnapshot`（宽表日期图、长表 enum 图）；边界单测扫描
   `src/*.ts` 断言无 echarts/react/electron import（depcruise 亦硬阻断）。
9. **tsconfig**：`packages/chart-model/tsconfig.json` 增加 `references`（domain、table-engine）
   与 `types: ["node"]`（仅边界测试读源码）。缺 references 时 `tsc -b` 会把兄弟包的 `.d.ts`
   生成到 `src/` 下并让 `pnpm lint` 报错；不要删除这两项。

实测（2026-10-24，本机）：`pnpm verify` **144 files / 1276 tests**；coverage 全局 lines
**75.34%**（`render-model.ts` 97.54% / `palettes.ts` 90.9%）；`pnpm build` exit 0（产物与 M3
一致，chart-model 尚未被 renderer 引用）；`pnpm e2e` **72 passed**；`pnpm bench` exit 0。

关键文件：

```text
packages/chart-model/src/{render-model,palettes}.ts (+ render-model.test.ts, __snapshots__/)
packages/chart-model/{index.ts,tsconfig.json}
docs/adr/040-t41-render-model.md
docs/reports/t4.1/REPORT.md
docs/SPEC.md §11.3（实现边界）、docs/TASKS.md（T4.1）、CHANGELOG、HANDOFF
```

**不要做**：不要在 chart-model 里 import ECharts/React/Electron；不要另写筛选/排序比较；
不要改 `formatVersion`/manifest/JSONL/IPC；不要把 LTTB（T4.2）或 ECharts option（T4.3）
顺手塞进本任务；不要让 warning 变成静默丢弃。

提交：**`06858d4`**（`feat(chart): add RenderModel with wide/long mapping (T4.1)`）；
M3 验收记录为 **`4ec9653`**。

**T4.2 交接提示（LTTB 采样与缺失值语义）**：

- 采样只发生在 RenderModel 生成阶段（`chart-model`），`chart-echarts` 不得再采样。
- 每个系列独立采样；x 必须单调（T4.1 已按 X 升序或用户排序输出）；保留首尾点；null 不参与
  三角面积计算且输出仍为 null（断点语义不变）。
- 配置来自 `ChartOptions.sampling { enabled, threshold, target }`；关闭或点数 ≤ threshold 时
  原样输出。
- 采样后必须更新 `meta.sampled=true` 与 `renderedPoints ≤ sourcePoints`（sourcePoints 口径见
  ADR-040：非空 Y 值数），并保持 T4.1 的 warning 顺序不变。
- 验收：100k → 2k 点、首尾保留、采样 ≤50ms/系列、属性测试（点数 ≤ target 且 x 单调）、
  `pnpm bench -- --sample`；图表解析+采样总预算 300ms（SPEC §16.1）。
- 不要改 T4.1 的映射/校验/系列 id 契约；需要扩展时先改 SPEC/ADR。

---

## 5L. T4.2 LTTB 采样与缺失值语义（已完成）

ADR-041 记录 7 组决定（无需变更文件格式、IPC 或运行时依赖）：

1. **API**：`lttbIndices(x, y, target)` 返回升序原始下标（保首尾非空点、null 不参与面积、
   `target<3` 退化、`target≥点数` 原样返回、非法入参抛 `RangeError`）；`sampleSeriesIndices`
   逐系列判定 `enabled && 非空点数 > threshold && 非空点数 > target`，否则 `null`。
2. **x 坐标**：number/time 用存储数值（date epoch ms），category 用有序行下标；采样只取子序列，
   永不重排（含用户 `sort`）。
3. **共享 X 轴对齐（关键）**：采样后 `x.values` 取各系列保留下标的**升序并集**；未采样系列
   贡献全部非空下标（不丢点），被采样系列在其它系列位置为 `null`、非空点数 ≤ target。
   被否决的替代方案（整图共用一个下标子集）会抹平逐系列峰值。
4. **缺失值**：null 不参与三角面积、不会成为保留下标、采样后仍为 null；被采样略过的位置也是
   null（模型只有两种状态）；T4.3 已按 ADR-042 §3 处理（未采样断开、已采样跨过）。
   采样不新增/删除/重排 warning。
5. **meta**：`sourcePoints` 采样前非空 Y 总数；`renderedPoints` 采样后非空 Y 总数；
   `sampled` 只在真的降采样时为 true；未采样时模型与 T4.1 完全一致。
6. **基准**：新增 `sample` suite（`pnpm bench -- --sample`）：`chart.resolve-sample.100k`
   预算 300ms（SPEC §16.1）、`chart.sample.100k` 预算 50ms（TASKS T4.2）、
   `chart.resolve-unsampled.100k` 仅诊断。
7. **范围**：不新增运行时依赖、不改 `RenderModel` 形状/`formatVersion`/manifest/JSONL/IPC；
   不做 ECharts option（T4.3）与图表 UI（T4.4）。

关键文件：

```text
packages/chart-model/src/sampling.ts (+ sampling.test.ts)   # LTTB + 逐系列判定
packages/chart-model/src/{render-model.ts,index.ts} (+ render-model.test.ts 集成用例)
scripts/bench.ts（sample suite 与 --sample）、scripts/tsconfig.json、package.json / pnpm-lock.yaml
docs/adr/041-t42-lttb-sampling.md
docs/reports/t4.2/REPORT.md
docs/SPEC.md §11.3（实现边界）、docs/TASKS.md（T4.2）、CHANGELOG、HANDOFF
```

实测（2026-10-25，本机）：

```text
pnpm verify         145 files / 1302 tests；ESLint 0；
                    depcruise 400 modules / 1609 deps / 0 violations
pnpm test:coverage  lines 75.55% / statements 75.46% / branches 68.41% / functions 73.96%
                    sampling.ts lines 93.24%（branch 81.25%）/ render-model.ts 96.96%
pnpm format:check   通过
pnpm build          exit 0；renderer 1,618.04 kB（未变）+ ImportSession 42.82 kB；CSS 64.03 kB
pnpm e2e            72 passed（未改 UI/E2E）
pnpm bench -- --sample
                    chart.resolve-sample.100k P50 82ms / P95 93ms、预算 300ms
                    chart.sample.100k P50 4ms / P95 4ms、预算 50ms
                    chart.resolve-unsampled.100k P50 55ms（诊断）
pnpm bench          exit 0；open 542ms、save 314ms、edit 0ms、query 223ms、
                    text-sort 276ms、cjk-sort 636ms、import 830ms、condition P95 1ms
```

残留：

- 采样后 x 并集可大于 target（上界约 `Σ max(threshold, target)`）；T4.6 已复核（§5P：2 个 Y
  系列的并集约 4k 点，update 89ms/200ms、10 次连点缩放无长任务），未改采样语义。
- 被采样略过的 null 与原始缺口不可区分；T4.3 已按 ADR-042 §3 处理（未采样断开 / 已采样
  跨过；真实断点也会被连线）。
- category 轴按下标采样；未采样系列贡献全部非空点，极端多小系列时采样收益下降。
- 重复 X 面积为 0 时按"每桶首个"确定性选中（已有重复 X warning）。

提交：**`247093d`**（`feat(chart): add LTTB sampling with shared-x alignment (T4.2)`）；
本交接文档的提交见 `git log -1 -- docs/HANDOFF.md`。

## 5M. T4.3 ECharts 适配器（已完成）

ADR-042 记录 7 组决定（无需变更文件格式、IPC 或 UI）：

1. **依赖与注册**：`echarts@^6.1.0`（安装 **6.1.0**）是 `chart-echarts` 唯一新增运行时依赖；
   只注册 Line/Scatter/Bar + Grid/Tooltip/Legend/DataZoom/Toolbox + CanvasRenderer（9 个
   installer，幂等），不 import 全量入口；注册子集 606.0 kB minified / 206 kB gzip。
2. **option 映射**：`toEChartsOption(model, { locale? })` 是唯一构造点；`x.type` 的 `number`
   → ECharts `value`、`time` → `time`、`text` → `category`；类目轴 `xAxis.data` + 对齐数组，
   数值/时间轴 `[x, y]` 对；样式/图例/网格/从零开始/精度逐项映射；`animation: false`。
3. **null 断点**（解决 TASKS T4.3 与 ADR-041 §4 的冲突）：未采样 `connectNulls: false`
   （真实缺口断开，符合 SPEC §11.2.4 与验收 "null 断点不连 line"）；`meta.sampled === true`
   时 `connectNulls: true`（共享 X 轴并集把"被采样略过"变成 null，与真实缺口不可区分；采样图
   必须跨过，真实缺口被连线是 ADR-041 接受的代价）。适配器不采样。
4. **主题**：`resolveChartTheme(background)` 用 WCAG 相对亮度推导 light/dark（hex/rgb/rgba；
   未知语法按 light）；颜色常量与 `@curve/ui` 令牌同值，但不 import `@curve/ui`。
5. **tooltip/交互**：`renderMode: 'html'` + `escapeHtmlText`（用户系列名/类目值不进 HTML）；
   X 单位 + Y 固定 `numberDigits` 精度；`dataZoom` inside + slider；toolbox dataZoom 框选缩放
   （`yAxisIndex:'none'`）。ECharts `marker` 不透传，用模型系列色自绘色点。
6. **生命周期/错误/PNG**：惰性 init；`render` 重新挂载、`update` merge +
   `replaceMerge:['series','xAxis','yAxis']`；空模型不创建实例；错误 `{ ok:false, error }`
   （`E_UNKNOWN`/`E_EXPORT_FAILED`）；`activeChartInstanceCount()`；`toPNG` 默认 2x/透明、
   排除 toolbox，返回 data URL（不落盘）。
7. **边界**：新增 depcruise `only-chart-echarts-imports-echarts` + 包内边界测试；
   不改 `RenderModel`/`formatVersion`/manifest/JSONL/IPC/preload/CSP。

关键文件：

```text
packages/chart-echarts/{package.json,tsconfig.json}
packages/chart-echarts/src/{theme,format,option,registration,renderer}.ts (+tests)
packages/chart-echarts/src/option.ssr.test.ts / boundary.test.ts / __snapshots__/
.dependency-cruiser.cjs
docs/adr/042-t43-echarts-adapter.md；docs/reports/t4.3/REPORT.md
```

实测（2026-10-25，本机）：

```text
pnpm verify         152 files / 1369 tests；ESLint 0；
                    depcruise 416 modules / 1655 deps / 0 violations
pnpm test:coverage  lines 76.09% / statements 75.99% / branches 69.04% / functions 74.60%
                    chart-echarts/src lines 99.56%（option/renderer/theme/registration 100%）
pnpm format:check   通过
pnpm build          exit 0；renderer 1,618.04 kB + ImportSession 42.82 kB；CSS 64.03 kB
                    （chart-echarts 尚未被 renderer 引用）
pnpm e2e            72 passed（3.2m；100k 导出 1,673ms、M3 10.1s、内存 570MB/600MB）
pnpm bench          exit 0；open 537ms、save 395ms、edit 0ms、query 209ms、
                    text-sort 252ms、cjk-sort 581ms、import 866ms、condition P95 1ms；
                    chart.resolve-sample P95 81ms/300ms、chart.sample P95 21ms/50ms
esbuild 体积        echarts 子集 606.0 kB min / 206 kB gzip；
                    适配器完整 bundle 1.0 MB / 304 kB gzip
```

残留：

- Y 轴单位不在 `RenderModel`（`RenderSeries` 无 `unit`），tooltip 只有 X 单位 + Y 精度；要显示
  Y 单位需扩展 SPEC §11.3 并写 ADR。
- 采样图的真实缺口也会被连线（ADR-041 代价）；未采样图断点保持断开。
- canvas 不能在 jsdom 单测：生命周期用 mock；另有 2 条 SSR/SVG 冒烟验证真实 option；像素/布局
  由 T4.5/T4.6 E2E。
- toolbox 标题为 ECharts 英文默认值；动画关闭；dataZoom 滑块常驻。
- 按需注册仍带 toolbox 全部 feature 实现；T4.4 接线后 renderer chunk 增大，T6.4 评估拆包。

提交：**`7a9b665`**（`feat(chart): add the ECharts adapter with option golden snapshots (T4.3)`）；
本交接文档的提交见 `git log -1 -- docs/HANDOFF.md`。

---

## 5N. T4.4 图表创建与检查器（已完成）

ADR-043 记录 9 组决定：

1. **命令面**：`chart.create { chart, view }`、`chart.update { chart }`、`chart.delete { chartId }`；
   manifest-only、workspace 作用域撤销。创建严格校验映射/筛选/排序并原子建视图入 layout；
   更新允许悬空映射（列删除后的修复路径）、覆盖 `createdAt`、刷新 `updatedAt`、标题变化同步
   图表视图标题；删除级联视图与 layout 引用。
2. **用例层**：`createChart/updateChart/deleteChart/duplicateChart/openChart`；向导只提交
   `{ tableId, title, kind, mapping, options?, filter?, sort? }`；id/时间戳/`DEFAULT_CHART_OPTIONS`
   （sampling 5000/2000）在 app-core 生成；复制用 `duplicateChartTitle` + 新 id；action 等 flush、
   失败 `committed: true`。
3. **数据口径**：图表读全表行，行序由图表自身 filter/sort 决定，不跟随表格视图。
4. **RenderModel 扩展**：`y?: { label?: string }`（来自 `ChartOptions.yLabel`）与
   `RenderStyle.connectNulls = sampled || layout === 'long'`；适配器映射 `yAxis.name`、
   `grid.bottom` 72（X 轴名避开 dataZoom）；6 条 option + 2 条 RenderModel 快照有意更新。
5. **检查器**：图表视图激活时四组（数据/映射/外观/坐标轴）；映射编辑器与错误态重映射共用
   `ChartMappingFields`（只列兼容列、布局不可表达置灰、至少一个 Y、悬空列可移除/替换）。
   下拉/复选框即时提交，文本/数字失焦/Enter 提交；一条交互一条 `chart.update`。
6. **渲染更新**：`ChartCanvas` 首次 `render`、之后 120ms 防抖 `update`（不重建实例）、
   `ResizeObserver → resize`、卸载 dispose；错误内联；`data-chart-*` 暴露渲染契约。
7. **入口与联动**：侧栏图表列表（新建/打开/复制/重命名/删除）；点击激活/重建标签；删除二次
   确认可撤销；图表标签标题跟随图表标题；一个图表一个视图。
8. **依赖/产物**：desktop renderer 新增 chart-model/chart-echarts workspace 依赖与 tsconfig
   references；不新增第三方依赖；主 chunk 1,618.04 → **3,209.97 kB**、CSS 70.66 kB（T6.4 拆包）。
9. **不改变的**：`formatVersion`/manifest 字段/JSONL/IPC/preload/CSP/`ChartSpec`/采样规则；
   适配器仍不读表/Store、不采样。

关键文件：

```text
packages/app-core/src/commands/charts.ts (+test)
packages/app-core/src/{app-core.ts,history/edit-history.ts,index.ts}
packages/app-core/src/usecases/workspace-actions.ts (+chart-actions.test.ts)
packages/chart-model/src/render-model.ts (+test, +snapshot)
packages/chart-echarts/src/option.ts (+option.test/option.ssr/snapshot)
packages/ui/src/Select.tsx（option disabled）
apps/desktop/src/renderer/features/charts/*（+5 个测试文件，39 条）
apps/desktop/src/renderer/shell/{Sidebar,Inspector}.tsx
apps/desktop/src/renderer/features/workspace/WorkspaceView.tsx
apps/desktop/src/renderer/{i18n/messages/*,styles.css}
apps/desktop/{package.json,tsconfig.web.json}；pnpm-lock.yaml
apps/desktop/e2e/{chart.spec.ts,schema.spec.ts}
docs/adr/043-t44-chart-creation-inspector.md；docs/reports/t4.4/REPORT.md (+4 screenshots)
```

实测（2026-10-25，本机）：

```text
pnpm verify         159 files / 1434 tests；ESLint 0；
                    depcruise 435 modules / 1791 deps / 0 violations
pnpm test:coverage  lines 75.89% / statements 75.75% / branches 68.76% / functions 74.28%
                    chart-model/src lines 95.93%；chart-echarts/src lines 99.57%；
                    app-core/src lines 98.41%（charts.ts 91.81%）
pnpm format:check   通过
pnpm build          exit 0；renderer 3,209.97 kB + ImportSession 42.82 kB；CSS 70.66 kB；
                    workers 220.68/236.16/270.16 kB
pnpm e2e            76 passed（3.7m；chart.spec 4 条全绿）
pnpm bench          exit 0；open 361ms、save 306ms、edit 0ms、query 190ms、
                    text-sort 238ms、cjk-sort 496ms、import 629ms、condition P95 1ms；
                    chart.resolve-sample P95 75ms/300ms、chart.sample P95 5ms/50ms
```

提交：**`862063f`**（`feat(chart): add the chart list, wizard and inspector (T4.4)`）；
本交接文档的提交见 `git log -1 -- docs/HANDOFF.md`。

残留：

- 长表的真实缺口也会被连线（ADR-043 代价）；要区分需结构化 gap 或 per-series x。
- 坏图表（悬空映射）不可复制：`chart.create` 严格校验，需先修复。
- Y 轴名单一、Y 单位仍缺失；宽表多个 Y 列共享一个轴名。
- 图表按全表行解析；T4.6 已用缓存/延迟解析把样式提交降到 0ms 级，映射/行变化仍解析一次（40–60ms）。
- 每次检查器提交都 flush manifest；T5.2 保留“一次控件一条撤销”，不合并快速连续提交。
- 主 chunk +1.59 MB（ECharts）；T6.4 评估拆包/懒加载。
- `ChartList`/`ChartDialogs` 容器仅由 E2E 覆盖；aria 摘要/PNG/三种空态文案已由 T4.5 补齐。
- toolbox 已本地化（T4.5）；动画关闭、dataZoom 滑块常驻（T4.6 实测 2k 点下无性能问题，未改）。
- 图表与表格选中行联动（SHOULD）未实现。

## 5O. T4.5 图表交互、空态与 PNG 导出（已完成）

ADR-044 记录 8 组决定：

1. **交互归属**：`ChartRenderer` 增加 `getInteractionState()` / `dispatchInteraction()` /
   `onInteractionChange()`；`dispatchInteraction` 只调 ECharts `dispatchAction`，不重建实例、
   不改 option、不写 RenderModel，异常吞掉；`onInteractionChange` 订阅 `datazoom` /
   `legendselectchanged`。DOM 工具栏（逐系列 `aria-pressed` 图例、放大/缩小/重置、“查看数据表”、
   “导出 PNG…”）与 canvas 内置控件共享同一份瞬态状态。
2. **瞬态性**：图例选择/缩放窗口不写 `ChartSpec`/manifest、不进撤销、不跨标签/重启保留；
   关闭标签或重启回到全选/0–100。
3. **三态空态**：`data-chart-empty` = `no-table`（表已删除 → “删除图表…”，二次确认可撤销）/
   `unmapped`（缺列/映射无效 → “配置映射”聚焦内嵌 `ChartMappingFields`）/`no-data`
   （`data-chart-state="empty"` → “查看数据表” `openTable`）。映射仍不自动改写（SPEC §19）。
4. **PNG 导出**：`ChartCanvas.exportPng` 先 flush 120ms 防抖、等两个动画帧，再调同步 `toPNG`；
   对话框选透明/白/深背景、固定 2x、建议文件名 `<标题>-<yyyyMMdd-HHmm>.png`（非法字符→`_`、
   去尾部点/空格、Windows 保留名加 `_`、80 码点、空标题回退 `chart`）；失败/取消在对话框内
   处理，不写半成品。
5. **传输复用**：`file:exportText` 请求增加可选 `encoding:'utf8'|'base64'`；main 严格校验
   base64 后解码为字节，`atomicWriteBytes`（临时文件 + fsync + rename）。**不新增 IPC 通道**，
   preload 白名单与 `ALL_IPC_CHANNELS` 计数不变。
6. **导出入口**：放在图表视图工具栏而非检查器（渲染器实例归属；检查器仍是数据/映射/外观/
   坐标轴四组）。SPEC §11.5 已按此改措辞。
7. **无障碍**：canvas 宿主 `role="img"` 的 `aria-label` = 标题/类型/系列数/点数（采样时补充
   原始点数）；E2E 在 100k 图上跑 axe wcag2a/aa，critical 0。
8. **toolbox/类名**：`toEChartsOption` 增加 `labels { zoom, zoomBack }`（不传保持 ECharts
   英文默认值）；tooltip 增加稳定类名 `cs-chart-tooltip`，6 条 option 快照有意更新。

关键文件：

```text
packages/chart-echarts/src/option.ts (+option.test/snapshot)     # labels、tooltip className
packages/chart-echarts/src/renderer.ts (+renderer.test)          # 交互读取/派发/订阅
apps/desktop/src/shared/contracts/ipc.ts (+ipc.test)             # exportText encoding
apps/desktop/src/main/import/import-files.ts (+test)             # base64 解码/字节写
apps/desktop/src/main/workspace/atomic-write.ts                  # atomicWriteBytes
apps/desktop/src/main/index.ts                                   # 传递 encoding
apps/desktop/src/renderer/features/charts/
├─ ChartView.tsx (+test)            # 工具栏、三态空态、aria 摘要、导出入口
├─ ChartCanvas.tsx (+test)          # exportPng/交互句柄、toolbox labels
├─ ChartExportDialog.tsx (+test)    # 背景选择、文件名、成功/失败
├─ ChartEmptyState.tsx              # 三态空态卡片
├─ chart-export.ts (+test)          # 文件名清洗/base64 data URL
└─ chart-text.ts                    # chartSummaryText
apps/desktop/src/renderer/{i18n/messages/*,styles.css}
apps/desktop/e2e/chart-interaction.spec.ts                      # 3 条 E2E
docs/adr/044-t45-chart-interaction-export.md；docs/reports/t4.5/REPORT.md (+3 screenshots)
```

实测（2026-10-26，本机）：

```text
pnpm verify         161 files / 1474 tests；ESLint 0；
                    depcruise 441 modules / 1830 deps / 0 violations
pnpm test:coverage  lines 76.26% / statements 76.12% / branches 69.03% / functions 74.65%
                    chart-echarts/src lines 96.75%（renderer.ts 93.75%、option.ts 100%）
pnpm format:check   通过
pnpm build          exit 0；renderer 3,238.36 kB + ImportSession 42.82 kB；CSS 72.19 kB
pnpm e2e            79 passed（3.7m）；chart-interaction 3 条：4.0s / 2.4s / 2.4s
pnpm bench          exit 0；open 361ms、save 237ms、edit 0ms、query 196ms、
                    text-sort 263ms、cjk-sort 443ms、import 644ms、condition P95 1ms；
                    chart.resolve-sample P95 66ms/300ms、chart.sample P95 2ms/50ms
```

提交：**`fd68789`**（`feat(chart): add chart interaction, empty states and PNG export (T4.5)`）；
本交接文档的提交见 `git log -1 -- docs/HANDOFF.md`。

残留：

- `no-table` 是防御态：`checkChartInto` 把缺失表当错误，合法 manifest 打不开；`table.delete`
  也会级联删除图表。三态由 `ChartView.test.tsx` 覆盖，E2E 只覆盖可达的 `no-data`/`unmapped`。
- 图例/缩放不持久化（ADR-044 的取舍）；若产品要求保留，需改 `ChartSpec`/manifest 并加迁移。
- 导出入口在视图工具栏；若检查器内必须导出，需要跨组件的渲染器句柄注册表。
- base64 使 PNG 载荷约 +33%；4x/超长画布需分块或新二进制通道。
- 直接调用 `chart-echarts` 且不传 `labels` 的调用方仍显示 ECharts 英文 toolbox 标题。
- 图表与表格选中行联动（SHOULD）仍未实现；T4.6 只做性能硬化。

---

## 5P. T4.6 图表性能硬化（已完成）

ADR-045 记录 7 组决定：

1. **解析/样式拆分**：`@curve/chart-model` 新增 `resolveChartData(table, rows, spec, options?)`
   （行集 → `{ x, series:{id,name,values}[], meta }`，不含颜色与样式）与
   `renderChartModel(data, spec, options?)`（palette/background/线宽/平滑/点/图例/网格/精度/
   从零/Y 轴名/kind/`xLabel`/`connectNulls`）；`resolveSeries` 变成二者组合，**输出与黄金快照
   不变**。样式提交不再筛选/排序/采样。
2. **数据缓存归渲染层**：`chart-data-cache.ts` 的 `createChartDataCache(capacity=2)`（LRU，
   数据键 + `rows` 引用双重命中）。键 = 表 id + 列签名（id/label/type/role/unit/precision/
   enumOptions）+ 行数 + mapping + filter + sort + sampling + locale；不含样式字段与 `xLabel`。
   `chart-model` 保持纯函数无状态（ADR-040）。
3. **大表延迟解析**：`useChartRenderStatus`，阈值 `CHART_DEFER_RESOLVE_ROW_THRESHOLD = 20_000`；
   缓存未命中且超大时先渲染 loading（`role="status"`、`data-chart-pending="true"`），
   `setTimeout(0)` 解析；小表/缓存命中/缺 chart/table 同步。**不引入图表 Worker**
   （100k 结构性克隆与第二份行副本抵消收益；ADR-011 前提）。
4. **诊断契约（只读 DOM 属性）**：`chart-view` 的 `data-chart-pending`/`data-chart-resolve-ms`；
   `chart-canvas` 的 `data-chart-update-ms`/`data-chart-update-count`/`data-chart-instances`
   （`activeChartInstanceCount()`）。E2E 用它判定 §16.1 的渲染/更新预算与泄漏。
5. **交互按帧合并**：`datazoom`/`legendselectchanged` 触发的发布经 `requestAnimationFrame`
   合并（每帧一次、最新值）；工具栏动作与 `update()` 后的刷新立即发布；无 rAF 时同步。
6. **基准**：`sample` suite 更名 `chart`（`--chart`，`--sample` 别名），新增
   `chart.option.2k`（50ms）与 `chart.restyle.100k`（20ms）；根 `devDependencies` 增加 workspace
   包 `@curve/chart-echarts`（仅 bench），`scripts/tsconfig.json` 增加引用与 `DOM` lib。
   回归 >20% 沿用 `bench/baseline.json` 的 `::warning`（ADR-033）。
7. **解析分配优化**（实现级）：默认数值/时间 X 用“坐标数组 + 下标排序”（去掉每行
   `{row,index,value}` 装饰对象，稳定序不变）；无筛选时不再先复制整表行。
8. **顺带修复主进程缺陷**：备份目录缺失时 `manifest:write`/`table:write` 全部返回
   `E_FS_WRITE`(ENOENT)（复制/恢复的工作区没有 `backups/`）。`copyToBackup` 现在先
   `mkdir(recursive)`，并加了回归测试；修复后 `chart-perf` 切换场景内存从 605–612MB 回落到
   584–592MB。

关键文件：

```text
packages/chart-model/src/render-model.ts (+render-model.test.ts)   # 拆分/组合、下标排序
apps/desktop/src/renderer/features/charts/
├─ chart-data-cache.ts (+test)            # LRU(2)、数据键、resolveChartDataCached
├─ use-chart-render-status.ts (+test)     # 延迟解析 + loading + resolveMs
├─ chart-view-model.ts (+test)            # chartRenderStatus 接缓存
├─ ChartView.tsx (+test)                  # loading 态、data-chart-pending/resolve-ms
├─ ChartCanvas.tsx (+test)                # update-ms/count/instances、rAF 合并
└─ NewChartDialog.tsx                     # 预览复用同一缓存
apps/desktop/src/main/workspace/file-workspace-store.ts (+test)    # 备份目录自愈
apps/desktop/src/renderer/{i18n/messages/*,styles.css}
scripts/bench.ts / bench/README.md / scripts/tsconfig.json / package.json / pnpm-lock.yaml
apps/desktop/e2e/chart-perf.spec.ts                                # 2 条 E2E
docs/adr/045-t46-chart-performance.md；docs/reports/t4.6/REPORT.md (+2 screenshots)
```

实测（2026-10-26，本机）：

```text
pnpm verify         163 files / 1505 tests；ESLint 0；
                    depcruise 446 modules / 1867 deps / 0 violations
pnpm test:coverage  lines 76.47% / statements 76.34% / branches 69.21% / functions 74.99%
                    render-model.ts lines 96.88%、sampling.ts 93.24%（chart-model 包）
pnpm format:check   通过
pnpm build          exit 0；renderer 3,251.27 kB + ImportSession 42.82 kB；CSS 72.31 kB
pnpm bench -- --chart
                    chart.resolve-sample.100k P50 59ms / P95 63ms（300ms）
                    chart.sample.100k P95 2ms（50ms）
                    chart.option.2k P95 1ms（50ms）
                    chart.restyle.100k P95 0ms（20ms）
                    chart.resolve-unsampled.100k P95 51ms（诊断）
pnpm e2e            81 passed（4.1m）；chart-perf 2 条：4.3s / 6.5s
chart-perf 实测     resolve 47ms / update 89ms；样式提交 resolve 0ms / update 14ms；
                    10 次连点缩放 longtask=0；11 次切换后 instances=1；
                    100k 图表工作区 private 470MB、切换后峰值 589–591MB（≤600MB）
```

残留：

- 100k 图表 11 次映射/标签切换后 private 峰值 584–592MB（初始 466–474MB）：余量 1.5–2.5%。
  ECharts 实例已 dispose（计数 1）、采样平稳、无 JS 保留；Chromium canvas/分配器池不会立刻
  归还内存。CI runner 更慢/更碎片化时可能顶到 600MB；失败时先按 ADR-033 排查噪声，再考虑
  降 ECharts DPR / 跨标签复用 canvas / 限制单页图表数（新 ADR）。
- 备份目录缺陷已修复；其它“工作区目录被外部改动”（只读、磁盘满）仍走 `committed: true` +
  状态栏重试路径。
- 长表 20 系列 × 100k null 数组未优化；需 per-series x / 结构化 gap（ADR-041 复核条件）。
- 单次 100k 解析仍占用主线程 40–60ms 且不可中断；loading 只保证先绘制/先处理输入。
- 数据缓存容量 2、关闭采样时持有 100k×系列；随组件卸载释放。
- `data-chart-*` 新增 5 个诊断属性；改名需同步 SPEC §11.5 与 `chart-perf`。
- `longtask` 门禁在不支持该 API 的浏览器上跳过断言。
- bench suite 更名会让旧的 `sample` 名称从报告消失（`--sample` 仍可用）；基线仍未生成。

提交：**`0fc37aa`**（`feat(chart): harden chart performance with cached data and deferred
resolve (T4.6)`）；本交接文档的提交见 `git log -1 -- docs/HANDOFF.md`。

---

## 6. M2 验收演示（已获用户接受）

单条 `apps/desktop/e2e/m2-acceptance.spec.ts`（一个 test）已按 ADR-033 §7 执行完毕：

1. UI 新建工作区 `M2 Acceptance` 与表 `Readings`，粘贴 200 行 × 6 列（含 5×4 引号/换行片段，
   新增 5 列并设 text/number/date/boolean/text）；
2. 通过导入向导导入 `gbk-100k.csv`（GB18030 + 分号 + 3 坏行，跳过），最终 **100,197** 行；
3. 单层 `all` 筛选 `value > 50` → **49,900** 可见行；3 级排序 `value↑/day↑/id↑`；
4. 拖动 `Name` 列宽并双击自适应到 107px；冻结 **2** 列；
5. 工作区保持打开时退出 Electron，同一 `userData` 重启，从最近列表打开；
6. 断言界面与磁盘还原（筛选/排序/列宽/冻结/行数、manifest、JSONL SHA-256 不变）+ 预算；
7. 输出 `docs/reports/m2/REPORT.md` 与 4 张截图；`e2e/fixtures.ts` 新增
   `launchCurveApp()`（同一 `userData` 重启，仅测试代码）。

- 提交：**`8ed6c2b`**（`test(m2): add milestone acceptance demo and report`）；工作树干净。
- 关键文件：`apps/desktop/e2e/m2-acceptance.spec.ts`、`apps/desktop/e2e/fixtures.ts`
  （`launchCurveApp`）、`docs/reports/m2/REPORT.md` 与 `m2-01…04*.png`；
  TASKS/CHANGELOG/AGENTS/HANDOFF 已同步。
- Playwright 产物：`apps/desktop/test-results/m2-acceptance-*`（gitignore），含 timings/
  manifest attachment 与失败时 trace。

实测（全量 E2E 套件内，本机空闲）：

| 指标 | 实测 | 预算 |
|---|---:|---:|
| 导入 100k（提交 → 网格可交互） | **824ms** | 8,000ms |
| 筛选 100k（Worker） | **19ms** | 400ms |
| 3 级排序 100k（Worker） | **63ms** | 400ms |
| 重启后 100k 打开（`curve:open`） | **624ms** | 3,000ms |
| 重启后查询 | **95ms** | 400ms |
| 整应用 private 内存峰值 | **497MB** | 600MB |
| 冷启动（重启，趋势） | 951ms | 2,500ms（硬门禁在 perf.spec） |

- 物理行 100,197；JSONL 行数 100,197；SHA-256
  `e1dc160265c6f518f17e5c8079676a489029951d22ec344d8f236748650fba35` 重启前后不变。
- 重启若出现 stale lock 提示，T5.3 起会先显示恢复对话框；测试需先点“尝试恢复”再断言
  （`grid.spec.ts` 已按此更新）。M2 的 clean quit 会释放锁，不再出现该提示。
- 验收脚本的合成快速拖动 + 立即释放会让最后一步与 `pointerup` 提交差一步；最终宽度用
  `dblclick` autofit 提交确定值，未改生产代码。详见报告 §3.4/§6。

验证命令：

```powershell
pnpm verify
pnpm test:coverage
pnpm format:check
pnpm build
$env:CURVE_E2E_NO_SANDBOX = '1'
pnpm e2e
pnpm bench
```

**用户已于 2026-10-23 接受 M2**；TASKS M2 注记已更新为“获用户接受”，T3.1、T3.2、T3.3、T3.4、
T3.5、T3.6 已按授权完成（见 §5D/§5E/§5F/§5G/§5H/§5I）。若未来用户要求修改 M2，再回到对应 T2.x 修复。

**M2 已关闭；T3.1–T3.6 已完成；M3 验收演示已执行并于 2026-10-24 获用户接受（见 §6A）。**

---

## 6A. M3 验收演示（已执行并获用户接受）

演示已于 **2026-10-24** 执行，提交为 `test(m3): add milestone acceptance demo and report`（见
`git log -1 -- apps/desktop/e2e/m3-acceptance.spec.ts`）。单条 `e2e/m3-acceptance.spec.ts`
（1 个 test，3 次启动，全量 E2E 内 **11.2s**）按原脚本完成：

1. 通过 `window.api` seed 源/目标两个工作区（6 行 × 6 列：id/text、sensor_a/number、day/date、
   active/boolean、status/enum、note/text），再从最近列表打开源工作区。
2. 模板管理依次应用 4 个内置模板（同一视图），断言行高 32→24、compact 表头 12px、dark
   `rgb(30,30,30)`/`rgb(37,37,38)`、finance 等宽 + 斑马纹 + `rgb(31,41,55)`；截图 4 张。
3. 样式编辑器改密度 compact、表头 `#123456`、`sensor_a` 显示名/180px/1 位小数；预览
   `data-preview-ms` 实测 **2–3ms**/100ms；关闭后 `Ctrl+Z`/`Ctrl+Shift+Z` 验证一次控件一条撤销。
4. 加条件规则“高温”（`sensor_a > 30` → 红底/深红字/加粗/warning）；r2/r3 命中，r1/r4/r5/r6 未命中。
5. 另存模板 `M3 Report`（新 `sty_*`，视图切换）→ 筛选 `>=20` + 降序 → 冻结 2 列 → Note 列
   双击自适应（116px）→ 设为默认 → 导出 `.curvestyle.json` → 导出 CSV（4 行 × 6 列）。
6. 重启后导入到新工作区并应用：导入重分配 `sty_*`/`rule_*`，12 项计算样式与源完全一致；
   目标工作区再导出 CSV（6 行 + 表头）。再重启验证两个工作区的模板/引用/筛选/排序/列宽/冻结/
   默认样式还原。

证据：`docs/reports/m3/REPORT.md` + `m3-01`…`m3-10`（10 张 PNG）；Playwright attachment
含 `m3-metrics.txt` 与 `m3-contract.json`。演示中发现并修复“虚拟化行高不随样式令牌重测”：
`DataGrid` 在 `rowHeight` 变化时调用 `virtualizer.measure()`（修复前 compact 行高停留在 32px，
M3 用例可复现）。

验收命令（已执行，结果见报告 §7）：`pnpm verify`、`pnpm test:coverage`、`pnpm format:check`、
`pnpm build`、`pnpm e2e`（72 passed）、`pnpm bench`（exit 0）。未改 `formatVersion`/manifest/
JSONL/IPC；未新增运行时依赖。接受前复核（2026-10-24）：`pnpm verify` 143 files / 1232 tests、
`pnpm build` exit 0、`m3-acceptance` 单跑 1 passed、全量 `pnpm e2e` 72 passed（M3 11.4s、
100k 导出 1,670ms、内存 569MB/600MB）。

实测（全量 E2E 内，本机空闲）：

| 指标 | 实测 | 预算/口径 |
|---|---:|---|
| M3 演示用例 | **11.2s** | 无（单条，3 次启动） |
| 样式预览 `data-preview-ms` | **2ms** | 100ms |
| 12 项计算样式（源 vs 导入） | **逐项相等** | 全部相等 |
| 源 CSV / 目标 CSV | **211B / 293B** | 记录数 5 / 7（CRLF） |
| Note 列宽（自适应） | **116px** | 与重启后计算宽度一致 |
| 100k 导出（export-csv.spec） | **1,646ms** | 5,000ms |
| 冷启动 / 100k 打开 | **1,017ms / 637ms** | 2,500ms / 3,000ms |
| 整应用 private 内存峰值 | **572MB** | 600MB |

提交：**`9cac391`**（`test(m3): add milestone acceptance demo and report`）。
Playwright 产物在 `apps/desktop/test-results/`（gitignore），含 timings、`m3-contract.json` 与
失败时的 trace；截图已复制到 `docs/reports/m3/`。

**停点（已解除）**：M3 已于 2026-10-24 获用户接受并关闭；此后 T4.1–T4.6 已完成
（见 §5K/§5L/§5M/§5N/§5O/§5P），M4 验收演示已于 2026-10-26 执行并通过（TESTPLAN E6，
报告 `docs/reports/m4/REPORT.md`），并已于 2026-10-27 获用户接受、M4 关闭；M5 的 T5.1、T5.2、
T5.3、T5.4 已完成，下一步 T5.5。

---

## 7. 已知风险与处理

| 风险 | 影响 | 处理 |
|---|---|---|
| 会话策略回到 `workspace-write` | `verify`/E2E 报 EPERM | 切 `danger-full-access`，不改项目配置 |
| Windows 无 symlink 权限 | `pnpm install` 失败 | 按 §3.4 用 junction 补齐；不要删 node_modules/切 linker |
| 全量 E2E 偶发 grid/edit 键盘超时 | 全量非零 | 单跑确认；T2.4 已修复焦点丢失；不放宽超时/不删断言 |
| 外部程序占满 CPU（如游戏/聊天工具） | verify 5s 超时、100k grid 首帧 >1s | 先确认 CPU（`Get-Counter '\Processor(_Total)\% Processor Time'` 与按进程 CPU 增量）；T4.2 实测外部游戏占 ~7.7 核时 `grid.spec` 首帧 1045/1062ms 超 1000ms 预算、单跑也复现；暂停后全量 72 passed。暂停外部程序后重跑，不改预算 |
| 100k 行结构变更同步执行 | UI 短暂无响应 | T2.3 已记录；未纳入 T2.7 预算，后续按需 Worker 化 |
| 10 万级粘贴命令阶段同步 | UI 可能短暂无响应 | T2.4 10k 实测远低于预算；T2.7 未改命令阶段 |
| 10 万级导入命令阶段同步 | 提交时短暂占用主线程 | T2.5/T2.7 bench 核心管线 P95 878ms（8s 预算）；命令阶段仍同步 |
| 导入后 100k 逆补丁 | 撤销栈内存 | T5.2 已按结构估算计入 256MB；独特旧行数组抽样 16 行外推，超限丢最旧（ADR-047） |
| >50MB 原文只记 sidecar | 原文件路径可能失效 | SPEC §9.4 允许；路径 + SHA-256 可审计 |
| 导入错误 CSV 按坏行聚合 | 机器消费需拆字段 | 文档已记录；UI 仍显示逐 issue |
| 筛选视图粘贴整批拒绝 | 已由 T2.6 闭环 | 只写可见行/超出整批拒绝/stale 检查；见 ADR-032 |
| 100k 文本排序接近 400ms | bench 波动可能超预算 | T2.7 已预计算排序键/类型数组，ASCII 253ms；中文仍 698ms/800ms |
| query Worker 缓存最多 4 张表 | 切换更多表会重新克隆 | 记录于 ADR-032；T2.7 未改淘汰策略 |
| 100k 首次 Worker 快照克隆 | 首次筛选/排序有额外延迟 | 不计入 `data-query-ms`；E2E `data-query-total-ms` 实测 448–490ms |
| 整应用内存 497MB/600MB（M2 实测；T2.7 570MB；T3.5 568MB；T3.6 571MB；M3 572MB；T4.2 571MB；T4.5 578MB；T4.6 perf 场景 577MB；T5.3 perf 场景 593–596MB；T5.4 第一版常驻面板 605–615MB，优化后 506MB（isolated 509–519MB）） | CI runner 更慢/更碎片化时可能超 | T5.4 已把命令面板改为打开时挂载/快照、AppShell 不再订阅文档 store，余量恢复到 ~90MB；若再出现 600MB 附近，先查是否常驻面板/整壳重渲染或 E2E 探针，独占重跑，不改预算 |
| bench 基线未提交 | 20% 回归告警不触发 | CI Windows runner 跑 `pnpm bench -- --write-baseline` 后提交 `bench/baseline.json` |
| 100k 行撤销补丁变大 | 历史内存 | T2.7 的整数组 patch 每个编辑约 1.6MB（两数组各 ~800KB）；T5.2 共享行数组只计数组，100 条约 160MB，低于 256MB；实测 `sizeBytes` 有单测 |
| 视图状态连续写 manifest | 拖动列宽/快速排序多次写盘 | `view.update` 仍走 `saveManifest()` 立即写；T5.3 只统一了行数据/布局/删除等路径，未合并视图状态。若需合并，复用 `SaveQueue.enqueueManifest()` 并补 E2E |
| Playwright 合成快速拖动列宽 | 最后一步与 `pointerup` 提交可能差一步 | M2 验收用 `dblclick` autofit 提交确定值；T5.3 未改列宽提交路径，仍需确定值断言 |
| 筛选对话框只支持单层 | 嵌套谓词只读 | ADR-032；如需嵌套 UI 另写 ADR |
| 结构变更不可撤销（T5.2 前） | 误操作需手工恢复 | T5.2 已统一：表/列/行/视图/样式/图表默认入栈；`view.layout` 结构变更可撤销，纯标签/焦点切换瞬态（ADR-047） |
| 最后聚焦 pane 不持久化（T5.1） | 重启后焦点落在第一个有活动标签的 pane | `activePanePath` 是 UI-only；每个 pane 的活动标签/比例已恢复。要恢复最后焦点需新增 manifest 字段 + 迁移（ADR-046 复核条件） |
| 分栏后是空 pane / 无跨 pane 拖拽（T5.1） | 多一步移动或新建视图 | 分栏不自动创建/移动视图；v1 用“移动到下一分栏”；要拖拽需新交互与 E2E |
| 布局 500ms 去抖强退窗口（T5.1） | 直接强杀可能丢最后 500ms 的焦点/比例/分栏 | `Ctrl+S`/关闭工作区/flush 会冲掉；T5.3 统一退出 flush（ADR-046） |
| `view.layout` 清空 redo（T5.1 现状） | 切换标签后 redo 历史消失 | T5.2 已修复：焦点/标签切换是瞬态，不清 redo；结构布局变更记录且可撤销（ADR-047） |
| 256MB 是估算而非精确 GC（T5.2） | 共享行数组可能低估、独特行可能高估 | 宁可提前丢弃最旧条目；不 stringify 100k 行；`sizeBytes` 与 256MB 常量有单测；若实测偏差大再调共享判定/抽样（ADR-047） |
| 单条 >256MB 的导入（T5.2） | 该条会被丢弃，没有撤销 | 硬上限优先；报告/ADR 已记录；需要保留时改为磁盘快照/增量导入，另写 ADR |
| `table.delete` redo 留孤儿表文件（T5.2） | 磁盘多一个不被 manifest 引用的 JSONL | 不重复 `trash`（避免 redo 期间异步 IO）；孤儿文件无害，后续清理/覆盖；要清理需异步 redo 钩子 |
| Edit 菜单只有 in-app 菜单（T5.2） | 原生 Electron Edit 菜单不显示历史命令名 | 原生 `undo/redo` role 保留给文本输入；不新增 IPC；需要同步时写 ADR + SPEC §15 |
| 4 pane × 200% 未单独断言（T5.1） | 极窄视口可能挤压 pane 工具栏 | 200% 冒烟在 2 pane 上通过；4 pane 在 100% 下覆盖；T5.4 键位/面板时补 4 pane 极窄视口冒烟 |
| 图表/样式悬空引用 | 图表进入错误态；样式求值忽略 | 样式覆盖/规则列引用按 SPEC §6.6.7 保留；T4.4 对图表提供 `missing-columns` + 内嵌重映射，修复后持久化 |
| 条件规则 number/date `contains` | 匹配 epoch 字符串，不是显示日期 | 按 SPEC §10.4“字符串化”字面实现；需要显示文本匹配时另写 ADR |
| 条件规则不叠加 | 多条规则只有首条生效 | SPEC §10.4；需要叠加时扩展 `ConditionalRule.style`/合并语义并写 ADR |
| 条件背景覆盖 bar | 同时启用时 bar 不可见 | ADR-036 的优先级决定；需要并存时重定视觉规则 |
| `style.update` manifest 异步 | 撤销后短暂未落盘 | 与 T2.2 相同的队列语义；关闭/退出前 flush |
| 条件格式 16ms 仅纯求值 | DOM 应用不在门禁 | T3.4 预览按 SPEC §16.1 的 100ms 预算用组件/E2E 覆盖（实测 3ms） |
| `builtin.finance` 数字格式 | 模板令牌无法表达右对齐/千分位 | T3.2 用全局数字规则实现（ADR-035）：number/date 默认右对齐、Intl 千分位；未扩展模型 |
| 所有模板数字带千分位、布尔本地化 | 与 T2.x 显示不同 | 用户确认的全局数字规则；显示层变化，不改磁盘数据；E2E 断言已同步 |
| 视觉验收无像素基线 | 跨 DPI/字体可能视觉漂移 | 按 HANDOFF §3.6 用计算样式契约 + 截图证据；需要像素基线时先评估 Windows CI 稳定性 |
| 样式/模板切换的行高 | TanStack Virtual 保留旧测量，行高停留旧值 | M3 已在 `rowHeight` 变化时 `virtualizer.measure()`（`DataGrid`）；新增行高来源时确认仍触发重测 |
| 内置模板名称 i18n | 常量使用中文规范名 | T3.4 按 id 走 `t(key)`；T3.5 管理器/导入预览同样按 id 显示，用户样式显示自身 `name` |
| 样式编辑器/导入预览只含前 50 行 | 看不到筛选/虚拟滚动效果 | ADR-037/038；主网格虚拟化路径不变；需要筛选预览时另写 ADR |
| 样式规则组最多 2 个 | 更深谓词只读 | `condition-builder`/UI 限制；T3.5 导入复杂模板原样保留、不静默改写 |
| 样式编辑器密度联动内边距 | 自定义 `cellPaddingY` 会被密度预设覆盖 | 用户可随后单独调整内边距；ADR-037 已记录 |
| 样式编辑器文本未失焦即 Esc | 丢弃本地未提交值 | “取消即丢弃”的一致语义；提交按钮/失焦才写命令 |
| 颜色仅接受 hex | 不支持 `transparent`/CSS 变量 | 按 SPEC §10.6；需要时另写 ADR 放宽 schema |
| fork 保留规则 id | 跨样式复制后规则 id 可能重复 | T3.5 的导入/复制/另存为改用 `reassignStyleIdentity` 重新分配；T3.4 的懒 fork 仍保留规则 id，规则只在所属样式内求值 |
| 保存失败但内存已变更 | `committed: true` | UI 关闭对话框，状态栏/Toast 重试；不重复执行 |
| 行数据/布局走 1.5s 队列，部分结构化 action 仍立即写 | 表/视图/样式/图表的某些 action 直接 `saveManifest()` | T5.3 已实现 1.5s/10s 窗口（ADR-048）；行数据、布局、撤销/重做走 `SaveQueue`；`view.update`/表创建等仍立即写 manifest，若需统一需单独评估并补 E2E |
| `openWorkspace` 表读取失败不 close | 残留 `.lock` | T5.3 已修复：`createOpenWorkspace` 先 `close` 再返回错误（ADR-048） |
| 强杀丢最后 1.5s（T5.3） | 未落盘的编辑丢失 | 恢复对话框明确提示；要消除需写前日志/检查点，另写 ADR |
| flush 失败后确认退出留 stale lock（T5.3） | 下次启动多一次恢复提示 | 有意保留“未正常退出”事实；取消退出会保持应用打开，可重试 |
| main 原生退出确认/恢复提示为英文（T5.3） | 中文用户看到英文按钮 | 与既有 About/文件对话框一致；要本地化需把消息表下沉到 main 或改 renderer 驱动，另写 ADR |
| `workspace:inspect` 多读一次 manifest（T5.3） | 打开延迟几十 KB 级 | 换取取消恢复不写文件的语义；若 manifest 变大再评估缓存/懒读 |
| E2E 截图重写 | 工作树变脏 | 提交前还原 `docs/reports/m0/*.png` |
| 应用设置与 manifest 是两份快照（T5.5） | manifest 的 theme/locale/autosave 创建后不更新 | 读取方以 `settings.json` 为准；保留字段为 v1 格式；详见 ADR-050 |
| 自动保存关闭时显式 action 仍 flush（T5.5） | 用户可能以为只有 Ctrl+S 写盘 | 粘贴/导入/样式/图表 action 需要保存结果；若要求完全手动保存，需加队列模式并改 action，ADR-050 复核条件 |
| 设置写失败只在对话框提示（T5.5） | 主题/语言已生效但重启回退 | 下一次设置更新会重试；不新增全局 Toast |
| 覆盖率 77.25%（T6.2 实测；T5.5 77.01%、T5.4 76.74%、T5.3 76.05%、T4.6 76.47%、T4.5 76.26%、T4.4 75.89%、T4.1 75.34%、M3 74.89%） | 新增 UI 主要由 E2E 覆盖 | 阈值 70/60 满足；`plugins/plugin-sample/src` lines 97.64%、`features/keymap` 90.27% 行/82.37% 分支、`chart-model` render-model.ts 96.88%、`chart-echarts/src` 96.75%、`app-core/history/edit-history.ts` 90.99%、`quit-guard.ts` 89.06%、`save-queue.ts` 89.56%、`translate.ts` 86.36%；设置/未保存对话框与 T6.2 插件接线由单测 + E2E 覆盖 |
| renderer bundle 3,394.50 kB（T6.2；+ 87.80 kB 懒加载 ImportSession） | 启动/内存 | T6.4 打包阶段评估拆包/压缩；ECharts 首次进入主 chunk；T6.2 的 +28.58 kB 来自插件 SDK/示例插件 |
| 100k CSV 导出 1,716ms/5s（T3.6） | 去掉 Intl formatter 缓存会退到 10s 量级 | `formatCellValue` 的 locale/格式缓存是达标关键；不要改回每单元格 `new Intl.*` |
| CSV 临时文件残留 | 进程崩溃时 `.curve-export-*.tmp` 留在目标目录 | cancel/`before-quit` 已清理；崩溃残留需手工删除，报告已记录 |
| 显示格式 CSV 的千分位/本地化日期 | Excel 可能识别为文本 | 数值语义用“原始值”；对话框已说明两种格式 |
| CSV 公式注入 | `=`/`+`/`-`/`@` 开头文本可能被 Excel 执行 | T3.6 不改写数据；需要缓解时加显式选项与 ADR |
| 宽表分块格式化 | 100 列 × 1,000 行/块可能阻塞 >100ms | 100k×10 实测达标；极宽表可后续增大让出频率或移入 Worker |
| 导出会话 token 无 TTL | 渲染层崩溃后临时文件留到退出清理 | `before-quit` 兜底；不新增 TTL 计时器 |
| 删除可撤销与 TASKS 原文冲突 | 确认文案/验收口径可能被误读 | SPEC §13.1 优先；ADR-038 已记录，确认框必须写“可撤销” |
| 导入总是新建模板 | 无法合并/覆盖同名样式 | ADR-038；需要合并时另写 ADR 与冲突 UI |
| 导入文档 2,000,000 字符上限 | 极端大模板被拒 | 正常模板几 KB；上限在 JSON.parse 前短路 |
| 名称冲突按持久化 `style.name` 比较 | 本地化显示名可能观感重复 | 管理器/导入按 id 本地化内置名称；不做静默改名 |
| 模板管理是模态对话框 | 不能边看主网格边管理 | 应用/删除后关闭查看；需要非模态时另写 ADR |
| 图表 X 缺失行被丢弃 | 图表点数少于表格行数 | ADR-040：number/date X 缺失行丢弃并聚合 warning；需要在图上保留占位时另写 ADR |
| 图表 warning 为英文聚合文案 | UI 无法逐行定位、未本地化 | 与 workspace/manifest warning 一致；T4.4 在图表视图原样展示（不吞掉），本地化留后续 |
| 长表 null 与空串合并为 `(空)` | 图上无法区分二者 | ADR-040；数据仍完整保留，需要区分时扩展系列 id 语义并写 ADR |
| 图表调色板为 chart-model 常量 | 不能跟随主题令牌 | ADR-040；需要令牌化时改常量并写 ADR，不涉及 manifest |
| T4.1 `sourcePoints` 不含断点 | T4.2 采样预算口径易混淆 | 采样后 `renderedPoints ≤ sourcePoints`，按 ADR-040 的口径报告，不改预算 |
| T4.2 采样后 x 并集大于 target | 多系列时 x 位置变多，可能影响渲染预算 | ADR-041：逐系列 ≤ target、并集上界 `Σ max(threshold,target)`；T4.6 复核（10 次连点缩放无长任务、update 89ms/200ms），未改共用下标/per-series x |
| T4.2 被采样略过的 null 与真实缺口同形 | 适配器无法只断真实缺口 | ADR-041 代价；T4.3 已按 ADR-042 §3 处理（未采样断开 / 已采样跨过）；需要结构化 gap 时另写 ADR |
| T4.2 未采样系列贡献全部非空点 | 极端多小系列时采样收益下降 | 有意取舍（不丢未采样数据）；T4.6 未改采样语义（ADR-045 §7） |
| `scripts/bench.ts` 依赖 `@curve/chart-model` / `@curve/chart-echarts` | 重装依赖可能出现 symlink 权限错误 | 均为根 devDependency（仅 bench）；按 §3.4 预建 junction 后 `pnpm install`（T4.6 已加 `chart-echarts` junction） |
| T4.3 按需注册仍带 toolbox feature 实现 | bundle 606.0 kB min / 206 kB gzip | ADR-042：只启用 dataZoom feature；T4.4 接入 renderer，T4.5 主 chunk 3,238.36 kB，T6.4 评估拆包 |
| 采样图真实缺口也被连线 | 图上无法区分真实缺口与采样略过 | ADR-042 §3：未采样断开、已采样连线（ADR-041 接受的代价）；需要真实断点时改 RenderModel 结构化 gap + ADR |
| Y 轴单位不在 `RenderModel` | tooltip 只有 X 单位 + Y 精度（T4.4 已补 Y 轴名 `y.label`，单位仍缺） | ADR-043：`RenderModel.y.label` 只来自 `options.yLabel`；需要 Y 单位/逐列轴名时扩展 SPEC §11.3 的 `RenderSeries.unit` 并写 ADR，不在组件里绕过 |
| toolbox 标题本地化/动画关闭/滑块常驻 | 直接调用适配器不传 `labels` 时仍是英文标题；无入场动画 | T4.5 经 `ChartCanvas` 注入 `labels`；动画关闭是为 2k 点与 PNG 确定性（ADR-042）；T4.6 未改滑块常驻（2k 点下无性能问题，交互已 rAF 合并） |
| canvas 无法在 jsdom 单测 | 真实像素/布局未在单测覆盖 | 生命周期 mock `echarts/core`；`option.ssr.test.ts` 用真实 ECharts SSR/SVG；T4.5 E2E 已覆盖 tooltip/resize/PNG 像素；T4.6 由 `chart-perf` 覆盖 2k 点真实 `setOption` 更新（update 94ms/200ms） |
| `[x, null]` 空点语义依赖 ECharts 版本 | 升级主版本可能改变断点/连线 | 版本锁 6.1.0；SSR 测试断言 2 子路径/1 子路径；升级 ECharts 主版本需重跑并写 ADR |
| 图表主题颜色是复制常量 | 令牌变更需手动同步 | ADR-042；需要令牌化时把颜色注入 option 并写 ADR |
| 长表折线跨过真实缺口 | 图上无法区分"其它系列占用该行"与真实缺失 | ADR-043：长表 `connectNulls=true`（结构性 null 必须跨过）；需要真实断点时改结构化 gap/per-series x + ADR |
| `chart.update` 允许悬空映射 | 命令层不能保证图表映射有效 | 有意设计（列删除后的修复路径）：视图进入 `missing-columns` 错误态 + 内嵌重映射；`chart.create` 仍严格校验；不要给 update 加严格校验 |
| 坏图表不可复制 | 复制悬空映射的图表返回 `E_VALIDATION` | ADR-043 代价；先修复再复制；需要支持时改 `chart.create` 校验或加独立"复制为修复稿"命令（先 ADR） |
| Y 轴名只有一个 | 宽表多个 Y 列共享一个轴名；Y 单位仍缺 | ADR-043：`RenderModel.y.label` 只来自 `options.yLabel`；需要逐列轴名/单位时扩展契约并写 ADR |
| 图表按全表行解析 | 100k 表编辑后切图/改映射仍有解析成本 | T4.6（ADR-045）：样式提交走缓存不重新解析；映射/行变化仍解析一次（实测 40–60ms，≤300ms 预算），大表先 loading |
| 每次检查器提交 flush manifest | 快速连续操作产生多条撤销与写盘 | 小文件；T5.2 保留一次控件一条撤销、不合并；需要批量提交时另写 ADR |
| `ChartList`/`ChartDialogs` 无组件测试 | 容器接线回归只能靠 E2E | 逻辑在 app-core 有单测、容器由 `chart.spec.ts` 覆盖；新增交互时补 E2E |
| `data-chart-*` 属性是渲染契约 | 字段增减影响 E2E 与未来 a11y 摘要 | 由 `ChartView` 一处生成；改字段时同步 E2E 与报告，不是持久化格式 |
| 图表主 chunk 3.24MB（T4.5；+42.82 kB 懒加载） | 冷启动/内存可能受影响 | T6.4 拆包/懒加载，T4.6 复核 100k 图表交互与实例泄漏 |
| T4.4/T4.5 全量 E2E 偶发 grid 200% 焦点失败 | 全量非零 | 与既有 flake 一致（单跑约 2.2s 通过）；确认 CPU 空闲后重跑，不放宽断言 |
| 图例选择/缩放窗口不持久化 | 关闭标签或重启后回到全选 0–100 | ADR-044 的有意取舍（瞬态、不进撤销）；若要求保留需写 `ChartSpec`/manifest 并加迁移 |
| `no-table` 空态无法从合法 manifest 进入 | E2E 只能覆盖 `no-data`/`unmapped` | `checkChartInto` 把缺失表当错误、`table.delete` 级联删图表；三态由 `ChartView.test.tsx` 覆盖；若允许换表/孤儿图表需放宽 invariant 并写 ADR |
| 导出入口在图表视图工具栏 | SPEC §11.5 原文把“导出”列在检查器 | ADR-044 已改 SPEC 措辞；检查器保持四组文档属性；若检查器内必须导出，引入跨组件渲染器句柄注册表（先 ADR） |
| PNG 经 base64 复用 `file:exportText` | 载荷约 +33%，4x/超长画布可能接近上限 | 2x 图通常 0.3–2MB，远低于 256MB；需要 4x/分块时新增二进制通道或分块协议（先 ADR） |
| 导出等待两个动画帧 | 导出多约 33ms | 换取“刚改完检查器立刻导出”也包含最新模型；`animation:false` 使 `toPNG` 确定（ADR-044） |
| 100k 图表 11 次映射/标签切换后 private 584–592MB（初始 466–474MB；T4.6 实测） | 距 600MB 仅 1.5–2.5% 余量 | ADR-045：实例计数 1、采样平稳、无 JS 保留；Chromium canvas/分配器池不会立刻归还内存。修复备份目录缺陷前该场景为 605–612MB（失败保存的重试累积）。CI 更碎片化时若顶到 600MB，先按 ADR-033 排查噪声，再考虑降 ECharts DPR / 跨标签复用 canvas / 单页图表数上限（新 ADR） |
| 工作区缺少 `backups/` 目录（复制/恢复/脚本生成） | 修复前每次保存都 `E_FS_WRITE`(ENOENT)，UI 只弹 Toast | T4.6 已修：`copyToBackup` 先 `mkdir(recursive)`，`file-workspace-store.test.ts` 有回归测试；只读/磁盘满等真实 IO 错误仍走 `committed: true` + 状态栏重试 |
| 大表解析仍不可中断（单次 100k 约 40–60ms） | loading 只保证先绘制/先处理输入，单次任务内仍占主线程 | ADR-045 的已知代价；若要求可取消/真正后台，引入图表 Worker（协议 + ADR），不改缓存键 |
| 数据缓存容量 2 | 关闭采样时持有 100k×系列；打开的图表多时内存上升 | 随组件卸载释放；内存吃紧时降到 1 或改 WeakRef（ADR-045 复核条件） |
| 长表 20 系列 × 100k 的 null 数组 | 长表解析/option 比宽表更重，未设预算 | ADR-041 复核条件：per-series x / 结构化 gap（新 ADR）；M4 演示的长表用小表，100k 用宽表 |
| 诊断属性扩容（5 个 `data-chart-*`） | 改名会破坏 E2E | 契约集中在 `ChartView`/`ChartCanvas`；改名需同步 SPEC §11.5 与 `chart-perf.spec.ts` |
| `longtask` 门禁依赖浏览器 API | 不支持的运行时跳过断言 | `chart-perf` 记录 `longTaskSupported`；本机支持且 10 次连点缩放计数为 0 |
| bench `sample` suite 更名 `chart` | 旧报告名消失 | `--sample` 保留别名；基线未生成，无兼容成本；CI 基线生成后新用例自动进入回归比较 |
| bench 子进程加载 ECharts | `pnpm bench` 启动略慢、`memoryPeakMB` 趋势上升 | `chart` suite 独立子进程；该数字本来不是应用内存门禁（ADR-033） |
| userData 路径随 T6.0 更名变化 | 升级后主题/语言/最近列表/窗口尺寸重置一次 | ADR-051：v1 未发布，不做迁移；工作区目录/JSONL 不受影响；要保留偏好时加一次性迁移 ADR |
| 插件禁用列表仅内存（T6.1） | 坏插件每次启动重试并再记日志；没有手动禁用 | 有意取舍；T6.3 决定持久化/手动禁用（写 settings 或独立文件，不进 manifest） |
| 插件贡献未全部接 UI/命令总线（T6.1→T6.2） | T6.2 已接字段类型与导入器；图表类型、命令、来源标识、错误边界、手动禁用仍未接 | T6.3 把内置列表改为“注册表 + 内置注册”，接图表类型/命令/面板，并做来源徽标与错误 toast；见 §0.11 |
| `ImportResult` 与 table-engine `ImportDataset` 仅结构兼容（T6.1→T6.2） | 导入管线新增字段时插件输出可能缺字段 | T6.2 已在 `features/import/plugin-import.ts` 显式映射（`ImportResult` → `ParsedImportData`，缺省列用 `buildImportColumns` 推断）；table-engine 新增字段时必须同步映射并补契约测试 |
| `subscribe` 同步通知（T6.1） | 插件批量注册 N 条会触发 N 次回调 | T6.2 不订阅（启动时固定贡献集）；T6.3 打开面板时才订阅/合并刷新，不要订阅文档 store（chart-perf 内存门禁） |
| `plugin-sdk` 增加 `lib: DOM`（T6.1） | 类型层多出 DOM 全局 | 仅用于 `AbortSignal`；不引入 Node 全局或运行时依赖，也不能因此 import Electron/table-engine |
| 插件导入在主线程解析与规划（T6.2） | 大文件插件导入可能阻塞 UI；内置 CSV/JSON 不受影响 | ADR-053 复核条件：需要时把数据集送入 Worker 或拆独立 Worker；不要在未确认前用“降低行数上限”绕过 |
| 每次导入多一份字节副本（T6.2） | 为支持导入器切换，`client.open` transfer 前保留副本；受现有限额约束 | 若需消除，改 Worker 协议（不 transfer 或按需回读 token）并写 ADR，不要删副本导致插件导入拿到 detached bytes |
| 字段类型/导入器 label 不本地化（T6.2） | 插件提供的 label 直接显示（如 `Rating`、`Points JSON`） | 有意取舍；要本地化需给 `FieldTypeDef`/`ImporterDef` 加 `labelKey` 或语言 map（SPEC §14.2 + ADR） |
| CSV 导出未接语义格式化（T6.2） | 导出 `rating` 仍是数字而非 `★` | 显示格式导出仍走 `formatCellValue`（存储格式化）；需要时把 `formatFieldCell` 接到 T3.6 导出管线并补 E2E |
| 主进程与渲染进程字段类型集合可能不同（T6.2） | 主进程按“编译进包”的定义严格校验，渲染进程按“实际激活”的注册表解析；插件激活失败时两者不一致 | 方向保守：载入更严格、显示更宽松；若需要一致的可观测状态，T6.3 在插件面板显示启动自检结果 |
| chart-perf 紧接全量 E2E 后单跑出现过 602MB（T6.2 实测离群值） | 门禁 600MB；随后两次单跑 505 / 516MB，全量套件通过 | 判为环境瞬时压力（T6.2 不触及图表路径，渲染包 +28.58 kB）；再出现先按 ADR-033 排查噪声，不放宽门槛 |

---

## 8. 不可做清单（重申）

- 不关闭 `contextIsolation` / `sandbox` / `webSecurity`，不打开 `nodeIntegration`。
- 不把 `--no-sandbox`、`CURVE_E2E_NO_SANDBOX` 写进应用代码、默认脚本或 CI。
- 不为 Worker 放宽 CSP；同源 module Worker 已验证可用。
- 不在 renderer 里 `require('fs')`、读任意路径、暴露 `ipcRenderer` 本体或泛 `invoke`。
- 不把 Zod 或任何外部包放进 preload。
- 不绕过命令总线直接改 store（撤销会坏）；不在组件里写业务逻辑。
- 不加未经 ADR 的运行时依赖；不跳过测试、不放宽 ESLint/覆盖率规则、不用 `--no-verify`。
- 不未经 ADR/用户确认升级 `formatVersion`、改数据格式、IPC 通道或公共 API。
- 不在 T3.6 已完成后再顺手实现 T5.x 的自动保存/恢复；不把 10 万行整体放进 React state。
- 不在 `chart-echarts` 里再采样：LTTB 只在 `resolveSeries` 内做一次（ADR-041）。
- 不把 `null` 当 0、不插值补齐断点，也不为“看起来连续”修改 `RenderSeries.values` 类型；
  被采样略过的 null 与真实缺口同形是 ADR-041 已接受的代价。
- 不把 `sampled` 当成“采样已启用”：只有至少一个系列真的被降采样时才为 true。
- 不在 `chart-echarts` 之外 import echarts（含 T4.4 的组件、检查器与测试；depcruise 与边界测试
  会硬失败）。
- 不在组件/检查器里拼 option；option 只经 `toEChartsOption`，绘制只经 `createChartRenderer`。
- 不把 `'number'` 写进 ECharts 的 `xAxis.type`（必须是 `value`）；不把 `null` 变成 0 或插值。
- 不擅自改断点策略：`RenderStyle.connectNulls` 由 chart-model 计算（采样图/长表 `true`、宽表未采样
  `false`）；不要在适配器/组件里按 `meta.sampled` 或布局重算，也不要为“看起来连续”改成永远 true
  （ADR-042 §3、ADR-043）。
- 不在 `chart-echarts` 里读表、Store 或命令总线；它只消费 `RenderModel`。
- 不在 jsdom 里 `init` 真实 canvas 渲染器（没有 2D context）；单测用 mock 或 SSR/SVG。
- 不把用户可控文本（系列名/类目值）未转义地拼进 tooltip HTML；统一走 `escapeHtmlText`。
- 不在检查器/组件里维护图表文档副本或直接改 store；所有变更走 `chart.update`（命令总线，撤销）。
- 不在模型变化时重建图表实例：首次 `ChartCanvas.render()`，之后只走 120ms 防抖 `update()`；
  不要在 React 里另建 `ChartRenderer` 或反复 `dispose/init`。
- 不给 `chart.update` 加严格映射校验（列删除后的逐步修复路径），也不让 `chart.create` 接受非法
  映射；复制/向导仍必须严格校验。
- 不把 `ChartOptions.yLabel` 绕过 `RenderModel.y.label` 直接写进 option；Y 单位/逐列轴名需要新
  契约与 ADR。
- 不把图例选择/缩放窗口写进 `ChartSpec`/manifest 或撤销栈（ADR-044 的瞬态契约）；关闭标签/重启
  回到全选 0–100 是预期行为。
- 不在 `ChartCanvas` 之外调用 `toPNG` 并自己拼文件名；导出只经 `ChartCanvas.exportPng` + 视图
  工具栏对话框（2x/背景/文件名/等待渲染都在那里）。
- 不给 `file:exportText` 增加任意路径或第二个保存通道；PNG 复用 `encoding:'base64'`，路径只由
  保存对话框决定（ADR-044）。
- 不放宽 `no-table` 的 manifest invariant 来“让 E2E 能打开”：该态是防御态，由组件测试覆盖；
  真要支持换表/孤儿图表先写 ADR。
- 不在适配器/组件里硬编码 toolbox 本地化文案；`labels` 由 `ChartCanvas` 从 i18n 注入。
- 不把样式字段（palette/background/线宽/平滑/点/图例/网格/精度/从零/Y 轴名/kind/`xLabel`）加进
  数据缓存键；命中必须同时校验 `rows` 引用，否则行编辑会读到旧数据（ADR-045）。
- 不在渲染期同步解析 100k 行：大表必须走 `useChartRenderStatus` 的 loading + `setTimeout(0)`
  路径；不要移除 `data-chart-pending`/`data-chart-resolve-ms`（E2E/预算依赖）。
- 不把 `ChartCanvas` 的交互发布改回逐事件 `setState`（拖动会卡）；也不要在模型变化时
  dispose/re-init 实例。
- 不删除或调低 `chart.option.2k`（50ms）/`chart.restyle.100k`（20ms）门禁；`chart.restyle` 的
  `values` 引用相等断言是有意的“不重复解析”证据。
- 不把 `copyToBackup` 的 `mkdir(recursive)` 或它的回归测试删掉：复制/恢复的工作区缺少
  `backups/` 时，所有保存都会 `E_FS_WRITE`（静默只弹 Toast）。
- 不为通过 `chart-perf` 放宽 resolve ≤300ms / update ≤200ms / private ≤600MB 或删除实例计数断言；
  失败先查是否 CPU 噪声（ADR-033），再按 ADR-045 复核条件优化。
- 不把命令面板/帮助对话框改成常驻挂载，也不在 `AppShell` 里加 `useAppState` 文档订阅：
  T5.4 实测这会把 100k 图表切换 private 从 506MB 推到 605–615MB；keymap 在按键时读 store、
  面板打开时快照可用性并只在此期间挂载（ADR-049 §5）。
- 不让命令面板绕过 `core.actions` 或复制 `isEnabled` 业务规则；`data-command-id`/
  `data-command-recent`/`command-palette-input` 是 E2E 契约，不要改名。
- 不把设置写回 `localStorage` 当作“持久化”：`settings.json` 是唯一权威，localStorage 只是
  独立 provider 的兜底镜像；不要让 `I18nProvider`/`ThemeProvider` 重新拥有自己的持久化状态。
- 不新增 `app:settings` 的路径参数或任意文件读写；不把 `settings.json` 放进工作区；不改
  `AppSettings.version` 而不写迁移。
- 不让 `SettingsDialog` 直接改 store 或绕过 `style.apply` 去写工作区默认样式；默认样式是
  workspace 数据，不是应用设置。
- 不在自动保存关闭时静默丢弃修改：关闭窗口/工作区必须走三选一；不要删掉
  `closeWorkspace({ save:false })` 的“不 flush”语义或 `SaveState.unsaved`。
- 不把 main 退出超时改回固定 3s（自动保存关闭时它必须等用户的 60s 决策）；不要删
  `UNSAVED_QUIT_TIMEOUT_MS` 或动态 `timeoutMs`。
- 不在开发构建移除缺 key 抛错来“让页面先渲染”；缺 key 是文案 bug，不是运行时容错点。
- 不删除 `ui-conventions.test.ts` 的属性文案门禁；新增用户可见属性时同步扩展白名单而不是
  放宽整条规则。
- 不把 `APP_NAME` 改回散落的字面量，也不要只改其中一处：`productName`、`<title>`、`app.name`
  由 `brand.test.ts`/`i18n.test.ts` 锁定；历史 ADR/报告中的旧名不要批量改写（ADR-051）。
- 不把插件注册表改回 `{ id, def }` 或无订阅：`source`/`subscribe` 是 T6.3 UI 刷新与来源标注的
  契约（ADR-052）；`register` 不得静默覆盖同 id。
- 不让插件替换内置或其他插件的贡献；插件 `dispose`/`deactivate` 后不得残留贡献。
- 不在 `plugin-sdk` 里 import table-engine/React/Electron/fs；`ImportResult` 只是结构兼容，
  映射放在 `apps/desktop/src/renderer/features/import/plugin-import.ts`（T6.2），不要在插件包里
  import table-engine。
- 不把禁用列表写进 manifest 或 settings（T6.1 仅内存；T6.3 再决定持久化）。
- 不把宿主激活错误改成一抛就中断整批插件；必须逐插件隔离、记录 `disabled` 状态与日志。
- 不把 T6.2 的字段类型校验降级成“只校验存储类型”：`parseText` 只做类型解析、值域必须在
  `validate`（0/6 必须落到 `range`），命令层与编辑器必须共用 app-core 的
  `checkTableCellSet`/`FieldTypeLookup`，不要在组件里另写一套 parse/validate。
- 不把 `ColumnDraft.fieldTypeId` 的三态改回两态（`undefined` 保留 / `null` 清除 / 字符串选择）；
  换存储类型必须清空 `fieldTypeId`（ADR-015）。
- 不让 `ui` 或 `app-core` import `@curve/plugin-sdk`：前者用 `formatField` 回调，后者用
  `FieldTypeLookup` 结构端口（ADR-053）。
- 不在主进程 `createPluginHost`/`activate` 插件，也不让主进程失去 `resolveFieldTypeStorage`：
  否则含 `fieldTypeId` 的工作区会重新出现 “cannot verify field type” 警告。
- 不删掉 `use-import` 在 `client.open` 前的字节副本，除非同时改 Worker transfer 协议；
  删掉会让插件导入器读到 detached buffer。
- 不把 `plugin.spec.ts` 依赖的 `column-form-field-type`、`import-importer`、`data-field-type`
  改名；新增插件 UI 契约时同步 E2E 与 SPEC。
- 不自动跨任务/跨里程碑；M3、M4 均已验收并关闭，M4 的 T4.1–T4.6 与验收演示已完成，
  T5.1–T5.5 与 M5 验收演示已完成；**M5 已获接受并关闭**，**T6.0 品牌更名、T6.1 插件 SDK/注册表
  与 T6.2 示例插件已完成**，M6 的 `T6.3`–`T6.5` 未开始。

---

## 9. 新会话启动检查清单

- [ ] `git status --short` 干净；`git log` 包含 T5.1 代码/报告 **`eb152b4`**、T5.2 **`a9dcf75`**、
      T5.3 **`02e30a8`**、T5.4 **`fb53d9b`**、T5.5（`git log -1 -- apps/desktop/src/renderer/features/settings`）、
      T6.0 **`cc6dd5c`**、T6.1 **`2ea05cf`**、T6.2 **`15e43ed`** 与本交接文档提交。
- [ ] 已注入 PATH（§3.1），`pnpm --version` 为 11.28.5。
- [ ] 会话文件策略为 `danger-full-access`（§3.2）；审批提示关闭。
- [ ] 已读 `AGENTS.md`、本文件、`docs/reports/t5.5/REPORT.md`、`docs/reports/t6.0/REPORT.md`、
      `docs/reports/t6.1/REPORT.md`、`docs/reports/t6.2/REPORT.md`、`docs/TASKS.md` 的 M5/M6、
      `docs/SPEC.md` §12/§13.3/§14/§16.3/§16.4、ADR-053/052/051/050/048/047。
- [ ] 已确认 `pnpm verify` 基线（**188 files / 1761 tests**）、`pnpm e2e` **107 passed**（6.5m）、
      `pnpm bench` exit 0；M5 demo 1 条 20.2s；T6.2 `plugin.spec.ts` 3 条 13.0s；
      settings 4 条 3.9s/5.0s/3.6s/1.7s；chart-perf 100k 切换 private **505 / 516MB**（≤600MB）。
- [ ] 已确认 `apps/desktop/node_modules/electron/dist/electron.exe` 存在。
- [ ] 已清除 `ELECTRON_RUN_AS_NODE`；跑 E2E 前再设 `CURVE_E2E_NO_SANDBOX=1`。
- [ ] 已确认 M1/M2/M3/M4/M5 均已获用户接受、T3.1–T3.6、T4.1–T4.6、M4 验收演示、T5.1–T5.5、
      **M5 验收演示、T6.0 品牌更名、T6.1 插件 SDK 与 T6.2 示例插件已完成**；**M5 已关闭，
      M6 的 T6.3–T6.5 未开始**，不要自动领取 T6.3。
- [ ] 已确认 T5.1 契约：`LayoutView` 递归渲染、`ui.activePanePath` UI-only、分栏=原 pane+空
      pane、最多 4 pane、移动标签到下一分栏、关闭最后标签折叠 pane、空 pane 才可关分栏、
      500ms 布局去抖（`flushSaves`/关闭/Ctrl+S 冲掉）、`view.layout` 可选 `activePanePath`、
      非法 layout 回退单 pane + warning；`pane[data-pane-active]` 不要改回 `data-active`。
- [ ] 已读 0.2/0.3/0.4/0.5 并确认 T5.2 契约：`EditHistory` 单一栈默认记录所有带 patches 的命令；
      `view.layout` 仅结构变更入栈，纯标签/焦点切换瞬态且不清 redo；100 条/256MB 估算上限；
      undo/redo 行补丁走表 + manifest、纯 manifest 命令只写 manifest；`ui.history` 快照 +
      TitleBar“编辑”Menu；打开/关闭清空。E2E 契约 `data-undo-depth`/`data-undo-action` 等。
- [ ] 已确认 T5.3 契约：`SaveQueue` 1.5s trailing 去抖 + 10s 上限，`flush()`/`retry()` 立即写；
      `app:quit-requested` → renderer flush ≤3s → 成功时 `workspace.close` 删除 `.lock` →
      `app:quit-response`；失败/超时原生确认，flush 失败后确认退出**保留** `.lock`；
      `workspace:inspect` 只读，取消恢复不改字节，“尝试恢复”才写备份；preload 名称是
      `workspace.recentRemove/recentClear`。T5.5 不得把这些快捷键改坏或绕开 `flushSaves()`。
- [ ] 已确认 T5.4 契约：`APP_COMMANDS` 的快捷键表与 scopes（global/workspace/grid/chart）、
      `createKeymap` 冲突即抛、`isEditableTarget` 保护；面板只在打开时挂载并快照可用性，
      `AppShell` 不订阅 store（否则 chart-perf 100k 切换会到 605–615MB）；E2E 契约
      `command-palette*`/`data-command-id`/`data-command-recent`；`F1` 帮助表由同一注册表生成。
- [ ] 已确认 T5.5 契约：`userData/settings.json` 的 `AppSettings`/`normalizeAppSettings`；
      `app:settings`/`app:settings:update` 与 preload `app.settings/updateSettings`；
      `SettingsProvider` 是 locale/theme 唯一状态源，`I18nProvider`/`ThemeProvider` 受控；
      `SaveState.unsaved`/`'unsaved'`、`setAutosaveEnabled`、`closeWorkspace({ save:false })`、
      `UNSAVED_QUIT_TIMEOUT_MS`；`data-testid="settings-*"`/`open-settings`/未保存对话框名称；
      开发构建缺 key 抛错与属性文案门禁。不要把这些改回 localStorage/固定超时/静默丢弃。
- [ ] 已确认 T6.1 契约：`Registry.subscribe` 同步快照 + 监听器异常隔离、`list()` 每项带
      `source`、插件只能 `replace` 自己的贡献、宿主 `dispose` 关闭/插件 `dispose` 只清自己；
      `createPluginHost` 的版本主版本校验、失败回滚 + `disabled`、`E_PLUGIN_*` code；禁用列表
      仅内存；`pnpm exec vitest run packages/plugin-sdk` 26 条。
- [ ] 已确认 T6.2 契约：字段类型 id `com.curvealmanac.rating` / 导入器 `com.curvealmanac.points`；
      `parseText` 只做类型、值域在 `validate`（0/6 → `range`）；`ColumnDraft.fieldTypeId` 三态；
      app-core `FieldTypeLookup`（不 import plugin-sdk）、`@curve/ui` 的 `formatField` 回调；
      主进程 `resolveFieldTypeStorage` 严格校验；`use-import` 的字节副本；
      `pnpm exec vitest run plugins/plugin-sample` 29 条 + `e2e/plugin.spec.ts` 3 条。
- [ ] 已确认 E2E 新增 `apps/desktop/e2e/settings.spec.ts`（4 条）、`autosave.spec.ts`（4 条）、
      `recovery.spec.ts`（4 条）、`undo.spec.ts`（3 条）、`layout.spec.ts`（3 条）、
      `palette.spec.ts`（3 条）、`plugin.spec.ts`（3 条）与 `m4-acceptance.spec.ts`（1 条）；
      截图在 `docs/reports/t5.5/`、`docs/reports/t5.4/`、`docs/reports/t5.3/`、
      `docs/reports/t5.2/`、`docs/reports/t5.1/`、`docs/reports/t6.2/` 与 `docs/reports/m4/`；
      `m0` 截图已还原，`test-results/` 未提交。
- [ ] 已确认 T4.6：`resolveChartData`/`renderChartModel` 拆分与 `resolveSeries` 组合（输出/快照
      不变）；数据缓存键不含样式字段/`xLabel`、命中要求 `rows` 引用；>20k 行延迟解析 + loading；
      `data-chart-pending/resolve-ms/update-ms/update-count/instances` 诊断契约；rAF 合并交互
      发布；bench `--chart`（`--sample` 别名）。不要改采样/断点语义。
- [ ] 已确认 T4.4：`chart.create { chart, view }`/`chart.update { chart }`/`chart.delete { chartId }`
      为 manifest-only、workspace 作用域撤销；`createChart/updateChart/deleteChart/duplicateChart/
      openChart` 的失败/committed 语义；`DEFAULT_CHART_OPTIONS` 的 sampling 5000/2000；
      `RenderModel.y.label` 与 `RenderStyle.connectNulls`（采样图/长表 true、宽表未采样 false）；
      `ChartView/ChartCanvas` 首次 render + 120ms 防抖 update + resize + dispose；`data-chart-*`
      渲染契约；列删除后的 `missing-columns` 可重映射错误态；`ChartPlaceholder` 已删除。
- [ ] 已确认 T4.5：`ChartRenderer` 的交互 API 只影响瞬态状态（不写 `ChartSpec`/manifest、不进
      撤销）；`ChartCanvasHandle.exportPng` flush 防抖 + 两帧后同步 `toPNG`；
      `file:exportText` 的 `encoding:'base64'` 读写路径；`data-chart-empty` 三态；
      `no-table` 是防御态（合法 manifest 打不开）；toolbox labels 与 tooltip
      `cs-chart-tooltip` 类名；黄金快照只改了 tooltip 类名。
- [ ] 已确认 T4.3 的 `echarts@6.1.0` 只属于 `chart-echarts`，T4.4/T4.5 只通过 `ChartCanvas` 使用适配器；
      depcruise `only-chart-echarts-imports-echarts` 生效；option 只经 `toEChartsOption`。
- [ ] 已确认 T4.1/T4.2 的映射/采样口径未变：`resolveSeries` 仍是唯一解析/采样入口（T4.6 内部
      拆成两段后重新组合），`meta.sampled` 只表示“真的降采样”，采样后
      `renderedPoints ≤ sourcePoints`。
- [ ] 已确认 T2.4–T2.7 的粘贴/导入/筛选/保存/撤销/性能门禁语义；不绕过命令总线或另起写盘路径。
- [ ] 已确认 E2E 写盘断言使用 `expect.poll`；`m0` 截图提交前还原；`docs/reports/t4.5/*.png`
      （3 张）与 `docs/reports/t4.6/*.png`（2 张）已提交。
- [ ] 已确认 renderer 主 chunk 为 **3,394.50 kB**（ECharts + 分栏 + 撤销 + 自动保存/恢复 +
      快捷键/面板 + 设置 + 插件 SDK/示例插件）、CSS **77.89 kB**、main **338.76 kB**；T6.4 评估
      拆包，M4/T5.1–T5.5/T6.0/T6.2 不改图表层架构或重建实例。
- [ ] 跑全量 E2E 前已确认没有外部程序占满 CPU（§3.3/§7）；perf 内存门禁 600MB，T6.2 后
      100k 图表切换实测 **505 / 516MB**（全量套件通过；紧接全量后的单跑出现过 602MB 离群值），
      仍需独占运行、不放宽断言。
- [ ] M4 验收演示已按 TESTPLAN E6 执行（`e2e/m4-acceptance.spec.ts`，独占 CPU），报告
      `docs/reports/m4/REPORT.md` 与截图已提交；**M4 已于 2026-10-27 获用户接受并关闭**。
- [ ] T5.1–T5.5 已完成（报告 `docs/reports/t5.1|t5.2|t5.3|t5.4|t5.5/REPORT.md`，
      ADR-046/047/048/049/050，`e2e/layout.spec.ts` 3 条、`undo.spec.ts` 3 条、autosave 4 条、
      recovery 4 条、palette 3 条、settings 4 条）；**M5 验收演示已执行**
      （`e2e/m5-acceptance.spec.ts` 1 条、`docs/reports/m5/REPORT.md`、7 张截图），
      **M5 已获用户接受并关闭**；**T6.0 品牌更名已完成**（`docs/reports/t6.0/REPORT.md`、
      ADR-051、`e2e/smoke|shell` 断言已更新）；**T6.1 插件 SDK/注册表已完成**
      （`docs/reports/t6.1/REPORT.md`、ADR-052、`packages/plugin-sdk` 26 条）；**T6.2 示例插件
      已完成**（`docs/reports/t6.2/REPORT.md`、ADR-053、`plugins/plugin-sample` 29 条、
      `e2e/plugin.spec.ts` 3 条）；**M6 的 T6.3–T6.5 未开始**，等用户明确指示后再开始 T6.3。
