# HANDOFF — Curve Studio 实施交接

> 本文件面向**下一个实现会话**。当前会话已完成 `T1.3`（表数据 JSONL 读写与 Worker），按用户要求停止。
> 最后更新：2026-10-21 · T1.3 提交：`212aa0b` · 分支：`main` · 工作树：干净。
> 阅读顺序：`AGENTS.md` → 本文件 → `docs/TASKS.md` 的 T1.4 → `docs/TESTPLAN.md` §1、§2、§3（E2/E8）、§4、§5 →
> `docs/SPEC.md` §7.6、§7.5、§7.4、§6.5、§15.1 → `docs/DECISIONS.md` ADR-003/007/014/021/022。

---

## 1. 当前进度快照

| 项 | 状态 |
|---|---|
| 方案文档 | v1.0 已锁定（SPEC / TASKS / TESTPLAN / DECISIONS） |
| M0 基建（T0.1–T0.5） | **已完成**；验收报告 `docs/reports/m0/REPORT.md`（`02afe4b`） |
| `T1.1` 领域模型、Zod 与不变量 | **已完成**（`a58ee20`），domain 行覆盖 97.63% |
| `T1.2` 工作区仓库与原子持久化 | **已完成**（`4b742dd`），persistence 行覆盖 95.68%（当时基线） |
| `T1.3` 表数据 JSONL 读写与 Worker | **已完成**（`212aa0b`），table-engine 行覆盖 94.11% |
| 当前里程碑 | M1 进行中（T1.1–T1.3 完成；T1.4、T1.5 未开始） |
| 下一个任务 | **`T1.4` 迁移框架与夹具**（依赖 T1.3，已满足） |
| 提交历史（近 5 条） | `212aa0b feat(tbl): add JSONL codec, table worker and table IPC (T1.3)`<br>`9c08c0f docs: add T1.3 implementation handoff`<br>`4b742dd feat(persistence): add workspace store, atomic file adapter and IPC (T1.2)`<br>`df29db9 docs: add T1.2 implementation handoff`<br>`a58ee20 feat(domain): add domain model schemas and invariants (T1.1)` |
| 工作树 | 干净（`git status --short` 无输出） |
| 当前基线 | `pnpm verify` 57 files / 488 tests；`pnpm e2e` **22 passed**；depcruise 162 modules / 423 deps / 0 violations；`pnpm bench -- --table-io` 通过 |

**用户明确要求**：一次只做一个任务；每个任务先复述目标/产出/验收，再写测试、实现、跑 `pnpm verify`
与任务指定 e2e/bench，最后勾选 TASKS、更新 CHANGELOG、必要时 ADR、Conventional Commit。
新会话从 `T1.4` 开始；**T1.4 完成后输出任务报告并停下等确认**，不要自动进入 T1.5。
本任务（T1.3）的交接文件单独提交（`docs: add T1.4 implementation handoff`），不并入 feat 提交。

---

## 2. 新会话开场提示词（可直接粘贴）

```text
工作目录：D:\DSH_Work_Space\curve-studio（仓库根）。

先读 AGENTS.md、docs/HANDOFF.md、docs/TASKS.md 的 T1.4、docs/TESTPLAN.md §1/§2/§3（E2/E8）/§4/§5、
docs/SPEC.md §7.6/§7.5/§7.4/§6.5/§15.1，以及 docs/DECISIONS.md 的 ADR-003/ADR-007/ADR-014/ADR-021/ADR-022。

现状：M0、T1.1、T1.2、T1.3 已完成（T1.3 提交 212aa0b），工作树干净，
pnpm verify（57 files / 488 tests）与 pnpm e2e（22 passed）全绿，table-engine 行覆盖 94.11%。

请执行 T1.4：先按 AGENTS.md §8 复述目标/产出/验收与风险，并先确认 HANDOFF §6.2 的四个缺口
（迁移是否只交付框架、执行器落 domain 还是 main、夹具是否提交 .lock、formatVersion:2 拒绝是否复用 T1.2 证据）；
这些是行为/分层/验证决策，按 AGENTS.md §11 先问，不要自行选定。

确认后实现：packages/domain 的迁移注册表/执行器/结果类型、main 的迁移前备份与失败回滚、
fixtures/workspaces/ 夹具与逐行等价测试，并跑 pnpm verify 与任务指定命令。

完成后勾选 TASKS、更新 CHANGELOG、按 Conventional Commits 提交，输出任务报告并停下等我确认。
不要自动进入 T1.5；不要放宽 CSP/沙箱；不要跳过测试或降低 lint/覆盖率阈值。
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
    at optimizeSafeRealPathSync (...vite/dist/node/chunks/node.js...)
```

原因：Vite 在 Windows 上首次解析真实路径时会 `exec("net use")`（带管道的子进程），受限沙箱禁止。
**这不是代码问题**，不要改项目配置或加 workaround；把会话策略切到 `danger-full-access` 即可。
T1.3 全程 `danger-full-access`，且审批提示已关闭——不要使用 `sandbox_permissions` 参数。

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
- **grep 陷阱（T1.2/T1.3 都踩过）**：`pnpm e2e -- --grep "table"` 会实际跑全量（pnpm 把额外的 `--`
  传给 Playwright，grep 被当成位置参数忽略）。要只跑子集，用：
  `pnpm exec playwright test --config apps/desktop/playwright.config.ts --grep "table"`。
- 同理，`pnpm exec vitest run packages/domain -- --grep "migration"` 的 `--` 会被 vitest 收到；
  更稳的写法是 `pnpm exec vitest run packages/domain --testNamePattern "migration"`。

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
  57 个 worker 并行、机器繁忙时偶发 5s 超时；重跑即过（T1.3 出现过一次，最终 verify 全绿）。
  不要为它放宽全局超时。

### 3.8 T1.3 新增的运行入口

| 入口 | 用法 | 产物/说明 |
|---|---|---|
| 基准 | `pnpm bench -- --table-io` 或 `pnpm bench` | 固定种子 42，100k×10；写 `bench/report.json`（TESTPLAN §5.2 格式）；超预算 exit 1 |
| 表 Worker | 构建后 `out/renderer/assets/table-worker-<hash>.js`（约 9.4 KB） | 由 `electron.vite.config.ts` 的**显式入口**生成；它 import 同目录共享 chunk `./src-<hash>.js` |
| Worker E2E | `e2e/table-io.spec.ts` 扫描 `^table-worker-.*\.js$` 后 `new Worker(url, { type: 'module' })` | 证明生产 CSP（`default-src 'self'`，无 `worker-src`）允许同源 module Worker；**不要**为此改 CSP |

---

## 4. 已交付的关键接口（T1.4 直接消费，不要回退）

### 4.1 `@curve/domain`

```ts
// 类型（SPEC §6 全集）
Cell, ColumnDef, TableMeta, Row, ViewDef, ChartSpec, TableStyle, LayoutNode, WorkspaceManifest …

// 解析（永不抛裸异常）
parseManifest(value): ParseResult<WorkspaceManifest>
parseTableMeta(value): ParseResult<TableMeta>
parseRow(value): ParseResult<Row>          // 注意：Row 是 {id, values}，不是 JSONL 的 {id, v}
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
```

约定：schema 一律 `strictObject`；ID 读取放宽为 `^<prefix>_[A-Za-z0-9][A-Za-z0-9_-]*$`，写入恒为
`<prefix>_<uuid>`；`checkInvariants` 的 `issues` 阻塞、`warnings` 可修复；`rowCount` 只是提示值。

### 4.2 `@curve/table-engine`（T1.3 新增）

```ts
// JSONL（SPEC §7.3）
decodeJsonl(jsonl, table): { rows, issues, stats }   // 逐行；issues 带 1-based line/columnId/code
encodeJsonl(rows): string                            // 空数组 → ''；每行 '\n' 结尾
encodeJsonlWithStats(rows): { jsonl, bytes }         // 逐行累计字节，不复制整串
countJsonlRows(jsonl): number                        // 只数内容行，不 JSON.parse
hasTrailingNewline(jsonl): boolean                   // 空文件视为 true
toJsonlAppError(result): AppError | null             // E_TABLE_PARSE + 行号；超限优先 E_TABLE_LIMIT
tableWriteLimitError({ rowCount, bytes }): AppError | null
utf8ByteLength(text): number
BOM, MAX_JSONL_LINE_BYTES (8MB), MAX_TABLE_FILE_BYTES (256MB), MAX_ROWS_PER_TABLE (200_000)

// 行集与行数（SPEC §8）
TableData, createTableData(table, rows?)
diffRowCounts(tables, actualCounts): RowCountDrift[]
reconcileRowCounts(manifest, actualCounts): { manifest, drifts, changed }  // 不改 updatedAt
diffTableRows(before, after): { added, removed, changed, orderChanged, empty }

// 脏表原语（ADR-023）
DirtyTableTracker: mark / markAll / clear / clearAll / has / get / list / ids / size
  // 可注入 now；revision 单调递增；重复 mark 不改变首次顺序

// Worker 协议
TableWorkerRequest = { id, type:'decode', payload:{ jsonl, table } }
                   | { id, type:'encode', payload:{ rows } }
TableWorkerResponse = { id, ok:true, type:'decode', result } | { id, ok:true, type:'encode', result }
                    | { id, ok:false, type, error: AppError }
createDecodeRequest / createEncodeRequest / isTableWorkerRequest / isTableWorkerResponse
```

`decodeJsonl` 的规则：空串 → 0 行；BOM/CRLF/空行/非 `{"id","v"}` 形状/非法 row id/重复 id/
列数不符/逐格类型错误都产生 issue 并**跳过该行**（不吞行）；单行 >8MB 在解析前拒；超过 200k 行
追加一条 `E_TABLE_LIMIT` 并停止。

### 4.3 `@curve/persistence`

`WorkspaceStore` 端口（`packages/persistence/src/types.ts`）：

```ts
create({ dir, name }): Promise<WorkspaceManifest>
open({ dir }): Promise<{ manifest, warnings }>
close({ workspaceId }): Promise<{ ok: true }>
readTable({ workspaceId, tableId }): Promise<{ jsonl, bytes }>
writeTable({ workspaceId, tableId, jsonl }): Promise<{ bytes }>
writeManifest({ workspaceId, manifest }): Promise<{ ok: true }>
trash({ workspaceId, tableId }): Promise<{ ok: true }>   // 只移文件，manifest 由调用方更新
listBackups({ workspaceId, tableId }): Promise<BackupEntry[]>
restore({ workspaceId, tableId, backupPath }): Promise<{ ok: true }>
```

**T1.3 起 `readTable` 的缺文件语义（ADR-022，两个适配器一致）**：表在 manifest 且 `rowCount === 0` →
`{ jsonl: '', bytes: 0 }`；`rowCount > 0` → `E_TABLE_NOT_FOUND`。

`MemoryWorkspaceStore` 已实现同一端口，供 app-core/T1.5 单测使用。
**注意**：Memory 适配器**不**校验写盘上限（`@curve/persistence` 不得依赖 `table-engine`），
`E_TABLE_LIMIT` 由 IPC + `FileWorkspaceStore` 保证，T1.5 的单测不要拿 Memory 断言该错误。

纯函数/常量（包根统一导出）：

- 布局：`WORKSPACE_*`、`tableFilePath(tableId)`、`tableFileName`、`workspaceFolderName(name)`、
  `sanitizeWorkspaceFolderName`、`isSafeRelativePath`、`assertSafeRelativePath`、`findManifestPathIssues`。
- 备份：`formatBackupTimestamp`、`tableBackupFileName`、`manifestBackupFileName`、
  `parseTableBackupFileName`、`parseBackupPath`、`planBackupRotation`、`isExpiredBackup`、`MAX_BACKUPS_PER_TARGET`。
- manifest：`createEmptyManifest`、`validateManifest`、`parseManifestDocument`、`serializeManifest`。

`packages/persistence` 无 Electron/Node 内置导入；T1.4 不要把 `node:fs` 放进这个包。

### 4.4 main：`FileWorkspaceStore`

`apps/desktop/src/main/workspace/file-workspace-store.ts`：

- 构造参数：`{ userDataPath, appVersion, now?, uuid?, logger?, isProcessAlive?, writeFile? }`。
- 额外公开 `listRecent(): Promise<RecentEntry[]>`（`recent.json`）。
- `create` 会创建并打开工作区、写 `.lock`、写最近列表；`open` 先校验 manifest，再检查/替换锁；
  `close` 删除自己的 `.lock`；未知 id 的 `close` 幂等返回 `{ok:true}`。
- `writeTable`：先校验 SPEC §2.2（`E_TABLE_LIMIT`），旧文件存在时先备份（最多 3 份），再
  `write-file-atomic` 替换；失败保留旧文件并返回 `E_FS_WRITE`。
- `writeManifest`：先 `validateManifest`（id 必须匹配、table.file 必须是 `tables/<tableId>.jsonl`），
  备份旧 manifest，再原子写；损坏的 manifest 不会被 `open` 覆盖。
- `trash` 只把表文件移到 `.trash/`，不修改 manifest。
- **`open` 末尾按磁盘重算 `rowCount`**（T1.3，SPEC §7.5）：只数内容行；不一致则备份 + 原子重写
  manifest 并追加 warning；缺文件保留原提示值，只 warning；重写失败不阻塞打开；不修改 `updatedAt`。
- 路径白名单：`path-safety.ts` 的 `resolveInsideRoot` / `resolveWorkspaceRelativePath` 全部先
  `fs.realpath`（缺失目标则解析父目录）再做 `path.relative` 前缀判断；失败 `E_PATH_DENIED`。
- `.lock`：`{pid, startedAt, appVersion}`；PID 存活且 <24h → `E_WS_LOCKED`；PID 不存在/超过 24h →
  stale warning 并替换；无法解析的 lock 按 corrupt 处理（warning + 替换）。

### 4.5 IPC / preload / renderer

- `CurveApi` 命名空间：`app`、`log`、`workspace`、`manifest`、`table`。
- `IMPLEMENTED_IPC_CHANNELS` 共 **10** 个：`app:info`、`log:write`、`workspace:create/open/close/recent`、
  `manifest:write`、`table:read/write/trash`。
- `workspace:recent:remove/clear` 仍未注册（留给 T5.3/欢迎页）。
- `HandlerContract` 的 request/response 输入类型是 `unknown`（`safeParse` 接收跨进程原始载荷）。
- preload 只 import `channels.ts`/`envelope.ts` 的运行时内容；`ipc.ts` 只做 `import type`。
- `e2e/ipc.spec.ts` 会断言“实际注册通道 == `IMPLEMENTED_IPC_CHANNELS`”与桥方法白名单；
  加通道必须同步 `channels.ts`、handlers、preload、`CurveApi`、renderer `api-client` 和该 E2E。
- `table:read/write` 只收 `{ workspaceId, tableId }`（write 另加 `jsonl`）；main 从内部映射解析路径。

### 4.6 renderer：table-io

- `apps/desktop/src/renderer/workers/table.worker.ts`：`onmessage → handleTableWorkerRequest → postMessage`。
- `apps/desktop/src/renderer/table-io/handler.ts`：`handleTableWorkerRequest(message: unknown): TableWorkerResponse`，
  永远返回响应、不抛异常（malformed → `E_TABLE_PARSE` 信封）。
- `apps/desktop/src/renderer/table-io/client.ts`：
  `createTableIoClient({ createWorker?, timeoutMs? })` → `{ decode, encode, terminate, pending }`；
  请求 id 关联、120s 默认超时、`terminate` 时结算所有 pending、Worker error 事件失败所有 pending
  并丢弃 worker（下次调用重建）。返回 `TableWorkerCallResult<T>`（`{ok:true,result} | {ok:false,error}`），
  不向调用方抛 rejection。
- 生产用法：`new Worker(new URL('../workers/table.worker.ts', import.meta.url), { type: 'module' })`。
  T1.5 把客户端接进渲染进程后，应删除 `electron.vite.config.ts` 里的显式 `table-worker` 入口
  （否则会多出一份 ~9.4KB 的 Worker 产物）。

---

## 5. T1.3 实施记录（已完成 2026-10-21，提交 `212aa0b`）

### 5.1 交付文件

```text
packages/table-engine/src/
├─ jsonl.ts              # 编解码、计数、行号 issue、8MB/200k/256MB 上限
├─ row-set.ts            # TableData、行数比对与重写、行差异
├─ dirty-set.ts          # DirtyTableTracker（纯原语，ADR-023）
├─ worker-protocol.ts    # decode/encode 判别联合 + 手写 guard
├─ *.test.ts             # 4 个测试文件（51 条）
└─ index.ts
apps/desktop/src/renderer/
├─ workers/table.worker.ts
└─ table-io/{handler,client}.ts + *.test.ts（14 条）
apps/desktop/e2e/table-io.spec.ts        # 3 条 E2E
scripts/bench.ts                          # 100k×10 基准，写 bench/report.json
docs/adr/022-table-read-missing-file.md
docs/adr/023-dirty-table-tracking.md
```

改动的既有文件（要点）：`shared/contracts/{channels,ipc}.ts`（`table:*` 契约，通道 7→10）、
`main/ipc/handlers.ts`、`preload/api.ts`、`renderer/api-client.ts`、`main/workspace/file-workspace-store.ts`
（缺文件语义、写上限、`rowCount` 重算）、`packages/persistence/src/memory-workspace-store.ts`（语义对齐）、
`electron.vite.config.ts`（显式 worker 入口）、`vitest.config.ts`（排除 worker 入口）、`package.json`（`tsx`）。

### 5.2 关键决策

- 开工前三个缺口按用户确认执行：补 `tsx` + bench 脚本；`table:read` 按 `rowCount` 区分；脏表只给纯原语。
- 缺文件语义与 `rowCount` 重算边界写入 ADR-022，并回写 SPEC §7.5/§15.1。
- 生产 CSP **未**改动：E2E 证明 `default-src 'self'` 允许同源 module Worker（含相对 import）。
- `decodeJsonl` 不用 Zod 逐行校验（ADR-007 的复核条件）：形状手写 + 每格 `parseCell`，100k 解码
  p95 约 270–570ms（随机器负载）。
- Worker 由显式 renderer 入口构建，避免在 T1.3 提前把客户端接进 UI。
- 写盘上限放在 `FileWorkspaceStore.writeTable`（真实持久化边界），Memory 适配器保持简单。

### 5.3 已验证证据

| 命令 | 结果 |
|---|---|
| `pnpm exec vitest run packages/table-engine` | exit 0；5 files / 51 tests |
| `pnpm verify` | exit 0；ESLint 0 problem；depcruise **162 modules / 423 deps / 0 violations**；**57 files / 488 tests** |
| `pnpm test:coverage` | exit 0；全局 lines **93.06%** / branches 85.56%；table-engine lines **94.11%**（jsonl 91.82%、dirty-set 100%、row-set 97.61%、worker-protocol 96.96%） |
| `pnpm e2e` | **22 passed**（T0.4 shell 6 + T0.3 IPC 4 + E1 5 + T1.2 workspace 4 + T1.3 table 3） |
| `pnpm exec playwright test ... --grep "table"` | **3 passed** |
| `pnpm bench -- --table-io` | exit 0；encode p95 498ms / 预算 1500ms；decode p95 572ms / 预算 3000ms；memoryPeakMB 328.6 / 600（空载重跑约 190/269ms，机器负载影响大） |
| `pnpm format:check` | exit 0 |

### 5.4 与计划/规格的差异

- 新增 `tsx` devDependency 与 `scripts/bench.ts`（SPEC §5.2 的 `bench` 脚本原本只有契约没有实现）。
- 新增 ADR-022/023，并同步 SPEC §7.5、§15.1；`TASKS` T1.3 的验收第 4 项引用从 TESTPLAN §4（夹具表）
  更正为 SPEC §16.1 / TESTPLAN §5.1（600MB 内存预算）。
- renderer 增加显式 `table-worker` 构建入口（T1.5 接线后可删）；Worker 入口排除出覆盖率门禁。
- `MemoryWorkspaceStore` 不实现写盘上限；`E_TABLE_LIMIT` 只由 IPC/文件适配器保证。
- `rowCount` 重算只数行、不解析；解析错误在读取时以 `E_TABLE_PARSE` + 行号暴露（ADR-022）。
- 未更新 `AGENTS.md §0` 的过时状态行；未改 `formatVersion`。

---

## 6. T1.4 迁移框架与夹具（下一个任务）

### 6.1 任务原文（`docs/TASKS.md` T1.4）

- **依赖**：T1.3（已完成）
- **覆盖**：FR-WS-04、FR-TBL-08
- **参考**：SPEC §7.6
- **产出**：
  - `packages/domain/src/migrations/`：注册表、执行器、结果类型
  - 迁移前备份、失败回滚
  - `fixtures/workspaces/v1-min/` 夹具与逐行等价测试
- **步骤**：
  1. 定义 `Migration { from, to, migrate(manifest, tables) }`。
  2. 顺序执行，禁止跳版；每步后校验不变量。
  3. 失败时恢复备份并返回 `E_MIGRATION_FAILED`。
  4. 用夹具模拟 v1 → 测试迁移（可造一个测试专用 v0）。
- **验收**：
  - [ ] 夹具打开成功，行数与内容逐行相等。
  - [ ] `formatVersion: 2` 被拒绝并提示升级。
  - [ ] 迁移失败后原文件哈希不变。
  - [ ] 备份目录存在且可回滚。
- **验证**：`pnpm exec vitest run packages/domain -- --grep "migration"`

### 6.2 开工前必须先确认的缺口

1. **生产是否要真的注册迁移**：v1 是当前唯一版本，没有真实的 v0→v1 历史。TASKS 步骤 4 允许
   “造一个测试专用 v0”。选项：
   (a) 生产注册表为空，只交付框架 + 测试内注入 v0；
   (b) 把 v0→v1 作为真实迁移注册（等于承认 v0 存在过）。
   建议 (a)（最保守、可回滚），但会改变“迁移失败后原文件哈希不变”这条验收的验证方式（只能用测试注册表）。
   这是**行为决策，先问用户**。
2. **执行器落哪一层**：SPEC §7.6 的签名是纯变换，但“迁移前复制 `tables/` 到 `backups/migration-<ts>/`、
   失败回滚”是文件系统操作（只能在 main）。需要确认拆分：
   - `@curve/domain`：`Migration` 类型、注册表、纯 `runMigrations(manifest, tables, registry)`、结果类型；
   - `apps/desktop/src/main/workspace/`：备份目录、回滚、调用纯执行器、`E_MIGRATION_FAILED`；
   - **是否在 `FileWorkspaceStore.open` 里接线**（打开即迁移），还是 T1.4 只提供原语、接线留 T1.5？
     T1.3 的脏表问题同构，建议先问。
3. **夹具是否提交 `.lock`**：TESTPLAN §4 要求 `fixtures/workspaces/stale-lock/`（残留 `.lock`）。
   `.gitignore` 目前没有排除 `*.lock`，但 `.lock` 含 pid/时间，需要固定内容并确认是否提交；
   另外 `fixtures/workspaces/**` 下的 manifest 时间必须固定 UTC（TESTPLAN §4 规则）。
4. **`formatVersion: 2` 拒绝已被 T1.2 覆盖**：`workspace.spec.ts` 有 E2E，`persistence` 有单测
   （`E_WS_VERSION_UNSUPPORTED`）。T1.4 验收第二项应复用这些证据，还是新增夹具 `future-version/` 再测一遍？
   建议复用 + 新增夹具（夹具本身是 T1.4 产出）。
5. 附带确认：`fixtures/` 目录尚不存在，`scripts/gen-100k.ts`（TESTPLAN §4）也不存在；后者属于 T2.x，
   T1.4 不要顺手实现。

### 6.3 建议的落地拆分（待用户确认后调整）

1. **`packages/domain/src/migrations/`**
   - `types.ts`：`Migration`、`MigrationContext`、`MigrationResult`、`MigrationFailure`（纯类型）。
   - `registry.ts`：`createMigrationRegistry(entries)`、`resolveMigrationPath(from, to)`（连续、禁跳版）。
   - `run.ts`：`runMigrations({ manifest, tables, target, registry })`，每步后 `checkInvariants`，
     失败返回结构化错误（不抛裸异常）。
   - `*.test.ts`：正例（v0→v1）、跳版拒绝、注册表缺步、每步不变量校验失败。
2. **main 侧备份/回滚**：`apps/desktop/src/main/workspace/migration-backup.ts`
   - 复制 `tables/` → `backups/migration-<timestamp>/`；失败时回滚并保持原文件可读；
   - 复用 `formatBackupTimestamp`、`resolveInsideRoot`，不要新造路径逻辑；
   - 单测覆盖“复制失败/回滚成功/哈希不变”。
3. **夹具**：`fixtures/workspaces/{v1-min,corrupt-manifest,future-version,stale-lock}/` + 每个目录的
   `README.md`（预期行数、列类型、坏行位置）。时间固定 UTC。
4. **接线**（若用户要求）：`FileWorkspaceStore.open` 在 manifest 解析后、写锁前执行迁移；
   失败返回 `E_MIGRATION_FAILED` 且不写锁、不改原文件。
5. **文档**：`docs/TASKS.md` 勾选、`CHANGELOG.md`、必要时 ADR（迁移执行位置/是否注册生产迁移）。

### 6.4 关键陷阱

| 陷阱 | 说明 |
|---|---|
| domain 不能碰 fs | `@curve/domain` 禁止 Node 内置（depcruise `domain-no-node-core`）；备份/回滚只能放 main |
| 版本检查顺序 | `parseManifestDocument` 已经先看原始 `formatVersion` 再 Zod；迁移必须在“版本允许”之后、不变量校验之前 |
| 不变量校验时机 | SPEC §7.6 要求每步后校验；不要只在最后校验一次 |
| 备份目录命名 | 复用 `backups/migration-<ts>/`，timestamp 用 `formatBackupTimestamp`（ADR-021 的紧凑 UTC） |
| 失败语义 | 迁移失败必须回滚且**原文件可读**；返回 `E_MIGRATION_FAILED`，不得留下半迁移状态 |
| `rowCount` | 是提示值；迁移后仍需按 ADR-022 由 open 重算 |
| 夹具时间 | 固定 UTC，避免时区导致断言漂移；禁止 `new Date()` 落盘 |
| 大文件 | 夹具要小（v1-min 3 行）；100k 数据用脚本生成，不提交 |
| grep | `pnpm exec vitest run packages/domain -- --grep` 的 `--` 会传给 vitest；用 `--testNamePattern` |
| 覆盖率 | domain 行覆盖 ≥85%；迁移执行器必须有正反例 |

### 6.5 验证命令

```powershell
$env:PATH = "D:\DSH_Work_Space\tools\bin;C:\Users\MECHREVO\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin;$env:PATH"
cd D:\DSH_Work_Space\curve-studio
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue

pnpm exec vitest run packages/domain --testNamePattern "migration"
pnpm verify
pnpm test:coverage        # domain 行覆盖 ≥ 85%
$env:CURVE_E2E_NO_SANDBOX = '1'
pnpm exec playwright test --config apps/desktop/playwright.config.ts --grep "workspace|migration"
pnpm format:check
```

---

## 7. 后续里程碑提醒

### 7.1 公共 API / 契约位置（已获批，改动先问用户）

- `ErrorCode` / `AppError` / `toAppError` → `@curve/domain`（`src/errors.ts`）。
- 领域类型与 schema → `@curve/domain`（`src/types.ts`、`src/schemas.ts`）。`strictObject` 策略与
  ID 宽松度是**读取契约**，改动需 ADR。
- 迁移注册表/执行器 → `@curve/domain`（T1.4）。
- `WorkspaceStore` 端口、布局/备份纯函数、`MemoryWorkspaceStore` → `@curve/persistence`。
- JSONL 编解码、行集、Worker 协议、脏表原语 → `@curve/table-engine`（T1.3）。
- `FileWorkspaceStore` / 路径白名单 / 锁 / 最近列表 / `rowCount` 重算 → `apps/desktop/src/main/workspace/`。
- `IpcResult<T>` → `apps/desktop/src/shared/contracts/envelope.ts`；通道名 → `channels.ts`。
- `CurveApi` → `apps/desktop/src/shared/contracts/ipc.ts`；preload 只暴露白名单方法。
- `@curve/ui` 的公共入口与 `tokens.css` 令牌名/`data-theme` 是主题契约。
- 消息表 key（`shell.*`/`theme.*`/`language.*`/`error.*`）在 `renderer/i18n/messages/zh-CN.ts`；
  新增 UI 文案必须同时加 zh-CN 与 en-US。

### 7.2 M1–M6

- 严格按 `docs/TASKS.md` 的 ID 顺序；每个任务一个提交；每个里程碑结束跑验收演示、写报告、停下。
- `T1.4` 迁移框架与夹具（下一个）；`T1.5` app-core 命令总线。
- `T1.4` 才创建 `fixtures/workspaces/`；大文件用脚本生成，不要提交。
- `T2.1` 起 UI 才接工作区入口；T1.3 的 E2E 直接调 `window.api`，T1.4 不要提前做 UI。
- M1 验收演示：创建 `Demo.cstudio` → 写 1,000 行 → 关闭重开 → 逐行相等；篡改 manifest → 报错且
  原文件不变；伪造 `.lock` → 走恢复提示。
- T1.5 接线时要处理：删除 `electron.vite.config.ts` 的显式 `table-worker` 入口、用 `DirtyTableTracker`
  驱动脏表切片、自动保存时自行更新 `rowCount`。

---

## 8. 已知风险与处理

| 风险 | 影响 | 处理 |
|---|---|---|
| 会话策略回到 `workspace-write` | `pnpm verify` 报 `spawn EPERM`，e2e 同样受影响 | 切到 `danger-full-access`；不要改项目配置绕过 |
| agent shell 内 Electron 无法初始化 | E2E `Process failed to launch!` | `CURVE_E2E_NO_SANDBOX=1`（E2E）/ `NO_SANDBOX=1`（dev）；普通终端不需要 |
| 干净安装缺 Electron 运行时 | `pnpm dev`/`e2e` 失败 | 根 `postinstall`；仍缺时手工 `node install.js` |
| 截图证据非字节稳定（鼠标悬停） | 每次 e2e 后工作树变脏 | 预期行为；断言不依赖像素；提交前还原 |
| `pnpm e2e -- --grep` 不过滤 | 误以为只跑了子集 | 用直接 `playwright ... --grep` 过滤 |
| 打开时逐表整文件读取计数 | 20 张满表时打开变慢，可能超 SPEC §16.1 的 3s | 当前 1–2 表无影响；T2.6 再评估流式/按需重算（ADR-022 复核条件） |
| `rowCount` 提示值无法区分“新建空表”与“被清空且提示为 0” | 极端情况下把数据丢失当空表 | ADR-022 已接受；`rowCount > 0` 时必定报错 |
| 显式 `table-worker` 入口 | T1.5 接线后会多一份 Worker 产物 | T1.5 删除该入口，改由客户端 `new Worker` 生成 |
| 单次 `table:write` 整串过 IPC | 100k×10 约 12MB；200k 更大 | 当前可接受；T2.6 若需要改流式/分块，先写 ADR |
| Memory 适配器不校验写上限 | 单测若用 Memory 断言 `E_TABLE_LIMIT` 会失败 | T1.5 用 IPC/File 适配器测该路径 |
| `recent-list` capping 用例偶发超时 | 并行 57 worker 时误报 | 重跑确认；不要放宽全局超时 |
| `app.requestSingleInstanceLock()` 未实现 | 两个进程可同时打开同一工作区 | `.lock` 仍能拦截；后续任务补 |
| 应用退出未 `closeAll` | 异常退出留下 `.lock` | 下次打开按 PID/24h 识别 stale 并替换；正常 close 会删锁 |
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
- 不把 `node_modules`、`out/`、`dist-types/`、`release/`、`test-results/`、`bench/`、`debug.log`、
  真实用户数据提交进仓库。
- 不在组件里硬编码用户文案/颜色；文案走 `t()`，颜色走令牌。
- 不自动跨里程碑推进；每个里程碑验收报告后停下等确认。

---

## 10. 新会话启动检查清单

- [ ] `git status --short` 干净，`git log --oneline -4` 顶部为两个文档提交
      （`docs: add T1.4 implementation handoff`、`docs(agents): refresh status snapshot`），
      其下为 `212aa0b`（T1.3）。
- [ ] 已注入 PATH（§3.1），`pnpm --version` 为 11.28.5。
- [ ] 会话文件策略为 `danger-full-access`（§3.2），否则先切换。
- [ ] 已读 `AGENTS.md`、本文件、`docs/TASKS.md` T1.4、`docs/TESTPLAN.md` §1/§2/§3（E2/E8）/§4/§5、
      `docs/SPEC.md` §7.6/§7.5/§7.4/§6.5/§15.1、`docs/DECISIONS.md` ADR-003/007/014/021/022。
- [ ] 已确认 `apps/desktop/node_modules/electron/dist/electron.exe` 存在。
- [ ] 已清除 `ELECTRON_RUN_AS_NODE`；跑 E2E 前再设 `CURVE_E2E_NO_SANDBOX=1`。
- [ ] 已确认用户本轮范围（T1.4，然后停下；不进入 T1.5）。
- [ ] 已就 §6.2 的四个缺口得到用户答复。
- [ ] 复述 T1.4 目标/产出/验收后再动手。
