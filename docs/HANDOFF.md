# HANDOFF — Curve Studio 实施交接

> 本文件面向**下一个实现会话**。当前会话已完成 `T1.4`（迁移框架与夹具），按用户要求停止。
> 最后更新：2026-10-21 · T1.4 提交：`3eb306e` · 分支：`main` · 工作树：干净（本文件单独提交）。
> 阅读顺序：`AGENTS.md` → 本文件 → `docs/TASKS.md` 的 T1.5 → `docs/TESTPLAN.md` §1、§2、§3（E2/E7）、§4、§5 →
> `docs/SPEC.md` §13.1、§13.2、§4.2、§6.5、§7.5、§7.6、§15.1 → `docs/DECISIONS.md` 的 ADR-006/007/014 →
> `docs/adr/021`–`024`。

---

## 1. 当前进度快照

| 项 | 状态 |
|---|---|
| 方案文档 | v1.0 已锁定（SPEC / TASKS / TESTPLAN / DECISIONS） |
| M0 基建（T0.1–T0.5） | **已完成**；验收报告 `docs/reports/m0/REPORT.md`（`02afe4b`） |
| `T1.1` 领域模型、Zod 与不变量 | **已完成**（`a58ee20`），domain 行覆盖 97.63% |
| `T1.2` 工作区仓库与原子持久化 | **已完成**（`4b742dd`），persistence 行覆盖 95.68%（当时基线） |
| `T1.3` 表数据 JSONL 读写与 Worker | **已完成**（`212aa0b`），table-engine 行覆盖 94.11% |
| `T1.4` 迁移框架与夹具 | **已完成**（`3eb306e`），migrations 行覆盖 100%、domain 行覆盖 97.63% |
| 当前里程碑 | M1 进行中（T1.1–T1.4 完成；T1.5 未开始） |
| 下一个任务 | **`T1.5` app-core 状态与命令总线骨架**（依赖 T1.1/T1.2/T1.3/T0.2，均已满足） |
| 提交历史（近 6 条） | `3eb306e feat(domain): add migration registry, executor, backups and fixtures (T1.4)`<br>`af9ba02 docs(agents): refresh status snapshot and handoff pointers`<br>`b435029 docs: add T1.4 implementation handoff`<br>`212aa0b feat(tbl): add JSONL codec, table worker and table IPC (T1.3)`<br>`9c08c0f docs: add T1.3 implementation handoff`<br>`4b742dd feat(persistence): add workspace store, atomic file adapter and IPC (T1.2)` |
| 工作树 | 干净（`git status --short` 无输出） |
| 当前基线 | `pnpm verify` **61 files / 529 tests**；`pnpm e2e` **22 passed**；depcruise **172 modules / 469 deps / 0 violations**；`pnpm test:coverage` 全局 lines **93.31%** |
| 夹具 | `fixtures/workspaces/{v1-min,corrupt-manifest,future-version,stale-lock}/` 已建立（T1.4） |

**用户明确要求**：一次只做一个任务；每个任务先复述目标/产出/验收，再写测试、实现、跑 `pnpm verify`
与任务指定 e2e/bench，最后勾选 TASKS、更新 CHANGELOG、必要时 ADR、Conventional Commit。
新会话从 `T1.5` 开始；**T1.5 完成后输出任务报告并停下等确认**，不要自动进入 T2.1。
交接文件单独提交（`docs: add T1.5 implementation handoff`），不并入 feat 提交。

---

## 2. 新会话开场提示词（可直接粘贴）

```text
工作目录：D:\DSH_Work_Space\curve-studio（仓库根）。

先读 AGENTS.md、docs/HANDOFF.md、docs/TASKS.md 的 T1.5、docs/TESTPLAN.md §1/§2/§3（E2/E7）/§4/§5、
docs/SPEC.md §13.1/§13.2、§4.2、§6.5、§7.5、§7.6、§15.1，以及 docs/DECISIONS.md 的
ADR-006/ADR-007/ADR-014，再读 ADR-021/ADR-022/ADR-023/ADR-024。

现状：M0、T1.1–T1.4 已完成（T1.4 提交 3eb306e），工作树干净，pnpm verify（61 files / 529 tests）、
pnpm e2e（22 passed）全绿；domain 行覆盖 97.63%，migrations 100%。

请执行 T1.5：先按 AGENTS.md §8 复述目标/产出/验收与风险，并先确认 HANDOFF §6.2 的五个缺口
（迁移是否在 T1.5 接进 open 以及打开时如何取得行数据、T1.5 是否包含 renderer 适配层、
workspace.open 是否算命令、表数据切片形状与夹具来源、100k 首屏 <16ms 的取证方式）；
这些是行为/分层/验证决策，按 AGENTS.md §11 先问，不要自行选定。

确认后实现：packages/app-core 的 AppState 切片、命令注册表与 dispatch（Immer produceWithPatches）、
table.cell.set 与 workspace.open、选择器与错误 surface，并补测试；按 AGENTS §4 为 zustand/immer 写 ADR。
跑 pnpm exec vitest run packages/app-core、pnpm verify、pnpm test:coverage、pnpm format:check。

完成后勾选 TASKS、更新 CHANGELOG、按 Conventional Commits 提交，输出任务报告并停下等我确认。
不要自动进入 T2.1；不要放宽 CSP/沙箱；不要跳过测试或降低 lint/覆盖率阈值。
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
| pnpm store | `D:\.pnpm-store\v11`（跨盘时 pnpm 会提示 `C:\Users\...\AppData\Local\pnpm\store` 不可硬链接，正常） |
| Electron 二进制 | `apps/desktop/node_modules/electron/dist/electron.exe`（**44.9.0**，内置 Node 24.22.0） |
| `tsx` | **4.23.15**，root devDependency（T1.3 新增，仅工具链，不进产物） |
| 干净克隆（可删） | `D:\DSH_Work_Space\curve-studio-clean`（622 MB，T0.5 证据，可 `Remove-Item -Recurse -Force`） |

Node/pnpm **不在 PATH**。每条命令前先注入：

```powershell
$env:PATH = "D:\DSH_Work_Space\tools\bin;C:\Users\MECHREVO\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin;$env:PATH"
$git = 'D:\DSH_Work_Space\tools\mingit\cmd\git.exe'
cd D:\DSH_Work_Space\curve-studio
```

### 3.2 DSH 会话策略：必须是 `danger-full-access`

T1.1 实测：`workspace-write` 策略下 `pnpm verify` **必然失败**，报错为

```text
failed to load config from D:\DSH_Work_Space\curve-studio\vitest.config.ts
[plugin externalize-deps] Error: spawn EPERM
    at optimizeSafeRealPathSync (.../vite/dist/node/chunks/node.js...)
```

原因：Vite 在 Windows 上首次解析真实路径时会 `exec("net use")`（带管道的子进程），受限沙箱禁止。
**这不是代码问题**，不要改项目配置或加 workaround；把会话策略切到 `danger-full-access` 即可。
T1.3/T1.4 全程 `danger-full-access`，且审批提示已关闭——不要使用 `sandbox_permissions` 参数。

### 3.3 受限 shell 里 Electron 无法直接启动（仍然有效）

- 在 agent 的 pwsh 会话里直接启动 Electron：默认（Chromium OS 沙箱开启）→ 进程退出，`main.js` 不执行。
  已实测：不加 `--no-sandbox` 时 E2E 全部 `Error: Process failed to launch!`。
- **E2E 必须**：`Remove-Item Env:ELECTRON_RUN_AS_NODE` + `$env:CURVE_E2E_NO_SANDBOX = '1'`。
  该变量只被 `apps/desktop/e2e/fixtures.ts` 读取，不影响应用 `webPreferences.sandbox`。
- **手工看 dev 窗口**：

```powershell
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
$env:NO_SANDBOX = '1'
$env:CURVE_E2E = '1'
$env:CURVE_E2E_USER_DATA = 'D:\DSH_Work_Space\curve-studio\apps\desktop\test-results\dev-user-data'
pnpm dev    # 期望日志：[main] window ready (mode=development, devTools=true, visible=true)
```

- 用户自己的普通终端没有这些限制：`pnpm dev` / `pnpm e2e` 原样可用，**不要**把
  `--no-sandbox`、`CURVE_E2E_NO_SANDBOX` 写进应用代码、默认脚本或 CI。
- **grep 陷阱 1（T1.2/T1.3 都踩过）**：`pnpm e2e -- --grep "table"` 会实际跑全量（pnpm 把额外的 `--`
  传给 Playwright，grep 被当成位置参数忽略）。要只跑子集，用：
  `pnpm exec playwright test --config apps/desktop/playwright.config.ts --grep "table"`。
- **grep 陷阱 2（T1.4 实测）**：在 Windows PowerShell 里经 `pnpm` 垫片传
  `--grep "workspace|migration"` 会被 cmd 按 `|` 拆开，报
  `'migration' is not recognized as an internal or external command`。一次只跑一个 `--grep`，
  或改用不含 `|` 的模式。
- **直接跑 Playwright 前先 `pnpm build`**（`out/` 是构建产物，E2E 启动的是它）。
- 同理，`pnpm exec vitest run packages/domain -- --grep "migration"` 的 `--` 会被 vitest 收到；
  更稳的写法是 `pnpm exec vitest run packages/domain --testNamePattern "migration"`（T1.4 已把
  全部迁移用例的 describe 前缀写成 `migration ...`，保证该过滤命令选中 18 条用例）。

### 3.4 `ELECTRON_RUN_AS_NODE=1`

DSH 进程环境全局存在该变量，子进程会继承；Electron 会退化为纯 Node。所有启动/测试前
`Remove-Item Env:ELECTRON_RUN_AS_NODE`；E2E fixture 已在传给子进程前删除该键。

### 3.5 安装 / Electron 运行时

- 根 `package.json` 有 `postinstall` → `scripts/install-electron.mjs`。原因：`electron@44.9.0`
  的 npm 包**不再自带 postinstall**，干净克隆/CI 上 `pnpm install` 不会下载运行时，`pnpm e2e` 必然失败。
- 脚本行为：二进制已存在则跳过；缺失时调用 electron 自带 `install.js`（继承 stdio，兼容禁止管道的 shell）；
  尊重 `ELECTRON_MIRROR` / `ELECTRON_CUSTOM_DIR`；下载失败非零退出。
- 手工重装时：

```powershell
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
$env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'
$env:ELECTRON_CUSTOM_DIR = '{{ version }}'
pnpm install
```

若仍缺二进制：`cd apps\desktop\node_modules\electron; node install.js`（同样带上述变量），
确认 `dist\electron.exe` 与 `path.txt` 存在。**不要假装能启动**。

### 3.6 文本编码与路径陷阱

- DSH 的 shell 是 **Windows PowerShell 5.1**：`Get-Content` 默认按 GBK 解码无 BOM 的 UTF-8 文件（乱码），
  `Set-Content -Encoding UTF8` 会写入 **BOM**。**源码与文档一律用编辑器工具（read/write/edit）修改**。
- `[System.IO.File]::ReadAllBytes('相对路径')` 按**进程 CWD**（`D:\DSH_Work_Space`）解析，不是 PowerShell 的
  `cd` 目录；这类 .NET 调用必须给绝对路径。
- `pnpm` 的 stdout 被 PowerShell 当成错误流时会打印 `NativeCommandError` 红字，但**结论看 `$LASTEXITCODE`**；
  建议 `pnpm ... *> test-results/xxx.log` 后再检索。注意：用管道接 `Select-Object -Last` 会截断，
  曾出现过"测试全绿但 exit code 1"的假象——**重定向到文件再看退出码**。
- 截图是设备像素（125% DPI）：窗口 1440×816 → 页面 1426×779 CSS px → PNG 1783×943。
  新增截图用例必须复用 `shell.spec.ts` 的 `settleFrame()`（双 rAF），否则首帧会拼接旧画面。

### 3.7 已知的测试/依赖行为

- `pnpm verify` = `pnpm lint && pnpm typecheck && pnpm test`；`format:check` **不在** verify 里，需单独跑。
- `pnpm e2e` 会先 `pnpm build`，并重写 `docs/reports/m0/t0.2-window.png`；调试主题时还会重写
  `t0.4-shell-dark.png`（受**真实鼠标悬停**影响，字节不稳定，视觉无变化）。断言不依赖像素；
  提交前 `git checkout -- docs/reports/m0/*.png` 还原，并在提交说明里写一句。
- `apps/desktop/test-results/`、`playwright-report/`、`coverage/`、`bench/` 均已 gitignore。
- Vitest 覆盖率排除：`packages/domain/src/types.ts`、`packages/persistence/src/types.ts`、
  三个进程入口（`main/index.ts`、`preload/index.ts`、`renderer/main.tsx`）与 Worker 入口
  `apps/desktop/src/renderer/workers/*.worker.ts`（仅一条转发，行为由 E2E 覆盖）。
- 通过用例不残留 trace；失败用例在 `apps/desktop/test-results/<test>/` 留下
  `test-failed-1.png`、`trace.zip`（内建）与 `attachments/trace-*.zip`（fixture 录的完整 context trace）。
- `apps/desktop` 的 `dependencies` 只有 `write-file-atomic@8.0.0`；main 构建会**外置**它
  （`out/main/index.cjs` 里是 `require("write-file-atomic")`），所以打包时它必须留在 dependencies。
- preload 产物仍只 `require("electron")`；`@curve/persistence`、`@curve/table-engine` 与 zod 都不得进入 preload。
- **已知偶发**：`apps/desktop/src/main/workspace/recent-list.test.ts` 的 "caps the list" 用例在
  61 个 worker 并行、机器繁忙时偶发 5s 超时；重跑即过（T1.3/T1.4 各出现一次，最终 verify 全绿）。
  不要为它放宽全局超时。
- `pnpm test:coverage` 的门禁：全局 lines/statements/functions 70、branches 60；纯逻辑包
  （domain/table-engine/chart-model）行覆盖 ≥85%。`app-core` 在 T1.5 前只有一条 smoke 用例
  （100% 是假象），T1.5 后必须靠真实用例撑起来。

### 3.8 T1.4 新增的运行入口与事实

| 项 | 用法/说明 |
|---|---|
| 夹具 | `fixtures/workspaces/{v1-min,corrupt-manifest,future-version,stale-lock}/`，每个目录有 `README.md`；打开前必须复制到临时目录（`.lock` 会被写） |
| 迁移单测 | `pnpm exec vitest run packages/domain --testNamePattern "migration"`（2 files / 18 tests） |
| 迁移备份单测 | `pnpm exec vitest run apps/desktop/src/main/workspace/migration-backup.test.ts`（9 tests） |
| 夹具单测 | `pnpm exec vitest run apps/desktop/src/main/workspace/workspace-fixtures.test.ts`（6 tests） |
| 迁移执行器 | `@curve/domain` 的 `MIGRATIONS` 生产为空；`runMigrations` 不在任何生产路径被调用 |
| main 备份/回滚 | `apps/desktop/src/main/workspace/migration-backup.ts` 已交付但**未被引用**（T1.5/T2.3 接线前不删） |
| 格式化豁免 | `.prettierignore` 排除 `fixtures/workspaces/corrupt-manifest/manifest.json`（故意截断） |
| 表 Worker | 构建后 `out/renderer/assets/table-worker-<hash>.js`（约 9.3 KB）；T1.5 接线渲染进程后应删掉 `electron.vite.config.ts` 的显式入口 |
| 基准 | `pnpm bench -- --table-io` 或 `pnpm bench`，写 `bench/report.json`（TESTPLAN §5.2） |

---

## 4. 已交付的关键接口（T1.5 直接消费，不要回退）

### 4.1 `@curve/domain`

```ts
// 类型（SPEC §6 全集）
Cell, ColumnDef, TableMeta, Row, ViewDef, ChartSpec, TableStyle, LayoutNode, WorkspaceManifest …

// 解析（永不抛裸异常）
parseManifest(value): ParseResult<WorkspaceManifest>
parseTableMeta(value): ParseResult<TableMeta>
parseRow(value): ParseResult<Row>          // Row 是 {id, values}，不是 JSONL 的 {id, v}
parseCell(value, column): CellResult        // 严格：JSONL 读取路径
toValidationIssues(error, input?): ValidationIssue[]

// 不变量（SPEC §6.6）
checkTable(table, { rowsByTable?, resolveFieldTypeStorage? }): InvariantReport
checkInvariants(manifest, { rowsByTable?, resolveFieldTypeStorage? }): InvariantReport
assertInvariants(report): void

// 归一与格式化（SPEC §8.1）
coerceCell(raw, column): CellResult
formatCellValue(value, column, options?): string

// 错误与工厂
ERROR_CODES, createAppError, isAppError, toAppError
createId / createWorkspaceId / createTableId / createColumnId / createRowId / … / isId
createTimestamp(now?: Date): string

// 迁移（T1.4，SPEC §7.6）
CURRENT_FORMAT_VERSION = 1
MIGRATIONS: MigrationRegistry              // 生产为空（ADR-024）
Migration { from, to, migrate(manifest, tables) }
MigrationResult { manifest, tables, warnings? }
MigrationTables = ReadonlyMap<string, readonly Row[]>
createMigrationRegistry(migrations): MigrationRegistry   // 禁跳版/重复 from；违反抛 E_VALIDATION
resolveMigrationPath({ from, to, registry }): { ok: true; steps } | { ok: false; error }
runMigrations({ manifest, tables, registry, target? }): Promise<
  { ok: true; manifest; tables; applied; warnings } |
  { ok: false; error /* E_MIGRATION_FAILED */; applied; warnings }
>
// 失败绝不返回半迁移文档；每步校验 formatVersion、孤儿表、当前版本的 Zod 结构与 §6.6 不变量
```

约定：schema 一律 `strictObject`；ID 读取放宽为 `^<prefix>_[A-Za-z0-9][A-Za-z0-9_-]*$`，写入恒为
`<prefix>_<uuid>`；`checkInvariants` 的 `issues` 阻塞、`warnings` 可修复；`rowCount` 只是提示值。

### 4.2 `@curve/table-engine`

```ts
// JSONL（SPEC §7.3）
decodeJsonl(jsonl, table): { rows, issues, stats }   // issues 带 1-based line/columnId/code
encodeJsonl(rows): string
encodeJsonlWithStats(rows): { jsonl, bytes }
countJsonlRows(jsonl): number
hasTrailingNewline(jsonl): boolean
toJsonlAppError(result): AppError | null            // E_TABLE_PARSE + 行号；超限优先 E_TABLE_LIMIT
tableWriteLimitError({ rowCount, bytes }): AppError | null
utf8ByteLength(text): number
BOM, MAX_JSONL_LINE_BYTES (8MB), MAX_TABLE_FILE_BYTES (256MB), MAX_ROWS_PER_TABLE (200_000)

// 行集与行数（SPEC §8）
TableData, createTableData(table, rows?)
diffRowCounts / reconcileRowCounts (不改 updatedAt) / diffTableRows

// 脏表原语（ADR-023）
DirtyTableTracker: mark / markAll / clear / clearAll / has / get / list / ids / size
  // 可注入 now；revision 单调递增；重复 mark 不改变首次顺序

// Worker 协议
TableWorkerRequest / TableWorkerResponse / createDecodeRequest / createEncodeRequest / guards
```

`decodeJsonl` 规则：空串 → 0 行；BOM/CRLF/空行/非 `{"id","v"}` 形状/非法 row id/重复 id/列数不符/
逐格类型错误都产生 issue 并**跳过该行**；单行 >8MB 解析前拒；超过 200k 行追加 `E_TABLE_LIMIT` 并停止。

### 4.3 `@curve/persistence`

`WorkspaceStore` 端口（`packages/persistence/src/types.ts`）：`create/open/close/readTable/writeTable/
writeManifest/trash/listBackups/restore`（签名见 `docs/SPEC.md §15.1` 与 T1.2 交接）。

- **缺文件语义（ADR-022，两个适配器一致）**：表在 manifest 且 `rowCount === 0` → `{ jsonl: '', bytes: 0 }`；
  `rowCount > 0` → `E_TABLE_NOT_FOUND`。
- `MemoryWorkspaceStore`：同一端口，供 app-core 单测使用；`open` 只能打开**本实例** `create` 过的工作区
  （按 root 查找），不会读磁盘；`writeManifest` 要求 id 与已存在工作区一致。
  **Memory 适配器不校验写盘上限**（`E_TABLE_LIMIT` 只由 IPC/FileWorkspaceStore 保证）。
- 纯函数（包根统一导出）：
  - 布局：`WORKSPACE_*`、`tableFilePath`、`tableFileName`、`workspaceFolderName`、`sanitizeWorkspaceFolderName`、
    `isSafeRelativePath`、`assertSafeRelativePath`、`findManifestPathIssues`。
  - 备份：`formatBackupTimestamp`、`tableBackupFileName`、`manifestBackupFileName`、
    `parseTableBackupFileName`、`parseBackupPath`、`planBackupRotation`、`isExpiredBackup`、
    `MAX_BACKUPS_PER_TARGET`、`BACKUP_RETENTION_MS`。
  - 迁移快照目录（T1.4）：`MIGRATION_BACKUP_DIRECTORY_PREFIX`、`migrationBackupDirectoryName(date)`、
    `parseMigrationBackupDirectoryName(name)`、`isMigrationBackupDirectoryName(name)`。
  - manifest：`createEmptyManifest`、`validateManifest`、`parseManifestDocument`、`serializeManifest`。

`packages/persistence` 无 Electron/Node 内置导入；T1.5 不要把 `node:fs` 放进这个包。

### 4.4 main：`FileWorkspaceStore` 与迁移备份

`apps/desktop/src/main/workspace/file-workspace-store.ts`：

- 构造参数：`{ userDataPath, appVersion, now?, uuid?, logger?, isProcessAlive?, writeFile? }`。
- 额外公开 `listRecent(): Promise<RecentEntry[]>`（`recent.json`）。
- `create` 会创建并打开工作区、写 `.lock`、写最近列表；`open` 先校验 manifest，再检查/替换锁；
  `close` 删除自己的 `.lock`；未知 id 的 `close` 幂等返回 `{ok:true}`。
- `writeTable`：先校验 SPEC §2.2（`E_TABLE_LIMIT`），旧文件存在时先备份（最多 3 份），再
  `write-file-atomic` 替换；失败保留旧文件并返回 `E_FS_WRITE`。
- `writeManifest`：先 `validateManifest`（id 必须匹配、`table.file` 必须是 `tables/<tableId>.jsonl`），
  备份旧 manifest，再原子写；损坏的 manifest 不会被 `open` 覆盖。
- `trash` 只把表文件移到 `.trash/`，不修改 manifest。
- **`open` 末尾按磁盘重算 `rowCount`**（ADR-022）：只数内容行；不一致则备份 + 原子重写 manifest 并
  追加 warning；缺文件保留原提示值；重写失败不阻塞打开；不修改 `updatedAt`。
- 路径白名单：`path-safety.ts` 的 `resolveInsideRoot` / `resolveWorkspaceRelativePath` 全部先
  `fs.realpath`（缺失目标则解析父目录）再做 `path.relative` 前缀判断；失败 `E_PATH_DENIED`。
- `.lock`：`{pid, startedAt, appVersion}`；PID 存活且 <24h → `E_WS_LOCKED`；PID 不存在/超过 24h →
  stale warning 并替换；无法解析的 lock 按 corrupt 处理（warning + 替换）。

`apps/desktop/src/main/workspace/migration-backup.ts`（T1.4，**尚未被任何生产路径引用**）：

```ts
backupTablesForMigration({ root, now?, copyFile? }): Promise<MigrationBackup>
  // 逐字节复制 tables/ 下的常规文件 → backups/migration-<ts>/；同名 +1ms；失败删半成品
restoreMigrationBackup(backup, { root, copyFile? }): Promise<void>
  // copy → <target>.migration-restore → rename；写回原字节并删除快照后新建的表文件
runWithMigrationBackup({ root, now?, copyFile?, run }): Promise<{ result, backup }>
  // 失败自动回滚并抛 E_MIGRATION_FAILED；detail 同时带 error=<code> / rollback=<code>
```

迁移快照只覆盖 `tables/`；manifest 不在此快照内（始终最后写；写 manifest 走 `writeManifest` 的备份）。
`migration-backup.ts` 的接线时点见 ADR-024 与 §6.2 缺口 1。

### 4.5 IPC / preload / renderer

- `CurveApi` 命名空间：`app`、`log`、`workspace`、`manifest`、`table`。
- `IMPLEMENTED_IPC_CHANNELS` 共 **10** 个：`app:info`、`log:write`、`workspace:create/open/close/recent`、
  `manifest:write`、`table:read/write/trash`。
- `workspace:recent:remove/clear` 仍未注册（留给 T5.3/欢迎页）。
- `HandlerContract` 的 request/response 输入类型是 `unknown`（`safeParse` 接收跨进程原始载荷）。
- preload 只 import `channels.ts`/`envelope.ts` 的运行时内容；`ipc.ts` 只做 `import type`。
- `e2e/ipc.spec.ts` 断言“实际注册通道 == `IMPLEMENTED_IPC_CHANNELS`”与桥方法白名单；
  加通道必须同步 `channels.ts`、handlers、preload、`CurveApi`、renderer `api-client` 和该 E2E。
- `table:read/write` 只收 `{ workspaceId, tableId }`（write 另加 `jsonl`）；main 从内部映射解析路径。
- `apps/desktop/src/renderer/table-io/client.ts`：`createTableIoClient({ createWorker?, timeoutMs? })`；
  请求 id 关联、120s 超时、`terminate` 结算所有 pending、Worker 错误失败所有 pending。
  **T1.5 若要接 renderer，复用它，不要重写 Worker 协议**；接完删除 `electron.vite.config.ts` 的显式
  `table-worker` 入口。

### 4.6 `fixtures/workspaces/`（T1.4）

| 夹具 | 内容 | 预期 |
|---|---|---|
| `v1-min/` | `ws_v1min` / `tbl_v1min`，3 列（text 主键、date、number），3 行 | `open` 成功、无 warning；`decodeJsonl` 0 issue；行内容逐行等于 `EXPECTED_ROWS` |
| `stale-lock/` | 同结构（`ws_stalelock`）+ 固定 `.lock`（pid 999999，`startedAt 2020-01-01T00:00:00.000Z`） | `open` 成功 + stale warning；锁被替换；关闭后删除 |
| `future-version/` | `formatVersion: 2` | `E_WS_VERSION_UNSUPPORTED`，`detail=formatVersion=2`；文件不变；不写锁 |
| `corrupt-manifest/` | 截断 JSON | `E_WS_INVALID_MANIFEST`；文件不变；不写锁 |

规则：时间固定 UTC；打开前复制到临时目录（`.lock` 会被写）；夹具只读，不要在测试里原地打开。
`v1-min` 的行常量在 `apps/desktop/src/main/workspace/workspace-fixtures.test.ts`。

---

## 5. T1.4 实施记录（已完成 2026-10-21，提交 `3eb306e`）

### 5.1 交付文件

```text
packages/domain/src/migrations/
├─ types.ts              # Migration / MigrationResult / MigrationTables / 结果类型 / CURRENT_FORMAT_VERSION
├─ registry.ts           # createMigrationRegistry（禁跳版/重复 from）、resolveMigrationPath
├─ run.ts                # runMigrations（逐版本、每步校验、不返回半迁移文档）
├─ index.ts              # 包内出口 + MIGRATIONS（生产为空）
└─ *.test.ts             # registry 9 条 + run 9 条
apps/desktop/src/main/workspace/
├─ migration-backup.ts   # 备份/回滚/组合执行
├─ migration-backup.test.ts（9 条）
└─ workspace-fixtures.test.ts（6 条，含未来版本/损坏 manifest/stale-lock）
packages/persistence/src/backup.ts        # migrationBackupDirectoryName 等 3 个纯函数（+8 条测试）
fixtures/workspaces/{v1-min,corrupt-manifest,future-version,stale-lock}/ + README
docs/adr/024-migration-framework.md
```

改动的既有文件：`packages/domain/src/index.ts`（导出 migrations）、
`packages/persistence/src/backup.test.ts`、`.prettierignore`（坏夹具豁免）、
`docs/SPEC.md §7.6`、`docs/TASKS.md`（T1.4 勾选）、`docs/adr/README.md`、`CHANGELOG.md`。

### 5.2 关键决策（开工前经用户逐项确认）

- **生产注册表为空**：v1 是唯一发布过的格式，v0→v1 只在测试内注入（ADR-024）。
- **执行器落 domain，备份/回滚落 main**；**T1.4 不接进 `open`**，接线留 T1.5（ADR-024）。
- **夹具 `.lock` 提交**，内容固定且按时间必判 stale。
- **`formatVersion: 2` 复用 T1.2 证据** + 新增 `future-version/` 夹具；夹具读取测试放 main，
  因为 `@curve/persistence` 保持无 Node 内建。
- **四个夹具一次建齐**；`scripts/gen-100k.ts` 仍属 T2.x，未提前实现。

### 5.3 已验证证据

| 命令 | 结果 |
|---|---|
| `pnpm exec vitest run packages/domain --testNamePattern "migration"` | exit 0；2 files / **18 tests passed**（其余按名称过滤跳过） |
| `pnpm exec vitest run apps/desktop/src/main/workspace/migration-backup.test.ts` | exit 0；9 tests |
| `pnpm exec vitest run apps/desktop/src/main/workspace/workspace-fixtures.test.ts` | exit 0；6 tests |
| `pnpm build` | exit 0；main/preload/renderer 均构建成功 |
| `pnpm verify` | exit 0；ESLint 0 problem；depcruise **172 modules / 469 deps / 0 violations**；**61 files / 529 tests** |
| `pnpm test:coverage` | exit 0；全局 lines **93.31%** / branches 85.82%；domain lines **97.63%**；migrations **100%** lines / 93.47% branch |
| `pnpm exec playwright test --config apps/desktop/playwright.config.ts` | **22 passed**（workspace 子集 4 passed，含 future-version 拒绝） |
| `pnpm format:check` | exit 0 |
| `pnpm bench -- --table-io` | 本任务**未跑**（无性能敏感路径改动；迁移无生产入口） |

### 5.4 与计划/规格的差异

- TASKS 的验证命令从已知失效的 `-- --grep "migration"` 更正为 `--testNamePattern "migration"`；
  同时把迁移测试的 describe 前缀统一为 `migration ...`，保证该过滤命令选中全部 18 条。
- “persistence 读夹具”改为在 main 的 `workspace-fixtures.test.ts` 调用 `parseManifestDocument`
  读取夹具：`@curve/persistence` 必须保持无 Node 内建（HANDOFF §4.3）。
- 未接 `open`，所以没有新增迁移 E2E；“迁移失败原文件哈希不变”由 main 单测直接证明。
- `.prettierignore` 增加 `fixtures/workspaces/corrupt-manifest/manifest.json`，否则 `format:check`
  会试图“修好”坏夹具。
- E2E 改写的 `docs/reports/m0/*.png` 已还原，未进提交。
- 未更新 `AGENTS.md §0` 的过时状态行（仍写 T1.4 为下一个）；未改 `formatVersion`、IPC 通道或 SCHEMA。

---

## 6. T1.5 app-core 状态与命令总线骨架（下一个任务）

### 6.1 任务原文（`docs/TASKS.md` T1.5）

- **依赖**：T1.1、T1.2、T1.3、T0.2（均已满足）
- **覆盖**：FR-WS-01、FR-TBL-02
- **参考**：SPEC §13.1
- **产出**：
  - `packages/app-core`：Zustand store 切片（workspace/tables/views/ui）
  - 命令注册表、`dispatch`、Immer patches 捕获、错误 surface
  - 启动序列：打开工作区 → 读 manifest → 加载表 → 恢复布局
  - 选择器：当前表、可见行、脏表列表
- **步骤**：
  1. 定义 `AppState` 与 actions；大数组放表切片，避免全局重渲染。
  2. 命令 `(state, payload) => { next, patches, inversePatches }`。
  3. 先实现 `table.cell.set`、`workspace.open` 两个命令验证链路。
  4. 错误统一进 `ui.error` + 日志。
- **验收**：
  - [ ] 打开夹具工作区，表数据进入 store，选择器正确。
  - [ ] 命令 dispatch 产生可逆 patches；失败不改状态。
  - [ ] `app-core` 无 React/Electron import。
  - [ ] 100k 行加载后首屏选择器调用 < 16ms（memo 命中）。
- **验证**：`pnpm exec vitest run packages/app-core`

### 6.2 开工前必须先确认的缺口

1. **迁移是否在 T1.5 接进 `open`，以及打开时如何取得行数据**：T1.4 明确把接线时点留给 T1.5
   （ADR-024），但 `FileWorkspaceStore.open` 目前只数行、不解析（ADR-022），而 `runMigrations`
   需要每张表的 `Row[]`。可选：
   (a) 继续后置，留到 T2.3（首个真实列结构迁移）；
   (b) 仅在原始 `formatVersion < CURRENT_FORMAT_VERSION` 时解码全部表并迁移（正常 v1 打开不受
       影响），需要给 `open` 增加解码依赖并补 E2E；
   (c) 另设显式“升级工作区”流程，不在 `open` 隐形执行。
   这是行为/性能决策，先问。

2. **T1.5 的边界**：只交付 `@curve/app-core`（命令总线 + store + 选择器，单测用 fake 或
   `MemoryWorkspaceStore`），还是同时交付 renderer 侧 `WorkspaceStore` → `window.api` 适配层与
   真实 Worker 表加载接线？TASKS 验收只跑 `packages/app-core`，且 T2.1 才接 UI；建议只做 app-core，
   renderer 接线留给 T2.1（届时删除显式 `table-worker` 入口）。先确认。

3. **`workspace.open` 的定位**：TASKS 步骤 3 要求把 `workspace.open` 作为“命令”验证链路；
   SPEC §13.1 的命令表没有它，且它是异步副作用（IPC/读盘），按 §13.1 不得进入命令。
   建议实现为 app-core 的 use case（注入 `WorkspaceSource` 端口），不产 patches、不入历史；
   命令总线只接受同步文档命令。确认“命令”是否包含 use case。

4. **表数据切片形状与夹具来源**：
   - 切片用 `Map<tableId, TableData>`（table-engine）还是 `Record<tableId, { meta; rows }>`？
     Immer 对 `Map/Set` 需要 `enableMapSet()`，且 patches 对 Map 的表达会影响 T5.2 的 inverse patches；
     建议普通对象 + `Row[]`，`TableData` 只在加载边界短暂使用。
   - “打开夹具工作区”的数据怎么进测试：测试侧读 `fixtures/workspaces/v1-min`（node:fs）→
     `decodeJsonl` → 注入 fake 端口；还是用 `MemoryWorkspaceStore` 造数据？注意
     `MemoryWorkspaceStore.create` 生成的 workspace id 是随机的，`writeManifest` 要求 id 匹配，
     无法直接把夹具 manifest 灌进去；需要 fake 端口或只复用夹具的 columns/rows 常量。

5. **100k 首屏 <16ms 的取证方式**：计时断言在 CI/负载下易 flaky。建议用结构断言
   （选择器返回同一引用、未命中时不做全表 `.map`、调用计数）+ 可选 bench 手工记录；是否接受？

### 6.3 建议的落地拆分（待用户确认后调整）

1. **依赖与 ADR-025**：`zustand@5.x` + `immer@10.x` 加入 `packages/app-core` 的 `dependencies`
   （SPEC §4.2 已允许；SPEC §5.1 要求主版本锁定；AGENTS §4 要求新增运行时依赖先写 ADR，
   说明体积/维护/替代方案）。`pnpm-lock.yaml` 会更新；不要把两者塞进 preload。
2. **`packages/app-core/src/state/`**
   - `types.ts`：`AppState`（`workspace`、`tables`、`views`、`ui`）、`TableSlice`、`UiState`
     （`activeTableId`、`activeViewId`、`error: AppError | null`、`dirtyTables` 或 `DirtyTableTracker`）。
   - `store.ts`：`createAppStore()` 用 `zustand/vanilla` 的 `createStore`（**不要** React binding），
     暴露 `getState/setState/subscribe`；不直接对外暴露 mutable state。
3. **`commands/`**
   - `types.ts`：`CommandDefinition<P>`、`CommandResult`（`patches`/`inversePatches`/`name`/`mergeKey?`）、
     `CommandBus`。
   - `bus.ts`：`createCommandBus(store)` + `register` + `dispatch`；用 Immer `produceWithPatches`
     与 `enablePatches()`；失败捕获 `AppError` → `ui.error`，状态不变。
   - `table-cell-set.ts`：校验 table/row/column 存在、值经 `coerceCell`、主键唯一；只替换目标行。
   - `workspace-open.ts`：按缺口 3 的定位实现 use case（读取 manifest/表 → 归一 state），
     不产 patches 或产“不可撤销”的整树替换。
4. **`selectors/`**：`selectCurrentTable`、`selectVisibleRows`（引用缓存，避免 100k 全表遍历）、
   `selectDirtyTables`；可注入 `DirtyTableTracker`。
5. **错误 surface**：dispatch 返回 `AppError`（domain 的 `createAppError`）；`ui.error` 只存
   `AppError`，渲染层用 `describeAppError` 出文案（T0.4 已交付）。
6. **测试**（`packages/app-core/src/**/*.test.ts`）：
   - `table.cell.set` 正例：值改变、行身份只变目标行、patches + inversePatches 可逆。
   - 反例：不存在的 table/row/column、类型非法、主键重复 → 返回 AppError、state 深比较不变。
   - 注册表：重复命令名、未知命令、dispatch 未注册命令。
   - 选择器：引用相等（memo）、dirty 列表正确、`workspace.open` 后当前表/可见行正确。
   - 夹具：用 `fixtures/workspaces/v1-min` 的 3 行数据断言（测试侧读文件，生产代码不碰 fs）。
   - 100k 结构/perf smoke（按缺口 5 的取证方式）。
7. **文档**：勾选 TASKS、更新 CHANGELOG、新增 ADR-025（zustand/immer）；若 `workspace.open` 定位
   与 SPEC §13.1 不一致，先补 ADR 再回写 SPEC。

### 6.4 关键陷阱

| 陷阱 | 说明 |
|---|---|
| React 不能进 app-core | Zustand 用 `zustand/vanilla` 的 `createStore`，不要 `create` hook；depcruise 已禁止 React/Electron |
| Immer 插件初始化 | `enablePatches()` 在模块入口调用一次；用 `Map/Set` 还要 `enableMapSet()` |
| 异步副作用不进命令 | SPEC §13.1：磁盘写入/IPC 由状态订阅触发；`workspace.open` 是 use case |
| 失败不得部分修改 | `produceWithPatches` 抛错时 catch，不 publish；测试要深比较 state |
| 100k 行 | 选择器禁止 `.filter/.map` 全表；命令只替换目标行数组；不要整表深拷贝 |
| patches 可序列化 | 不要放函数/undefined；Map/Set 的 patch 形状复杂，T5.2 的 undo 会踩 |
| `rowCount` | 提示值；cell.set 不改行数；插入/删除（T2.x）要同步或交给自动保存（T5.1） |
| 依赖已声明但未用 | `packages/app-core/package.json` 已列 domain/table-engine/chart-model/persistence/plugin-sdk；新增 zustand/immer 后跑 `pnpm install` 并更新 lockfile |
| Memory store 语义 | `open` 只认本实例 `create` 过的 root；id 随机；不能直接把夹具 manifest `writeManifest` 进去 |
| 夹具只读 | 不要打开仓库内 `fixtures/workspaces/v1-min`（会写 `.lock`）；需要时复制到临时目录 |
| grep | `pnpm exec vitest run packages/app-core -- --grep` 的 `--` 会被 vitest 收到；用 `--testNamePattern` |
| 性能断言 | 不要用真实墙钟卡 16ms 作为唯一证据；结构断言 + 可选 bench |
| 覆盖率 | app-core 现有 100% 是 smoke 假象；新代码必须带正反例，否则全局 branches 会掉 |

### 6.5 验证命令

```powershell
$env:PATH = "D:\DSH_Work_Space\tools\bin;C:\Users\MECHREVO\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin;$env:PATH"
cd D:\DSH_Work_Space\curve-studio
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue

pnpm exec vitest run packages/app-core
pnpm verify
pnpm test:coverage
pnpm format:check

# 仅当 T1.5 改到 open/E2E 时：
$env:CURVE_E2E_NO_SANDBOX = '1'
pnpm build
pnpm exec playwright test --config apps/desktop/playwright.config.ts --grep "workspace"
```

---

## 7. 后续里程碑提醒

### 7.1 公共 API / 契约位置（已获批，改动先问用户）

- `ErrorCode` / `AppError` / `toAppError` → `@curve/domain`（`src/errors.ts`）。
- 领域类型与 schema → `@curve/domain`（`src/types.ts`、`src/schemas.ts`）；迁移框架 →
  `@curve/domain/src/migrations/`。`strictObject` 策略与 ID 宽松度是**读取契约**，改动需 ADR。
- `WorkspaceStore` 端口、布局/备份纯函数、`MemoryWorkspaceStore` → `@curve/persistence`。
- JSONL 编解码、行集、Worker 协议、脏表原语 → `@curve/table-engine`。
- `FileWorkspaceStore` / 路径白名单 / 锁 / 最近列表 / `rowCount` 重算 / 迁移备份 → `apps/desktop/src/main/workspace/`。
- `IpcResult<T>` → `apps/desktop/src/shared/contracts/envelope.ts`；通道名 → `channels.ts`。
- `CurveApi` → `apps/desktop/src/shared/contracts/ipc.ts`；preload 只暴露白名单方法。
- `@curve/ui` 的公共入口与 `tokens.css` 令牌名/`data-theme` 是主题契约。
- 消息表 key（`shell.*`/`theme.*`/`language.*`/`error.*`）在 `renderer/i18n/messages/zh-CN.ts`；
  新增 UI 文案必须同时加 zh-CN 与 en-US。
- **T1.5 将新增 `@curve/app-core` 的公开 API**（`AppState`、`createAppStore`、`CommandBus`、
  `dispatch`、选择器）；稳定后 T2.x 的 UI 只从包根消费，禁止深路径。

### 7.2 M1–M6

- 严格按 `docs/TASKS.md` 的 ID 顺序；每个任务一个提交；每个里程碑结束跑验收演示、写报告、停下。
- `T1.5` app-core（下一个）；完成后是 `T2.1` 工作区入口/网格。
- `T2.3`（列管理、结构变更与迁移）依赖 `T1.4`，也是**首个真实迁移**最可能的落点。
- `T1.5` 若接线渲染进程，要处理：删除 `electron.vite.config.ts` 的显式 `table-worker` 入口、
  用 `DirtyTableTracker` 驱动脏表切片、自动保存时自行更新 `rowCount`；迁移接线按 §6.2 缺口 1 的决定。
- T2.1 起 UI 才接工作区入口；T1.3 的 E2E 直接调 `window.api`，T1.5 不要提前做 UI。
- M1 验收演示：创建 `Demo.cstudio` → 写 1,000 行 → 关闭重开 → 逐行相等；篡改 manifest → 报错且
  原文件不变；伪造 `.lock` → 走恢复提示。输出报告后停下。

---

## 8. 已知风险与处理

| 风险 | 影响 | 处理 |
|---|---|---|
| 会话策略回到 `workspace-write` | `pnpm verify` 报 `spawn EPERM`，e2e 同样受影响 | 切到 `danger-full-access`；不要改项目配置绕过 |
| agent shell 内 Electron 无法初始化 | E2E `Process failed to launch!` | `CURVE_E2E_NO_SANDBOX=1`（E2E）/ `NO_SANDBOX=1`（dev）；普通终端不需要 |
| 干净安装缺 Electron 运行时 | `pnpm dev`/`e2e` 失败 | 根 `postinstall`；仍缺时手工 `node install.js` |
| 截图证据非字节稳定（鼠标悬停） | 每次 e2e 后工作树变脏 | 预期行为；断言不依赖像素；提交前还原 |
| `pnpm e2e -- --grep` 不过滤 | 误以为只跑了子集 | 用直接 `playwright ... --grep` 过滤 |
| PowerShell 下 `--grep "a|b"` 被拆 | `'b' is not recognized...` | 一次跑一个 `--grep`，不要用 `|` |
| 迁移框架未接线 | 生产 `open` 从不迁移；将来 v2 只能用 `E_WS_VERSION_UNSUPPORTED` 拒绝 | ADR-024；§6.2 缺口 1 决定接线时点；T2.3 前必须解决 |
| `open` 只数行不解析 | 接线迁移时若直接解码全部表，打开 100k×10 可能超 3s | 只在 `formatVersion < CURRENT` 时解码；补 E2E 与计时 |
| 迁移快照不轮转 | `backups/migration-*` 目录永久累积 | ADR-024 接受；磁盘压力时另写 ADR |
| v0→v1 仅测试存在 | 首次真实升级仍需真实迁移与夹具 | T2.3 按 SPEC §7.6 补 |
| zustand/immer 尚未安装 | T1.5 第一个动作就要 `pnpm install` | 写 ADR-025，锁主版本；不要塞进 preload |
| 100k 选择器计时断言易 flaky | CI 误报 | 结构断言 + 可选 bench；不放宽全局超时 |
| 显式 `table-worker` 入口 | 接线渲染进程后会多一份 Worker 产物 | T1.5/T2.1 接线时删除该入口，改由客户端 `new Worker` 生成 |
| `recent-list` capping 用例偶发超时 | 并行 61 worker 时误报 | 重跑确认；不要放宽全局超时 |
| `app.requestSingleInstanceLock()` 未实现 | 两个进程可同时打开同一工作区 | `.lock` 仍能拦截；后续任务补 |
| 应用退出未 `closeAll` | 异常退出留下 `.lock` | 下次打开按 PID/24h 识别 stale 并替换；正常 close 会删锁 |
| 打开时逐表整文件读取计数 | 20 张满表时打开变慢，可能超 SPEC §16.1 的 3s | 当前 1–2 表无影响；T2.6 再评估流式/按需重算（ADR-022 复核条件） |
| `rowCount` 提示值无法区分“新建空表”与“被清空且提示为 0” | 极端情况下把数据丢失当空表 | ADR-022 已接受；`rowCount > 0` 时必定报错 |
| 单次 `table:write` 整串过 IPC | 100k×10 约 12MB；200k 更大 | 当前可接受；T2.6 若需要改流式/分块，先写 ADR |
| Memory 适配器不校验写上限 | 单测若用 Memory 断言 `E_TABLE_LIMIT` 会失败 | 用 IPC/File 适配器测该路径 |
| `write-file-atomic@8` 引擎 | Node 20.11 下 `engines` 不满足 | 实际 Node 24.21 / Electron 24.22 满足；若必须支持 Node 20 需复核 ADR-019 |
| 基准数字随机器负载波动 | 同机 p95 可差 2–3 倍（190 vs 498ms） | 只做预算判断，不当回归基线；CI 报警阈值 20%（TESTPLAN §5.2） |

---

## 9. 不可做清单（重申）

- 不关闭 `contextIsolation` / `sandbox` / `webSecurity`，不打开 `nodeIntegration`。
- 不把 `--no-sandbox`、`CURVE_E2E_NO_SANDBOX` 写进应用代码、默认脚本或 CI。
- 不为 Worker 放宽 CSP（`worker-src`/`script-src` 的 `blob:`）；T1.3 已证明同源 module Worker 可用。
- 不在 renderer 里 `require('fs')`、读任意路径、暴露 `ipcRenderer` 本体或泛 `invoke`。
- 不把 Zod / 任何外部包放进 preload。
- 不为通过安装而删除 `allowBuilds` 白名单或提交 `--ignore-scripts`。
- 不跳过测试、不放宽 ESLint/覆盖率规则、不用 `--no-verify`。
- 不未经 ADR 升级 `formatVersion`、改数据格式、改 IPC 通道或公共 API。
- **不未经用户确认把迁移接进 `FileWorkspaceStore.open`**（ADR-024 的复核条件）。
- **不在 app-core 里 import React/Electron**；Zustand 只用 vanilla store。
- **不把异步 IPC/磁盘写进命令**（SPEC §13.1）。
- 不把 `node_modules`、`out/`、`dist-types/`、`release/`、`test-results/`、`bench/`、`debug.log`、
  真实用户数据提交进仓库。
- 不在组件里硬编码用户文案/颜色；文案走 `t()`，颜色走令牌。
- 不自动跨里程碑推进；每个里程碑验收报告后停下等确认。

---

## 10. 新会话启动检查清单

- [ ] `git status --short` 干净，`git log --oneline -3` 顶部为本交接提交
      （`docs: add T1.5 implementation handoff`），其下为 `3eb306e`（T1.4）。
- [ ] 已注入 PATH（§3.1），`pnpm --version` 为 11.28.5。
- [ ] 会话文件策略为 `danger-full-access`（§3.2），否则先切换。
- [ ] 已读 `AGENTS.md`、本文件、`docs/TASKS.md` T1.5、`docs/TESTPLAN.md` §1/§2/§3（E2/E7）/§4/§5、
      `docs/SPEC.md` §13.1/§13.2、§4.2、§6.5、§7.5、§7.6、§15.1、
      `docs/DECISIONS.md` ADR-006/007/014、`docs/adr/021`–`024`。
- [ ] 已确认 `apps/desktop/node_modules/electron/dist/electron.exe` 存在。
- [ ] 已清除 `ELECTRON_RUN_AS_NODE`；跑 E2E 前再设 `CURVE_E2E_NO_SANDBOX=1`。
- [ ] 已确认用户本轮范围（T1.5，然后停下；不进入 T2.1）。
- [ ] 已就 §6.2 的五个缺口得到用户答复。
- [ ] 已确认 `packages/app-core` 尚无 zustand/immer，需要新增依赖并写 ADR-025。
- [ ] 复述 T1.5 目标/产出/验收后再动手。
