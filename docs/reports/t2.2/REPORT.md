# T2.2 实施报告 — 单元格编辑与校验

- 任务：`docs/TASKS.md` T2.2（FR-TBL-02）
- 完成日期：2026-10-21
- 决策记录：`docs/adr/028-t22-cell-editing-and-save.md`
- 状态：完成；按用户要求停在 T2.3 前，等待确认。

## 1. 开工前确认的 8 项决策

用户在实现前逐项确认，全部采用推荐方案：

1. 每次成功提交后异步保存该表，串行/合并写，失败保留 dirty 并可重试；关闭工作区前 flush ≤3s。
2. 仅对 `table.cell.set` 实现最小历史栈：每次提交一条、800ms 合并、Ctrl/Cmd+Z、Ctrl/Cmd+Shift+Z
   （含 Cmd+Y）、新命令丢弃 redo、上限 100 条；完整历史留 T5.2。
3. 新增行（`table.rows.insert`、空主键自动生成）留 T2.4/T2.5；T2.2 不提供新增行 UI。
4. 使用结构化 `CellIssue`（reason/columnId/rowNumber/conflictRowNumber/conflictRowId），renderer 用
   `t(key)` 本地化；不改变 `AppError` schema 或 IPC 信封。
5. 主键冲突显示冲突行号，并滚动/高亮冲突行。
6. F2 + 双击 + 直接输入；Enter 提交下移、Tab/Shift+Tab、失焦提交、Esc 取消。
7. date 用 `input[type=date]`（本地午夜）、boolean 用三态 select、enum 用带空值项的 select。
8. 状态栏保存三态 + 重试；app-core 提供 `validateCellBatch` 纯函数，批量 UI 留 T2.4/T2.5。

## 2. 交付内容

### app-core

- `validation/cell-issue.ts`：结构化 `CellIssue`、`cellIssueFromResult`、`cellIssueToAppError`。
- `validation/cell-validation.ts`：命令与 renderer 共用的 `checkTableCellSet`、`validateCellBatch`
  （行 overlay + 最终主键唯一性检查）。
- `history/edit-history.ts`：`table.cell.set` 的最小撤销/重做栈，消费 `CommandResult.patches`。
- `usecases/save-queue.ts`：按表串行的保存队列；Worker encode → `table:write` → `manifest:write`；
  失败保留 dirty/error；`retry`/`flush`/`reset`。
- `state/manifest.ts`：`stateToManifest` 从 actions 迁出，供 actions 与保存队列共用。
- `state/types.ts` / `state/store.ts`：`ui.save`、`ui.editIssue`、`setSaveState`、`setEditIssue`。
- `commands/table-cell-set.ts`：改用共享 `checkTableCellSet`，错误保留 reason/row 信息。
- `commands/bus.ts`：新增 `CommandBusOptions.onCommand` 观察者。
- `usecases/workspace-actions.ts`：`updateCell/undo/redo/retrySave/flushSaves`；删除表时取消待写；
  关闭工作区前 flush；打开/关闭时清理历史与保存状态。
- `app-core.ts`：创建保存队列/历史，`onCommand` 记录历史并入队保存，`encodeTable` 注入，
  `openWorkspace` 成功后重置历史/保存状态。

### renderer

- `features/grid/editors/`：`TextCellEditor`、`NumberCellEditor`、`DateCellEditor`、
  `BooleanCellEditor`、`EnumCellEditor`、`CellEditor`、`editor-value.ts`。
- `features/grid/use-cell-editing.ts`：草稿本地状态、提交/取消/失焦、IME composition、失败保持编辑态。
- `features/grid/cell-issue-text.ts`：`CellIssue.reason` → `t(key)`，输出“第 N 行 · 列 X：原因”。
- `features/grid/DataGrid.tsx`：F2/双击/直接输入/Delete、Enter/Tab/Esc/失焦、主键冲突滚动/高亮、
  `rangeExtractor` 保留编辑行、仅 active cell 渲染编辑器。
- `features/grid/GridCell.tsx`：编辑/错误/冲突状态、编辑器 slot、双击入口；移除只读 ARIA 标记。
- `features/workspace/WorkspaceView.tsx`：Ctrl/Cmd+Z/Y/S 与单元格提交/错误接线。
- `shell/StatusBar.tsx`：保存三态、错误定位、重试按钮。
- `i18n/messages/{zh-CN,en-US}.ts`：新增编辑器/错误/保存文案。
- `styles.css`：编辑器、错误描边、冲突高亮、状态栏样式（只用 `--cs-*` 令牌）。

### 测试与文档

- app-core：`cell-validation.test.ts`、`edit-history.test.ts`、`save-queue.test.ts`，并扩展
  `table-cell-set.test.ts`（既有）、`workspace-actions.test.ts`、`open-workspace.test.ts`、`store.test.ts`。
- renderer：`editor-value.test.ts`、`CellEditor.test.tsx`、`cell-issue-text.test.ts`。
- E2E：`apps/desktop/e2e/edit.spec.ts` 3 条。
- ADR-028、SPEC §9.2/§13.2/§13.3、TASKS T2.2、CHANGELOG、HANDOFF、AGENTS §0、ADR 索引。

## 3. 验收项与证据

| 验收项 | 证据 |
|---|---|
| 5 种类型均可编辑；非法值不落库且错误可读 | `e2e/edit.spec.ts` 第 1/2 条；`editor-value.test.ts`、`CellEditor.test.tsx`、`cell-validation.test.ts` |
| 主键重复被阻止并定位冲突行 | `e2e/edit.spec.ts` 第 2 条断言 `与第 1 行冲突` + `cs-grid__cell--conflict`；`cell-validation.test.ts` 断言 `conflictRowNumber`/`conflictRowId` |
| 编辑一次 = 一条撤销记录（800ms 合并） | `edit-history.test.ts` 合并/窗口/redo 分支/上限；`e2e/edit.spec.ts` 第 3 条 Ctrl+Z / Ctrl+Shift+Z |
| 纯键盘可完成“改一格” | `e2e/edit.spec.ts` 第 3 条：点击聚焦后 F2 → 输入 → Enter，后续 Tab/Esc 均键盘完成 |
| 提交后落盘 | `e2e/edit.spec.ts` 第 1 条 `expect.poll` 读 JSONL + 关闭/重开断言；`save-queue.test.ts` 写序/失败/重试/合并/超时 |
| 保存状态三态 | `StatusBar` 接线；`e2e/edit.spec.ts` 等待“已保存”；`save-queue.test.ts` 断言 `ui.save.status` |

## 4. 实际验证输出

| 命令 | 结果 |
|---|---|
| `pnpm verify` | exit 0；**78 files / 638 tests**；ESLint 0；depcruise **242 modules / 851 deps / 0 violations** |
| `pnpm test:coverage` | exit 0；全局 lines **77.73%** / statements 77.42% / branches 68.82% / functions 78.42%；阈值 70/60 未下调 |
| `pnpm format:check` | exit 0 |
| `pnpm build` | exit 0；renderer 1,163.90 kB；Worker `assets/table.worker-*.js` |
| `pnpm e2e` | **33 passed**（原 30 + `edit.spec.ts` 3），约 51.1s |

T2.2 专属 E2E：

```text
ok 1 edits text, number, date, boolean and enum cells and persists them
ok 2 rejects invalid values, empty required keys and duplicate keys with localised errors
ok 3 supports F2/Enter/Tab/Esc and undo/redo without a mouse after focus
```

## 5. 与规格/计划的差异与残留

- 新增行、空主键自动生成留给 T2.4/T2.5；TESTPLAN E3 的“键盘新增一行”尚未在 T2.2 闭环，已在 TASKS
  T2.2 备注与 ADR-028 中显式承接。
- 撤销仅覆盖 `table.cell.set`；其他命令与撤销菜单留 T5.2，T5.2 必须复用 800ms/100 条语义。
- 每次提交后立即写表 + manifest 是 T5.3 自动保存的前置实现；T5.3 必须合并/替换，不能并存两条写盘路径。
- 日期编辑器只编辑日期；带时刻的既有值在用户提交后归一到本地午夜（未修改的草稿不会 dispatch）。
- 批量校验只有 app-core 纯函数，无 UI；T2.4/T2.5 必须复用它并补“整批不写”的 E2E。
- 全局 lines 覆盖率从 81.57% 降到 77.73%，主要因新增 renderer 编辑组件由 E2E 覆盖；阈值仍满足，
  M2 报告需给出趋势。

## 6. 残留风险

| 风险 | 处理 |
|---|---|
| 每次提交写表+manifest 的 I/O 频率高于 1.5s 自动保存 | T5.3 合并队列；当前按表串行/合并，保持 UI 异步 |
| 主键冲突滚动到远处行会短暂离开编辑位置 | `rangeExtractor` 保留编辑行；1.2s 后滚回并恢复焦点；E2E 未覆盖超远行 |
| 日期列带时刻值提交后丢失时刻 | ADR-028 明确限制；若需求出现，改为日期时间编辑器并写新 ADR |
| 批量校验未接 UI | T2.4/T2.5 复用并补 E2E |
| 保存失败只显示状态栏，不弹 Toast | 状态栏有重试；T5.3 恢复/保存策略再评估 |
