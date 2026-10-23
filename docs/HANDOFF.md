# HANDOFF — Curve Studio 实施交接

> 本文件面向**下一个实现会话**。当前会话已完成 `T2.7`（10 万行性能硬化）并执行了
> **M2 验收演示**，按用户要求停在验收确认前。最后更新：2026-10-23 ·
> `T2.7` 代码提交 **`553f71b`** · M2 验收提交 **`8ed6c2b`** · 分支 `main` · 工作树干净。
> 阅读顺序：`AGENTS.md` → 本文件 → `docs/reports/m2/REPORT.md` →
> `docs/TASKS.md` 的 M2 / T2.7 → `docs/TESTPLAN.md` §5、§3、§4 →
> `docs/SPEC.md` §16.1、§9.5、§9.3、§13.3 →
> `docs/adr/033-t27-performance-gates.md`（T2.7）与 ADR-032（T2.6）。

---

## 0. 一页摘要（给下一个会话）

- **当前状态**：`T2.7`（10 万行性能硬化）已完成并提交；**M2 验收演示已执行并提交**
  （`8ed6c2b`；`apps/desktop/e2e/m2-acceptance.spec.ts` + `docs/reports/m2/REPORT.md`），
  **等待用户验收**；确认前不要开始 T3.x。
- **本次交付**：T2.7 的 bench/E2E/热路径优化（见 §5C）＋ M2 单条端到端验收
  （新建表 → 粘贴 200 行 → 导入 100k GBK CSV（3 坏行）→ 筛选/3 级排序 → 列宽/冻结 →
  退出并重启 Electron → 界面/磁盘还原 + 性能预算）；`e2e/fixtures.ts` 新增
  `launchCurveApp()`（同一 `userData` 重启，仅测试代码）；M2 报告与 4 张证据截图。
- **基线**：`pnpm verify` **123 files / 978 tests**；coverage lines **74.99%**；
  `format:check` 通过；`pnpm build` exit 0；`pnpm e2e` **64 passed**（含 M2 1 条）；
  `pnpm bench` **exit 0**。M2 实测：导入 **824ms**、100k 打开 **624ms**、
  筛选 **19ms**、排序 **63ms**、重启查询 **95ms**、内存峰值 **497MB**、冷启动 **951ms**。
- **硬约束**：不绕过命令总线；不新增未写 ADR 的运行时依赖；不改 `formatVersion`/IPC/公共 API
  而不更新 SPEC/ADR；不跳过验收项；不自动跨任务/里程碑。
- **停点**：M2 验收报告已输出；**等用户验收**，不进入 T3.x。

---

## 1. 当前进度快照

| 项 | 状态 |
|---|---|
| 方案文档 | v1.0 已锁定（SPEC / TASKS / TESTPLAN / DECISIONS） |
| M0 基建（T0.1–T0.5） | **已完成**；验收报告 `docs/reports/m0/REPORT.md` |
| M1 领域与持久化（T1.1–T1.5） | **已完成并经用户验收**（2026-10-21）；报告 `docs/reports/m1/REPORT.md` |
| `T1.5` app-core 状态与命令总线 | **已完成**（`c077cf2`）；T2.1–T2.7 扩展了命令、actions、历史与保存 |
| `T2.1` 工作区入口、表管理与网格 | **已完成**（`07c4763`）；报告 `docs/reports/t2.1/REPORT.md`；ADR-027 |
| `T2.2` 单元格编辑与校验 | **已完成**（`641cd86`）；报告 `docs/reports/t2.2/REPORT.md`；ADR-028 |
| `T2.3` 列管理、结构变更与迁移 | **已完成**（`213fab4`）；报告 `docs/reports/t2.3/REPORT.md`；ADR-029 |
| `T2.4` 区域粘贴 | **已完成**（`14c4816`）；报告 `docs/reports/t2.4/REPORT.md`；ADR-030 |
| `T2.5` CSV/JSON 导入向导 | **已完成**（`16ba035`）；报告 `docs/reports/t2.5/REPORT.md`；ADR-031 |
| `T2.6` 筛选、排序与视图状态 | **已完成**（`1149100`）；报告 `docs/reports/t2.6/REPORT.md`；ADR-032 |
| `T2.7` 10 万行性能硬化 | **已完成**（`553f71b`）；报告 `docs/reports/t2.7/REPORT.md`；ADR-033 |
| M2 验收演示 | **已执行并提交**（2026-10-23，`8ed6c2b`）；`e2e/m2-acceptance.spec.ts` + `docs/reports/m2/REPORT.md`；**等待用户验收** |
| 当前里程碑 | **M2 表格数据**：T2.1–T2.7 全部完成，**验收演示已执行，等待用户验收** |
| 下一步 | **等待用户验收 M2**；确认前不要开始 T3.x，也不要自动推进 |
| `pnpm verify` 基线 | **123 files / 978 tests**；ESLint 0；depcruise **345 modules / 1326 deps / 0 violations** |
| `pnpm test:coverage` 基线 | 全局 lines **74.99%** / statements **74.88%** / branches **67.02%** / functions **75.91%**；阈值 70/60 未下调 |
| `pnpm e2e` 基线 | **64 passed**（60 + `perf.spec.ts` 3 + M2 验收 1），约 2.6min |
| `pnpm bench` 基线 | **exit 0**；open 553ms/3s、save 409ms/500ms、edit 0ms/50ms、query 191ms/400ms、text-sort 249ms/400ms、cjk-sort 661ms/800ms、import 685ms/8s |
| `pnpm format:check` | 通过 |
| 构建 | `pnpm build` exit 0；renderer **1,415.85 kB** + 懒加载 ImportSession 42.82 kB；Worker `assets/{table,import,query}.worker-<hash>.js` |
| 夹具 | `fixtures/workspaces/{v1-min,corrupt-manifest,future-version,stale-lock}/`；`fixtures/csv/{small,quoted,types,bad-rows}.csv`；`fixtures/json/points.json`；`fixtures/csv/gbk-100k.csv` 与 `bench/.fixtures/100k-workspace/` 由脚本生成、gitignore |

**用户明确要求**：

- 一次只做一个任务；每个任务先复述目标/产出/验收，再写测试、实现、跑 `pnpm verify` 与任务指定
  e2e/bench，最后勾选 TASKS、更新 CHANGELOG、必要时 ADR、Conventional Commit。
- **T2.7 已完成并已提交**；**M2 验收演示已执行并输出报告**，等待用户验收。
- 不得跨里程碑；M2 验收报告已输出，停下等用户确认，不进入 T3.x。

---

## 2. 新会话开场提示词（可直接粘贴）

```text
工作目录：D:\DSH_Work_Space\curve-studio（仓库根）。

先读 AGENTS.md、docs/HANDOFF.md、docs/reports/m2/REPORT.md、
docs/TASKS.md 的 M2 与 T2.7、docs/reports/t2.7/REPORT.md、
docs/TESTPLAN.md §5/§3/§4、docs/SPEC.md §16.1/§9.5/§9.3/§13.3、ADR-033 与 ADR-032。

现状：M0、M1（已验收）、T1.1–T1.5、T2.1–T2.7 已完成；M2 验收演示已执行
（apps/desktop/e2e/m2-acceptance.spec.ts + docs/reports/m2/REPORT.md），
pnpm verify 123 files / 978 tests、coverage lines 74.99%、pnpm e2e 64 passed、
pnpm bench exit 0 全绿；等待用户验收。

下一步：等待用户对 M2 验收确认；确认前不要开始 T3.x。
若用户明确接受 M2 并授权进入 T3.1，先按 AGENTS §8 复述目标/产出/验收再开工。
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

### 3.5 文本编码与路径陷阱

- DSH 的 shell 是 **Windows PowerShell 5.1**：`Get-Content` 默认按 GBK 解码无 BOM 的 UTF-8 文件；
  `Set-Content -Encoding UTF8` 会写入 BOM。源码与文档一律用 `read`/`write`/`edit` 工具修改。
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
- 全量 E2E 若偶发 `grid.spec.ts` 的 `Control+End` 或 `edit.spec.ts` 的 F2 编辑器超时：先单跑确认；
  T2.4 已修复虚拟行未挂载时焦点丢失（100ms 安全重试，编辑器打开时不抢焦点），当前全量 63 passed。
  不要放宽超时或删除断言。
- Vitest 过滤用 `--testNamePattern`，不要用 `-- --grep`。
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
- T2.6 的筛选/排序 E2E 依赖网格上的 `data-query-mode`/`data-query-busy`/`data-query-ms`/
  `data-visible-rows` 属性断言 Worker 完成与预算；不要移除这些属性。
- T2.6 的 text sort bench 使用打乱后的 100k 文本主键；若机器繁忙 P95 可能接近 400ms，
  先确认 CPU 后重跑，不放宽预算。
- **T2.7 的 bench 每个 suite 独立子进程**（`process.execPath --expose-gc --import tsx ...`），
  结果写到 `bench/.tmp/suite-<name>.json` 再由父进程汇总；不要把多个 suite 塞回一个进程，
  否则后跑的 `query.text-sort.100k` 会被前序堆状态顶到 400ms 以上。
- `pnpm e2e` 会先执行 `tsx scripts/gen-100k.ts --workspace bench/.fixtures/100k-workspace`
  生成 100k×10 夹具（约 15MB，gitignore）；`perf.spec.ts` 把它复制到 `testInfo.outputPath` 再打开。
  单独跑 perf spec 前必须先执行该生成命令。
- `perf.spec.ts` 的内存门禁用 `app.getAppMetrics().memory.privateBytes`（不含 GPU）；
  `workingSetSize` 会重复计算共享页，只作诊断。当前峰值 574MB/600MB，余量约 4%。
- `pnpm bench` 的 `memoryPeakMB` 是 Node 管线 RSS 趋势（约 900MB），**不是**应用内存门禁；
  600MB 只由 E2E 判定。
- `bench/baseline.json` 需由 CI Windows runner 的 `pnpm bench -- --write-baseline` 生成后提交；
  缺失时报告 `baseline: "missing"` 并打印 `::notice`，回归比较跳过。损坏的基线直接让 bench 失败。

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

`IMPLEMENTED_IPC_CHANNELS` 共 **14** 个：`app:info`、`dialog:pickDirectory`、`log:write`、
`workspace:create/open/close/recent`、`manifest:write`、`table:read/write/trash`、
`file:importText`、`file:exportText`、`file:archiveImport`。

- `dialog:saveFile` / `backup:*` / `workspace:recent:remove|clear` 仍只有通道名。
- `file:importText` 返回 `{ token, name, bytes, sha256, size, format }`（原始字节，供 Worker 解码）；
  `file:archiveImport` 只用 token 对应的已选路径，把原文复制/记录到 `imports/`。
- `apps/desktop/src/renderer/api-client.ts` 提供 `app`、`dialog`、`workspace`、`manifest`、`table`、
  `file`，所有方法返回 `IpcResult<T>`，入参与响应双向 Zod 校验。
- `table:write` 写盘前校验 200k 行 / 256MB 上限；导入保存仍走该通道（256MB 在保存时强制）。
- T2.5 新增 3 个已实现通道（`ALL_IPC_CHANNELS` 18 → 19）。

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
  （表 → manifest）；纯 schema 命令只写 manifest。
- 保存失败返回 `{ ok: false, error, committed: true }`：内存已变更，UI 关闭对话框，状态栏/Toast 重试。
- `EditHistory` 记录 `table.cell.set`、`table.paste` 与 `table.import`；粘贴/导入各一条、不合并；
  撤销回滚新增行/列与覆盖单元格。
- 结构命令仍不进入最小历史；T5.2 统一。
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
├─ features/columns/            # T2.3：ColumnsPanel/ColumnFormDialog/ColumnChangeDialog
├─ features/paste/              # T2.4：PasteColumnsDialog/PasteErrorDialog/PasteProgressDialog
│  ├─ use-paste.tsx             # idle→preparing→columns/errors/applying；T2.6 传 rowIds
│  └─ paste-issue-text.ts
├─ features/import/             # T2.5：ImportWizardDialog/use-import/import-error-csv
│  └─ ImportSession.tsx          # 懒加载入口；避免进入初始 TableList chunk
├─ import/                      # T2.5：encoding/client/worker-protocol/worker-handler
├─ query/                       # T2.6：query Worker client/handler（缓存/增量/守卫）
├─ workers/{import,query}.worker.ts  # T2.5/T2.6 专用 Worker
├─ features/charts/ChartPlaceholder.tsx  # T2.3 图表无效占位（T3.1 替换）
├─ shell/                       # AppShell/TitleBar/Sidebar/Inspector/StatusBar/HelpDialog
├─ i18n/messages/{zh-CN,en-US}.ts
```

- `DataGrid` 监听 `onPaste`，读 `text/plain`；编辑器打开/事件源是可编辑控件时走原生粘贴。
  锚点为选择矩形左上角；`locate` prop 让网格滚动并临时高亮第一个错误。
- `WorkspaceView` 渲染 `paste.dialogs`；`onLocate` 把错误行/列传给 `DataGrid`。
- 所有文案走消息表；`apps/desktop/test/ui-conventions.test.ts` 会拦硬编码中文/颜色字面量/未声明令牌。

### 4.8 E2E 证据

`apps/desktop/e2e/paste.spec.ts` 7 条：5×4 引号/内嵌换行 + 重开；类型错误 + 定位 + 磁盘不变；
超列确认 + 新增列 + 重开；10k/100k 格取消 + 磁盘不变；撤销/重做；筛选守卫；200% 缩放键盘可达。

T2.5 新增 `apps/desktop/e2e/import.spec.ts` 6 条：100k GBK 分号 + 3 坏行 + 错误 CSV；错编码
覆盖；150k 取消/100k 提示；JSON 替换 + 备份 + 原文归档 + 撤销；200k 拒绝；200% 缩放键盘。

完整 E2E 现为 **64 passed**；T2.1 的 `grid.spec.ts`、T2.2 的 `edit.spec.ts`、T2.3 的
`schema.spec.ts`、T2.4 的 `paste.spec.ts`、T2.5 的 `import.spec.ts`、T2.6 的
`filter.spec.ts`、T2.7 的 `perf.spec.ts`、M2 的 `m2-acceptance.spec.ts` 与既有
shell/ipc/smoke/workspace/table-io 仍全绿。

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
100k 打开 624ms、筛选 19ms、排序 63ms、内存 497MB；报告 `docs/reports/m2/REPORT.md`。

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
11. `table.import` 一条撤销，不合并；100k 逆补丁内存留 T5.2；
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
- 100k 导入逆补丁内存未计 256MB 字节上限；T5.2 统一。
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
- 视图状态连续拖动列宽/快速排序会多次写 manifest；T5.3 统一保存队列。
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
- `EditHistory` 的整数组撤销补丁每个 100k 行编辑多约 800KB；T5.2 统一历史时评估。
- bench `memoryPeakMB`（约 900MB RSS）是 Node 管线趋势，不是应用内存门禁。
- 10 万级粘贴/导入命令阶段仍同步（未纳入 T2.7 预算；T2.7 未改命令阶段）。
- M2 验收演示已执行（2026-10-23），报告 `docs/reports/m2/REPORT.md`；等待用户验收。

---

## 6. M2 验收演示（已执行，等待用户验收）

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
- 重启会出现一次 stale lock 提示（T5.3 已后置完整恢复交互）；测试 dismiss 并记录，不作为失败。
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

**验收待用户确认**：用户接受 M2 后，再把 TASKS M2 注记更新为“获用户接受”，并按 AGENTS §8
复述 T3.1 后再开工；若用户要求修改，回到对应 T2.x 修复，不进入 T3.x。

**停点：等待用户验收 M2；确认前不要开始 T3.x。**

---

## 7. 已知风险与处理

| 风险 | 影响 | 处理 |
|---|---|---|
| 会话策略回到 `workspace-write` | `verify`/E2E 报 EPERM | 切 `danger-full-access`，不改项目配置 |
| Windows 无 symlink 权限 | `pnpm install` 失败 | 按 §3.4 用 junction 补齐；不要删 node_modules/切 linker |
| 全量 E2E 偶发 grid/edit 键盘超时 | 全量非零 | 单跑确认；T2.4 已修复焦点丢失；不放宽超时/不删断言 |
| 外部程序占满 CPU（如游戏/聊天工具） | verify 5s 超时、100k grid 首帧 >1s | 先确认 CPU（`Get-Counter '\Processor(_Total)\% Processor Time'`）；暂停外部程序后重跑，不改预算 |
| 100k 行结构变更同步执行 | UI 短暂无响应 | T2.3 已记录；未纳入 T2.7 预算，后续按需 Worker 化 |
| 10 万级粘贴命令阶段同步 | UI 可能短暂无响应 | T2.4 10k 实测远低于预算；T2.7 未改命令阶段 |
| 10 万级导入命令阶段同步 | 提交时短暂占用主线程 | T2.5/T2.7 bench 核心管线 P95 878ms（8s 预算）；命令阶段仍同步 |
| 导入后 100k 逆补丁 | 撤销栈内存 | T2.5 仅记录；T5.2 统一 256MB 上限 |
| >50MB 原文只记 sidecar | 原文件路径可能失效 | SPEC §9.4 允许；路径 + SHA-256 可审计 |
| 导入错误 CSV 按坏行聚合 | 机器消费需拆字段 | 文档已记录；UI 仍显示逐 issue |
| 筛选视图粘贴整批拒绝 | 已由 T2.6 闭环 | 只写可见行/超出整批拒绝/stale 检查；见 ADR-032 |
| 100k 文本排序接近 400ms | bench 波动可能超预算 | T2.7 已预计算排序键/类型数组，ASCII 253ms；中文仍 698ms/800ms |
| query Worker 缓存最多 4 张表 | 切换更多表会重新克隆 | 记录于 ADR-032；T2.7 未改淘汰策略 |
| 100k 首次 Worker 快照克隆 | 首次筛选/排序有额外延迟 | 不计入 `data-query-ms`；E2E `data-query-total-ms` 实测 448–490ms |
| 整应用内存 497MB/600MB（M2 实测；T2.7 为 570MB） | CI runner 更慢/更碎片化时可能超 | 余量约 17%；超了先查是否 E2E 探针/噪声，不改预算 |
| bench 基线未提交 | 20% 回归告警不触发 | CI Windows runner 跑 `pnpm bench -- --write-baseline` 后提交 `bench/baseline.json` |
| 100k 行撤销补丁变大 | 历史内存 | T2.7 的整数组 patch 每个编辑约 800KB；T5.2 统一历史时评估 |
| 视图状态连续写 manifest | 拖动列宽/快速排序多次写盘 | T5.3 统一保存队列后合并 |
| Playwright 合成快速拖动列宽 | 最后一步与 `pointerup` 提交可能差一步 | M2 验收用 `dblclick` autofit 提交确定值；T5.3 统一保存队列时复核 |
| 筛选对话框只支持单层 | 嵌套谓词只读 | ADR-032；如需嵌套 UI 另写 ADR |
| 结构变更不可撤销 | 误操作需手工恢复 | 确认框 + 磁盘备份；T5.2 统一历史 |
| 图表/样式悬空引用 | 图表错误占位；样式求值忽略 | T3.1 重映射；T4.x 样式求值处理 |
| 保存失败但内存已变更 | `committed: true` | UI 关闭对话框，状态栏/Toast 重试；不重复执行 |
| 自动保存 1.5s 仍未实现 | 每次编辑/结构变更立即写 | T5.3 合并队列，不能并存两条写盘路径 |
| `openWorkspace` 表读取失败不 close | 残留 `.lock` | T5.3 补 close-on-failure |
| E2E 截图重写 | 工作树变脏 | 提交前还原 `docs/reports/m0/*.png` |
| 覆盖率 74.99% | 新增 UI 主要由 E2E 覆盖 | 阈值 70/60 满足；M2 报告记录实测 |
| renderer bundle 约 1.42MB（+ 42.82 kB 懒加载） | 启动/内存 | T6.4 打包阶段评估拆包/压缩 |

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
- 不在 M2 验收里顺手实现 T3.x 的图表或 T5.x 的自动保存/恢复；不把 10 万行整体放进 React state。
- 不自动跨任务/跨里程碑；M2 验收演示已执行并输出报告，等待用户验收，不进入 T3.x。

---

## 9. 新会话启动检查清单

- [ ] `git status --short` 干净；`git log --oneline -3` 顶部为 M2 验收提交 **`8ed6c2b`**（报告 `docs/reports/m2/REPORT.md`）。
- [ ] 已注入 PATH（§3.1），`pnpm --version` 为 11.28.5。
- [ ] 会话文件策略为 `danger-full-access`（§3.2）；审批提示关闭。
- [ ] 已读 `AGENTS.md`、本文件、TASKS 的 M2、`docs/reports/m2/REPORT.md`、
      TESTPLAN §5/§3/§4、SPEC §16.1/§9.5/§9.3/§13.3、ADR-033 与 ADR-032。
- [ ] 已确认 `pnpm verify` 基线（123 files / 978 tests）、coverage lines 74.99%、
      e2e 64 passed、bench exit 0。
- [ ] 已确认 `apps/desktop/node_modules/electron/dist/electron.exe` 存在。
- [ ] 已清除 `ELECTRON_RUN_AS_NODE`；跑 E2E 前再设 `CURVE_E2E_NO_SANDBOX=1`。
- [ ] 已确认 M2 验收演示已执行并输出报告，**等待用户验收**；不要自行进入 T3.x。
- [ ] 已确认 T2.4–T2.7 的粘贴/导入/筛选/保存/撤销/性能门禁语义；不绕过命令总线或另起写盘路径。
- [ ] 已确认 E2E 写盘断言使用 `expect.poll`，截图提交前还原。
- [ ] 用户接受 M2 并明确授权 T3.1 后，先按 AGENTS §8 复述再开工；未授权则停在验收。
