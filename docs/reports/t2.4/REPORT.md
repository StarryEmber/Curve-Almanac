# T2.4 实施报告 — 区域粘贴

- 任务：`docs/TASKS.md` T2.4（FR-TBL-03）
- 完成日期：2026-10-22
- 决策记录：`docs/adr/030-t24-region-paste.md`
- 状态：完成；按用户要求停在 T2.5 前，等待确认。

## 1. 开工前确认的 11 项决策

用户在实现前逐项确认，全部采用推荐方案：

1. **解析器与入口**：TSV 优先；只有单列且原文含逗号时回退 CSV。支持引号、`""`、引号内换行/
   制表符、CRLF、BOM。网格 `onPaste` 直读 `text/plain`，不新增 IPC；编辑器打开时走原生粘贴。
2. **锚点与目标**：选择矩形左上角为锚点，矩阵向右下覆盖/扩容；命令以 `rowId` 定位，排序 UI 留 T2.6。
3. **筛选**：T2.4 检测到 `view.tableView.filter` 时整批拒绝，隐藏行不被修改；完整“只写可见行/
   超出整批拒绝”语义显式延后 T2.6（用户同意）。
4. **新增行与空主键**：实现 `table.rows.insert`，空 text 主键生成 `row_<uuid>`；粘贴自动追加；
   本次不加独立“新增行”按钮/快捷键，E3 的键盘新增一行仍待后续任务。
5. **超列与 100 列**：单条原子 `table.paste` 携带 `newColumns`；确认框默认 text/非必填、可改
   label/type；100 列上限命令硬拒绝；撤销同时回滚新增列。
6. **类型错误**：整批预检，失败列出前 100 条并定位第一个错误；不提供对话框内编辑，修正后重新粘贴。
7. **10k 取消**：≥10,000 单元格显示可取消进度；async 分块（默认 2,000 格/块），取消不 dispatch；
   不引入 Worker。
8. **撤销**：粘贴接入现有最小历史，一次一条、不合并；撤销/重做同时回滚新增行/列与覆盖单元格。
9. **保存时机**：成功后走 T2.2 保存队列（表 → manifest），等待 flush ≤3s；失败 `committed: true`
   并保留 dirty。
10. **性能**：批量替换受影响行 + 一次 `splice` 追加；10k 端到端 P95 ≤1s 软预算，硬门禁留 T2.7。
11. **范围**：不实现区域复制（Ctrl/Cmd+C）。

## 2. 交付内容

### table-engine

- `packages/table-engine/src/paste.ts`：
  - `parseClipboardText(text)` → `ClipboardMatrix { delimiter, cells, rows, columns }`；
  - TSV/CSV 回退、引号/`""`/内嵌换行、CRLF、BOM、单尾随换行、矩形化、未闭合引号 `E_IMPORT_FORMAT`。

### app-core

- `packages/app-core/src/validation/paste-plan.ts`：
  - `PastePlanner`（`step`/`finish`/`blocked`）与 `planPaste`；锚点/列/行/100 列/200k 行检查；
  - 逐格 `coerceCell`；追加行与空 text 主键生成；`PasteIssue`（矩阵坐标）、`PasteSummary`；
  - 新增列（非必填）、既有行补空、所有视图 `columnOrder` 同步由命令层复用 `insertColumnIntoView`。
- `packages/app-core/src/validation/paste-columns.ts`：`createPasteColumns`（label→key、唯一 key、
  复用 `checkColumnDraft`、100 列上限、text/number/date/boolean）。
- `packages/app-core/src/commands/paste.ts`：`table.paste` 单条原子命令；失败抛 `AppError`，Immer 不发布半成品。
- `packages/app-core/src/commands/rows.ts`：`table.rows.insert`（`coerceCell`、空主键生成、重复 id/key 拒绝）。
- `history/edit-history.ts`：`table.cell.set` + `table.paste`；粘贴不合并。
- `app-core.ts`：注册两个命令；`changedTableId` 把 `table.paste`/`table.rows.insert` 纳入保存队列。
- `usecases/workspace-actions.ts`：`preparePaste`（筛选守卫、分块、AbortSignal、进度）与
  `applyPaste`（dispatch + flush ≤3s、失败 `committed: true`）；`PASTE_PROGRESS_THRESHOLD`、
  `DEFAULT_PASTE_CHUNK_CELLS`。

### renderer

- `features/paste/PasteColumnsDialog.tsx`：超列确认，label/type 编辑，100 列提示。
- `features/paste/PasteErrorDialog.tsx`：前 100 条错误 + 定位第一个错误。
- `features/paste/PasteProgressDialog.tsx`：可取消进度；saving 阶段禁用取消。
- `features/paste/use-paste.tsx`：idle → preparing → columns/errors/applying 状态机。
- `features/paste/paste-issue-text.ts`：`PasteIssue` → `t(key)` 文案。
- `features/grid/DataGrid.tsx`：`onPaste` 监听、选择矩形左上角锚点、locate 滚动/高亮；并修复
  虚拟行未挂载时键盘焦点丢失（100ms 安全重试，编辑器打开时不抢焦点）。
- `features/grid/GridCell.tsx`：`cs-grid__cell--paste-error`。
- `features/grid/grid-navigation.ts`：`pasteTarget` 纯函数。
- `i18n/messages/{zh-CN,en-US}.ts`、`styles.css`：粘贴文案与对话框/进度/错误样式。

### 测试

- table-engine：`paste.test.ts` 14 条。
- app-core：`paste-plan.test.ts` 18、`paste-columns.test.ts` 6、`paste.test.ts` 6、`rows.test.ts` 3、
  `edit-history.test.ts` +3、`paste-actions.test.ts` 12。
- renderer：`paste-issue-text.test.ts` 5、`PasteColumnsDialog.test.tsx` 4、
  `PasteErrorDialog.test.tsx` 4、`PasteProgressDialog.test.tsx` 3、`grid-navigation.test.ts` +2。
- E2E：`apps/desktop/e2e/paste.spec.ts` 7 条。

## 3. 验收项与证据

| 验收项 | 证据 |
|---|---|
| Excel 5×4 粘贴逐格正确，含引号与换行 | `e2e/paste.spec.ts` 第 1 条：5×4 TSV（引号、`""`、内嵌换行）→ 3 行更新 + 2 行追加、`1,234.5`→`1234.5`、JSONL 含 `"Line1\nLine2"` 与 `"Say \"hi\""`、关闭重开仍正确；`paste.test.ts`/`paste-plan.test.ts` |
| 类型错误整批不提交，错误定位到单元格 | `e2e/paste.spec.ts` 第 2 条：错误对话框、定位后 `--paste-error` 高亮、JSONL 字节不变、manifest `rowCount` 不变；`paste-plan.test.ts` 前 100 条 + 矩阵坐标；`paste-actions.test.ts` |
| 10k 单元格可取消，取消后数据不变 | `e2e/paste.spec.ts` 第 4 条：100×100 矩阵 → 进度对话框 → 取消 → JSONL 字节不变、`aria-rowcount` 仍为 3；`paste-actions.test.ts` 分块取消用例 |
| 筛选激活时只写可见行/超出整批拒绝 | T2.4 保守实现：`e2e/paste.spec.ts` 第 6 条在带 `filter` 的视图粘贴，整批拒绝、JSONL 不变；完整可见行语义按 ADR-030 由 T2.6 闭环 |
| 粘贴可一次撤销 | `e2e/paste.spec.ts` 第 5 条：粘贴 2 行 → Ctrl+Z 回滚为 1 行 → Ctrl+Shift+Z 恢复，磁盘同步；`edit-history.test.ts` 粘贴一条/新增列回滚 |
| 超列确认与新增列 | `e2e/paste.spec.ts` 第 3 条：确认框新增 1 列（label=Score、type=number）→ 写入 → manifest key `['id','name','score']` → 重开仍在 |
| 键盘与 200% 缩放 | `e2e/paste.spec.ts` 第 7 条：200% 下确认框可达、Tab 到确认按钮、无横向溢出、Esc 关闭 |

## 4. 实际验证输出（2026-10-22）

| 命令 | 结果 |
|---|---|
| `pnpm exec vitest run packages/table-engine packages/app-core --testNamePattern "paste"` | exit 0；**25 passed / 217 skipped**（`testNamePattern` 只匹配用例名；完整 paste 文件 62 条由 `pnpm verify` 覆盖） |
| `pnpm verify` | exit 0；**99 files / 813 tests**；ESLint 0；depcruise **286 modules / 1073 deps / 0 violations** |
| `pnpm test:coverage` | exit 0；全局 lines **76.34%** / statements **76.17%** / branches **68.45%** / functions **77.92%**；阈值 70/60 未下调 |
| `pnpm format:check` | 通过 |
| `pnpm build` | exit 0；renderer **1,308.67 kB**；Worker `assets/table.worker-BAayXUuQ.js` |
| `pnpm exec playwright test ... e2e/paste.spec.ts` | **7 passed** |
| `pnpm e2e` | **48 passed**（7 条新增 + 既有 41 条） |
| 10k parse+plan 本机基准 | 7 次采样 2.20–7.75ms；P50 **5.01ms**、P95 **7.75ms**（Node 24，非 CI 门禁） |

> 说明：首次 `pnpm verify` 命中 `recent-list.test.ts` 已知的 5s 超时（HANDOFF §3.6），重跑
> 99 files / 813 tests 全绿。全量 E2E 首次暴露 `DataGrid` 键盘焦点在虚拟行未挂载时丢失的问题，
> 已用 100ms 安全重试修复（编辑器打开时不抢焦点），随后 `pnpm e2e` 48 passed。

## 5. 残留风险

- 筛选视图只能整批拒绝；完整“只写可见行/超出整批拒绝”由 T2.6 实现并补 E2E（TASKS T2.6 已承接）。
- 独立“新增行”按钮/快捷键未实现；`table.rows.insert` 命令已可用，E3 的键盘新增一行仍待后续任务。
- 10 万级矩阵的命令阶段仍同步重规划；10k 实测远低于预算，T2.7 再评估 Worker/硬门禁。
- 256MB 文件上限在保存时由 `table:write` 强制，超限返回 `committed: true`；未在 dispatch 前编码整表。
- 隐藏列与视图级列顺序的完整映射规则依赖 T2.6；T2.4 只处理传入的可见列顺序。
- 新增列不支持 enum/badge 等需要额外选项的类型，仍走 T2.3 列面板。

## 6. 停点

按用户要求，T2.4 完成后停止，**不进入 T2.5**。下一个任务 `T2.5`（CSV/JSON 导入向导）开始前仍需
用户确认，并按 AGENTS §11 先逐项确认歧义。
