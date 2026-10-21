# HANDOFF — Curve Studio 实施交接

> 本文件面向**下一个实现会话**。当前会话已完成 `T2.2`（单元格编辑与校验），
> 按用户要求停止，`T2.3` 尚未开始。
> 最后更新：2026-10-21 · `T2.2` 代码提交 `641cd86`、文档提交 `d46bc8f` · 分支 `main` · 工作树干净。
> 阅读顺序：`AGENTS.md` → 本文件 → `docs/TASKS.md` 的 T2.3 →
> `docs/TESTPLAN.md` §1、§2、§3（E3）、§4、§5 →
> `docs/SPEC.md` §6.6、§7.6、§9.0、§13.1、§15.1、§16.1 →
> `docs/DECISIONS.md` 的 ADR-005/006/007/014/015/024，再读 ADR-028/027/025。

---

## 1. 当前进度快照

| 项 | 状态 |
|---|---|
| 方案文档 | v1.0 已锁定（SPEC / TASKS / TESTPLAN / DECISIONS） |
| M0 基建（T0.1–T0.5） | **已完成**；验收报告 `docs/reports/m0/REPORT.md` |
| M1 领域与持久化（T1.1–T1.5） | **已完成并经用户验收**（2026-10-21）；报告 `docs/reports/m1/REPORT.md` |
| `T1.5` app-core 状态与命令总线 | **已完成**（`c077cf2`）；T2.1/T2.2 扩展了命令、actions、历史与保存 |
| `T2.1` 工作区入口、表管理、网格 | **已完成**（`07c4763`）；报告 `docs/reports/t2.1/REPORT.md`；ADR-027 |
| `T2.2` 单元格编辑与校验 | **已完成**（`641cd86`）；报告 `docs/reports/t2.2/REPORT.md`；ADR-028 |
| 当前里程碑 | **M2 表格数据进行中**（T2.1、T2.2 完成，T2.3–T2.7 未开始） |
| 下一个任务 | **T2.3 列管理、结构变更与迁移**；开工前必须按 AGENTS §11 确认歧义，不要自行选定 |
| 提交历史（近 6 条） | `d46bc8f docs(t2.2): record final verification numbers`<br>`641cd86 feat(tbl): add cell editing, validation, undo and saving (T2.2)`<br>`b8597e6 docs: add T2.2 implementation handoff`<br>`07c4763 feat(tbl): ... (T2.1)`<br>`8559e32 docs(m1): record sign-off and defer crash recovery to T5.3`<br>`228e5ce test(m1): add milestone acceptance demo and report` |
| `pnpm verify` 基线 | **78 files / 638 tests**；ESLint 0；depcruise **242 modules / 851 deps / 0 violations** |
| `pnpm test:coverage` 基线 | 全局 lines **77.73%** / statements 77.42% / branches 68.82% / functions 78.42%；阈值 70/60 未下调 |
| `pnpm e2e` 基线 | **33 passed**（原 30 + T2.2 `e2e/edit.spec.ts` 3 条），约 51s |
| `pnpm format:check` | 通过 |
| 构建 | `pnpm build` exit 0；renderer **1,164.07 kB**；Worker `assets/table.worker-<hash>.js` |
| 夹具 | `fixtures/workspaces/{v1-min,corrupt-manifest,future-version,stale-lock}/`（T1.4） |

**用户明确要求**：

- 一次只做一个任务；每个任务先复述目标/产出/验收，再写测试、实现、跑 `pnpm verify` 与任务指定
  e2e/bench，最后勾选 TASKS、更新 CHANGELOG、必要时 ADR、Conventional Commit。
- **T2.2 已完成**；**不要自动进入 T2.3**，先停下等用户确认。
- M2 全部任务完成后再运行 M2 验收演示，不得跨里程碑。

---

## 2. 新会话开场提示词（可直接粘贴）

```text
工作目录：D:\DSH_Work_Space\curve-studio（仓库根）。

先读 AGENTS.md、docs/HANDOFF.md、docs/TASKS.md 的 T2.3、
docs/TESTPLAN.md §1/§2/§3（E3）/§4/§5、
docs/SPEC.md §6.6/§7.6/§9.0/§13.1/§15.1/§16.1、
docs/DECISIONS.md 的 ADR-005/006/007/014/015/024，再读 ADR-028/027/025。

现状：M0、M1（已验收）、T1.1–T1.5、T2.1、T2.2 已完成；T2.2 提交 641cd86，工作树干净；
pnpm verify 78 files / 638 tests、test:coverage 全局 lines 77.73%、format:check、
pnpm e2e 33 passed 全绿。T2.2 报告见 docs/reports/t2.2/REPORT.md，决策见 ADR-028。

下一步是 T2.3（列管理、结构变更与迁移），但不要直接开工：
先按 AGENTS §11 逐项确认 HANDOFF §6 的待定决策（是否升 formatVersion/接迁移、
改类型失败策略、删列/改主键的引用清理、破坏性确认、100 列上限、列面板入口等），
不要自行选定；确认后先复述目标/文件/验收命令，再写测试与实现。

不要自动进入 T2.4；T2.3 完成后停下等确认。
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
T2.1/T2.2 全程 `danger-full-access`，审批提示已关闭——**不要使用 `sandbox_permissions` 参数**。
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
`axe-core` 时出现过：

```text
[ERR_PNPM_EPERM] [symlinkAllModules] EPERM: operation not permitted, symlink '<target>' -> '<link>'
```

处理（不要删 `node_modules`、不要切 hoisted linker、不要 `--ignore-scripts`）：

1. 从 pnpm 报错里取 `<target>` 与 `<link>`；
2. `cmd /c mklink /J "<link>" "<target>"`；
3. 重跑 `pnpm install`，直到退出码为 0；
4. 若报错是直接依赖链接（`apps/desktop/node_modules/...`），同样用 junction 补齐。

当前依赖解析正常。若 T2.3 需要新依赖，先按 AGENTS §4 写 ADR；能复用已有依赖就不要新增。

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
- T2.1/T2.2 的 E2E 在 UI 更新后等 manifest/JSONL 落盘时使用 `expect.poll`；新增编辑/保存测试也要这样等
  磁盘，不要直接读文件后立刻断言（渲染状态先于异步写盘）。
- T2.2 的保存是“提交后异步写”，编辑成功的断言不要假设 `updateCell` 返回时磁盘已更新；用
  `expect.poll` 或状态栏“已保存”。
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

- `coerceCell` 已覆盖空值/必填、千分位数字、日期（`YYYY-MM-DD` 按本地时区 00:00）、
  布尔 `true/false/1/0/是/否`、枚举命中；T2.2 编辑器复用它，不要另写一套解析。
- `null`/`undefined` 在非必填列清空；text 空值归一为 `""`。
- 迁移框架已存在（`runMigrations`、注册表、备份/回滚原语），但**生产打开流程尚未接线**；
  是否在 T2.3 接线是待确认决策。

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
  **尚未接进生产打开路径**。迁移注册表为空；未来版本仍以 `E_WS_VERSION_UNSUPPORTED` 拒绝。

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

- `app:info` 响应含 `documentsDir`；`dialog:pickDirectory` 请求为 `{ title?, defaultPath? }`。
- `dialog:saveFile` / `file:*` / `backup:*` / `workspace:recent:remove|clear` **仍只有通道名**，
  没有 handler/preload 方法。
- `apps/desktop/src/renderer/api-client.ts` 已提供 `app`、`dialog`、`workspace`、`manifest`、`table`，
  所有方法返回 `IpcResult<T>`，入参与响应双向 Zod 校验。
- `apps/desktop/src/renderer/table-io/client.ts`：`createTableIoClient`，请求 id 关联、120s 超时、
  Worker 错误/终止结算所有 pending；`openWorkspace` 用 `decode`，保存队列用 `encode`。

### 4.6 `@curve/app-core`（T1.5 + T2.1 + T2.2）

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
| `table.cell.set` | `{ tableId, rowId, columnId, value }` | `checkTableCellSet` + `coerceCell`、主键非空/唯一、只替换目标行、更新 `updatedAt`；`mergeKey = table.cell.set:<t>:<r>:<c>` |
| `table.create` | `{ table, view }` | 新表 + 表视图 + 标签；`rowCount: 0`，不落文件 |
| `table.delete` | `{ tableId }` | 级联删除 chart/view/layout 引用，活动标签回退 |
| `table.meta.update` | `{ tableId, name }` | 重命名表与该表所有视图标题 |
| `view.create` | `{ view }` | 新建视图并加入布局 |
| `view.delete` | `{ viewId }` | 关闭标签并从布局移除 |
| `view.update` | `{ viewId, patch }` | 列宽、冻结列数、列顺序、隐藏列、排序、标题等 |
| `view.layout` | `{ layout }` | 校验引用后替换布局并同步活动视图 |

`WorkspaceActions`：

```ts
createTable(name, primaryKey?): Promise<ActionOutcome<TableCreatePayload>>
renameTable(tableId, name): Promise<ActionOutcome>
deleteTable(tableId): Promise<ActionOutcome>   // dispatch → 取消待写 → writeManifest → trash
openTable(tableId): Promise<ActionOutcome<{ viewId, created }>>
activateView(viewId): Promise<ActionOutcome>
closeView(viewId): Promise<ActionOutcome>
updateView(viewId, patch): Promise<ActionOutcome>
updateCell(tableId, rowId, columnId, value): Promise<ActionOutcome<CellUpdateResult>>
  // 失败时 ActionOutcome 额外带 issue?: CellIssue；不写文档
undo(): Promise<ActionOutcome>                 // 仅 table.cell.set 最小历史
redo(): Promise<ActionOutcome>
retrySave(): Promise<ActionOutcome>
flushSaves(): Promise<ActionOutcome>           // 等待保存队列（≤3s）
saveManifest(): Promise<ActionOutcome>
closeWorkspace(): Promise<ActionOutcome>       // 先 flush；失败保持工作区打开
```

其他导出：

```ts
CellIssue, CellIssueReason, checkTableCellSet, validateCellBatch, cellIssueToAppError
createEditHistory, EditHistory, createSaveQueue, SaveQueue
createNewTablePayload, createOpenTableView, stateToManifest
countTableReferences, findActivePane/listPanes/addViewToLayout/activateViewInLayout/removeViewFromLayout
```

**T2.2 后的关键事实**：

- 命令总线新增 `CommandBusOptions.onCommand` 观察者；app-core 用它记录历史并入队保存。命令本身仍无 IO。
- `ui` 新增 `save: { status, pending, error }` 与 `editIssue: CellIssue | null`；`setSaveState`/
  `setEditIssue` 只改 UI 切片，不进入 Immer 文档 patches。
- 每次 `table.cell.set` 成功产生 patches 后，保存队列异步写表 + manifest；失败保留 dirty，
  状态栏可重试；关闭工作区前 flush ≤3s。
- 历史栈仅覆盖 `table.cell.set`：800ms 合并、上限 100、打开/关闭工作区清空；其他命令留给 T5.2。
- `openWorkspace` 成功后会清空历史与保存状态；解码/打开失败仍保持旧文档不变。
- **新增行/空主键自动生成尚未实现**，按 T2.4/T2.5；`table.rows.insert` 仍只有 SPEC 名称。
- 结构变更命令（加列/删列/改类型/改主键/列重排）**尚未实现**，是 T2.3 的交付。

### 4.7 renderer 结构

```text
apps/desktop/src/renderer/
├─ app-core/
│  ├─ renderer-core.ts          # 组合根；注入 Worker decode + encode
│  ├─ use-app-core.tsx          # AppCoreProvider / useRendererCore / useAppState
│  ├─ use-workspace-controller.ts
│  └─ workspace-store.ts        # IpcResult → WorkspaceStore（抛 AppError）
├─ features/workspace/          # WelcomePage/NewWorkspaceDialog/OpenWorkspaceDialog/TabBar/WorkspaceView
├─ features/tables/             # TableList/NewTableDialog/RenameTableDialog/DeleteTableDialog
├─ features/grid/
│  ├─ DataGrid.tsx              # 虚拟网格 + 编辑入口 + 冲突定位
│  ├─ GridCell.tsx              # 编辑/错误/冲突状态
│  ├─ editors/                  # Text/Number/Date/Boolean/Enum + CellEditor + editor-value
│  ├─ use-cell-editing.ts       # 草稿/提交/取消/失焦/IME
│  ├─ cell-issue-text.ts        # CellIssue → t(key)
│  └─ GridHeader/SelectionLayer/grid-navigation/grid-sizing
└─ shell/                       # AppShell/TitleBar/Sidebar/StatusBar/Inspector/HelpDialog
```

- `AppShell` 在 `workspace === null` 时渲染 `WelcomePage`，否则 `WorkspaceView`；错误经
  `ui.error` → Toast，`workspace.warnings` 以横幅显示；保存错误与单元格 issue 走状态栏，不走 Toast。
- `DataGrid` 可编辑：F2/双击/直接输入进入编辑；Enter 提交下移、Tab/Shift+Tab、失焦提交、
  Esc 取消；Delete 清空；只给 active cell 渲染一个编辑器；`rangeExtractor` 保留正在编辑的行。
- 主键冲突：状态栏“第 N 行 · 列 X：与第 M 行冲突”，滚动并高亮冲突行 2.5s，1.2s 后滚回编辑行。
- `StatusBar` 显示保存三态（保存中/已保存/保存失败 + 重试）与单元格错误定位。
- 所有文案走 `i18n/messages/{zh-CN,en-US}.ts`；`apps/desktop/test/ui-conventions.test.ts` 会拦硬编码中文。

### 4.8 E2E 证据

`apps/desktop/e2e/edit.spec.ts` 3 条：

1. 五类型单元格编辑 + 非法值不落库 + 关闭/重开持久化；
2. 非法数字、必填空主键、主键重复（冲突行号 + 高亮）；
3. 点击聚焦后纯键盘 F2/Enter/Tab/Esc + Ctrl+Z / Ctrl+Shift+Z。

完整 E2E 现为 **33 passed**；T2.1 的 `grid.spec.ts` 8 条与既有 22 条仍全绿。

---

## 5. T2.2 决策与实现记录（已完成）

8 项决策全部由用户确认，详见 `docs/adr/028-t22-cell-editing-and-save.md`：

1. 每次成功提交后异步保存该表（Worker encode → `table:write` → `manifest:write`，按表串行/合并；
   失败保留 dirty，状态栏可重试；关闭工作区前 flush ≤3s）。
2. 仅对 `table.cell.set` 实现最小历史栈：每次提交一条、800ms 合并、Ctrl/Cmd+Z、Ctrl/Cmd+Shift+Z
   （含 Cmd+Y）、新命令丢弃 redo、上限 100；完整历史留 T5.2。
3. 新增行/空主键自动生成留 T2.4/T2.5。
4. 结构化 `CellIssue` + renderer `t(key)`；不修改 `AppError` schema/IPC。
5. 主键冲突显示行号并滚动/高亮冲突行。
6. F2 + 双击 + 直接输入；Enter/Tab/Shift+Tab/失焦/Esc 按 SPEC。
7. date `input[type=date]`（本地午夜）；boolean 三态；enum 下拉含空值。
8. 状态栏保存三态 + `validateCellBatch` 纯函数；批量 UI 留 T2.4/T2.5。

关键文件：

```text
packages/app-core/src/
├─ validation/{cell-issue,cell-validation}.ts (+ test)
├─ history/edit-history.ts (+ test)
├─ usecases/save-queue.ts (+ test)
├─ state/manifest.ts
├─ state/{types,store}.ts
├─ commands/{bus,table-cell-set}.ts
└─ usecases/workspace-actions.ts
apps/desktop/src/renderer/features/grid/
├─ editors/{Text,Number,Date,Boolean,Enum}CellEditor.tsx, CellEditor.tsx, editor-value.ts
├─ use-cell-editing.ts
├─ cell-issue-text.ts
├─ DataGrid.tsx, GridCell.tsx
└─ ...
apps/desktop/e2e/edit.spec.ts
docs/adr/028-t22-cell-editing-and-save.md
docs/reports/t2.2/REPORT.md
```

实测（2026-10-21）：

```text
pnpm verify         78 files / 638 tests；depcruise 242 modules / 851 deps / 0 violations
pnpm test:coverage  全局 lines 77.73% / statements 77.42% / branches 68.82% / functions 78.42%
pnpm format:check   通过
pnpm build          exit 0；renderer 1,164.07 kB
pnpm e2e            33 passed，约 51s
```

残留：

- 新增行/空主键自动生成（T2.4/T2.5）；
- 完整撤销/重做栈与菜单（T5.2，必须复用 800ms/100 条语义）；
- 1.5s 自动保存/崩溃恢复（T5.3，必须合并/替换当前保存队列，不能并存两条写盘路径）；
- 日期编辑器只编辑日期，带时刻值提交后归一到本地午夜（ADR-028）；
- 批量校验暂无 UI；
- 全局覆盖率从 81.57% 降到 77.73%，主要因新增编辑 UI 由 E2E 覆盖，阈值仍满足。

---

## 6. T2.3 开工前必须确认的决策（不要自行选定）

T2.3 原文摘要（`docs/TASKS.md`）：

- 依赖：T2.1、T1.4；覆盖 FR-TBL-01、FR-TBL-08；参考 SPEC §6.6、§7.6。
- 产出：列管理面板（新增/编辑/删除/重排/改类型/角色/枚举/主键）；结构变更命令 + 行数据迁移
  （补 null、类型转换、失败回滚）；破坏性操作二次确认（删列/改类型/换主键）。
- 验收：加列后旧行补 `null`、行数不变；改类型成功/失败路径都有测试且失败不改数据；删列后清理
  `columnOrder/widths/columnOverrides/sort/filter` 并重新加载不变量通过；删列后图表显示“列已删除”
  错误态不崩溃；100 列上限生效。

开工前至少确认以下歧义（结合 SPEC §19 与既有 ADR，仍无法覆盖时提问）：

1. **是否升 `formatVersion` / 接迁移**：T2.3 是否首次产生 v1→v2 文件格式变更？若是，必须注册真实
   migration、补 `fixtures/workspaces/` 与逐行等价测试，并把 `FileWorkspaceStore.open` 接在
   manifest 解析成功后、写 `.lock` 前；若不是，结构变更只走运行时命令，不要顺手升版。
   `TableMeta.schemaVersion` 是否随之变化也要明确。
2. **改类型失败策略**：逐行转换失败时“列出前 100 行让用户确认”具体是取消整批、跳过失败行，还是
   强制转换？失败必须不改数据并整体回滚。
3. **删列/改主键的引用清理**：`columnOrder`、`widths`、`hiddenColumnIds`、`columnOverrides`、
   `sort`、`filter`、图表映射、条件格式/模板覆盖分别如何清理；图表错误态的具体文案与恢复入口。
4. **破坏性操作确认**：删列、改类型、换主键是否共用 Dialog；确认信息是否列出受影响行数/引用数；
   是否允许在 100k 行表上同步执行，还是需要进度/取消。
5. **100 列上限**：达到上限时是禁用“新增列”还是提交时报错；导入/粘贴新增列是否也受此限制。
6. **列面板入口**：放在侧栏、网格工具栏还是检查器；键盘可达性与 200% 缩放要求。
7. **撤销范围**：T2.3 的结构变更命令是否只产 patches（等 T5.2 做 UI），还是要在 T2.3 就接入最小
   历史？不要与 T2.2 的 `table.cell.set` 历史混在一起。
8. **迁移失败/回滚证据**：是否需要 E2E 证明原文件哈希不变、备份目录存在；测试夹具是否复用
   T1.4 的 `migration-backup`。

建议验证命令：

```powershell
pnpm exec vitest run packages/domain packages/table-engine --testNamePattern "column"
pnpm verify
pnpm test:coverage
pnpm format:check
$env:CURVE_E2E_NO_SANDBOX = '1'
pnpm build
pnpm exec playwright test --config apps/desktop/playwright.config.ts --grep "schema"
pnpm e2e
```

T2.3 完成后停下报告，**不要自动进入 T2.4**。

---

## 7. 已知风险与处理

| 风险 | 影响 | 处理 |
|---|---|---|
| 会话策略回到 `workspace-write` | `verify`/E2E 报 EPERM | 切 `danger-full-access`，不改项目配置 |
| Windows 无 symlink 权限 | `pnpm install` 失败 | 按 §3.4 用 junction 补齐；不要删 node_modules/切 linker |
| 覆盖率 77.73% | 新增 UI 主要由 E2E 覆盖 | 阈值 70/60 满足；M2 报告给趋势 |
| renderer bundle 约 1.16MB | 启动/内存 | T6.4 打包阶段评估拆包/压缩 |
| `openWorkspace` 表读取失败不 close | 残留 `.lock`（HANDOFF 旧 §7.4.7） | T2.3/T5.3 补 close-on-failure |
| 100k 滚动帧率为合成 rAF | 非正式性能门禁 | T2.7 `pnpm bench` 固化 |
| E2E 截图重写 | 工作树变脏 | 提交前还原 `docs/reports/m0/*.png` |
| 每次提交都写表+manifest | I/O 频率高于 1.5s 自动保存 | 按表串行/合并；T5.3 合并进 1.5s 队列，不能并存两条路径 |
| 撤销只覆盖 `table.cell.set` | 其他命令暂不可撤销 | T5.2 复用 800ms/100 条语义扩展，不另起一套 |
| 主键冲突滚动到远处行 | 编辑位置短暂离开视口 | `rangeExtractor` 保留编辑行；1.2s 后滚回并恢复焦点 |
| 日期编辑器只编辑日期 | 带时刻值提交后时刻被归一 | ADR-028 明确；需要时改日期时间编辑器并写新 ADR |
| 新增行/空主键自动生成未实现 | E3 的“键盘新增一行”未闭环 | T2.4/T2.5 落地，不得视为已验收 |
| `workspace:recent:remove/clear` 未实现 | 欢迎页不能移除 | T5.3 |
| 恢复对话框/备份重建未实现 | 崩溃后应用内无法恢复 | T5.3（ADR-026） |
| T2.3 迁移接线风险 | 打开路径锁顺序/原文件损坏 | 先确认版本策略；复用 ADR-024 备份/回滚；补失败哈希测试 |

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
- 不在 T2.3 顺手实现 T2.4 的粘贴或 T5.3 的自动保存。
- 不把 10 万行整体放进 React state 并逐单元格触发全局重渲染；编辑器只给 active cell。
- 不自动跨任务/跨里程碑；T2.3 完成后停下报告，不进入 T2.4。

---

## 9. 新会话启动检查清单

- [ ] `git status --short` 干净；`git log --oneline -3` 顶部为 T2.2 提交 `641cd86` 或其后的 docs 提交。
- [ ] 已注入 PATH（§3.1），`pnpm --version` 为 11.28.5。
- [ ] 会话文件策略为 `danger-full-access`（§3.2）；审批提示关闭。
- [ ] 已读 `AGENTS.md`、本文件、TASKS 的 T2.3、TESTPLAN §1/§2/§3（E3）/§4/§5、
      SPEC §6.6/§7.6/§9.0/§13.1/§15.1/§16.1、ADR-005/006/007/014/015/024、
      ADR-028/027/025。
- [ ] 已确认 `pnpm verify` 基线（78 files / 638 tests）、coverage lines 77.73%、e2e 33 passed。
- [ ] 已确认 `apps/desktop/node_modules/electron/dist/electron.exe` 存在。
- [ ] 已清除 `ELECTRON_RUN_AS_NODE`；跑 E2E 前再设 `CURVE_E2E_NO_SANDBOX=1`。
- [ ] 已确认 T2.3 尚未开始，**先按 §6 逐项确认决策**，未自行选定。
- [ ] 已确认 T2.2 的保存队列/最小历史/结构化 issue 形状；T2.3 的列结构变更不能绕过命令总线。
- [ ] 已确认 E2E 写盘断言使用 `expect.poll`，截图提交前还原。
- [ ] 复述 T2.3 目标/产出/验收/风险后再动手；完成后停下报告，不进入 T2.4。
