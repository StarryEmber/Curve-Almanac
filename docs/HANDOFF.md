# HANDOFF — Curve Studio 实施交接

> 本文件面向**下一个实现会话**。当前会话已完成 `T2.3`（列管理、结构变更与迁移），
> 按用户要求停止，`T2.4` 尚未开始。
> 最后更新：2026-10-21 · `T2.3` 代码提交 `213fab4`、文档提交 `4177ade`（交接定稿为其后的 docs
> 提交）· 分支 `main` · 工作树干净。
> 阅读顺序：`AGENTS.md` → 本文件 → `docs/TASKS.md` 的 T2.4 →
> `docs/TESTPLAN.md` §1、§2、§3（E3）、§4、§5 →
> `docs/SPEC.md` §9.3、§8.1、§13.1、§16.1 →
> `docs/DECISIONS.md` 的 ADR-005/006/007/014/024，再读 ADR-028/029。

---

## 0. 一页摘要（给下一个会话）

- **当前状态**：`T2.3`（列管理、结构变更与迁移）已完成并提交；`T2.4`（区域粘贴）未开始；
  M2 仍在进行，M2 验收演示要等 T2.4–T2.7 全部完成。
- **本次交付**：列管理 Inspector 面板、`table.column.add/update/delete/reorder`、换主键、
  运行期行数据转换/失败回滚、共用破坏性确认、100 列上限、图表“列已删除”最小占位；
  未升 `formatVersion`、未接迁移、结构命令未接撤销历史（ADR-029）。
- **基线**：`pnpm verify` 89 files / 733 tests；coverage lines 77.83%；`format:check` 通过；
  `pnpm build` exit 0；`pnpm e2e` 41 passed。
- **下一步**：读 TASKS T2.4 与 SPEC §9.3，先逐项确认本文件 §6 的 10 个歧义，**不要自行选定**；
  确认后复述目标/文件/验收命令，再写测试与实现。
- **硬约束**：不绕过命令总线；不新增未写 ADR 的运行时依赖；不改 `formatVersion`/IPC/公共 API；
  不跳过验收项；不自动跨任务。
- **停点**：T2.4 完成后停下报告，不进入 T2.5。

---

## 1. 当前进度快照

| 项 | 状态 |
|---|---|
| 方案文档 | v1.0 已锁定（SPEC / TASKS / TESTPLAN / DECISIONS） |
| M0 基建（T0.1–T0.5） | **已完成**；验收报告 `docs/reports/m0/REPORT.md` |
| M1 领域与持久化（T1.1–T1.5） | **已完成并经用户验收**（2026-10-21）；报告 `docs/reports/m1/REPORT.md` |
| `T1.5` app-core 状态与命令总线 | **已完成**（`c077cf2`）；T2.1/T2.2/T2.3 扩展了命令、actions、历史与保存 |
| `T2.1` 工作区入口、表管理与网格 | **已完成**（`07c4763`）；报告 `docs/reports/t2.1/REPORT.md`；ADR-027 |
| `T2.2` 单元格编辑与校验 | **已完成**（`641cd86`）；报告 `docs/reports/t2.2/REPORT.md`；ADR-028 |
| `T2.3` 列管理、结构变更与迁移 | **已完成**（`213fab4`）；报告 `docs/reports/t2.3/REPORT.md`；ADR-029 |
| 当前里程碑 | **M2 表格数据进行中**（T2.1–T2.3 完成，T2.4–T2.7 未开始） |
| 下一个任务 | **T2.4 区域粘贴**；开工前必须按 AGENTS §11 确认歧义，不要自行选定 |
| 提交历史（近 7 条） | `4177ade docs(t2.3): record column-management decisions and handoff`<br>`213fab4 feat(tbl): add column management and structure changes (T2.3)`<br>`ba7d74a docs(t2.2): rewrite handoff for T2.3`<br>`d46bc8f docs(t2.2): record final verification numbers`<br>`641cd86 feat(tbl): add cell editing, validation, undo and saving (T2.2)`<br>`b8597e6 docs: add T2.2 implementation handoff`<br>`07c4763 feat(tbl): add workspace entry, table management and virtual grid (T2.1)` |
| `pnpm verify` 基线 | **89 files / 733 tests**；ESLint 0；depcruise **265 modules / 968 deps / 0 violations** |
| `pnpm test:coverage` 基线 | 全局 lines **77.83%** / statements 77.58% / branches 69.49% / functions 78.78%；阈值 70/60 未下调 |
| `pnpm e2e` 基线 | **41 passed**（33 + T2.3 `e2e/schema.spec.ts` 8 条），约 1.1min |
| `pnpm format:check` | 通过 |
| 构建 | `pnpm build` exit 0；renderer **1,246.01 kB**；Worker `assets/table.worker-<hash>.js` |
| 夹具 | `fixtures/workspaces/{v1-min,corrupt-manifest,future-version,stale-lock}/`（T1.4）；T2.3 未新增格式夹具 |

**用户明确要求**：

- 一次只做一个任务；每个任务先复述目标/产出/验收，再写测试、实现、跑 `pnpm verify` 与任务指定
  e2e/bench，最后勾选 TASKS、更新 CHANGELOG、必要时 ADR、Conventional Commit。
- **T2.3 已完成**；**不要自动进入 T2.4**，先停下等用户确认。
- M2 全部任务完成后再运行 M2 验收演示，不得跨里程碑。

---

## 2. 新会话开场提示词（可直接粘贴）

```text
工作目录：D:\DSH_Work_Space\curve-studio（仓库根）。

先读 AGENTS.md、docs/HANDOFF.md、docs/TASKS.md 的 T2.4、
docs/TESTPLAN.md §1/§2/§3（E3）/§4/§5、
docs/SPEC.md §9.3/§8.1/§13.1/§16.1、
docs/DECISIONS.md 的 ADR-005/006/007/014/024，再读 ADR-028/029。

现状：M0、M1（已验收）、T1.1–T1.5、T2.1、T2.2、T2.3 已完成；T2.3 提交 213fab4，工作树干净；
pnpm verify 89 files / 733 tests、test:coverage 全局 lines 77.83%、format:check、
pnpm e2e 41 passed 全绿。T2.3 报告见 docs/reports/t2.3/REPORT.md，决策见 ADR-029。

下一步是 T2.4（区域粘贴），但不要直接开工：
先按 AGENTS §11 逐项确认 HANDOFF §6 的待定决策（解析器范围、锚点/筛选/排序语义、
超列确认与 100 列上限、新增行与空主键生成、10k 取消、撤销、保存时机等），不要自行选定；
确认后先复述目标/文件/验收命令，再写测试与实现。

不要自动进入 T2.5；T2.4 完成后停下等确认。
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
T2.1–T2.3 全程 `danger-full-access`，审批提示已关闭——**不要使用 `sandbox_permissions` 参数**。
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

T2.3 未新增依赖。若 T2.4 需要新依赖，先按 AGENTS §4 写 ADR；能复用已有依赖就不要新增。

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
- Vitest 过滤用 `--testNamePattern`，不要用 `-- --grep`。
- T2.1/T2.2/T2.3 的 E2E 在 UI 更新后等 manifest/JSONL 落盘时使用 `expect.poll`；新增编辑/保存测试也要这样等
  磁盘，不要直接读文件后立刻断言（渲染状态先于异步写盘）。
- 结构变更保存：行数据命令走保存队列（表 → manifest），纯 schema 命令只写 manifest；E2E 断言前用
  `expect.poll` 读 manifest。
- E2E 截图证据字节不稳定；断言不依赖像素。
- Worker 产物名现在是 `table.worker-<hash>.js`（不是 T1.3 的 `table-worker-*.js`）。

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

- `coerceCell` 覆盖 SPEC §8.1 的全部归一规则；T2.4 粘贴必须复用它，不要另写解析。
- 列计划全有或全无：失败返回前 100 条 `ColumnChangeFailure` + `totalFailures`，不返回半迁移行集。
- 空值在类型转换时保持 `null`；主键列必须 text；加列补 `null`。

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
- `tables:write` 写盘前校验 200k 行 / 256MB 上限；T2.4 的批量写入仍必须走该通道。

### 4.6 `@curve/app-core`（T1.5 + T2.1 + T2.2 + T2.3）

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
| `table.create` | `{ table, view }` | 新表 + 表视图 + 标签 |
| `table.delete` | `{ tableId }` | 级联删除 chart/view/layout 引用 |
| `table.meta.update` | `{ tableId, name?, primaryKey? }` | 至少一个；换主键走 `planPrimaryKeyChange` |
| `table.column.add` | `{ tableId, column, index? }` | 旧行补 `null`；所有视图插入顺序 |
| `table.column.update` | `{ tableId, column }` | 完整列定义；类型/必填/枚举逐行校验/转换 |
| `table.column.delete` | `{ tableId, columnId }` | 主键拒绝；清理所有视图状态 |
| `table.column.reorder` | `{ tableId, columnIds }` | 精确排列；同步 schema/行/所有视图顺序 |
| `view.create/delete/update/layout` | … | T2.1 视图与布局 |

`WorkspaceActions`（T2.3 新增部分）：

```ts
inspectColumnChange(change: ColumnChange): ColumnChangeInspection;
addColumn(tableId, draft: ColumnDraft): Promise<ColumnActionOutcome>;
updateColumn(tableId, columnId, draft): Promise<ColumnActionOutcome>;
deleteColumn(tableId, columnId): Promise<ColumnActionOutcome>;
reorderColumns(tableId, columnIds): Promise<ColumnActionOutcome>;
changePrimaryKey(tableId, columnId): Promise<ColumnActionOutcome>;
```

- 行数据命令走保存队列（表 → manifest）；纯 schema 命令只写 manifest。
- 保存失败返回 `{ ok: false, error, committed: true }`：内存已变更，UI 关闭对话框，状态栏/Toast 重试。
- 结构命令不进入 T2.2 最小历史（仅 `table.cell.set`）；T5.2 统一。
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
├─ features/columns/            # T2.3：ColumnsPanel/ColumnFormDialog/ColumnChangeDialog
│  ├─ column-form.ts            # draftFromColumn/newColumnDraft/keyFromLabel/isDestructive
│  ├─ column-error-text.ts      # 字段/行失败 → t(key)
│  └─ *.test.ts(x)
├─ features/charts/ChartPlaceholder.tsx  # T2.3 图表无效占位（T3.1 替换）
├─ shell/                       # AppShell/TitleBar/Sidebar/Inspector/StatusBar/HelpDialog
└─ i18n/messages/{zh-CN,en-US}.ts
```

- `Inspector` 在存在活动表时渲染 `ColumnsPanel`；列面板新增/编辑用 `ColumnFormDialog`，删除/改类型/
  换主键用 `ColumnChangeDialog`。
- `WorkspaceView` 对 `view.kind === 'chart'` 渲染 `ChartPlaceholder`；表视图仍渲染 `DataGrid`。
- 所有文案走消息表；`apps/desktop/test/ui-conventions.test.ts` 会拦硬编码中文/颜色字面量/未声明令牌。

### 4.8 E2E 证据

`apps/desktop/e2e/schema.spec.ts` 8 条：增列补 `null` + 重开；改类型成功；改类型失败字节不变；
删列 + 视图清理 + 图表错误态 + 重开；换主键成功；重复主键失败；100 列禁用新增；200% 缩放键盘可达。

完整 E2E 现为 **41 passed**；T2.1 的 `grid.spec.ts`、T2.2 的 `edit.spec.ts` 与既有 30 条仍全绿。

---

## 5. T2.3 决策与实现记录（已完成）

10 项决策全部由用户确认，详见 `docs/adr/029-t23-column-management-and-structure.md`：

1. 不升 `formatVersion`/不接迁移；运行期行数据转换，命令级回滚 + 字节不变证据。
2. 改类型逐行 `coerceCell`，失败整批取消、列出前 100 行；不置 null、不删行。
3. 删列清理视图状态；图表与样式引用保留；主键列禁止删除；换主键非空唯一并置 required。
4. 图表数据层 + 最小错误占位；完整图表留 T3.1。
5. 共用确认框、同步执行；显示行数/转换/视图/图表计数。
6. 100 列命令硬拒绝 + UI 禁用新增。
7. 列面板在右侧 Inspector；表单/确认用 Dialog；重排用按钮。
8. `table.column.reorder` 重写 schema + 行 + 所有视图顺序。
9. 结构命令只产 patches，不接撤销历史。
10. 完整 `ColumnDef` 编辑；宽度仍由视图管理；`fieldTypeId` 留 T6.1。

关键文件：

```text
packages/domain/src/column-ops.ts (+test)
packages/app-core/src/
├─ commands/{columns,column-views}.ts (+test)
├─ validation/{column-draft,column-change}.ts (+test)
├─ state/chart-validity.ts (+test)
├─ usecases/{workspace-actions,column-actions.test}.ts
└─ commands/tables.ts（table.meta.update primaryKey）
apps/desktop/src/renderer/features/columns/*
apps/desktop/src/renderer/features/charts/ChartPlaceholder.tsx
apps/desktop/e2e/schema.spec.ts
docs/adr/029-t23-column-management-and-structure.md
docs/reports/t2.3/REPORT.md
```

实测（2026-10-21）：

```text
pnpm verify         89 files / 733 tests；depcruise 265 modules / 968 deps / 0 violations
pnpm test:coverage  全局 lines 77.83% / statements 77.58% / branches 69.49% / functions 78.78%
pnpm format:check   通过
pnpm build          exit 0；renderer 1,246.01 kB
pnpm e2e            41 passed，约 1.1min
```

残留：

- 结构变更不可撤销（T5.2 统一历史；需评估 100k 行 inverse patches）。
- 100k 行改类型/重排同步执行、无进度/取消（T2.7 复核）。
- 图表完整渲染/重映射（T3.1）。
- 视图级自定义列顺序（T2.6）；当前结构重排会覆盖所有视图 `columnOrder`。
- 表内已有行时不能直接新增 required 列（需先加普通列→填值→设必填）。
- `.trash`/备份恢复 UI 仍按 T5.3；样式悬空引用在 T4.x 求值时忽略。

---

## 6. T2.4 开工前必须确认的决策（不要自行选定）

T2.4 原文摘要（`docs/TASKS.md`）：

- 依赖：T2.2；覆盖 FR-TBL-03；参考 SPEC §9.3。
- 产出：剪贴板 TSV/CSV 解析器（引号、换行、制表符）；矩阵应用（扩容行、列确认、批量校验）；
  进度与取消（>10k 单元格）。
- 验收：Excel 5×4 粘贴逐格正确；类型错误整批不提交并定位；10k 可取消且取消后数据不变；
  筛选激活时只写可见行/超出可见行整批拒绝；粘贴可一次撤销。

开工前至少确认以下歧义（结合 SPEC §19 与既有 ADR，仍无法覆盖时提问）：

1. **解析器与入口**：只做 TSV（单列含逗号再试 CSV），还是 TSV/CSV 双解析？引号/内嵌换行/制表符
   的边界与单格文本编辑如何区分？是否直接监听 `paste` 事件（无新 IPC）？
2. **锚点与目标**：以选择矩形左上角/活动单元格为锚点？矩阵大于选择区域时覆盖范围如何确定？
   排序激活时按 rowId 定位（SPEC §9.3）是否在 T2.4 实现，还是随 T2.6？
3. **筛选未实现（T2.6 才做）**：T2.4 验收含“筛选激活时只写可见行/超出可见行整批拒绝”。是否在
   T2.4 先做“筛选存在时禁用粘贴/整批拒绝”的保守行为，把完整可见行语义留 T2.6？需要用户确认，
   不得悄悄跳过验收项。
4. **新增行与空主键**：T2.4 是否实现 `table.rows.insert` 与空主键自动生成 `row_<uuid>`（SPEC §9.2）？
   ADR-028 把“新增行”留给 T2.4/T2.5，TESTPLAN E3 的“键盘新增一行”也未闭环。
5. **超列确认**：矩阵列数 > 当前列数时弹“新增 N 列”（默认 text，可改）；新增列是否复用
   `planColumnAdd`/`checkColumnDraft`？一次粘贴新增多列需要一个原子命令，还是多次
   `table.column.add` 再粘贴？100 列上限如何提示/拒绝？
6. **类型错误**：整批先 `validateCellBatch`，失败整批不写并列出错误；错误列表 UI 与“定位到第一个
   错误单元格”的交互；是否允许用户在错误对话框中取消/修正后重试？
7. **10k 取消**：粘贴 10,000 单元格以上显示进度，超过 1s 可取消。T2.2 的 `validateCellBatch` 是同步
   纯函数；T2.4 是否用 Worker/分批？取消后必须内存与磁盘都不变。
8. **撤销**：粘贴必须“一次撤销”。T2.2 历史只覆盖 `table.cell.set`；T2.4 是把 `table.paste` 接入
   同一最小历史（推荐，一次一条、不合并），还是后置 T5.2（会违反 T2.4 验收，需要用户明确同意）？
9. **保存时机**：整批粘贴作为一条命令后，走保存队列写表 + manifest（推荐），失败保留 dirty 并可
   重试；批内不能逐格写盘。
10. **性能**：10k 单元格同步校验/写入的实测预算；命令应一次替换目标行数组/追加行，避免 10k 条
    Immer 单格 patch；在 T2.7 前记录实测值。

建议验证命令：

```powershell
pnpm exec vitest run packages/table-engine packages/app-core --testNamePattern "paste"
pnpm verify
pnpm test:coverage
pnpm format:check
$env:CURVE_E2E_NO_SANDBOX = '1'
pnpm build
pnpm exec playwright test --config apps/desktop/playwright.config.ts --grep "paste"
pnpm e2e
```

T2.4 完成后停下报告，**不要自动进入 T2.5**。

---

## 7. 已知风险与处理

| 风险 | 影响 | 处理 |
|---|---|---|
| 会话策略回到 `workspace-write` | `verify`/E2E 报 EPERM | 切 `danger-full-access`，不改项目配置 |
| Windows 无 symlink 权限 | `pnpm install` 失败 | 按 §3.4 用 junction 补齐；不要删 node_modules/切 linker |
| 100k 行结构变更同步执行 | UI 短暂无响应 | T2.3 已记录；T2.7 实测/Worker 化 |
| 结构变更不可撤销 | 误操作需手工恢复 | 确认框 + 磁盘备份；T5.2 统一历史 |
| 图表/样式悬空引用 | 图表错误占位；样式求值忽略 | T3.1 重映射；T4.x 样式求值处理 |
| 保存失败但内存已变更 | `committed: true` | UI 关闭对话框，状态栏/Toast 重试；不重复执行 |
| 重排覆盖视图自定义顺序 | T2.6 视图级重排冲突 | T2.6 写新 ADR/调整语义 |
| 自动保存 1.5s 仍未实现 | 每次编辑/结构变更立即写 | T5.3 合并队列，不能并存两条写盘路径 |
| `openWorkspace` 表读取失败不 close | 残留 `.lock` | T5.3 补 close-on-failure |
| E2E 截图重写 | 工作树变脏 | 提交前还原 `docs/reports/m0/*.png` |
| 覆盖率 77.83% | 新增 UI 主要由 E2E 覆盖 | 阈值 70/60 满足；M2 报告给趋势 |
| renderer bundle 约 1.25MB | 启动/内存 | T6.4 打包阶段评估拆包/压缩 |

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
- 不在 T2.4 顺手实现 T2.5 的导入或 T2.6 的筛选/排序；不把 10 万行整体放进 React state。
- 不自动跨任务/跨里程碑；T2.4 完成后停下报告，不进入 T2.5。

---

## 9. 新会话启动检查清单

- [ ] `git status --short` 干净；`git log --oneline -3` 顶部为 T2.3 文档提交 `4177ade` 或其后的交接
      docs 提交（不早于代码提交 `213fab4`）。
- [ ] 已注入 PATH（§3.1），`pnpm --version` 为 11.28.5。
- [ ] 会话文件策略为 `danger-full-access`（§3.2）；审批提示关闭。
- [ ] 已读 `AGENTS.md`、本文件、TASKS 的 T2.4、TESTPLAN §1/§2/§3（E3）/§4/§5、
      SPEC §9.3/§8.1/§13.1/§16.1、ADR-005/006/007/014/024、ADR-028/029。
- [ ] 已确认 `pnpm verify` 基线（89 files / 733 tests）、coverage lines 77.83%、e2e 41 passed。
- [ ] 已确认 `apps/desktop/node_modules/electron/dist/electron.exe` 存在。
- [ ] 已清除 `ELECTRON_RUN_AS_NODE`；跑 E2E 前再设 `CURVE_E2E_NO_SANDBOX=1`。
- [ ] 已确认 T2.4 尚未开始，**先按 §6 逐项确认决策**，未自行选定。
- [ ] 已确认 T2.3 的列命令/保存语义/图表占位；T2.4 不得绕过命令总线或另起写盘路径。
- [ ] 已确认 E2E 写盘断言使用 `expect.poll`，截图提交前还原。
- [ ] 复述 T2.4 目标/产出/验收/风险后再动手；完成后停下报告，不进入 T2.5。
