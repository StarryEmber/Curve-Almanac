# ADR-047 T5.2 的全命令撤销、256MB 门槛、瞬态布局与 Edit 菜单

- 状态：已接受
- 日期：2026-10-28
- 相关：SPEC §13.1、§13.2、§16.1；TASKS T5.2；TESTPLAN E7；ADR-025、ADR-028、ADR-029、
  ADR-030、ADR-031、ADR-033、ADR-036、ADR-037、ADR-038、ADR-043、ADR-046

## 背景

T2.2 的最小历史只记录 `table.cell.set`、`table.paste`、`table.import` 与 `style.*`/`chart.*`，
T5.2 要把 `table.create/delete`、`table.rows.insert`、`table.column.*`、`table.meta.update`、
`view.create/delete/update/layout` 全部接入同一撤销栈，同时满足：

1. SPEC §13.2 的“100 条或 256MB，以先到者为准”，但 100k 行的整数组补丁不能被
   `JSON.stringify` 在每次编辑时反复序列化；T2.7 已确认单元格编辑的数组补丁主要共享行对象。
2. SPEC §13.2 的“活动标签不进入历史”与 §13.1 把 `view.layout` 标为可撤销之间的张力：
   标签切换、pane 聚焦都是 `view.layout`，但分栏/比例/移动又是文档布局。
3. 撤销/重做必须复用既有 `SaveQueue`：行数据要写表 + manifest，纯 manifest 命令只写 manifest；
   删除表后 redo 不能重新写出已进 `.trash/` 的表文件。
4. UI 需要 `canUndo/canRedo` 与“可撤销命令名”，但 `EditHistory` 不能依赖 i18n/React。
5. 瞬态命令不得清空 redo 分支；T5.1 已记录标签切换会清 redo 的缺陷。

## 决定

### 1. 单一历史栈，默认记录所有产生 patches 的命令

- `EditHistory.record()` 不再维护命令白名单；只要 `CommandResult.patches.length > 0` 就记录。
  未来新增文档命令自动可撤销，避免再出现“忘了加白名单”。
- 唯一瞬态命令是 `view.layout`，且只在其布局树**除 `activeViewId` 外完全不变**时瞬态：
  - 从 inverse patch 的根 `layout` 值取旧树，与 `result.next.layout` 递归比较
    `type/direction/ratio/viewIds`（忽略每个 pane 的 `activeViewId`）；
  - 相等 → 标签/焦点切换，不入栈、不清 redo；
  - 不等 → 分栏、移动标签、比例、关闭 pane 等结构变更，记录一条可撤销的 `view.layout`。
- 选择、滚动、面板开合、窗口尺寸本来就只改 `ui` 或组件本地状态，不存在命令补丁，因此不入栈。

### 2. 合并与批量语义保持不变

- `table.cell.set` 仍按同一 `mergeKey`（table/row/column）和 800ms 窗口合并；合并保留第一次的
  inverse patches 与最后一次的 forward patches。
- 合并仅在 redo 栈为空时进行：撤销后再编辑同一格必须产生新条目，不能把新编辑并进更早的条目。
- 粘贴、导入、行插入、列变更、表/视图/样式/图表命令各一条，不参与 800ms 合并；一次控件提交
  仍对应一条记录。
- 历史条目保存命令名（`table.cell.set` 等），不保存本地化文案。

### 3. 100 条 + 256MB 的估算口径

- 条目字节数 = forward patches + inverse patches 的结构估算，计入路径、对象/数组开销、字符串
  UTF-16 码元（2 bytes/char）与数组指针（8 bytes/element）。
- 行数组特殊处理：
  - 数组元素是 `Row`（`{id, values}`）且与当前已发布表的行对象大部分相同（抽样 5 个下标，
    ≥75% 引用相同）→ 只计数组本身（100k 行约 800KB）；
  - 否则（例如 import replace 的旧行、删表/删列的 inverse）→ 抽样 16 行外推整数组大小，
    计入历史真正持有的行对象。
- 大数组（>1024）抽样 24 项外推；递归深度上限 12。估算不调用 `JSON.stringify`。
- 上限默认 `256 * 1024 * 1024` bytes 与 100 条，先到者生效：每次记录后从**最旧的 undo 条目**
  开始丢弃，直到满足两个上限。单条超过 256MB 时该条也会被丢弃（宁可没有撤销，不突破内存上限）。
- 新记录先清空 redo 分支再入栈/合并；redo 条目与 undo 条目在撤销/重做时互相移动，总存活字节
  不会超过记录时的上限。
- `sizeBytes()` 暴露两栈总估算值供测试/诊断；不持久化、不进 manifest。

### 4. 落盘语义：行补丁写表，其余写 manifest

- 撤销/重做只应用 patches 并触发既有回调，不另写盘。
- 若条目含 `tables/<id>/rows` 补丁，且表存在 → `onChanged(tableId)` 走 `SaveQueue` 的
  “表 → manifest”写入。
- 整表新增/删除的条目（`tables/<id>` 根补丁）：
  - 表存在且行数 > 0（例如撤销删除表）→ 写表 + manifest；
  - 表不存在（redo 删除）或表为空（redo 建空表）→ 只写 manifest。
- 没有表补丁的条目（视图、样式、图表、工作区、结构布局）→ `onWorkspaceChanged()` 只入队
  manifest。
- 删除表的 redo 只移除 manifest 引用，不再次 `trash` 文件；可能留下一个孤儿表文件（无害，
  与原 ADR-027 的“孤儿文件无害”一致），由后续清理/覆盖处理。

### 5. UI 快照、命令名与 Edit 菜单

- `UiState.history` 增加 UI-only 快照：`canUndo/canRedo/undoAction/redoAction/undoDepth/redoDepth`。
  `EditHistory` 在 record/undo/redo/clear 后通过 `onStateChange` 发布；快照不进入命令 patches，
  不写入工作区。
- 标题栏新增 `HistoryMenu`（`@curve/ui` 的 Menu）：标题“编辑”，菜单项显示
  “撤销 编辑单元格（Ctrl+Z）”“重做 …（Ctrl+Shift+Z）”，禁用时显示空栈文案。
- 命令名 → 文案的映射放在 renderer 的 `history-action-label.ts`，app-core 仍不依赖 i18n；
  未知命令回退“修改文档”。
- 快捷键仍由 `WorkspaceView` 的 `Ctrl/Cmd+Z`、`Ctrl/Cmd+Shift+Z`、`Cmd+Y` 处理；输入框/对话框
  内的编辑不劫持。Electron 原生菜单的 `undo/redo` role 保留给文本输入，本 ADR 不新增 IPC。
- 打开/关闭工作区继续 `history.clear()`，同时把 `ui.history` 重置为空快照。

### 6. 不改变的东西

- 不新增 manifest 字段、不升级 `formatVersion`、不改 JSONL/IPC/preload/CSP、不新增运行时依赖。
- `LayoutNode`、`view.*` 命令名/载荷、`activePanePath` 的 UI-only 性质、500ms 布局去抖不变。
- `SaveQueue` 仍是唯一写盘路径；撤销不会直接调 `workspaceStore.write*`。

## 代价

- 256MB 是**估算**而非精确 GC 占用：共享行数组会被低估、独特行对象会被抽样外推。宁可提前丢弃
  最旧条目，也不在每次编辑时遍历 100k 行或字符串化整表。
- 单条超过 256MB 的导入/替换会失去撤销能力（历史为空），这是硬上限的代价。
- `view.layout` 的结构变更（分栏/比例/移动）现在可撤销，撤销也会恢复当时的 `ui` 焦点；纯标签
  切换仍不进入历史。若用户期望“所有布局都不可撤销”，需要新 ADR 调整分类。
- `table.delete` 的 redo 不重复移入 `.trash/`，磁盘可能留下不再被 manifest 引用的表文件。
- `table.meta.update` 的菜单文案是“修改数据表”，不区分重命名/换主键。
- 历史快照是 Zustand UI 状态，记录/撤销/重做会各触发一次额外渲染；不在 100k 行热路径上。

## 影响

- 代码：
  - `packages/app-core/src/history/edit-history.ts`：全命令分类、布局形状比较、256MB 估算、
    `snapshot`/`sizeBytes`/`onStateChange`、按补丁选择保存路径。
  - `packages/app-core/src/state/{types,store}.ts`：`HistoryState`、`ui.history`、
    `setHistoryState`、`createEmptyHistoryState`。
  - `packages/app-core/src/app-core.ts`、`usecases/{open-workspace,workspace-actions}.ts`：
    接线快照、打开/关闭清空。
  - `apps/desktop/src/renderer/features/history/{HistoryMenu.tsx,history-action-label.ts}`、
    `shell/TitleBar.tsx`、`i18n/messages/{zh-CN,en-US}.ts`、`styles.css`：Edit 菜单与文案。
  - 测试：`edit-history.test.ts`（+7）、`workspace-actions.test.ts`（+2）、
    `column-actions.test.ts`（+1）、`chart-actions.test.ts`（扩展）、`import-actions.test.ts`
    （扩展）、`history-action-label.test.ts`、`e2e/undo.spec.ts`（3 条，含键盘/200% 缩放）。
- 文档：SPEC §13.1/§13.2、TASKS T5.2、TESTPLAN E7、ADR 索引、CHANGELOG、HANDOFF、AGENTS §0、
  `docs/reports/t5.2/REPORT.md`（2 张截图）。
- 快照：无；未改 RenderModel / chart option 黄金快照。

## 复核条件

- 若 100k 行单元格编辑实测历史内存明显高于估算，或 100 条上限因估算过早触发：调整
  `estimateRows` 的共享判定/抽样比例，并补 100k 行编辑的 bench 或内存证据。
- 若产品要求分栏/比例也属于纯 UI 状态、不可撤销：把 `view.layout` 整体标为瞬态，更新本 ADR、
  SPEC §13.1 与 E7。
- 若删除表的 redo 必须同时清理磁盘文件：在 `WorkspaceActions` 的异步层提供 redo 后清理钩子，
  不要让 `EditHistory` 直接碰 IO。
- 若菜单需要显示更精确的动作（重命名/换主键、列更新字段）：在 `CommandResult` 增加结构化
  `historyLabel` 或把 payload 摘要带进快照，而不是在 renderer 猜测命令名。
- 若原生 Edit 菜单必须与历史同步：新增 main↔renderer 历史状态 IPC，同步更新 SPEC §15 与
  preload 白名单；当前选择是不为菜单新增通道。
