# ADR-028 T2.2 的单元格编辑、结构化校验、最小撤销与即时保存

- 状态：已接受
- 日期：2026-10-21
- 相关：SPEC §8.1、§9.1、§9.2、§13.2、§13.3、§16.1；T2.2；ADR-005、ADR-006、ADR-014、ADR-023、ADR-025、ADR-027

## 背景

T2.2（单元格编辑与校验）需要落地一批 SPEC 只给出目标行为、没有给出实现边界的选择。按 AGENTS §11
在开工前逐项询问用户，用户于 2026-10-21 确认全部采用推荐方案：

1. 每次成功提交后异步保存；
2. T2.2 实现 `table.cell.set` 的最小撤销栈；
3. 新增行留给 T2.4/T2.5；
4. 校验错误使用结构化 issue + `t(key)`；
5. 主键冲突显示行号并滚动/高亮；
6. F2 + 双击 + 直接输入；
7. 日期/布尔/枚举使用原生控件；
8. 保存状态三态 + 批量校验纯函数。

本 ADR 记录这些决定、实现边界与后续任务的复用约束。

## 决定

### 1. 提交后异步保存，T5.3 再合并进 1.5s 自动保存队列

- 每次 `table.cell.set` 成功产生 patches 后，`@curve/app-core` 的保存队列标记该表待写。
- 队列按表串行；Worker `encode`（renderer 注入）→ `table:write` → `manifest:write`，manifest 始终最后写。
- 同一张表在写入期间再次编辑时合并为一次后续写入，不并发写同一文件。
- 写失败：保留 `ui.dirtyTables` 与内存数据，`ui.save.status = 'error'`，状态栏提供重试；下一次编辑或
  `retrySave()` 会重新入队。
- 关闭工作区前 `flush` 队列，最多等 3s；失败则工作区保持打开，不静默丢数据。
- 这是 T5.3 自动保存（1.5s 防抖、最长 10s 强制、退出 flush）的临时前置实现。T5.3 必须复用队列与
  状态形状，或写新 ADR 说明替换方式，不得另起一套并存的写盘路径。

### 2. 仅对 `table.cell.set` 实现最小历史栈

- 历史条目直接消费命令总线的 `patches` / `inversePatches`，不复制文档。
- 同一单元格（相同 `mergeKey`）800ms 内的连续提交合并为一条：保留第一次的 inverse patches 与最后一次
  的 patches。
- Ctrl/Cmd+Z 撤销，Ctrl/Cmd+Shift+Z 与 Cmd+Y 重做；新命令丢弃 redo 分支；栈上限 100 条；仅内存，
  打开/关闭工作区时清空。
- 撤销/重做通过同一保存队列落盘，并把表重新标记为 dirty。
- 其他命令、历史菜单与跨命令合并留给 T5.2。T5.2 必须复用本 ADR 的 800ms 语义与 `CommandResult` 补丁
  契约，不得静默改变已验收行为。

### 3. 新增行不属于 T2.2

- T2.2 不实现 `table.rows.insert`、空主键自动生成或新增行 UI。
- TESTPLAN E3 的“键盘新增一行”在 T2.4（粘贴扩容）或 T2.5（导入追加）落地；TASKS T2.2 的实现备注与
  T2.4/T2.5 任务必须显式承接，不得当作已验收。

### 4. 结构化单元格 issue，渲染端本地化

- `@curve/app-core` 新增 `CellIssue`：`reason`、`code`、`columnId?`、`rowNumber?`、
  `conflictRowNumber?`、`conflictRowId?`、英文 `message`。
- `reason` 是稳定的 UI 键：`required`、`type`、`range`、`enum`、`duplicate-key`、
  `primary-key-empty`、`table-not-found`、`row-not-found`、`column-not-found`、`row-shape`、`unknown`。
- `checkTableCellSet` 由命令和 renderer 共用；`updateCell` 在 dispatch 前预检并把 issue 返回给编辑器。
  命令仍抛 `AppError`，`detail` 字符串包含 `reason/column/row/conflictRow` 供日志与测试使用。
- 不改变 `AppError` 的 Zod schema、IPC 错误信封或 `formatVersion`；英文 `message` 不得直接显示给用户。
- renderer 以 `grid.error.*` 与 `grid.status.editLocation*` 消息键拼“第 N 行 · 列 X：原因”，
  主键冲突的“与第 N 行冲突”也来自消息表。

### 5. 主键冲突定位

- 校验失败时编辑器保持打开，单元格红色描边 + `title`，输入控件 `aria-invalid` 并通过
  `aria-describedby="cs-edit-status"` 关联状态栏。
- 状态栏显示编辑行、列与原因；主键冲突额外显示冲突行号。
- 网格滚动到冲突行并临时高亮 2.5s；1.2s 后滚回编辑行并恢复编辑器焦点。
- 虚拟列表使用 `rangeExtractor` 始终保留正在编辑的行，避免“滚动导致编辑器卸载/草稿丢失”。

### 6. 编辑入口与键盘语义

- F2、双击、直接键入可打印字符都进入编辑；直接键入以该字符替换原值。
- 编辑器中 Enter 提交并下移，Tab 提交右移，Shift+Tab 提交左移，失焦提交（不移动），Esc 取消。
- 非编辑态按 Enter 也进入编辑；Delete 直接清空当前格，失败时进入编辑态显示 issue。
- IME composition 期间的 Enter 不提交。
- 编辑中切换活动单元格：先提交；提交失败保持编辑态并重新聚焦。

### 7. 原生编辑器

- text/number：文本输入；number 允许千分位与负号，提交后交给 `coerceCell`。
- date：`input[type=date]`，编辑值为本地 `YYYY-MM-DD`，提交后按 SPEC §8.1 解析为本地午夜。
  既有值若带时刻，编辑器只显示日期；用户确认提交后该值会归一为本地午夜（见“代价”）。
- boolean：三态 select（空/是/否），空值提交为 `null`，保留 `false` 与空值语义。
- enum：select，选项来自 `enumOptions`；非必填列提供空值选项，空值提交为 `null`。
- 所有可见文案走 zh-CN/en-US 消息表；控件有可访问名称。

### 8. 保存状态与批量校验

- 状态栏显示 `保存中… / 已保存 / 保存失败（重试）`；失败时保留 dirty。
- `@curve/app-core` 提供 `validateCellBatch(table, rows, edits)`：逐格 `coerceCell`，在行 overlay 上应用
  合法编辑，最后对主键做一次唯一性检查，因此同一批内的主键交换合法、批内重复仍被拒绝。
- T2.2 不提供批量 UI；T2.4 粘贴与 T2.5 导入必须复用它，先整体校验，失败整批不写。

## 代价

- 每次提交都会触发一次 Worker 编码与两次磁盘写（表 + manifest），比 T5.3 的 1.5s 合并写更频繁；
  T5.3 需要合并，避免同一操作写两次。
- 日期编辑器只编辑日期，带时刻的既有值在用户提交后会被归一到本地午夜；未修改的草稿不会 dispatch。
- 最小历史只覆盖 `table.cell.set`；其他文档命令的撤销仍不可用，直到 T5.2。
- 新增 `ui.save`、`ui.editIssue`、`WorkspaceActions.updateCell/undo/redo/retrySave/flushSaves`、
  `CreateAppCoreOptions.encodeTable` 等公开面，T2.3+ 必须按新形状消费。
- 主键冲突时滚动到冲突行会让编辑行短暂离开视口；`rangeExtractor` 保证草稿与焦点不丢，但视觉上会移动。

## 影响

- `packages/app-core`：`validation/cell-issue.ts`、`validation/cell-validation.ts`、`history/edit-history.ts`、
  `usecases/save-queue.ts`、`state/manifest.ts`；`AppState.ui` 增加 `save`/`editIssue`；
  `CommandBusOptions.onCommand`、`stateToManifest` 迁移、`openWorkspace` 重置历史/保存状态。
- `apps/desktop`：`features/grid/editors/*`、`use-cell-editing.ts`、`DataGrid/GridCell` 编辑接线、
  `StatusBar` 三态/错误定位、`WorkspaceView` 的 Ctrl/Cmd+Z/Y/S、`renderer-core` 注入 Worker encode。
- `docs/SPEC.md`：§9.2/§13.2/§13.3 增加实现边界；不改变模型、文件格式、IPC 通道或 `formatVersion`。
- `docs/TASKS.md`、`CHANGELOG.md`、`HANDOFF.md`、`AGENTS.md` 同步 T2.2 完成状态与验证数字。
- 依赖：不新增运行时依赖；复用 `@tanstack/react-virtual` 的 `rangeExtractor` 与既有 Worker。

## 复核条件

- T2.4/T2.5：新增行、粘贴/导入批量写入必须复用 `validateCellBatch` 与空主键自动生成规则；补 E3 的
  “键盘新增一行”证据。
- T5.2：把最小历史扩展为全命令历史时，必须消费 `CommandResult.patches/inversePatches`、保留 800ms
  合并与 100 条上限；若改变形状需新 ADR 并更新本 ADR 的复核记录。
- T5.3：自动保存必须复用/替换保存队列；若改为 1.5s 防抖，补 SPEC §13.3 与 E8 的“最后 1.5s 可丢失”
  证据，不能同时保留两条写盘路径。
- 若日期列的带时刻编辑成为真实需求，改为日期时间编辑器并写新 ADR，不在本 ADR 上静默扩展。
