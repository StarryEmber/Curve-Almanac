# HANDOFF — Curve Studio 实施交接

> **更新（2026-10-21，T2.1 会话）**：`T2.1`（工作区入口、表管理与虚拟化数据网格）已完成，报告见
> `docs/reports/t2.1/REPORT.md`，决策记录见 ADR-027。**M2 仍在进行**，下一个任务是 `T2.2`
> （单元格编辑与校验）；开始前需用户确认，不要自动推进。M1 已由用户接受（ADR-026 把崩溃恢复交互
> 后置到 T5.3）。本文其余内容仍是 T1.5 → T2.1 的交接，保留为历史背景。
>
> 本文件面向**下一个实现会话**。上一会话已完成 `T1.5`（app-core 状态与命令总线骨架）。
> 最后更新：2026-10-21 · T1.5 提交：`c077cf2` · 分支：`main` · 工作树：T1.5 提交后干净（本文件单独提交）。
> 阅读顺序：`AGENTS.md` → 本文件 → `docs/TASKS.md` 的 M1 验收与 T2.1 →
> `docs/TESTPLAN.md` §1、§2、§3（E2/E3）、§4、§5 →
> `docs/SPEC.md` §9.0、§9.1、§12、§13.1、§13.2、§15.1、§15.4、§16.1 →
> `docs/DECISIONS.md` 的 ADR-005/006/007/014 → `docs/adr/020`–`025`。

---

## 1. 当前进度快照

| 项 | 状态 |
|---|---|
| 方案文档 | v1.0 已锁定（SPEC / TASKS / TESTPLAN / DECISIONS） |
| M0 基建（T0.1–T0.5） | **已完成**；验收报告 `docs/reports/m0/REPORT.md`（`02afe4b`） |
| `T1.1` 领域模型、Zod 与不变量 | **已完成**（`a58ee20`），domain 行覆盖 97.63% |
| `T1.2` 工作区仓库与原子持久化 | **已完成**（`4b742dd`） |
| `T1.3` 表数据 JSONL 读写与 Worker | **已完成**（`212aa0b`） |
| `T1.4` 迁移框架与夹具 | **已完成**（`3eb306e`），migrations 行覆盖 100% |
| `T1.5` app-core 状态与命令总线骨架 | **已完成**（`c077cf2`）；6 files / 26 tests，app-core 新增代码行覆盖 82–100% |
| `T2.1` 工作区入口、表管理与网格 | **已完成**（2026-10-21，ADR-027）；报告 `docs/reports/t2.1/REPORT.md` |
| 当前里程碑 | **M2 进行中**；下一个任务是 `T2.2`（单元格编辑与校验） |
| 提交历史（近 7 条） | T2.1 提交（见 `git log`）<br>`8559e32 docs(m1): record sign-off and defer crash recovery to T5.3`<br>`228e5ce test(m1): add milestone acceptance demo and report`<br>`fdd6545 docs: add T2.1 implementation handoff`<br>`c077cf2 feat(app-core): add state slices, command bus and workspace.open (T1.5)`<br>`fc54b27 docs: add T1.5 implementation handoff`<br>`3eb306e feat(domain): add migration registry, executor, backups and fixtures (T1.4)` |
| 当前基线 | `pnpm verify` **72 files / 594 tests**；depcruise **220 modules / 737 deps / 0 violations**；`pnpm test:coverage` 全局 lines **81.57%**；`pnpm format:check` 通过 |
| E2E 基线 | **30 passed**（T2.1 新增 `apps/desktop/e2e/grid.spec.ts` 8 条） |
| 夹具 | `fixtures/workspaces/{v1-min,corrupt-manifest,future-version,stale-lock}/`（T1.4） |

**用户明确要求**：一次只做一个任务；每个任务先复述目标/产出/验收，再写测试、实现、跑 `pnpm verify`
与任务指定 e2e/bench，最后勾选 TASKS、更新 CHANGELOG、必要时 ADR、Conventional Commit。
**不要自动进入 T2.2**；T2.1 已完成并报告，T2.2 开工前须获得用户确认。

---

## 2. 新会话开场提示词（可直接粘贴）

```text
工作目录：D:\DSH_Work_Space\curve-studio（仓库根）。

先读 AGENTS.md、docs/HANDOFF.md、docs/TASKS.md 的 M1 验收演示与 T2.1、
docs/TESTPLAN.md §1/§2/§3（E2/E3）/§4/§5、docs/SPEC.md §9.0/§9.1/§12/§13.1/§13.2/§15.1/§15.4/§16.1、
docs/DECISIONS.md 的 ADR-005/006/007/014，再读 ADR-020–ADR-025。

现状：M0、T1.1–T1.5 已完成（T1.5 提交 c077cf2），工作树干净；pnpm verify（66 files / 554 tests）、
pnpm test:coverage（全局 lines 93.51%）、pnpm format:check 全绿；pnpm e2e 最近一次为 22 passed。

下一步不是直接 T2.1：先执行 M1 验收演示（AGENTS §8 / TASKS 的 M1 条目）：
创建 Demo.cstudio → 写 1,000 行 → 关闭重开 → 逐行相等；篡改 manifest → 报错且原文件不变；
伪造 .lock → 走恢复提示。输出报告并停下等确认。

确认后才执行 T2.1。T2.1 开工前先按 AGENTS §11 确认 HANDOFF §7.5 的待定决策，
不要自行选定；不要自动进入 T2.2。
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

`workspace-write` 下 `pnpm verify` 会因 Vite 的 `spawn EPERM` 失败（见 HANDOFF 旧记录）。
T1.5 全程 `danger-full-access`，审批提示已关闭——不要使用 `sandbox_permissions` 参数。
这不是代码问题，不要改项目配置或加 workaround。

### 3.3 受限 shell 里的 Electron / E2E

- 直接启动 Electron 默认会因 Chromium OS 沙箱退出；E2E 必须删除 `ELECTRON_RUN_AS_NODE` 并设置
  `$env:CURVE_E2E_NO_SANDBOX = '1'`（只被 `apps/desktop/e2e/fixtures.ts` 读取，不影响应用
  `webPreferences.sandbox`）。
- 手工看 dev 窗口：
  ```powershell
  Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
  $env:NO_SANDBOX = '1'; $env:CURVE_E2E = '1'
  $env:CURVE_E2E_USER_DATA = 'D:\DSH_Work_Space\curve-studio\apps\desktop\test-results\dev-user-data'
  pnpm dev
  ```
- 普通用户终端无需这些变量；不要把 `--no-sandbox`/`CURVE_E2E_NO_SANDBOX` 写进应用代码或默认脚本。
- 直接跑 Playwright 前先 `pnpm build`。E2E 会重写 `docs/reports/m0/*.png`，提交前还原。

### 3.4 Windows 符号链接权限（T1.5 新增，安装 TanStack 前必读）

本机当前 **没有创建符号链接的权限**（`New-Item -ItemType SymbolicLink` 报“需要管理员权限”）。
T1.5 执行 `pnpm add zustand immer` 时，pnpm 在 `node_modules/.pnpm` 创建 peer/hoisted 链接失败：

```text
ERR_PNPM_EPERM [symlinkAllModules] EPERM: operation not permitted, symlink ...
```

当时的处理：

1. 不删除已经可用的 `node_modules`；不要切换 `node-linker` 或改项目配置。
2. 按 pnpm 报错给出的 `<target>` 与 `<link>`，用目录 junction 补齐：
   ```powershell
   cmd /c mklink /J "<link>" "<target>"
   ```
3. 重跑 `pnpm install`，直到退出码为 0。
4. 当前 `packages/app-core/node_modules/{zustand,immer}` 是 junction；依赖解析和测试正常。

**T2.1 要安装 TanStack 依赖，极可能再次遇到同一问题。** 优先开启 Windows Developer Mode 或用有
symlink 权限的终端安装；若只能在本机继续，按上面的 junction 方式补齐，不要用
`--ignore-scripts`、hoisted linker 或删除 node_modules 来绕过。干净 CI 不应需要这些本地操作。

### 3.5 文本编码与路径陷阱

- DSH 的 shell 是 **Windows PowerShell 5.1**：`Get-Content` 默认按 GBK 解码无 BOM 的 UTF-8 文件；
  `Set-Content -Encoding UTF8` 会写入 BOM。源码与文档一律用 `read`/`write`/`edit` 工具修改。
- `[System.IO.File]::ReadAllBytes('相对路径')` 按**进程 CWD**（`D:\DSH_Work_Space`）解析；需要绝对路径。
- pnpm 的 stdout 被 PowerShell 当成错误流时会打印红字，**结论看 `$LASTEXITCODE`**；重定向到文件后再检索。
- 截图是设备像素（125% DPI）：窗口 1440×816 → 页面 1426×779 CSS px → PNG 1783×943。
  新截图用例复用 `shell.spec.ts` 的 `settleFrame()`（双 rAF）。

### 3.6 已知测试/依赖行为

- `pnpm verify` = `pnpm lint && pnpm typecheck && pnpm test`；`format:check` 需单独跑。
- Vitest 覆盖率排除：domain/persistence/app-core 的纯类型模块、三个进程入口、Worker 入口。
  app-core 排除 `state/types.ts` 与 `commands/types.ts`（T1.5）。
- 纯逻辑门禁：domain/table-engine/chart-model 行覆盖 ≥85%；全局 ≥70%（lines/statements/functions）、
  branches ≥60。
- `apps/desktop/src/main/workspace/recent-list.test.ts` 的 “caps the list” 用例在 66 个 worker 并行、
  机器繁忙时偶发 5s 超时；重跑即过，不要放宽全局超时。
- `pnpm e2e -- --grep` 会实际跑全量；直接调用 Playwright。PowerShell 下 `--grep "a|b"` 会被 cmd
  拆开；一次只跑一个模式。
- Vitest 过滤用 `--testNamePattern`，不要用 `-- --grep`。
- E2E 截图证据字节不稳定（真实鼠标悬停），断言不依赖像素。
- `apps/desktop/test-results/`、`playwright-report/`、`coverage/`、`bench/` 均已 gitignore。
- 依赖安装后当前 lockfile 含 `zustand 5.0.15`、`immer 10.2.0` 及 zustand 的可选 peer 记录；
  preload 仍只加载 `electron`/`channels.ts`/`envelope.ts`，zustand/immer 不得进 preload。

---

## 4. 已交付的关键接口（直接消费，不要回退）

### 4.1 `@curve/domain`

```ts
Cell, ColumnDef, TableMeta, Row, ViewDef, ChartSpec, TableStyle, LayoutNode, WorkspaceManifest …

parseManifest/parseTableMeta/parseRow/parseCell → ParseResult / CellResult
coerceCell(raw, column): CellResult
formatCellValue(value, column, options?): string
checkTable/checkInvariants/assertInvariants
createId/createWorkspaceId/…/createTimestamp
ERROR_CODES/createAppError/isAppError/toAppError

CURRENT_FORMAT_VERSION = 1
MIGRATIONS = createMigrationRegistry([])   // 生产为空（ADR-024）
runMigrations({ manifest, tables, registry, target? })
```

`Row` 是 `{id, values}`；JSONL 的 `{id, v}` 只由 table-engine 转换。

### 4.2 `@curve/table-engine`

```ts
decodeJsonl(jsonl, table): { rows, issues, stats }
encodeJsonl(rows): string
encodeJsonlWithStats(rows): { jsonl, bytes }
countJsonlRows(jsonl): number
toJsonlAppError(result): AppError | null
TableData = { table: TableMeta; rows: Row[] }
createTableData(table, rows?)
diffRowCounts / reconcileRowCounts / diffTableRows
DirtyTableTracker: mark/markAll/clear/clearAll/has/get/list/ids/size
TableWorkerRequest / TableWorkerResponse / createDecodeRequest / createEncodeRequest
```

`decodeJsonl` 对坏行产生 `issues` 并跳过，不抛异常；`toJsonlAppError` 映射为 `E_TABLE_PARSE`（超限优先
`E_TABLE_LIMIT`）。

### 4.3 `@curve/persistence`

`WorkspaceStore` 端口（create/open/close/readTable/writeTable/writeManifest/trash/listBackups/restore），
`MemoryWorkspaceStore`，布局/备份/迁移快照命名纯函数，`createEmptyManifest`/`validateManifest`/
`parseManifestDocument`/`serializeManifest`。

- `readTable` 缺文件语义（ADR-022）：`rowCount === 0` → `{jsonl:'', bytes:0}`；`rowCount > 0` →
  `E_TABLE_NOT_FOUND`。
- `@curve/persistence` 无 Electron/Node 内建；不要往这个包放 `node:fs`。

### 4.4 main：`FileWorkspaceStore` 与迁移备份

- `apps/desktop/src/main/workspace/file-workspace-store.ts`：路径白名单、原子写、表/manifest 备份、
  `.lock`、最近列表、打开时按磁盘重算 `rowCount`。`open` 只计数不解析。
- `apps/desktop/src/main/workspace/migration-backup.ts`：迁移前 `tables/` 字节快照、失败回滚；
  **尚未接进生产打开路径**（T1.5 确认后置 T2.3）。
- 迁移注册表为空；未来版本仍以 `E_WS_VERSION_UNSUPPORTED` 拒绝。

### 4.5 IPC / preload / renderer

- `IMPLEMENTED_IPC_CHANNELS` 共 **10** 个：`app:info`、`log:write`、`workspace:create/open/close/recent`、
  `manifest:write`、`table:read/write/trash`。
- `dialog:pickDirectory` / `dialog:saveFile` / `file:*` / `backup:*` / `workspace:recent:remove|clear`
  **仍只有通道名，没有 handler/preload 方法**。
- `apps/desktop/src/renderer/api-client.ts` 已提供 `workspace.*`、`table.*`、`manifest.write`，
  所有方法返回 `IpcResult<T>`，入参与响应双向 Zod 校验。
- `apps/desktop/src/renderer/table-io/client.ts`：`createTableIoClient`，请求 id 关联、120s 超时、
  Worker 错误/终止结算所有 pending。T2.1 接真实 Worker 时复用它，**不要重写协议**。
- `apps/desktop/src/renderer/workers/table.worker.ts` 已存在；`apps/desktop/electron.vite.config.ts`
  仍在 `renderer.build.rolldownOptions.input` 显式加入 `table-worker`。T2.1 接 `createTableIoClient`
  后应删除该显式入口，让 Vite 自己产出 Worker。
- `apps/desktop/e2e/table-io.spec.ts` 的 “loads the table worker under the production CSP” 当前按
  `table-worker-*.js` 查找产物；删入口后确认该测试仍通过。

### 4.6 `@curve/app-core`（T1.5 新增）

```ts
createAppCore({ workspaceStore, logger?, now? }): {
  store: AppStore;                 // zustand/vanilla StoreApi<AppState>
  commands: CommandBus;
  openWorkspace(request): Promise<OpenWorkspaceOutcome>;
}

createAppStore({ initialState?, now?, dirtyTracker? }): AppStore
createCommandBus(store, { logger? }): CommandBus
createTableCellSetCommand({ now? }): CommandDefinition<TableCellSetPayload>

selectors:
  selectCurrentTable(state)
  selectVisibleRows(state)
  selectActiveView(state)
  selectDirtyTables(state)
```

`AppState`：

```ts
{
  workspace: WorkspaceInfo | null;   // id/name/root/appVersion/settings/warnings…
  tables: Record<string, TableData>; // 普通对象 + Row[]，不是 Map
  views: Record<string, ViewDef>;
  charts: Record<string, ChartSpec>;
  tableStyles: Record<string, TableStyle>;
  layout: LayoutNode;
  ui: {
    activeTableId: string | null;
    activeViewId: string | null;
    error: AppError | null;
    dirtyTables: DirtyTableEntry[];
  };
  actions: AppActions;               // setActiveTable/View、setError/clearError、mark/clearDirty
}
```

`openWorkspace` 是 **use case**，不是命令、不产生撤销历史：

- 调 `WorkspaceStore.open` → 逐表 `readTable` → `decodeJsonl` → 恢复 layout/活动视图/活动表；
- 所有表读取成功后才一次替换文档状态；打开失败只写 `ui.error` + 日志，旧文档不变；
- 解码坏行不阻塞打开：保留合法行，warning 写入 `workspace.warnings` 并调用 `logger.warn`；
- 只从 `layout` 推导活动视图/表；没有视图时回退第一张表；
- 迁移**未接线**（T2.3）。

`table.cell.set`：

```ts
core.commands.dispatch('table.cell.set', {
  tableId: 'tbl_x', rowId: 'row_x', columnId: 'col_x', value: '1,234.5',
})
// { ok: true, result: { next, patches, inversePatches, mergeKey } }
// { ok: false, error: AppError }
```

- `coerceCell` 按列类型归一；主键必须非空且唯一；只替换目标 `rows[index]`；
- 更新 `table.updatedAt` 与 `workspace.updatedAt`；
- 失败只更新 `ui.error`，文档切片（workspace/tables/views/layout）不变；
- 成功且确实产生 patches 时，bus 才 mark 脏表并清空旧 `ui.error`；
- `mergeKey` 形如 `table.cell.set:<tableId>:<rowId>:<columnId>`，供 T5.2 的 800ms 合并。

实现要点：

- `commands/bus.ts` 在模块入口 `enablePatches()` 并 `setAutoFreeze(false)`；不要恢复全局 auto-freeze
  （见 ADR-025）。
- `workspace.open` 的同步 `decodeJsonl` 仍会占调用线程；T2.1 接 Worker 时要替换加载实现。
- `selectVisibleRows` 目前没有筛选/排序，直接返回当前 `TableData.rows` 的引用；后续 T2.6 加筛选时
  必须保持 memo/引用语义。

### 4.7 夹具

| 夹具 | 内容 | 预期 |
|---|---|---|
| `v1-min/` | `ws_v1min` / `tbl_v1min`，3 列 3 行 | 打开成功、0 warning；行内容逐行相等 |
| `stale-lock/` | 固定 `.lock`（pid 999999，2020 时间） | 打开成功 + stale warning，替换锁 |
| `future-version/` | `formatVersion: 2` | `E_WS_VERSION_UNSUPPORTED`，文件不变 |
| `corrupt-manifest/` | 截断 JSON | `E_WS_INVALID_MANIFEST`，文件不变 |

夹具只读；打开前复制到临时目录。T1.5 的 app-core 测试通过 fake `WorkspaceStore` 读取 `v1-min`，
不依赖 main/Node fs（测试侧才用 `node:fs`）。

---

## 5. T1.5 实施记录（已完成 2026-10-21，提交 `c077cf2`）

### 5.1 交付文件

```text
packages/app-core/src/
├─ app-core.ts                 # createAppCore 组合根
├─ logging.ts                  # AppLogger + 默认 console logger
├─ commands/
│  ├─ types.ts                 # CommandDefinition/CommandResult/DispatchResult/CommandBus
│  ├─ bus.ts                   # 注册表、produceWithPatches、错误 surface、脏表刷新
│  └─ table-cell-set.ts        # 首个同步文档命令
├─ state/
│  ├─ types.ts                 # AppState 切片 + AppActions + AppStore
│  ├─ store.ts                 # vanilla Zustand store、actions、DirtyTableTracker
│  └─ selectors.ts             # 当前表/可见行/活动视图/脏表
├─ usecases/open-workspace.ts  # 异步打开 use case
└─ *.test.ts                   # 6 files / 26 tests
```

配套：`docs/adr/025-app-core-state-and-command-bus.md`、app-core `package.json`（zustand/immer）、
`app-core/tsconfig.json`（测试 node types）、`.dependency-cruiser.cjs`（app-core 禁止 React/Electron/
ECharts）、`vitest.config.ts`（app-core 类型模块覆盖率豁免）、TASKS/CHANGELOG/AGENTS §0。

### 5.2 开工前经用户确认的五个决策

1. **迁移后置 T2.3**：T1.5 不接进 `open`，生产注册表仍为空。
2. **仅 app-core**：不交付 renderer `WorkspaceStore` 适配层、Worker 加载或 UI。
3. **`workspace.open` 是 use case**：异步 IO 不进命令总线、不产生历史。
4. **切片形状**：`Record<tableId, TableData>` + `Row[]`；测试用 fake 端口读 `v1-min` 夹具。
5. **100k 取证**：结构断言（同一数组引用、O(1)）+ 手工计时，不把 16ms 写成 CI 门禁。

### 5.3 已验证证据

| 命令 | 结果 |
|---|---|
| `pnpm exec vitest run packages/app-core` | exit 0；**6 files / 26 tests passed** |
| `pnpm verify` | exit 0；ESLint 0；depcruise **187 modules / 548 deps / 0 violations**；**66 files / 554 tests passed** |
| `pnpm test:coverage` | exit 0；全局 lines **93.51%** / branches **84.80%**；app-core store/selectors 100% lines、commands 94.39%、open use case 86.66% |
| `pnpm format:check` | exit 0 |
| 100k 选择器手工 probe（临时文件已删除） | 首调 **0.026–0.052ms**；10,000 次缓存调用全部同一引用，均值 **0.049–0.070µs/次** |

`pnpm e2e` 本任务未跑：没有改 renderer/main/preload/E2E 路径。最近基线仍是 22 passed。

### 5.4 与计划/规格的差异

- TASKS 把 `workspace.open` 写在“命令”步骤，实际按 SPEC §13.1 实现为 use case；ADR-025 记录。
- 迁移接线从 ADR-024 的“T1.5”后置到 T2.3；生产注册表为空，因此无功能回退。
- 打开时表解码问题不阻塞，保留合法行并给 warnings；T2.1 必须把 warning 呈现给用户。
- `ui.error` 是错误 surface：失败时文档切片不变，但 `ui.error` 会更新；不要把它算作“状态被改坏”。
- app-core `tsconfig` 为测试读取夹具启用了 Node 类型；生产 app-core 仍不 import Node 内置。
- 未改 CSP、沙箱、preload 白名单、IPC 通道或 `formatVersion`。

---

## 6. M1 验收演示（2026-10-21 已完成）

> **已完成（2026-10-21）**：三条演示通过，用户已接受 M1；报告见 `docs/reports/m1/REPORT.md`，
> 恢复交互按 ADR-026 后置到 T5.3。以下保留为历史记录（建议做法已由
> `m1-acceptance.test.ts` 落地）。

TASKS 的 M1 条目要求：**脚本/测试创建 `Demo.cstudio` → 写入 1,000 行 → 关闭重开 → 数据逐行相等；
篡改 manifest → 报错且原文件不变；伪造 `.lock` → 走恢复提示。输出报告后停下。**

当前已有覆盖面：

- `apps/desktop/src/main/workspace/workspace-fixtures.test.ts` 覆盖 v1-min 逐行相等、未来版本拒绝、
  损坏 manifest 不覆盖、stale lock 替换。
- `apps/desktop/src/main/workspace/file-workspace-store.test.ts` 覆盖原子写、备份、重启式 reopen、
  rowCount 重算、缺文件语义。
- `apps/desktop/e2e/workspace.spec.ts` 覆盖 IPC 路径的 create/open/close、损坏 manifest、未来版本。
- 但**还没有** M1 的总验收报告，也没有“1,000 行 → close → reopen → 逐行相等”的单一证据。

建议做法（开工前先向用户确认是否需要新增提交的测试/脚本）：

1. 用临时目录 + `FileWorkspaceStore` 建 `Demo.cstudio`；
2. 建 1 张表、2 列、1,000 行，写 JSONL 与 manifest，记录 manifest 哈希；
3. 关闭、重新 `open`，用 `decodeJsonl` 逐行 `toEqual`，确认 `rowCount` 重算与 `updatedAt` 语义；
4. 篡改 manifest 为截断 JSON，再打开，断言 `E_WS_INVALID_MANIFEST` 且文件哈希不变；
5. 写入固定 stale `.lock` 再打开，断言 warning/替换，关闭后 `.lock` 删除；
6. 写 `docs/reports/m1/REPORT.md`（命令、实际输出、环境、残留风险），提交后停下等确认。

**不要**直接进入 T2.2；M1 已验收，T2.1 开工前仍需确认 §7.5 的决策。

---

## 7. T2.1 工作交接：工作区入口、表管理与虚拟化数据网格（已完成）

> **已完成（2026-10-21）**：本节描述的是 T2.1 开工前的交接背景，实际实现与决策见 ADR-027 与
> `docs/reports/t2.1/REPORT.md`。§7.5 的 8 个决策已由用户逐项确认，保留为历史记录。

### 7.1 任务原文摘要（`docs/TASKS.md` T2.1）

- 依赖：T1.5、T0.4（已满足）
- 覆盖：FR-WS-01、FR-WS-02、FR-TBL-01、FR-TBL-02、FR-TBL-07
- 参考：SPEC §9.0、§9.1
- 产出：欢迎页（新建/打开/最近）；表列表（新建向导/重命名/删除/打开）；基础标签栏；
  `renderer/features/grid/` 的 Grid/Header/Cell/SelectionLayer；TanStack Table + Virtual；
  列宽、冻结列、矩形选择、键盘导航；ARIA grid。
- 验收：无工作区欢迎页；新建/打开/最近三条路径；新建表→重命名→删除到 `.trash`→重开；
  删除被引用表列出数量并级联删除；同一张表只激活已有标签；100k 首帧 <1s、滚动 ≥55fps；
  方向键/Tab/Home/End/PageUp/PageDown；列宽拖拽/自适应且重开保留；axe 无 critical。

### 7.2 现有 renderer 状态（T2.1 起点）

- `AppShell` 仍是 T0.4 骨架：主区固定渲染 `WorkspaceEmptyState`，按钮只 toast
  “当前不可用”；`Sidebar` 是空 Tabs；`TitleBar` 的工作区名硬编码为空。
- `WorkspaceEmptyState` 的 `onUnavailable` 注释仍写 “Workspace IPC lands in T1.2”。
- 没有 `features/`、没有 `@curve/app-core` 依赖；`apps/desktop/package.json` 只有 domain/
  persistence/table-engine/ui；`tsconfig.web.json` references 也只有 domain/table-engine/ui。
- `window.api` 已有 `workspace.create/open/close/recent`、`manifest.write`、`table.read/write/trash`。
- `dialog:pickDirectory` **未实现**；E2E 替身 `resolveE2EDialogStubs` 已存在但未接 handler。
- `workspace:recent:remove/clear` 未实现；欢迎页只读最近列表可以先不做删除/清空。
- `table-io/client.ts` 已可用，但 renderer 尚未实例化；`electron.vite.config.ts` 仍显式构建 Worker。
- 现有 i18n 有 shell/sidebar/empty 文案，但没有表/网格/欢迎页的新 key；新增文案必须同时补
  `zh-CN.ts` 与 `en-US.ts`。

### 7.3 建议接入结构（待确认后实施）

```text
apps/desktop/src/renderer/
├─ app-core/
│  ├─ use-app-core.tsx          # 创建单例 core、React context 或模块级 store
│  ├─ workspace-store.ts        # window.api/IpcResult → @curve/persistence WorkspaceStore
│  └─ use-app-store.ts          # useSyncExternalStore(store.subscribe, selector)
├─ features/workspace/
│  ├─ WelcomePage.tsx
│  ├─ RecentWorkspaceList.tsx
│  └─ use-workspace-actions.ts
├─ features/tables/
│  ├─ TableList.tsx
│  ├─ NewTableDialog.tsx
│  └─ table-commands.ts          # table.create/delete、view.create/delete 等
└─ features/grid/
   ├─ DataGrid.tsx
   ├─ GridHeader.tsx
   ├─ GridCell.tsx
   └─ SelectionLayer.tsx
```

关键点：

- **不要**在组件里直接改 Zustand state；文档变更必须 `core.commands.dispatch(...)`。
- `WorkspaceStore` 适配层把 `IpcResult` 的 `ok:false` 转成抛出的 `AppError`（或适配成 core 能
  捕获的 rejected promise）；不要吞掉错误。
- `createAppCore` 已是组合根；renderer 只创建一次（模块级或 Provider），不要每个组件建一个。
- app-core 只有 vanilla store，**用 React `useSyncExternalStore`** 绑定，或单独给 desktop 加
  zustand React binding；不要把 React 引入 app-core。
- selector 返回 `TableData`/`rows` 引用；`useSyncExternalStore` 的 snapshot 必须稳定，避免每次
  `.map/.filter` 新数组。

### 7.4 必须先处理的功能空缺

1. **app-core 依赖接线**：`apps/desktop/package.json` 增加 `@curve/app-core`（以及适配层需要
   `@curve/persistence` 类型）；`tsconfig.web.json` 增加 app-core/persistence 工程引用。
2. **Welcome 页目录选择**：`dialog:pickDirectory` 目前只有通道名；需要 main handler、Zod 契约、
   preload 白名单、renderer api-client 和 E2E hook。默认父目录建议由 main 提供
   `app.getPath('documents')/Curve Studio`，但这是新 IPC/默认路径决策，先确认。
3. **表/视图命令**：现有 bus 只有 `table.cell.set`。T2.1 至少需要：
   - 建表（默认 `id` text 主键）并创建 `ViewDef`/加入当前 pane；
   - 重命名表（SPEC 有 `table.meta.update`）；
   - 删除表（`.trash` + 级联删除 chart/view/layout 引用）；
   - `view.create/delete/update` 与 layout 更新。
   SPEC §13.1 的命令表没有 `table.create/delete`；是新增命令并补 ADR/SPEC，还是把建表/删表
   做成 use case（同步文档部分仍走 bus），**开工前必须问用户**。
4. **持久化时机**：T2.1 没有自动保存（T5.1）。建表/重命名/删除/视图变更后，何时调用
   `manifest.write` / `table.write`？建议：这些显式操作后立即写 manifest；单元格编辑 T2.2 再接
   保存。需要确认“表创建是否写 0 字节表文件”（ADR-022 允许不写）。
5. **删除级联**：SPEC §9.0 要求删除被图表/视图引用的表时列出数量并一并删除；需要遍历
   `views/charts/layout`，保证不变量。`table:trash` 只移动表文件，不更新 manifest。
6. **Worker 解码**：`createOpenWorkspace` 目前同步 `decodeJsonl`。T2.1 要接
   `createTableIoClient`，建议给 `createOpenWorkspace`/`createAppCore` 增加可注入的
   `decodeTable`/`loadTable` 异步端口，或把 `openWorkspace` 拆成“manifest 打开 + 逐表 Worker 解码”。
   否则 100k 表会在 renderer 主线程阻塞。接入后删除 `electron.vite.config.ts` 的显式
   `table-worker` 入口，并确认 `table-io.spec.ts` 仍能找到 Vite 产出的 worker。
7. **打开失败释放锁**：`openWorkspace` 在 `WorkspaceStore.open` 成功后若表读取失败，目前不会
   `close` 工作区，可能留下 `.lock`。T2.1 接真实 store 时应补 close-on-failure 或明确交给
   main/窗口生命周期处理。

### 7.5 T2.1 开工前需要用户确认的决策（已确认，见 ADR-027）

> 2026-10-21 已逐项确认，全部采用推荐方案：新增 `table.create/table.delete` 命令；结构性操作后
> 立即写 manifest；新表不落 0 字节文件；实现 `dialog:pickDirectory` 且默认
> `Documents/Curve Studio`；删除用 Dialog 列数量后一条命令级联；`openWorkspace` 注入 Worker
> 异步解码；TanStack Table v8 + Virtual v3；`workspace:recent:remove/clear` 后置 T5.3。

| # | 决策 | 结果（2026-10-21） |
|---|---|---|
| 1 | 建表/删表是否新增同步命令 | 新增 `table.create`/`table.delete`，同步 SPEC §13.1 与 ADR-027 |
| 2 | 持久化时机 | 结构性操作后立即 `manifest.write`；单元格编辑留 T2.2/T5.3 |
| 3 | 表文件创建 | 只写 manifest 条目，不落 0 字节文件（ADR-022） |
| 4 | Welcome 目录选择 | 实现 `dialog:pickDirectory`；`app:info.documentsDir` + 默认 `Documents/Curve Studio` |
| 5 | 删除级联与二次确认 | Dialog 列视图/图表数量，确认后一条命令级联 |
| 6 | Worker 接入位置 | `openWorkspace` 注入异步解码端口，删除显式 worker 入口 |
| 7 | TanStack 依赖 | `@tanstack/react-table@8.21.3` + `@tanstack/react-virtual@3.14.21`；axe-core 测试专用 |
| 8 | 最近列表删除/清空 | 后置 T5.3，欢迎页只读最近列表 |

### 7.6 T2.1 关键陷阱

| 陷阱 | 处理 |
|---|---|
| 直接 `core.store.setState` 改表/视图 | 撤销会坏；文档变更走 `dispatch` |
| 组件里 `selectVisibleRows(state).filter(...)` 每次新数组 | `useSyncExternalStore` 会无限重渲染；先由 selector 返回稳定引用，筛选 T2.6 |
| 100k 行整表 `.map` 建渲染模型 | 只渲染视口；TanStack Virtual |
| 新建表只改 store 不写 manifest | 重开丢失；T2.1 明确保存时机 |
| 删除表只调 `table:trash` | manifest/chart/view/layout 悬挂；必须级联 |
| 迁移未接线 | 不要在此任务顺手接；T2.3 |
| Worker 入口 | 接入 `createTableIoClient` 后删除显式 `table-worker` input |
| 欢迎页无工作区 | 不显示空网格；显示欢迎页 |
| 方向键/Tab | 输入框、对话框内不能劫持；用 roving tabindex/焦点管理 |
| 200% 缩放/键盘 | T2.1 是 UI 任务，按 AGENTS §10 冒烟 |
| Windows 安装 | TanStack 依赖安装可能 symlink EPERM，先按 §3.4 处理 |
| `workspace.open` 失败 | 不会自动 close 已打开工作区；处理 `.lock` 残留 |

### 7.7 验证命令（建议）

TASKS 里 T2.1 的 `pnpm exec vitest run apps/desktop -- --grep ...` 是已知会传错参数的写法；
用 `--testNamePattern`：

```powershell
$env:PATH = "D:\DSH_Work_Space\tools\bin;C:\Users\MECHREVO\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin;$env:PATH"
cd D:\DSH_Work_Space\curve-studio
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue

pnpm exec vitest run apps/desktop --testNamePattern "grid|welcome"
pnpm verify
pnpm test:coverage
pnpm format:check

# E2E：先 build；一次只用一个 grep，避免 PowerShell 拆 |
$env:CURVE_E2E_NO_SANDBOX = '1'
pnpm build
pnpm exec playwright test --config apps/desktop/playwright.config.ts --grep "workspace"
pnpm exec playwright test --config apps/desktop/playwright.config.ts --grep "grid"
```

---

## 8. 后续里程碑提醒

- M1 已验收（2026-10-21）；T2.1 已完成并报告；下一个任务 `T2.2`（单元格编辑与校验）需用户确认，
  不要自动开始。
- T2.3 是首个真实迁移落点：届时接 `FileWorkspaceStore.open`、升 `CURRENT_FORMAT_VERSION`、
  补 v1→v2 夹具与逐行等价测试，并补 E2E 锁顺序/失败路径。
- T5.3 负责自动保存、崩溃恢复对话框、最近列表移除/清空与 manifest 备份重建（ADR-026）。
- T5.2 撤销/重做直接消费 `CommandResult.patches/inversePatches`；不要让 dirty 列表进入 patches。
- T2.6 筛选/排序会改变 `selectVisibleRows` 的语义；保持 O(1) 引用/缓存，不要每次全表遍历。
- M2 结束运行该里程碑验收演示并停下；不要自动进入 M3。

---

## 9. 已知风险与处理

| 风险 | 影响 | 处理 |
|---|---|---|
| 会话策略回到 `workspace-write` | `verify`/E2E 报 EPERM | 切 `danger-full-access`，不改项目配置 |
| Windows 无 symlink 权限 | `pnpm add`/`pnpm install` 失败 | 开 Developer Mode 或用 junction 补齐；不要删 node_modules |
| 崩溃恢复交互未实现 | 崩溃后应用内无法恢复 | 已裁决后置 T5.3（ADR-026）；T2.1 只呈现 warning，当前仅“warning + 替换锁” |
| 迁移未接线 | 未来 v2 工作区只会被拒绝 | T2.3 按 ADR-024 接线并补 E2E |
| Worker 未接 renderer | 100k 打开阻塞 UI 线程 | T2.1 注入异步解码并删显式 worker 入口 |
| `openWorkspace` 失败不 close | 残留 `.lock` | T2.1 适配层/main 生命周期补 close-on-failure |
| 表数据切片用普通对象 | 单表 O(1) 查找，表数上限 20 | 不要改成 Map；保持 patches 可序列化 |
| Immer auto-freeze 被误开 | 首次编辑 100k 表全表遍历 | 保持 `setAutoFreeze(false)`（ADR-025） |
| `selectVisibleRows` 无筛选 | T2.6 前只能显示全表 | T2.6 设计稳定缓存，不要破坏引用 |
| 删除表未级联 | 悬挂 view/chart/layout | T2.1 删除命令统一处理并测不变量 |
| 无自动保存 | 编辑/表操作可能丢 | T2.1 明确显式保存；T5.1 前不承诺自动保存 |
| E2E 截图重写 | 工作树变脏 | 提交前还原 `docs/reports/m0/*.png` |
| 显式 worker 入口残留 | 多一份产物/测试路径 | 接线后删除并跑 table-io E2E |
| `workspace:recent:remove/clear` 未实现 | 欢迎页不能删除/清空 | T5.3 或 T2.1 明确范围 |
| `dialog:*` 未实现 | 欢迎页无法选目录 | T2.1 补通道/handler/preload/api-client/E2E |
| 本机 `pnpm install` 链接问题 | 新依赖装不上 | 见 §3.4，先处理环境 |

---

## 10. 不可做清单（重申）

- 不关闭 `contextIsolation` / `sandbox` / `webSecurity`，不打开 `nodeIntegration`。
- 不把 `--no-sandbox`、`CURVE_E2E_NO_SANDBOX` 写进应用代码、默认脚本或 CI。
- 不为 Worker 放宽 CSP（`worker-src`/`script-src` 的 `blob:`）；同源 module Worker 已验证可用。
- 不在 renderer 里 `require('fs')`、读任意路径、暴露 `ipcRenderer` 本体或泛 `invoke`。
- 不把 Zod 或任何外部包放进 preload。
- 不为通过安装而删除 `allowBuilds` 白名单、提交 `--ignore-scripts` 或切换 hoisted linker。
- 不跳过测试、不放宽 ESLint/覆盖率规则、不用 `--no-verify`。
- 不未经 ADR/用户确认升级 `formatVersion`、改数据格式、IPC 通道或公共 API。
- 不未经确认把迁移接进 `FileWorkspaceStore.open`。
- 不在 app-core 里 import React/Electron；Zustand 只用 vanilla store。
- 不把异步 IPC/磁盘写进命令；`workspace.open` 保持 use case。
- 不把 10 万行整体放进 React state 并逐格触发全局重渲染。
- 不自动跨里程碑/跨任务推进；M1 报告、T2.1 报告后都要停下等确认。

---

## 11. 新会话启动检查清单

- [ ] `git status --short` 干净，`git log --oneline -2` 顶部为本交接提交，其下为 `c077cf2`（T1.5）。
- [ ] 已注入 PATH（§3.1），`pnpm --version` 为 11.28.5。
- [ ] 会话文件策略为 `danger-full-access`（§3.2）。
- [ ] 已读 `AGENTS.md`、本文件、TASKS 的 M1/T2.1、TESTPLAN §1/§2/§3（E2/E3）/§4/§5、
      SPEC §9.0/§9.1/§12/§13.1/§13.2/§15.1/§15.4/§16.1、ADR-005/006/007/014、ADR-020–025。
- [ ] 已确认 `apps/desktop/node_modules/electron/dist/electron.exe` 存在。
- [ ] 已确认 `pnpm verify` 基线（66 files / 554 tests）和 app-core 测试（6 files / 26 tests）。
- [ ] 已确认 M1 验收演示尚未执行，先做 §6，不直接进 T2.1。
- [ ] 已确认 T2.1 的 §7.5 待定决策已逐项问用户，未自行选定。
- [ ] 已确认 `apps/desktop` 尚未依赖 `@curve/app-core`，T2.1 第一步补依赖与 tsconfig references。
- [ ] 已确认 `dialog:pickDirectory` 未实现；欢迎页选目录需要先补 IPC。
- [ ] 已确认 `electron.vite.config.ts` 仍有显式 `table-worker` 入口；接 Worker 后删除。
- [ ] 已清除 `ELECTRON_RUN_AS_NODE`；跑 E2E 前再设 `CURVE_E2E_NO_SANDBOX=1`。
- [ ] 已确认用户本轮范围（先 M1 报告，确认后再 T2.1；不自动进 T2.2）。
- [ ] 复述目标/产出/验收与风险后再动手。
