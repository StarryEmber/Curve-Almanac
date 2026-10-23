# ADR-032 T2.6 的筛选、排序、视图状态、查询 Worker 与可见行粘贴

- 状态：已接受
- 日期：2026-10-23
- 相关：SPEC §6.2、§9.3、§9.5、§13.1、§16.1；T2.6；ADR-005、ADR-006、ADR-007、ADR-009、ADR-011、ADR-014、ADR-028、ADR-029、ADR-030、ADR-031

## 背景

T2.6（筛选、排序与视图状态）需要落地一批 SPEC 只给出目标行为、没有给出实现边界的选择。
2026-10-23 按 AGENTS §11 逐项询问用户，用户确认以下 12 项；本 ADR 记录决定、实现边界
和后续任务的复用约束。

## 决定

### 1. 筛选入口：工具条按钮 + 模态对话框

- 网格工具条显示“筛选 / N 个条件”与“清除筛选”；点击打开 `FilterDialog`。
- 对话框用现有 `@curve/ui` 的 `Dialog`、`Select`、`Input`、`Button`，因此焦点陷阱、Esc、
  焦点恢复和 200% 缩放行为与 T0.4/T2.3 一致。
- Inspector 仍只负责列管理；筛选不常驻侧栏。

### 2. 筛选结构：单层 all/any，最多 20 条

- UI 只编辑一个根组（全部满足 / 任一满足）加扁平 compare 子项；引擎仍支持递归 AST，
  嵌套谓词由 `table-engine` 单测覆盖。
- 从 manifest 读到嵌套筛选时，对话框显示“当前界面只能编辑单层条件”，禁用“应用筛选”；
  “清除筛选”仍可用。禁止把嵌套筛选静默拍平成另一条语义。

### 3. 操作符白名单与取值

- `text`：`eq/neq/contains/startsWith/endsWith/isNull/notNull`。
- `number`/`date`：`eq/neq/gt/gte/lt/lte/between/isNull/notNull`。
- `boolean`/`enum`：`eq/neq/isNull/notNull`。
- `between` 需要两个值；`isNull`/`notNull` 不带值；UI 按列类型只提供白名单内的操作符。
- 12 种操作符全部由 `table-engine` 单测覆盖；不合法组合在 `view.update` 前被拒绝。

### 4. 比较语义与值转换

- 文本比较大小写不敏感：按当前 UI locale 做 `toLocaleLowerCase`；`eq/neq/contains/
  startsWith/endsWith` 共用该规则。
- 空值：`null` 与 text 的 `''` 都视为空；值操作符不匹配空值，统一使用 `isNull`/`notNull`。
- `number`/`date` 数值比较；`date` 的过滤器值由 `coerceCell` 把 `YYYY-MM-DD` 转成本地午夜
  epoch ms。`between` 含边界；上下界写反时按 min/max 处理。
- `boolean` 严格比较布尔；`enum` 按 `enumOptions[].value` 比较，UI 显示 label。
- 筛选值复用 `coerceCell`（与内联编辑、粘贴、导入同一归一器），不另写解析。

### 5. 排序入口：表头点击 + Shift 多级

- 表头是按钮：点击循环 asc → desc → none，并清空其他排序层；Shift+点击追加/切换该列
  （最多 3 层）；表头显示 ↑/↓ 与 1..3 优先级，`aria-sort` 同步。
- 工具条“排序”菜单列出当前层级（可逐层移除）与“清除排序”。
- `MAX_SORT_LEVELS = 3` 落在 `@curve/domain/limits` 与 `tableViewStateSchema`；命令层和
  UI 另有校验，绕过 UI 的调用同样被拒绝。

### 6. 排序语义：空值最后、locale collator、稳定排序

- 升降序都把 `null`/空文本放最后。
- 文本使用 `Intl.Collator(locale, { numeric: true, sensitivity: 'variant' })` 的语义：
  - 普通 ASCII 文本使用“数字段补零”的自然键 + `numeric:false` collator 的快速路径；
  - 非 ASCII 文本使用自然键 + collator；
  - 带符号数字、超过 20 位的数字段等不安全值直接回退到字面 `numeric:true` collator。
  - 大小写差异由 collator 裁决；单测用参考 collator 对代表性数据逐项比对。
- `number`/`date` 数值比较；`boolean` false < true；`enum` 按显示 label。
- 并列项保持物理行顺序（稳定排序）；排序只影响显示，不改变 `rows` 的存储顺序。

### 7. 视图状态保存：每个确认动作立即写 manifest，不进撤销

- 筛选点“应用筛选”、排序点击/移除、隐藏切换、列宽 pointerup 各触发一次 `view.update`，
  随后写 `manifest.json`；不写 JSONL、不标脏表、不进入 T2.2 最小历史。
- 视图状态本来就属于 `TableViewState`，不新增 manifest 字段、不升 `formatVersion`。
- 保存失败时内存视图仍已更新，错误进入统一错误面；下一次动作或 T5.3 的保存队列负责重试。
- 撤销/重做范围不变（仍是 `table.cell.set`/`table.paste`/`table.import`）；T5.2 统一全命令历史。

### 8. 多视图：TabBar “+ 复制当前视图”

- 活动表视图的 TabBar 提供“复制当前视图”；新 `ViewDef` 复制 `columnOrder/widths/
  hiddenColumnIds/sort/filter/frozenColumnCount`，标题用 `Name (2)` 递增。
- 两个视图共享表数据，但筛选/排序/宽度/隐藏/冻结彼此独立；关闭一个不影响另一个。
- `openTable` 仍复用同一张表的已有视图，不会因“复制视图”改变 T2.1 的“打开同一张表只激活已有标签”。

### 9. 隐藏列：Inspector 列面板 + 已隐藏列表

- 列面板每列提供“隐藏/显示”；底部“已隐藏列”列出当前隐藏项并可恢复。
- 至少保留一列可见（UI 禁用隐藏最后一列）；`hiddenColumnIds` 必须是 `columnOrder` 的子集。
- 宽度/冻结统计仍由 `TableViewState` 持久化；刷新后恢复。

### 10. 大表查询：专用 query Worker + 行快照/增量缓存

- `apps/desktop/src/renderer/workers/query.worker.ts` 持有按表缓存的行快照；
  `sync` 支持 `reset/append/update`，`query` 返回有序 rowId、可见行数与 worker 内耗时。
- ≤20,000 行在主线程同步执行同一纯函数；>20,000 行走 Worker。新请求以 generation 作废旧
  响应；切换表/关闭工作区不阻塞旧请求；Worker 创建/查询失败时回退主线程并在工具条提示。
- 查询不提供百分比进度；行数据只在首次/结构变化时全量克隆，单元格编辑只发送改动的行。
- 文件格式、IPC 通道、preload 白名单均未改变。

### 11. T2.4 粘贴衔接：只写可见行，超出整批拒绝

- `table.paste` 载荷与 `WorkspaceActions.preparePaste/applyPaste` 增加可选 `rowIds`
  （当前视图可见行顺序）与命令侧 `viewId`。
- 筛选激活时：矩阵从锚点起逐行写入 `rowIds`；矩阵超出剩余可见行数 → 整批 `blocked`
  （`filter-visible-exceeded`），不追加、不写隐藏行；锚点不可见 → `filter-anchor-hidden`。
- 无筛选时保持 T2.4 语义：按当前显示顺序（有排序则按排序顺序）写入，超出末尾自动追加。
- 命令在 dispatch 时重新检查目标行仍满足当前筛选；筛选在预览后变化 → `filter-stale`，
  不产生半成品。隐藏列仍不参与粘贴（沿用 T2.4 的 `columnIds` 语义）。
- 这使 ADR-030 明确交给 T2.6 的“只写可见行/超出可见行整批拒绝”闭环，不再整批拒绝所有筛选视图。

### 12. 性能证据：bench query.100k + E2E 计时

- `scripts/bench.ts` 新增 `--query`：
  - `query.100k`：100k×10 行、两个条件筛选 + 3 级排序，P95 预算 400ms；
  - `query.text-sort.100k`：打乱后的 100k 文本主键排序，P95 预算 400ms。
- `apps/desktop/e2e/filter.spec.ts` 复用 100k 夹具，断言 `data-query-mode="worker"`、
  `data-query-ms <= 400`、网格可交互；`filter.spec.ts` 还覆盖筛选/排序/重开/双视图/隐藏列/
  200% 缩放。
- 结果记录在 `docs/reports/t2.6/REPORT.md`；T2.7 继续硬化预算与回归门禁。

## 代价

- 筛选 UI 只支持单层条件；复杂嵌套筛选可读但不可在 T2.6 对话框内编辑。
- 文本排序的快速路径对极端值（符号数字、超长数字段、非 ASCII）回退到较慢的 collator；
  100k 全中文文本排序仍可能接近预算，T2.7 复核。
- 复制视图会复制当前筛选/排序，用户可能需要在副本中再修改；标题后缀是数据字符串，
  不随 UI 语言本地化。
- 查询 Worker 缓存最多 4 张表；切换更多表会淘汰最早的表，再次查询需要重新克隆。
- 视图状态保存是 manifest 写入，频繁拖动列宽/连续点击排序会产生多次写盘；T5.3 的自动保存
  队列需要统一，不能并存两条写盘路径。
- 粘贴载荷新增可选字段，属于公共 API 变更；旧调用省略 `rowIds` 时保持 T2.4 的保守行为
  （筛选视图整批拒绝）。
- 无查询进度百分比；Worker 取消以“作废旧请求/忽略响应”为主，长任务本身仍是同步的。

## 影响

- `@curve/table-engine` 新增 `query.ts`（12 操作符、all/any、排序、校验、自然键快速路径）、
  `query-protocol.ts`（sync/query 消息与守卫），并导出 `queryRowIds`/`applyFilter`/`applySort`/
  `validateFilterPredicate`/`validateSortSpecs`/`QUERY_WORKER_ROW_THRESHOLD`。
- `@curve/domain` 新增 `MAX_SORT_LEVELS = 3`，`tableViewStateSchema.sort` 限制最多 3 层。
- `@curve/app-core` 新增 `validation/filter-builder.ts`、`validation/view-state.ts`、
  `commands/view-copy.ts`、`WorkspaceActions.duplicateView`；`view.create/update` 现在校验
  筛选/排序/隐藏列；`table.paste` 支持 `rowIds/viewId` 并做 stale/可见行检查。
- `apps/desktop` 新增 `renderer/query/{client,handler}`、`workers/query.worker.ts`、
  `features/filter/FilterDialog`、`features/grid/{grid-sort,use-view-rows}`；DataGrid/GridHeader/
  ColumnsPanel/TabBar/WorkspaceView/i18n/CSS 同步；`e2e/filter.spec.ts` 6 条。
- `scripts/bench.ts` 新增 query suite。
- 不新增运行时依赖；不新增 IPC 通道；不改变 `formatVersion`、JSONL 形态、CSP、沙箱或
  preload 白名单。

## 复核条件

- T2.7：100k 文本/中文排序、Worker 克隆耗时、内存峰值与 400ms 门禁；必要时把自然键/排序
  进一步下沉或改用更快的比较策略。
- T3.2/T3.5：条件格式与筛选共用 `FilterPredicate`；若条件格式需要跨列/嵌套 UI，重新评估
  本文的单层筛选对话框限制。
- T5.2：把视图变更纳入全命令历史时，必须决定是否记录 `view.update`、如何合并连续列宽/排序
  操作，并保持当前立即写 manifest 的行为不回退。
- T5.3：自动保存统一后，视图状态与行数据必须共用同一保存队列；不得出现两条写盘路径。
- 若未来需要“只改可见行”的粘贴扩展到列隐藏/视图级列顺序，重新评估 `columnIds` 语义并写新 ADR。
