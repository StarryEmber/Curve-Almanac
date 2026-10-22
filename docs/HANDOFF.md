# HANDOFF — Curve Studio 实施交接

> 本文件面向**下一个实现会话**。当前会话已完成 `T2.4`（区域粘贴），按用户要求停止，`T2.5` 尚未开始。
> 最后更新：2026-10-22 · `T2.4` 提交见 `git log -1`（本次代码+文档提交）· 分支 `main` · 工作树在提交前应干净。
> 阅读顺序：`AGENTS.md` → 本文件 → `docs/TASKS.md` 的 T2.5 →
> `docs/TESTPLAN.md` §1、§2、§3（E3/E4）、§4、§5 →
> `docs/SPEC.md` §9.4、§8.1、§13.1、§16.1 →
> `docs/DECISIONS.md` 的 ADR-005/006/007/014/024，再读 ADR-028/029/030。

---

## 0. 一页摘要（给下一个会话）

- **当前状态**：`T2.4`（区域粘贴）已完成并提交；`T2.5`（CSV/JSON 导入向导）未开始；M2 仍在进行，
  M2 验收演示要等 T2.5–T2.7 全部完成。
- **本次交付**：TSV/CSV 剪贴板解析器；选择矩形左上角锚点的矩阵粘贴；`table.paste` 原子命令；
  `table.rows.insert` 与空 text 主键生成；超列“新增 N 列”确认（默认 text、非必填）；整批预检/
  前 100 条错误/定位首错；≥10k 可取消进度；粘贴一次撤销；保存队列 flush ≤3s；筛选存在时保守
  整批拒绝（完整可见行语义显式延后 T2.6）。
- **基线**：`pnpm verify` **99 files / 813 tests**；coverage lines **76.34%**；`format:check` 通过；
  `pnpm build` exit 0（renderer **1,308.67 kB**）；`pnpm e2e` **48 passed**；`e2e/paste.spec.ts` **7 passed**。
- **下一步**：先读 TASKS T2.5、SPEC §9.4 与 TESTPLAN E4，按 AGENTS §11 逐项确认导入向导的歧义，
  **不要自行选定**；确认后复述目标/文件/验收命令，再写测试与实现。
- **硬约束**：不绕过命令总线；不新增未写 ADR 的运行时依赖；不改 `formatVersion`/IPC/公共 API；
  不跳过验收项；不自动跨任务。
- **停点**：T2.5 尚未开始；完成 T2.5 后仍需停下报告，不自动进入 T2.6。

---

## 1. 当前进度快照

| 项 | 状态 |
|---|---|
| 方案文档 | v1.0 已锁定（SPEC / TASKS / TESTPLAN / DECISIONS） |
| M0 基建（T0.1–T0.5） | **已完成**；验收报告 `docs/reports/m0/REPORT.md` |
| M1 领域与持久化（T1.1–T1.5） | **已完成并经用户验收**（2026-10-21）；报告 `docs/reports/m1/REPORT.md` |
| `T1.5` app-core 状态与命令总线 | **已完成**（`c077cf2`）；T2.1–T2.4 扩展了命令、actions、历史与保存 |
| `T2.1` 工作区入口、表管理与网格 | **已完成**（`07c4763`）；报告 `docs/reports/t2.1/REPORT.md`；ADR-027 |
| `T2.2` 单元格编辑与校验 | **已完成**（`641cd86`）；报告 `docs/reports/t2.2/REPORT.md`；ADR-028 |
| `T2.3` 列管理、结构变更与迁移 | **已完成**（`213fab4`）；报告 `docs/reports/t2.3/REPORT.md`；ADR-029 |
| `T2.4` 区域粘贴 | **已完成**（提交见 `git log -1`）；报告 `docs/reports/t2.4/REPORT.md`；ADR-030 |
| 当前里程碑 | **M2 表格数据进行中**（T2.1–T2.4 完成，T2.5–T2.7 未开始） |
| 下一个任务 | **T2.5 CSV/JSON 导入向导**；开工前必须按 AGENTS §11 确认歧义，不要自行选定 |
| `pnpm verify` 基线 | **99 files / 813 tests**；ESLint 0；depcruise **286 modules / 1073 deps / 0 violations** |
| `pnpm test:coverage` 基线 | 全局 lines **76.34%** / statements **76.17%** / branches **68.45%** / functions **77.92%**；阈值 70/60 未下调 |
| `pnpm e2e` 基线 | **48 passed**（41 + T2.4 `e2e/paste.spec.ts` 7 条），约 1.5min |
| `pnpm format:check` | 通过 |
| 构建 | `pnpm build` exit 0；renderer **1,308.67 kB**；Worker `assets/table.worker-<hash>.js` |
| 夹具 | `fixtures/workspaces/{v1-min,corrupt-manifest,future-version,stale-lock}/`（T1.4）；T2.4 未新增格式夹具 |

**用户明确要求**：

- 一次只做一个任务；每个任务先复述目标/产出/验收，再写测试、实现、跑 `pnpm verify` 与任务指定
  e2e/bench，最后勾选 TASKS、更新 CHANGELOG、必要时 ADR、Conventional Commit。
- **T2.4 已完成**；**T2.5 尚未开始**，开工前先确认歧义，不要自行选定。
- M2 全部任务完成后再运行 M2 验收演示，不得跨里程碑。

---

## 2. 新会话开场提示词（可直接粘贴）

```text
工作目录：D:\DSH_Work_Space\curve-studio（仓库根）。

先读 AGENTS.md、docs/HANDOFF.md、docs/TASKS.md 的 T2.5、
docs/TESTPLAN.md §1/§2/§3（E3/E4）/§4/§5、
docs/SPEC.md §9.4/§8.1/§13.1/§16.1、
docs/DECISIONS.md 的 ADR-005/006/007/014/024，再读 ADR-028/029/030。

现状：M0、M1（已验收）、T1.1–T1.5、T2.1–T2.4 已完成；T2.4 提交见 git log -1，工作树应干净；
pnpm verify 99 files / 813 tests、test:coverage 全局 lines 76.34%、format:check、
pnpm e2e 48 passed 全绿。T2.4 报告见 docs/reports/t2.4/REPORT.md，决策见 ADR-030。

下一步是 T2.5（CSV/JSON 导入向导），但不要直接开工：
先按 AGENTS §11 逐项确认导入向导的待定决策（编码/分隔符/表头覆盖、列映射与类型推断、
坏行跳过/取消、替换前备份、Worker/取消、200k 上限、保存时机、撤销、夹具与性能），不要自行选定；
确认后先复述目标/文件/验收命令，再写测试与实现。

不要自动进入 T2.6；T2.5 完成后停下等确认。
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
T2.1–T2.4 全程 `danger-full-access`，审批提示已关闭——**不要使用 `sandbox_permissions` 参数**。
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

T2.2–T2.4 未新增依赖。若 T2.5 需要新依赖（Papa Parse、jschardet、iconv-lite 等），先按 AGENTS §4
写 ADR；能复用已有依赖就不要新增。

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
  T2.4 已修复虚拟行未挂载时焦点丢失（100ms 安全重试，编辑器打开时不抢焦点），当前全量 48 passed。
  不要放宽超时或删除断言。
- Vitest 过滤用 `--testNamePattern`，不要用 `-- --grep`。
- E2E 在 UI 更新后等 manifest/JSONL 落盘时使用 `expect.poll`；新增编辑/保存测试也要这样等
  磁盘，不要直接读文件后立刻断言（渲染状态先于异步写盘）。
- E2E 粘贴用 `page.evaluate` 派发带 `DataTransfer` 的合成 `ClipboardEvent`（`e2e/paste.spec.ts`
  的 `pasteText`），不依赖 OS 剪贴板；10k 取消用例通过临时放慢页面 `setTimeout(0)` 制造确定
  的可取消窗口，不修改生产代码。
- 结构变更保存：行数据命令走保存队列（表 → manifest），纯 schema 命令只写 manifest；E2E 断言前用
  `expect.poll` 读 manifest。
- E2E 截图证据字节不稳定；断言不依赖像素。
- Worker 产物名现在是 `assets/table.worker-<hash>.js`（不是 T1.3 的 `table-worker-*.js`）。

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
- T2.5 可复用 `parseClipboardText` 的引号/换行处理思路，但导入向导的编码/分隔符嗅探/表头仍是
  独立实现；不要把粘贴解析器硬套到文件导入。

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

`IMPLEMENTED_IPC_CHANNELS` 共 **11** 个：`app:info`、`dialog:pickDirectory`、`log:write`、
`workspace:create/open/close/recent`、`manifest:write`、`table:read/write/trash`。

- `dialog:saveFile` / `file:*` / `backup:*` / `workspace:recent:remove|clear` 仍只有通道名。
- `apps/desktop/src/renderer/api-client.ts` 提供 `app`、`dialog`、`workspace`、`manifest`、`table`，
  所有方法返回 `IpcResult<T>`，入参与响应双向 Zod 校验。
- `table:write` 写盘前校验 200k 行 / 256MB 上限；T2.4 的批量写入仍走该通道（256MB 在保存时强制）。
- T2.4 未新增 IPC。

### 4.6 `@curve/app-core`（T1.5 + T2.1 + T2.2 + T2.3 + T2.4）

```ts
createAppCore({ workspaceStore, logger?, now?, uuid?, decodeTable?, encodeTable? }): {
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

`WorkspaceActions`（T2.4 新增部分）：

```ts
preparePaste(request, options?): Promise<PastePrepareOutcome>;
applyPaste(request): Promise<PasteApplyOutcome>;
```

- 行数据命令（`table.cell.set`/`table.paste`/`table.rows.insert`）走保存队列（表 → manifest）；
  纯 schema 命令只写 manifest。
- 保存失败返回 `{ ok: false, error, committed: true }`：内存已变更，UI 关闭对话框，状态栏/Toast 重试。
- `EditHistory` 记录 `table.cell.set` 与 `table.paste`；粘贴一次一条、不合并；撤销回滚新增行/列。
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
│  └─ use-cell-editing.ts
├─ features/columns/            # T2.3：ColumnsPanel/ColumnFormDialog/ColumnChangeDialog
├─ features/paste/              # T2.4：PasteColumnsDialog/PasteErrorDialog/PasteProgressDialog
│  ├─ use-paste.tsx             # idle→preparing→columns/errors/applying
│  └─ paste-issue-text.ts
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

完整 E2E 现为 **48 passed**；T2.1 的 `grid.spec.ts`、T2.2 的 `edit.spec.ts`、T2.3 的 `schema.spec.ts`
与既有 30 条仍全绿。

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
- 10 万级矩阵命令阶段仍同步；T2.7 评估 Worker/硬门禁。
- 256MB 写盘上限在保存时强制（`committed: true`），未在 dispatch 前编码整表。
- 隐藏列/视图级列顺序的完整映射依赖 T2.6；T2.4 只处理传入的可见列顺序。
- 新增列不支持 enum 等需要额外选项的类型，仍走 T2.3 列面板。

---

## 6. T2.5 开工前必须做的事（不要自行选定）

T2.5 尚未分析。开工前：

1. 读 `docs/TASKS.md` T2.5、`docs/SPEC.md §9.4`、`docs/TESTPLAN.md` E4/§4/§5、`docs/DECISIONS.md`
   的 ADR-005/006/007/014/024 与 ADR-028/029/030。
2. 按 AGENTS §11 逐项向用户确认至少以下歧义（读代码后给出具体选项与推荐）：
   - 编码/分隔符/表头嗅探与手动覆盖；GBK 失败提示与重试。
   - 列映射：已有列 vs 新建列；类型推断置信度；可编辑映射 UI。
   - 坏行：跳过/取消/导出错误 CSV；预览 20 行与统计口径。
   - 追加 vs 替换；替换前备份、原始文件副本与哈希。
   - Worker/取消：100k 行解析的进度、取消后内存/磁盘不变。
   - 200k 行上限、100k–200k 提示、`table:write` 256MB。
   - 保存时机（表 → manifest）、是否进入最小历史、T5.2 统一。
   - 夹具：`fixtures/csv/*` 生成器与提交策略；`pnpm bench --import`。
3. 确认后先复述目标/文件/验收命令，再写测试与实现。
4. 完成后停下报告，**不要自动进入 T2.6**。

建议验证命令（开工后按 TASKS T2.5 调整）：

```powershell
pnpm exec vitest run packages/table-engine packages/app-core --testNamePattern "import"
pnpm verify
pnpm test:coverage
pnpm format:check
$env:CURVE_E2E_NO_SANDBOX = '1'
pnpm build
pnpm exec playwright test --config apps/desktop/playwright.config.ts --grep "import"
pnpm e2e
```

---

## 7. 已知风险与处理

| 风险 | 影响 | 处理 |
|---|---|---|
| 会话策略回到 `workspace-write` | `verify`/E2E 报 EPERM | 切 `danger-full-access`，不改项目配置 |
| Windows 无 symlink 权限 | `pnpm install` 失败 | 按 §3.4 用 junction 补齐；不要删 node_modules/切 linker |
| 全量 E2E 偶发 grid/edit 键盘超时 | 全量非零 | 单跑确认；T2.4 已修复焦点丢失；不放宽超时/不删断言 |
| 100k 行结构变更同步执行 | UI 短暂无响应 | T2.3 已记录；T2.7 实测/Worker 化 |
| 10 万级粘贴命令阶段同步 | UI 可能短暂无响应 | T2.4 10k 实测远低于预算；T2.7 复核 |
| 筛选视图粘贴整批拒绝 | T2.6 前体验受限 | ADR-030 显式延后；T2.6 必须闭环 |
| 结构变更不可撤销 | 误操作需手工恢复 | 确认框 + 磁盘备份；T5.2 统一历史 |
| 图表/样式悬空引用 | 图表错误占位；样式求值忽略 | T3.1 重映射；T4.x 样式求值处理 |
| 保存失败但内存已变更 | `committed: true` | UI 关闭对话框，状态栏/Toast 重试；不重复执行 |
| 重排覆盖视图自定义顺序 | T2.6 视图级重排冲突 | T2.6 写新 ADR/调整语义 |
| 自动保存 1.5s 仍未实现 | 每次编辑/结构变更立即写 | T5.3 合并队列，不能并存两条写盘路径 |
| `openWorkspace` 表读取失败不 close | 残留 `.lock` | T5.3 补 close-on-failure |
| E2E 截图重写 | 工作树变脏 | 提交前还原 `docs/reports/m0/*.png` |
| 覆盖率 76.34% | 新增 UI 主要由 E2E 覆盖 | 阈值 70/60 满足；M2 报告给趋势 |
| renderer bundle 约 1.31MB | 启动/内存 | T6.4 打包阶段评估拆包/压缩 |

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
- 不在 T2.5 顺手实现 T2.6 的筛选/排序或 T3.x 的图表；不把 10 万行整体放进 React state。
- 不自动跨任务/跨里程碑；T2.5 完成后停下报告，不进入 T2.6。

---

## 9. 新会话启动检查清单

- [ ] `git status --short` 干净；`git log --oneline -3` 顶部为 T2.4 提交。
- [ ] 已注入 PATH（§3.1），`pnpm --version` 为 11.28.5。
- [ ] 会话文件策略为 `danger-full-access`（§3.2）；审批提示关闭。
- [ ] 已读 `AGENTS.md`、本文件、TASKS 的 T2.5、TESTPLAN §1/§2/§3（E3/E4）/§4/§5、
      SPEC §9.4/§8.1/§13.1/§16.1、ADR-005/006/007/014/024、ADR-028/029/030。
- [ ] 已确认 `pnpm verify` 基线（99 files / 813 tests）、coverage lines 76.34%、e2e 48 passed。
- [ ] 已确认 `apps/desktop/node_modules/electron/dist/electron.exe` 存在。
- [ ] 已清除 `ELECTRON_RUN_AS_NODE`；跑 E2E 前再设 `CURVE_E2E_NO_SANDBOX=1`。
- [ ] 已确认 T2.5 尚未开始，**先按 §6 逐项确认决策**，未自行选定。
- [ ] 已确认 T2.4 的粘贴/新增列/新增行/保存语义；T2.5 不得绕过命令总线或另起写盘路径。
- [ ] 已确认 E2E 写盘断言使用 `expect.poll`，截图提交前还原。
- [ ] 复述 T2.5 目标/产出/验收/风险后再动手；完成后停下报告，不进入 T2.6。
