# HANDOFF — Curve Studio 实施交接

> 本文件面向**下一个实现会话**。当前会话已完成 `T2.1`（工作区入口、表管理与虚拟化数据网格），
> 按用户要求停止，`T2.2` 尚未开始。
> 最后更新：2026-10-21 · `T2.1` 提交：`07c4763` · 分支：`main` · 工作树：干净。
> 阅读顺序：`AGENTS.md` → 本文件 → `docs/TASKS.md` 的 T2.2 →
> `docs/TESTPLAN.md` §1、§2、§3（E3）、§4、§5 →
> `docs/SPEC.md` §8.1、§9.1、§9.2、§13.1、§13.2、§15.1、§16.1 →
> `docs/DECISIONS.md` 的 ADR-005/006/007/014，再读 `docs/adr/025`、`026`、`027`。

---

## 1. 当前进度快照

| 项 | 状态 |
|---|---|
| 方案文档 | v1.0 已锁定（SPEC / TASKS / TESTPLAN / DECISIONS） |
| M0 基建（T0.1–T0.5） | **已完成**；验收报告 `docs/reports/m0/REPORT.md` |
| M1 领域与持久化（T1.1–T1.5） | **已完成并经用户验收**（2026-10-21）；报告 `docs/reports/m1/REPORT.md` |
| `T1.5` app-core 状态与命令总线 | **已完成**（`c077cf2`）；T2.1 扩展了命令与 actions |
| `T2.1` 工作区入口、表管理、网格 | **已完成**（`07c4763`）；报告 `docs/reports/t2.1/REPORT.md`；决策 ADR-027 |
| 当前里程碑 | **M2 表格数据进行中**（T2.1 完成，T2.2–T2.7 未开始） |
| 下一个任务 | **T2.2 单元格编辑与校验**；开工前必须确认 §6.5 的待定决策，不要自行选定 |
| 提交历史（近 8 条） | `07c4763 feat(tbl): ... (T2.1)`<br>`8559e32 docs(m1): record sign-off and defer crash recovery to T5.3`<br>`228e5ce test(m1): add milestone acceptance demo and report`<br>`fdd6545 docs: add T2.1 implementation handoff`<br>`c077cf2 feat(app-core): add state slices, command bus and workspace.open (T1.5)`<br>`fc54b27 docs: add T1.5 implementation handoff`<br>`3eb306e feat(domain): add migration registry, executor, backups and fixtures (T1.4)`<br>`af9ba02 docs(agents): refresh status snapshot and handoff pointers` |
| `pnpm verify` 基线 | **72 files / 594 tests**；ESLint 0；depcruise **220 modules / 737 deps / 0 violations** |
| `pnpm test:coverage` 基线 | 全局 lines **81.57%** / statements 81.12% / branches 72.95% / functions 80.76%；阈值 70/60 未下调 |
| `pnpm e2e` 基线 | **30 passed**（原 22 + T2.1 `e2e/grid.spec.ts` 8 条），约 45s |
| `pnpm format:check` | 通过 |
| 构建 | `pnpm build` exit 0；renderer 约 **1.12 MB**（含 TanStack），Worker 产物 `assets/table.worker-<hash>.js` |
| 夹具 | `fixtures/workspaces/{v1-min,corrupt-manifest,future-version,stale-lock}/`（T1.4） |

**用户明确要求**：

- 一次只做一个任务；每个任务先复述目标/产出/验收，再写测试、实现、跑 `pnpm verify` 与任务指定
  e2e/bench，最后勾选 TASKS、更新 CHANGELOG、必要时 ADR、Conventional Commit。
- **T2.2 尚未开始**；开工前先按 AGENTS §11 确认 §6.5 的待定决策，不要自行选定。
- **不要自动进入 T2.3**；每个任务完成后停下报告，等用户确认。
- M2 全部任务完成后再运行 M2 验收演示，不得跨里程碑。

---

## 2. 新会话开场提示词（可直接粘贴）

```text
工作目录：D:\DSH_Work_Space\curve-studio（仓库根）。

先读 AGENTS.md、docs/HANDOFF.md、docs/TASKS.md 的 T2.2、
docs/TESTPLAN.md §1/§2/§3（E3）/§4/§5、
docs/SPEC.md §8.1/§9.1/§9.2/§13.1/§13.2/§15.1/§16.1、
docs/DECISIONS.md 的 ADR-005/006/007/014，再读 ADR-025/026/027。

现状：M0、M1（已验收）、T1.1–T1.5、T2.1 已完成（T2.1 提交 07c4763），工作树干净；
pnpm verify 72 files / 594 tests、test:coverage 全局 lines 81.57%、format:check、
pnpm e2e 30 passed 全绿。T2.1 报告见 docs/reports/t2.1/REPORT.md。

下一步是 T2.2（单元格编辑与校验），但不要直接开工：
先按 AGENTS §11 逐项确认 HANDOFF §6.5 的待定决策（撤销范围、落盘时机、
新增行范围、错误文案/主键行号、编辑入口、日期/布尔/枚举编辑器、保存状态、批量校验），
不要自行选定；确认后先复述目标/文件/验收命令，再写测试与实现。

不要自动进入 T2.3；T2.2 完成后停下等确认。
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
T2.1 全程 `danger-full-access`，审批提示已关闭——**不要使用 `sandbox_permissions` 参数**。
这不是代码问题，不要改项目配置或加 workaround。

### 3.3 受限 shell 里的 Electron / E2E

- 直接启动 Electron 默认会因 Chromium OS 沙箱退出；E2E 必须删除 `ELECTRON_RUN_AS_NODE` 并设置
  `$env:CURVE_E2E_NO_SANDBOX = '1'`（只被 `apps/desktop/e2e/fixtures.ts` 读取，不影响应用
  `webPreferences.sandbox`）。
- 跑 E2E 前先 `pnpm build`（`pnpm e2e` 自带 build）。
- `pnpm exec playwright test --config apps/desktop/playwright.config.ts <spec>` 可直接跑单个 spec；
  PowerShell 下 `--grep "a|b"` 会被 cmd 拆开，一次只跑一个模式。
- E2E 会重写 `docs/reports/m0/*.png`（真实鼠标悬停导致字节不稳定）。提交前用
  `git checkout -- docs/reports/m0/t0.2-window.png docs/reports/m0/t0.4-shell-dark.png docs/reports/m0/t0.4-shell-light.png`
  还原，未提交的探针/截图不要带入提交。

### 3.4 Windows 符号链接权限（本机必读）

本机**没有创建符号链接的权限**。T2.1 新增 `@tanstack/react-table`、`@tanstack/react-virtual`、
`axe-core` 时再次出现：

```text
[ERR_PNPM_EPERM] [symlinkAllModules] EPERM: operation not permitted, symlink '<target>' -> '<link>'
```

处理（不要删 `node_modules`、不要切 hoisted linker、不要 `--ignore-scripts`）：

1. 从 pnpm 报错里取 `<target>` 与 `<link>`；
2. `cmd /c mklink /J "<link>" "<target>"`；
3. 重跑 `pnpm install`，直到退出码为 0；
4. 若报错是直接依赖链接（`apps/desktop/node_modules/...`），同样用 junction 补齐。

当前 `apps/desktop/node_modules/{@tanstack/react-table,@tanstack/react-virtual,axe-core}` 与
`node_modules/.pnpm/...` 的 peer 链接已是 junction，依赖解析和测试正常。干净 CI 不需要这些本地操作。
若 T2.2 需要新依赖，先按 AGENTS §4 写 ADR；能复用已有依赖就不要新增。

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
- T2.1 的 E2E 用例在 UI 更新后等 manifest 落盘时使用 `expect.poll`；新增编辑/保存测试也要这样等磁盘，
  不要直接读文件后立刻断言（渲染状态先于异步写盘）。
- E2E 截图证据字节不稳定；断言不依赖像素。
- `apps/desktop/test-results/`、`playwright-report/`、`coverage/`、`bench/` 均已 gitignore。
- Worker 产物名现在是 `table.worker-<hash>.js`（不是 T1.3 的 `table-worker-*.js`）。

---

## 4. 已交付的关键接口（直接消费，不要回退）

### 4.1 `@curve/domain`

```ts
Cell, ColumnDef, TableMeta, Row, ViewDef, ChartSpec, TableStyle, LayoutNode, WorkspaceManifest …
parseManifest/parseTableMeta/parseRow/parseCell → ParseResult / CellResult
coerceCell(raw, column): CellResult          // SPEC §8.1 的全部归一规则
formatCellValue(value, column, options?): string
checkTable/checkInvariants/assertInvariants
createId/createWorkspaceId/…/createTimestamp
ERROR_CODES/createAppError/isAppError/toAppError
CURRENT_FORMAT_VERSION = 1
MIGRATIONS = createMigrationRegistry([])     // 生产为空（ADR-024）
```

要点：`coerceCell` 已覆盖空值/必填、千分位数字、日期（`YYYY-MM-DD` 按本地时区 00:00）、
布尔 `true/false/1/0/是/否`、枚举命中；T2.2 的编辑器应复用它，不要另写一套解析。
`null`/`undefined` 在非必填列清空；text 空值归一为 `""`。

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

### 4.4 main：`FileWorkspaceStore` 与迁移备份

- `apps/desktop/src/main/workspace/file-workspace-store.ts`：路径白名单、原子写、表/manifest 备份、
  `.lock`、最近列表、打开时按磁盘重算 `rowCount`。`open` 只计数不解析。
- `trash` **按 `tableId` 解析文件**，不要求表仍在 manifest 中（T2.1 删除顺序“写 manifest → trash”，
  ADR-027）。
- `apps/desktop/src/main/workspace/migration-backup.ts`：迁移前 `tables/` 字节快照、失败回滚；
  **尚未接进生产打开路径**（T2.3）。
- 迁移注册表为空；未来版本仍以 `E_WS_VERSION_UNSUPPORTED` 拒绝。

### 4.5 IPC / preload / renderer

`IMPLEMENTED_IPC_CHANNELS` 共 **11** 个：

```text
app:info
dialog:pickDirectory
log:write
workspace:create/open/close/recent
manifest:write
table:read/write/trash
```

- `app:info` 响应增加 `documentsDir`（T2.1）；`dialog:pickDirectory` 请求为
  `{ title?, defaultPath? }`，响应 `{ path } | null`。
- `dialog:saveFile` / `file:*` / `backup:*` / `workspace:recent:remove|clear` **仍只有通道名**，
  没有 handler/preload 方法。
- `apps/desktop/src/renderer/api-client.ts` 已提供 `app`、`dialog`、`workspace`、`manifest`、`table`，
  所有方法返回 `IpcResult<T>`，入参与响应双向 Zod 校验。
- `apps/desktop/src/renderer/table-io/client.ts`：`createTableIoClient`，请求 id 关联、120s 超时、
  Worker 错误/终止结算所有 pending；T2.1 已接入 `openWorkspace` 的异步解码。
- Worker 入口不再显式列在 `electron.vite.config.ts`；Vite 自己产出 `table.worker-<hash>.js`。

### 4.6 `@curve/app-core`（T1.5 + T2.1）

```ts
createAppCore({ workspaceStore, logger?, now?, uuid?, decodeTable? }): {
  store: AppStore;
  commands: CommandBus;
  openWorkspace(request): Promise<OpenWorkspaceOutcome>;
  actions: WorkspaceActions;
}
```

已注册命令（全部同步、走 Immer patches）：

| 命令 | 载荷 | 说明 |
|---|---|---|
| `table.cell.set` | `{ tableId, rowId, columnId, value }` | `coerceCell`、主键非空/唯一、只替换目标行、更新 `updatedAt`；`mergeKey = table.cell.set:<t>:<r>:<c>` |
| `table.create` | `{ table, view }` | 新表 + 表视图 + 标签；`rowCount: 0`，不落文件 |
| `table.delete` | `{ tableId }` | 级联删除 chart/view/layout 引用，活动标签回退 |
| `table.meta.update` | `{ tableId, name }` | 重命名表与该表所有视图标题 |
| `view.create` | `{ view }` | 新建视图并加入布局 |
| `view.delete` | `{ viewId }` | 关闭标签并从布局移除 |
| `view.update` | `{ viewId, patch }` | 列宽、冻结列数、列顺序、隐藏列、排序、标题等 |
| `view.layout` | `{ layout }` | 校验引用后替换布局并同步活动视图 |

`WorkspaceActions`（T2.1）：

```ts
createTable(name, primaryKey?): Promise<ActionOutcome<TableCreatePayload>>
renameTable(tableId, name): Promise<ActionOutcome>
deleteTable(tableId): Promise<ActionOutcome>   // dispatch → writeManifest → trash
openTable(tableId): Promise<ActionOutcome<{ viewId, created }>>
activateView(viewId): Promise<ActionOutcome>
closeView(viewId): Promise<ActionOutcome>
updateView(viewId, patch): Promise<ActionOutcome>
saveManifest(): Promise<ActionOutcome>
closeWorkspace(): Promise<ActionOutcome>
```

其他导出：`createNewTablePayload`、`createOpenTableView`、`stateToManifest`、
`countTableReferences`、`findActivePane`/`listPanes`/`addViewToLayout`/`activateViewInLayout`/
`removeViewFromLayout`、选择器。

**T2.2 起点**：

- `table.cell.set` 已有全部校验与 patches，但没有撤销历史栈；`CommandResult` 有
  `patches/inversePatches/mergeKey`。
- 命令成功后 `ui.dirtyTables` 通过 `DirtyTableTracker` 标记；没有保存队列/保存指示。
- `openWorkspace` 支持注入异步 `decodeTable`；解码失败整体失败并写 `ui.error`。
- **没有任何编辑器、没有 `table.write` 的编辑保存路径**；网格是只读的。

### 4.7 renderer 结构（T2.1）

```text
apps/desktop/src/renderer/
├─ app-core/
│  ├─ renderer-core.ts          # 单一组合根（api-client + WorkspaceStore + Worker + app-core）
│  ├─ use-app-core.tsx          # AppCoreProvider / useRendererCore / useAppState
│  ├─ use-workspace-controller.ts
│  └─ workspace-store.ts        # IpcResult → WorkspaceStore（抛 AppError）
├─ features/workspace/          # WelcomePage/NewWorkspaceDialog/OpenWorkspaceDialog/TabBar/WorkspaceView
├─ features/tables/             # TableList/NewTableDialog/RenameTableDialog/DeleteTableDialog
├─ features/grid/               # DataGrid/GridHeader/GridCell/SelectionLayer/grid-navigation/grid-sizing
└─ shell/                       # AppShell/TitleBar/Sidebar/StatusBar/Inspector/HelpDialog
```

- `AppShell` 在 `workspace === null` 时渲染 `WelcomePage`，否则 `WorkspaceView`；错误经
  `ui.error` → Toast，`workspace.warnings` 以横幅显示。
- `DataGrid` 是**只读**的：TanStack Table v8 + Virtual v3、32px 行高、`aria-rowcount/colcount`、
  方向键/Tab/Home/End/PageUp/PageDown、矩形选择、冻结列、列宽拖拽/双击自适应（写入
  `view.tableView.widths`）、axe 无 critical、200% 缩放可用。
- 网格没有编辑入口/编辑器；`GridCell` 有 `aria-readonly="true"`。
- 所有文案走 `i18n/messages/{zh-CN,en-US}.ts`；`apps/desktop/test/ui-conventions.test.ts` 会拦硬编码中文。

### 4.8 T2.1 的 E2E 证据

`apps/desktop/e2e/grid.spec.ts` 8 条：

1. 欢迎页 → 新建工作区 → 建表 → 重命名 → 删除到 `.trash` → 最近重开；
2. picker 替身 + 可编辑路径成功打开工作区；
3. 被引用表的级联数量确认 + manifest 清理；
4. 打开警告横幅与 dismiss；
5. 50 行网格 ARIA/键盘/矩形选择 + axe；
6. 列宽拖拽/双击自适应 + 重开保留；
7. 200% 缩放仍可键盘操作；
8. 100k 首帧（实测 **405ms**）+ 滚动采样（**165.7fps**，合成 rAF）。

---

## 5. T2.1 实施记录（已完成 2026-10-21，提交 `07c4763`）

### 5.1 交付文件

```text
packages/app-core/src/
├─ commands/{layout,tables,views}.ts (+ tests)
├─ usecases/{open-workspace,workspace-actions}.ts (+ tests)
├─ state/selectors.ts                 # countTableReferences
└─ app-core.ts / index.ts

apps/desktop/src/
├─ renderer/app-core/{renderer-core,use-app-core,use-workspace-controller,workspace-store}.ts(x)
├─ renderer/features/{workspace,tables,grid}/*.tsx/ts
├─ renderer/shell/{AppShell,TitleBar,Sidebar,StatusBar}.tsx
├─ renderer/{App.tsx,api-client.ts,styles.css}
├─ main/{index.ts,ipc/handlers.ts,workspace/file-workspace-store.ts}
├─ preload/api.ts
└─ shared/contracts/{ipc,channels}.ts
```

配套：ADR-027、`docs/reports/t2.1/REPORT.md`、TASKS/CHANGELOG/HANDOFF/AGENTS、`e2e/grid.spec.ts`、
`@tanstack/*` 与 `axe-core` 依赖、`pnpm-lock.yaml`。

### 5.2 开工前经用户确认的八个决策

1. 新增 `table.create`/`table.delete` 同步命令。
2. 建表/改名/删表/视图变更后立即写 manifest；单元格编辑留 T2.2。
3. 新表只写 manifest 条目，不落 0 字节文件。
4. 实现 `dialog:pickDirectory`；默认父目录 `Documents/Curve Studio`。
5. 删除用 Dialog 列数量后一条命令级联。
6. `openWorkspace` 注入 Worker 异步解码端口；删除显式 `table-worker` 入口。
7. TanStack Table v8 + Virtual v3；axe-core 测试专用。
8. `workspace:recent:remove/clear` 后置 T5.3。

### 5.3 已验证证据

| 命令 | 结果 |
|---|---|
| `pnpm verify` | exit 0；**72 files / 594 tests**；depcruise **220 modules / 737 deps / 0 violations** |
| `pnpm test:coverage` | exit 0；全局 lines **81.57%** / branches 72.95%；阈值 70/60 未下调 |
| `pnpm format:check` | exit 0 |
| `pnpm e2e` | **30 passed**（约 45s） |
| `pnpm build` | exit 0；`assets/table.worker-<hash>.js` |

### 5.4 与计划/规格的差异

- `table.create`/`table.delete` 是 T2.1 新增命令，SPEC §13.1 与 ADR-027 已同步。
- `app:info` 增加 `documentsDir`，`dialog:pickDirectory` 请求增加 `defaultPath`（SPEC §15.1/§15.4）。
- `table:trash` 改为按 id 解析文件；支持“manifest 先写、文件后移”的删除顺序。
- 显式 `table-worker` 入口删除，Worker 产物命名变化；`table-io.spec.ts` 已同步。
- 全局覆盖率从 93.62% 降到 **81.57%**（新增 UI 由 E2E 覆盖，Vitest 不计）；阈值仍满足。
- 未实现：`workspace:recent:remove/clear`、恢复对话框/备份重建（T5.3）、迁移接线（T2.3）、
  单元格编辑（T2.2）。

---

## 6. T2.2 工作交接：单元格编辑与校验

### 6.1 任务原文摘要（`docs/TASKS.md` T2.2）

- 依赖：T2.1（已满足）
- 覆盖：FR-TBL-02
- 参考：SPEC §9.2、§8.1
- 产出：
  - 各类型编辑器：文本、数字、日期、布尔、枚举下拉
  - 提交/取消/失焦语义；错误态与状态栏定位
  - 主键重复、必填、枚举、范围校验
  - 命令接入与撤销钩子
- 步骤：
  1. 编辑器受控于单元格本地状态，提交时才进 store。
  2. `validateCell` 返回 issue；非法不写模型。
  3. Enter 提交下移、Tab 提交右移、Esc 取消。
  4. 批量操作先整体校验。
- 验收：
  - [ ] 5 种类型均可编辑；非法值不落库且错误可读。
  - [ ] 主键重复被阻止并定位冲突行。
  - [ ] 编辑一次 = 一条撤销记录（800ms 合并）。
  - [ ] 纯键盘可完成“改一格”。

### 6.2 T2.2 起点（重要）

已经存在：

- `table.cell.set`：解析/归一、主键非空唯一、只替换目标行、更新表/工作区 `updatedAt`、
  返回 `next/patches/inversePatches/mergeKey`；失败只写 `ui.error`，文档不变。
- `coerceCell` 的全部类型规则；`formatCellValue` 的显示基线。
- `DirtyTableTracker` 与 `ui.dirtyTables`；`table.write` IPC；Worker `encode` 能力。
- `DataGrid` 的 active cell、选择、键盘移动、虚拟化、冻结列、列宽持久化。
- 编辑失败的 `ui.error` → AppShell Toast；状态栏目前没有编辑/保存专用的 slot。

尚未存在：

- 任何编辑器组件、编辑态状态机、F2/双击/输入入口。
- `WorkspaceActions` 的 `updateCell`/`saveTable`；renderer 从未调用 `table.cell.set`。
- 撤销/重做历史栈（T5.2 才做完整栈）；`table.cell.set` 只产 patches。
- 单元格编辑后的 JSONL 落盘与“保存中/已保存/失败”状态。
- 主键冲突的**行号**（当前错误 message 只有冲突 rowId）。
- 批量校验（粘贴/导入在 T2.4/T2.5）。

### 6.3 规格行为契约（SPEC §9.2）

- 编辑提交：Enter、Tab、失焦；Esc 取消。
- 提交时立即校验；非法值**不写模型**，单元格保持编辑态并显示错误。
- 错误态：红色描边 + tooltip；状态栏显示“第 N 行 · 列 X：原因”。
- 主键重复：阻止提交，提示冲突行号。
- 新增行（含粘贴/导入新增）主键为空时自动生成 `row_<uuid>`（仅 text 主键）；显式填值则校验唯一。
- 批量清空/粘贴：先整体校验，失败整批不写并列出错误。
- 每次提交是一条命令（SPEC §13），支持撤销。
- 键盘入口：F2 编辑、Enter 提交并下移、Esc 取消；方向键移动、Tab 下一格、
  Delete 清空（SPEC §9.1）。

### 6.4 建议实现结构（待确认后实施）

```text
apps/desktop/src/renderer/features/grid/
├─ editors/
│  ├─ CellEditor.tsx            # 按 column.type 分发；受控本地值
│  ├─ TextCellEditor.tsx
│  ├─ NumberCellEditor.tsx
│  ├─ DateCellEditor.tsx
│  ├─ BooleanCellEditor.tsx
│  ├─ EnumCellEditor.tsx
│  └─ editor-value.ts           # value → 编辑文本 / 编辑文本 → raw 纯函数
├─ use-cell-editing.ts          # 编辑态、提交/取消、错误、焦点/滚动
├─ DataGrid.tsx                 # 接入编辑态（只渲染 active cell 的编辑器）
└─ GridCell.tsx                 # editing 时渲染编辑器/占位；保留 memo

packages/app-core/src/
├─ commands/table-cell-set.ts   # 补 rowNumber/detail；保持无 IO
├─ usecases/workspace-actions.ts# 新增 updateCell（和保存，按决策）
└─ （如实现撤销钩子）history/…  # 或只暴露 mergeKey，等 T5.2
```

关键点：

- 编辑器状态**只存在单元格本地**，提交时才 dispatch；不要在 onChange 时写 store。
- 只给 active cell 渲染编辑器，避免 100k 行时每格一个 input；`GridCell` 继续 memo。
- 提交时把原始输入交给 `coerceCell`/`table.cell.set`；不要复制归一逻辑。
- 编辑器的显示值用 `formatCellValue` 的反向映射：text 原值、number 字符串、date 用本地
  `YYYY-MM-DD`、boolean 三态、enum 用 value。
- 错误提示优先使用结构化 detail（见 §6.5），不要直接显示命令的英文 message。
- 中文输入法：`compositionstart/end` 期间不要用 Enter 提交；Esc 取消仍可用。
- 编辑中切换活动单元格/滚动虚拟列表时，先提交或取消（决定见 §6.5），不要留下失焦编辑器。

### 6.5 T2.2 开工前必须向用户确认的决策（AGENTS §11）

> 不要自行选定。建议用 `ask_user_question` 逐项确认，并记录到 ADR（建议 ADR-028）。

1. **单元格编辑的落盘时机**：
   - A（推荐）：每次成功提交后异步保存该表（Worker encode + `table:write`，串行/合并写；
     失败保留 dirty 并显示可重试错误），并写 manifest 记录 `updatedAt`；
   - B：只标 dirty，等 T5.3 自动保存（重启会丢编辑）；
   - C：500ms 防抖保存，T5.3 再统一成 1.5s 队列。
2. **撤销范围**：T2.2 先实现最小历史栈（每次提交一条，800ms 合并，Ctrl/Cmd+Z、Shift+Z），
   还是只消费/保留 `mergeKey` 与 patches，把完整撤销 UI 留给 T5.2？
   （验收写“编辑一次 = 一条撤销记录”，与 T5.2 的范围有重叠，必须明确。）
3. **新增行是否属于 T2.2**：TESTPLAN E3 有“键盘新增一行”，但 TASKS T2.2 产出没有列
   `table.rows.insert`；是现在加最小新增行（含空主键自动 `row_<uuid>`），还是留给 T2.4/T2.5？
4. **错误模型与本地化**：是否为 `table.cell.set` 返回机器可读 `detail`（reason/column/rowNumber）
   并在 renderer 用 `t(key)` 拼中文？还是只按 `AppError.code` 显示通用文案？主键冲突必须给行号。
5. **主键冲突定位**：只显示“与第 N 行冲突”，还是同时滚动/高亮冲突行？
6. **编辑入口**：F2 + 双击 + 直接输入三种都做，还是只做 F2/双击（键盘优先）？
   失焦提交、Tab 提交右移、Enter 提交下移、Esc 取消是否全部按 SPEC？
7. **编辑器表示**：date 用 `<input type="date">`（本地午夜，按 §8.1）还是文本 ISO？
   boolean 用三态 select（空/是/否）还是 checkbox + “清空”操作？enum 空值如何表示？
8. **保存状态/批量校验范围**：T2.2 是否加状态栏“保存中/已保存/失败”？“批量操作先整体校验”
   在 T2.2 只提供 app-core 的批量校验入口，还是等 T2.4 粘贴/T2.5 导入时一起做？

### 6.6 推荐实现步骤（确认决策后）

1. 先写 app-core 测试：`table.cell.set` 各类型归一、必填/枚举/范围、主键重复（含行号）、
   失败不改文档、patches 可逆、mergeKey；补 `updateCell`（如采用）与保存顺序测试。
2. 纯逻辑先写 `editor-value.ts` 测试：Cell → 编辑文本、编辑文本 → 提交 raw、日期本地午夜、
   空值/必填、枚举 label/value、boolean 三态。
3. 实现编辑器组件 + `CellEditor` 分发；组件只做受控输入与事件。
4. 接入 `DataGrid`：F2/双击/输入进入编辑；Enter/Tab/Shift+Tab/Esc/失焦；提交后按决策移动活动格；
   编辑中 `aria` 状态、焦点与 `virtualizer.scrollToIndex`；保存/错误状态。
5. 错误 UI：单元格红色描边 + tooltip + 状态栏定位；i18n 文案（zh-CN/en-US）。
6. 落盘/撤销按决策实现；若做保存，Worker encode + `table:write` + manifest `updatedAt`，
   失败保留 dirty 且可重试；成功清 dirty。
7. 写 E2E `apps/desktop/e2e/edit.spec.ts`：seed 5 种列（text/number/date/boolean/enum）→ 打开 →
   逐类型编辑；非法数字/枚举被拒且原值不变；主键重复给行号；Esc 取消；Enter 下移、Tab 右移；
   纯键盘改一格；撤销（若范围包含）；重开验证落盘（若范围包含）。
8. 跑 `pnpm verify`、`pnpm test:coverage`、`pnpm format:check`、`pnpm e2e`；还原 M0 截图；
   更新 TASKS/CHANGELOG/ADR/HANDOFF；提交；停下等确认。

### 6.7 验收映射与测试计划

| 验收项 | 测试 |
|---|---|
| 5 种类型可编辑；非法值不落库且错误可读 | Vitest：`coerceCell`/command/editor-value；E2E：逐类型编辑 + 非法数字/枚举 |
| 主键重复被阻止并定位冲突行 | app-core：错误 detail 带 rowNumber；E2E：提示行号/高亮 |
| 编辑一次 = 一条撤销记录（800ms 合并） | 按 §6.5 决策：history 测试或明确移交 T5.2（不得静默跳过） |
| 纯键盘完成“改一格” | E2E：F2 → 输入 → Enter；Tab/Esc；焦点与 active cell |

### 6.8 T2.2 关键陷阱

| 陷阱 | 处理 |
|---|---|
| 组件里直接 `store.setState` 改单元格 | 必须 `commands.dispatch('table.cell.set')` |
| onChange 就写 store | 编辑器本地状态，提交才 dispatch |
| 每次编辑重新渲染整张 100k 表 | 只给 active cell 渲染编辑器；`GridCell` memo；行虚拟化 |
| 非法值已经改 state | 命令抛错时 Immer 回滚；UI 保持编辑态 |
| 主键冲突只给 rowId | 扩展 detail 带 1-based 行号；UI 可滚动到该行 |
| Enter 在中文输入法组合中被当提交 | 监听 composition；组合中不提交 |
| 编辑器失焦时丢输入 | Enter/Tab/失焦统一走 commit；Esc 才 cancel |
| 日期时区漂移 | `YYYY-MM-DD` 按本地午夜；显示用 Intl，模型存 epoch ms |
| 清空必填单元格 | `coerceCell` 返回 `E_REQUIRED`，保持编辑态 |
| 保存阻塞输入 | Worker encode + 异步 IPC；串行/合并写；失败保留 dirty |
| 保存后 manifest `updatedAt` 丢失 | 按 §6.5 决策，保存表后同步写 manifest |
| 关闭工作区/退出时未保存 | 与 §6.5 保存决策一起定义；T5.3 前不得承诺自动保存 |
| 状态栏硬编码中文 | 全部走 `t(key)`，补 `en-US` |
| E2E 读盘早于异步写 | `expect.poll` 等 JSONL/manifest |

### 6.9 验证命令（PowerShell）

```powershell
$env:PATH = "D:\DSH_Work_Space\tools\bin;C:\Users\MECHREVO\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin;$env:PATH"
cd D:\DSH_Work_Space\curve-studio
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue

pnpm exec vitest run apps/desktop packages/app-core --testNamePattern "cell|edit"
pnpm verify
pnpm test:coverage
pnpm format:check

$env:CURVE_E2E_NO_SANDBOX = '1'
pnpm build
pnpm exec playwright test --config apps/desktop/playwright.config.ts --grep "edit"
pnpm exec playwright test --config apps/desktop/playwright.config.ts
```

提交前还原被 E2E 重写的 `docs/reports/m0/*.png`。

---

## 7. 后续里程碑提醒

- `T2.3` 是首个真实迁移落点：接 `FileWorkspaceStore.open`、升 `CURRENT_FORMAT_VERSION`、
  补 v1→v2 夹具与逐行等价测试；不要顺手接进 T2.2。
- `T2.4` 区域粘贴：TSV/CSV、引号/换行、超列确认、整批校验与撤销一条。
- `T2.5` CSV/JSON 导入：编码/分隔符嗅探、类型推断、Worker、进度/取消、错误 CSV。
- `T2.6` 筛选/排序：`selectVisibleRows` 语义改变，保持 O(1) 引用/缓存，不要每次全表遍历。
- `T2.7` 10 万行性能与 M2 验收演示：`pnpm bench`、首帧/滚动/编辑 P95、内存预算。
- `T5.2` 撤销/重做：消费 `CommandResult.patches/inversePatches`，800ms 合并；如果 T2.2 已做
  最小历史，T5.2 必须复用而不是另起一套。
- `T5.3` 自动保存、崩溃恢复、最近列表移除/清空（ADR-026/027）；T2.2 的保存策略要与它兼容。
- `T5.1` 分栏布局：`view.layout` 与 `findActivePane` 已按递归 layout 实现，分割 pane 时复核。

---

## 8. 已知风险与处理

| 风险 | 影响 | 处理 |
|---|---|---|
| 会话策略回到 `workspace-write` | `verify`/E2E 报 EPERM | 切 `danger-full-access`，不改项目配置 |
| Windows 无 symlink 权限 | `pnpm install` 失败 | 按 §3.4 用 junction 补齐；不要删 node_modules/切 linker |
| 覆盖率从 93.62% 降到 81.57% | 新增 UI 未被 Vitest 覆盖 | 阈值 70% 满足；T2.2 补组件测试，M2 报告给趋势 |
| renderer bundle 约 1.12MB | 启动/内存 | T6.4 打包阶段评估拆包/压缩 |
| `openWorkspace` 表读取失败不 close | 残留 `.lock`（HANDOFF 旧 §7.4.7） | T2.3/T5.3 补 close-on-failure |
| 100k 滚动帧率为合成 rAF | 非正式性能门禁 | T2.7 `pnpm bench` 固化 |
| E2E 截图重写 | 工作树变脏 | 提交前还原 `docs/reports/m0/*.png` |
| 保存/落盘晚于 UI | 重开可能丢编辑 | T2.2 按 §6.5 明确保存时机；T5.3 前不承诺自动保存 |
| 撤销范围与 T5.2 重叠 | 返工 | §6.5 决策 + ADR-028；T5.2 复用 |
| 主键冲突错误只有 rowId | 无法定位行号 | T2.2 扩展 detail 带 1-based 行号 |
| 日期输入时区 | 跨时区漂移 | 按 SPEC §8.1 本地午夜；测试固定时区/本地日期 |
| `workspace:recent:remove/clear` 未实现 | 欢迎页不能移除 | T5.3 |
| 恢复对话框/备份重建未实现 | 崩溃后应用内无法恢复 | T5.3（ADR-026） |

---

## 9. 不可做清单（重申）

- 不关闭 `contextIsolation` / `sandbox` / `webSecurity`，不打开 `nodeIntegration`。
- 不把 `--no-sandbox`、`CURVE_E2E_NO_SANDBOX` 写进应用代码、默认脚本或 CI。
- 不为 Worker 放宽 CSP；同源 module Worker 已验证可用。
- 不在 renderer 里 `require('fs')`、读任意路径、暴露 `ipcRenderer` 本体或泛 `invoke`。
- 不把 Zod 或任何外部包放进 preload。
- 不绕过命令总线直接改 store（撤销会坏）；不在组件里写业务逻辑。
- 不加未经 ADR 的运行时依赖；不跳过测试、不放宽 ESLint/覆盖率规则、不用 `--no-verify`。
- 不未经 ADR/用户确认升级 `formatVersion`、改数据格式、IPC 通道或公共 API。
- 不把迁移接进 `FileWorkspaceStore.open`（T2.3）。
- 不把 10 万行整体放进 React state 并逐单元格触发全局重渲染；编辑器只给 active cell。
- 不自动跨任务/跨里程碑；T2.2 报告后停下等确认，不进入 T2.3。

---

## 10. 新会话启动检查清单

- [ ] `git status --short` 干净；`git log --oneline -3` 顶部为 T2.1 提交 `07c4763`。
- [ ] 已注入 PATH（§3.1），`pnpm --version` 为 11.28.5。
- [ ] 会话文件策略为 `danger-full-access`（§3.2）；审批提示关闭。
- [ ] 已读 `AGENTS.md`、本文件、TASKS 的 T2.2、TESTPLAN §1/§2/§3（E3）/§4/§5、
      SPEC §8.1/§9.1/§9.2/§13.1/§13.2/§15.1/§16.1、ADR-005/006/007/014、ADR-025/026/027。
- [ ] 已确认 `pnpm verify` 基线（72 files / 594 tests）、coverage lines 81.57%、e2e 30 passed。
- [ ] 已确认 `apps/desktop/node_modules/electron/dist/electron.exe` 存在。
- [ ] 已清除 `ELECTRON_RUN_AS_NODE`；跑 E2E 前再设 `CURVE_E2E_NO_SANDBOX=1`。
- [ ] 已确认 T2.2 尚未开始，**先按 §6.5 逐项确认决策**，未自行选定。
- [ ] 已确认保存时机、撤销范围、新增行、错误本地化、主键行号等问题已问用户。
- [ ] 已确认网格是只读的、`table.cell.set` 已存在但没有编辑器/历史/编辑保存路径。
- [ ] 已确认 E2E 写盘断言使用 `expect.poll`，截图提交前还原。
- [ ] 复述 T2.2 目标/产出/验收/风险后再动手；完成后停下报告，不进入 T2.3。
