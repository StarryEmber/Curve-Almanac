# ADR-030 T2.4 的区域粘贴、批量命令、取消与新增列

- 状态：已接受
- 日期：2026-10-22
- 相关：SPEC §8.1、§9.2、§9.3、§13.1、§13.2、§13.3、§16.1；T2.4；ADR-005、ADR-006、ADR-007、ADR-014、ADR-024、ADR-027、ADR-028、ADR-029

## 背景

T2.4（区域粘贴）需要落地一批 SPEC 只给出目标行为、没有给出实现边界的选择。按 AGENTS §11
在开工前逐项询问用户，用户于 2026-10-22 确认全部采用推荐方案：

1. TSV 优先，单列含逗号时回退 CSV；网格 `paste` 事件直读 `text/plain`，不新增 IPC；
2. 以选择矩形左上角为锚点，矩阵向右下覆盖/扩容；命令按 rowId 定位，排序不受影响；
3. 筛选尚未实现（T2.6），T2.4 检测到 `view.tableView.filter` 时整批拒绝，完整“只写可见行”
   语义显式延后 T2.6；
4. 实现 `table.rows.insert` 与空 text 主键自动生成；粘贴自动追加；本次不加独立“新增行”UI；
5. 超列时用一条原子 `table.paste` 携带 `newColumns`，默认 text/非必填、可改 label/type，
   100 列上限预检，超限整批拒绝；
6. 整批预检失败列出前 100 条并定位第一个错误；不支持在错误对话框内编辑，修正后重新粘贴；
7. ≥10,000 单元格显示可取消进度，异步分块校验，取消不 dispatch；不引入 Worker；
8. 粘贴接入现有最小历史，一次一条、不合并，撤销同时回滚新增行/列；
9. 成功后走保存队列（表 → manifest），等待 flush ≤3s；失败 `committed: true` 可重试；
10. 命令批量替换受影响行、一次 `splice` 追加；10k 端到端 P95 ≤ 1s 作为软预算，硬门禁留 T2.7；
11. 不在 T2.4 实现区域复制（Ctrl/Cmd+C）。

本 ADR 记录这些决定、实现边界与后续任务的复用约束。

## 决定

### 1. 解析器在 `@curve/table-engine`，不新增 IPC

- `packages/table-engine/src/paste.ts` 新增纯函数 `parseClipboardText(text)`，返回矩形
  `ClipboardMatrix { delimiter, cells, rows, columns }` 或 `E_IMPORT_FORMAT`。
- 规则：去 BOM；恰好去掉一个尾随 CRLF/LF/CR（Excel 习惯）；引号内可含分隔符、CRLF 与
  `""` 转义；未闭合引号是硬错误；不规则的输入行按最宽行补空串；空剪贴板返回 0×0。
- 分隔符：先按 TSV 解析；只有当结果只有一列且原文含逗号时再按 CSV 解析，且 CSV 结果必须
  多于一行或一列才替换（SPEC §9.3 的“单列含逗号再试 CSV”）。
- 入口：`DataGrid` 的滚动容器监听 `onPaste`，读 `clipboardData.getData('text/plain')`；
  编辑器打开或事件源是 `input/textarea/select/contenteditable` 时交给原生粘贴。没有新增
  IPC 通道，也没有 renderer 剪贴板权限。
- 1×1 矩阵写入活动单元格；单列多行按多行处理（Excel 语义）。空文本不动作。

### 2. 锚点是选择矩形左上角，命令以 rowId 定位

- `pasteTarget(anchor, active, rowIds, columnIds)` 取 `selectionRect` 的 `top/left`，不是活动
  单元格；矩阵从锚点向右下扩展，可覆盖已有行并追加新行。
- `table.paste` 载荷包含 `anchor: { rowId, columnId }` 与 `columnIds`（当前视图可见列顺序）。
  命令按 rowId 找锚点行，因此未来排序激活时粘贴目标不变；T2.4 不实现排序 UI。
- 空表用 `rowId: null` 从第 1 行开始追加。
- 矩阵列映射到 `columnIds` 中锚点之后的列；超出部分必须由 `newColumns` 补齐。隐藏列
  （不在 `columnIds`）不参与本次粘贴，这是 T2.6 视图级列顺序的边界。
- 排序/筛选的完整“按当前视图顺序写入可见行”语义要与 T2.6 一起验收；T2.4 只保证
  rowId 定位与安全拒绝。

### 3. 筛选未实现：T2.4 保守整批拒绝，T2.6 闭环

- `preparePaste` 与 `applyPaste` 都检查 `view.tableView.filter`；存在 filter 时返回
  `blocked` / `filter-active`，不解析、不 dispatch、不写盘。
- 这是有意的保守行为：T2.4 没有筛选 UI，正常用户不可达；但通过 manifest/migration 注入
  filter 的工作区也绝不能写隐藏行。SPEC §9.3 的“只写可见行/超出可见行整批拒绝”在 T2.4
  只完成“隐藏行不被修改”的安全部分，完整语义由 T2.6 实现并补测试。
- TASKS T2.4 的该验收项保留显式说明；T2.6 的任务描述必须承接并在 E2E 覆盖。

### 4. `table.rows.insert` 与空主键生成

- 新增 `table.rows.insert { tableId, index, rows }`；每行可带显式 `row_` id，省略时生成。
- 值先按列 `coerceCell`；空 text 主键用该行的 `row_<uuid>` 填充（SPEC §9.2），显式主键
  与已有/批内主键查重；重复行 id 也拒绝。
- 粘贴命令内部不 dispatch `table.rows.insert`（一条粘贴必须是一个命令），但 T2.5/T2.6 可
  复用该命令。T2.4 不新增独立“新增行”按钮/快捷键；TESTPLAN E3 的“键盘新增一行”仍显式
  留待后续任务，不能当作已验收。

### 5. 一条原子 `table.paste`，新增列随矩阵一起提交

- 载荷：`{ tableId, anchor, columnIds, matrix, newColumns? }`。`matrix` 是已解析的字符串
  矩阵；`newColumns` 是完整 `ColumnDef`，由 `createPasteColumns` 按当前表生成。
- `@curve/app-core/src/validation/paste-plan.ts` 的 `planPaste` 一次性完成：锚点/列/行检查、
  逐格 `coerceCell`、必填/枚举/主键唯一性、追加行、新增列、所有视图 `columnOrder` 同步。
  任一格失败返回前 100 个 `PasteIssue` + `totalIssues`，不返回半迁移行集。
- 新增列追加到 schema 末尾；默认 text、非必填。`required` 新列会被拒绝，因为粘贴矩形之外
  的既有行无法补值。
- `MAX_COLUMNS_PER_TABLE` 在命令层硬校验；超限返回 `E_TABLE_LIMIT`，UI 在确认框禁用提交。
- 撤销一次粘贴会同时回滚新增列、追加行与被覆盖的单元格（同一组 Immer inverse patches）。

### 6. 错误模型：整批预检、前 100 条、定位第一个错误

- `PasteIssue` 扩展 `CellIssue`，带 `matrixRow`/`matrixColumn`/`value`；失败时
  `preparePaste` 返回 `kind: 'invalid'`、`issues`、`totalIssues`，不修改文档。
- `PasteErrorDialog` 显示“第 R 行 · 列 X：原因（值：…）”，最多 100 条；“定位第一个错误”
  关闭对话框并让网格滚动/高亮目标单元格。位于待新增行/列的错误无法定位时按钮禁用并提示。
- 不支持在错误对话框内直接编辑矩阵；用户关闭后修正单元格或剪贴板再粘贴。这满足
  SPEC §9.3 的“取消或修正后重试”，但避免在错误态造第二套编辑 UI。
- `applyPaste` 在命令失败时重新 `planPaste` 只为收集 issues，不用于提交；命令始终以当前
  状态重新校验，stale preview 不能绕过校验。

### 7. 10k 进度与取消：async 分块，不引入 Worker

- 阈值 `PASTE_PROGRESS_THRESHOLD = 10_000` 单元格；默认每 2,000 格让出一次事件循环。
- `preparePaste` 使用 `PastePlanner.step` 分块推进；`AbortSignal` 在块之间检查，取消返回
  `kind: 'cancelled'`，不 dispatch、不写盘。进度对话框在 validating 阶段可取消；进入
  saving 后按钮禁用（命令已提交，不能再取消）。
- 不引入 Worker：T2.4 的 10k 预算用主线程分块即可满足；Worker 化留给 T2.7 视实测决定。
- 命令本身仍同步重规划一次（防御 stale preview）；10k 实测 parse+plan P95 约 8ms，
  远低于 1s。

### 8. 撤销：粘贴是一整条历史

- `EditHistory` 的 recordable 命令从 `table.cell.set` 扩展为 `table.cell.set` 与
  `table.paste`；粘贴不参与 800ms 合并，永远独立一条。
- 撤销/重做消费命令的 `patches`/`inversePatches`，因此新增行/列与所有覆盖单元格一起回滚；
  撤销后仍走保存队列落盘。
- 其他命令（含 `table.rows.insert`）仍不进入最小历史，T5.2 统一。

### 9. 保存：复用 T2.2 队列，256MB 由写盘守卫兜底

- app-core 的 row-saving 命令集合扩展为 `table.cell.set`、`table.paste`、`table.rows.insert`；
  命令成功且产生 patches 后按表入保存队列，表 → manifest。
- `applyPaste` 等待 `flush` ≤3s；失败返回 `committed: true`，内存保留 dirty，状态栏可重试，
  不重复执行。
- dispatch 前由 `planPaste` 预检 200k 行上限；256MB 文件上限仍由既有 `table:write` /
  `tableWriteLimitError` 在写盘时强制，超限时走 `committed: true`。不在 dispatch 前编码整表，
  避免复制 T2.2 的 Worker encode 路径。

### 10. 性能实现约束

- 命令只替换受影响的行对象；追加行用一次 `splice`；不为每个单元格产生 Immer patch。
- `PastePlanner` 预计算列索引与 overlay，避免嵌套 `findIndex`；主键唯一性在最终 overlay
  上检查一次，因此批内主键交换合法。
- 10k 端到端 P95 ≤ 1s 为软预算，记录在报告；硬门禁、10 万行与内存峰值留 T2.7。

### 11. 范围：不做复制、不改格式/API

- T2.4 不实现 Ctrl/Cmd+C 区域复制；SPEC §9.1 的复制入口留后续任务。
- 不升 `formatVersion`、不改 JSONL/manifest、不新增 IPC 通道、preload 白名单或依赖。

## 代价

- 筛选存在时粘贴被整批拒绝，比 SPEC 的最终语义更严格；T2.6 前用户无法在筛选视图粘贴。
- 新增列只能选 text/number/date/boolean；enum 需要选项，仍走 T2.3 列面板。
- 命令同步重规划一次，10k 约 8ms；10 万级矩阵的命令阶段仍可能阻塞，T2.7 评估 Worker。
- 错误对话框不能在原地编辑矩阵；用户需要关闭后修正再重新粘贴。
- 256MB 超限在写盘时才暴露，属于 `committed: true` 的保存失败而非 dispatch 前拒绝。
- 隐藏列/视图级列顺序的完整语义未在 T2.4 覆盖，依赖 T2.6。

## 影响

- `@curve/table-engine` 新增 `parseClipboardText`、`ClipboardMatrix`、`PasteDelimiter`。
- `@curve/app-core` 新增 `table.paste`、`table.rows.insert` 命令；`validation/paste-plan.ts`
  （`PastePlanner`/`planPaste`/`PasteIssue`/`PasteSummary`）、`validation/paste-columns.ts`
  （`createPasteColumns`/`PasteColumnDraft`）、`WorkspaceActions.preparePaste/applyPaste`、
  `PASTE_PROGRESS_THRESHOLD`、`DEFAULT_PASTE_CHUNK_CELLS`；保存队列的 row-command 集合扩展。
- `apps/desktop` 新增 `features/paste/*`（三对话框、`use-paste`、issue 文案）、
  `e2e/paste.spec.ts` 7 条；`DataGrid` 增加 `onPaste`/locate 高亮；i18n 与 CSS 同步。
- `docs/SPEC.md` §9.2/§9.3/§13.1/§13.2/§13.3/§16.1 增加实现边界；TASKS/CHANGELOG/HANDOFF/
  REPORT/ADR 索引同步。
- 不新增运行时依赖；不改变 `formatVersion`、JSONL 形态、CSP、沙箱或 preload 白名单。

## 复核条件

- T2.6：实现筛选/排序后，替换 T2.4 的 filter 守卫为“只写可见行/超出整批拒绝”，补 E2E，
  并重新评估隐藏列与视图列顺序的映射规则。
- T2.5：导入追加必须复用 `coerceCell`、空主键生成与 200k 行/100 列上限；不得另起写盘路径。
- T5.2：把 `table.paste` 纳入全命令历史时，保留“一次粘贴一条、不合并”的语义。
- T2.7：实测 10 万单元格或 10 万行粘贴；若命令阶段超过预算，评估 Worker/分批与进度。
- 若需要 256MB 在 dispatch 前拒绝，评估在 encode 阶段复用 Worker 结果，不要在主线程整表编码。
