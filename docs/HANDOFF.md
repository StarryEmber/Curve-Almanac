# HANDOFF — Curve Studio 实施交接

> 本文件面向**下一个实现会话**。当前会话已完成 `T1.2`（工作区仓库与原子持久化），按用户要求停止。
> 最后更新：2026-10-20 · T1.2 提交：`4b742dd` · 分支：`main` · 工作树：干净。
> 阅读顺序：`AGENTS.md` → 本文件 → `docs/TASKS.md` 的 T1.3 → `docs/TESTPLAN.md` §1、§2、§3（E2/E3）、§4、§5 →
> `docs/SPEC.md` §7.3、§7.4、§8、§15.1 → `docs/DECISIONS.md` ADR-003/007/011/014/019/021。

---

## 1. 当前进度快照

| 项 | 状态 |
|---|---|
| 方案文档 | v1.0 已锁定（SPEC / TASKS / TESTPLAN / DECISIONS） |
| M0 基建（T0.1–T0.5） | **已完成**；验收报告 `docs/reports/m0/REPORT.md`（`02afe4b`） |
| `T1.1` 领域模型、Zod 与不变量 | **已完成**（`a58ee20`），43 files / 302 tests，domain 行覆盖 97.63% |
| `T1.2` 工作区仓库与原子持久化 | **已完成**（`4b742dd`），51 files / 417 tests，persistence 行覆盖 95.68% |
| 当前里程碑 | M1 进行中（T1.1、T1.2 完成，T1.3 未开始） |
| 下一个任务 | **`T1.3` 表数据 JSONL 读写与 Worker**（依赖 T1.2，已满足） |
| 提交历史（近 5 条） | `4b742dd feat(persistence): add workspace store, atomic file adapter and IPC (T1.2)`<br>`df29db9 docs: add T1.2 implementation handoff`<br>`a58ee20 feat(domain): add domain model schemas and invariants (T1.1)`<br>`02afe4b docs: add m0 acceptance report`<br>`1aefcdb chore(ci): add ci gate and e2e failure artifacts (T0.5)` |
| 工作树 | 干净（`git status --short` 无输出） |
| 当前基线 | `pnpm verify` 51 files / 417 tests；`pnpm e2e` **19 passed**；depcruise 148 modules / 381 dependencies / 0 violations |

**用户明确要求**：一次只做一个任务；每个任务先复述目标/产出/验收，再写测试、实现、跑 `pnpm verify`
与任务指定 e2e/bench，最后勾选 TASKS、更新 CHANGELOG、必要时 ADR、Conventional Commit。
新会话从 `T1.3` 开始；**T1.3 完成后输出任务报告并停下等确认**，不要自动进入 T1.4。

---

## 2. 新会话开场提示词（可直接粘贴）

```text
工作目录：D:\DSH_Work_Space\curve-studio（仓库根）。

先读 AGENTS.md、docs/HANDOFF.md、docs/TASKS.md 的 T1.3、docs/TESTPLAN.md §1/§2/§3（E2/E3）/§4/§5、
docs/SPEC.md §7.3/§7.4/§8/§15.1，以及 docs/DECISIONS.md 的 ADR-003/ADR-007/ADR-011/ADR-014/ADR-019/ADR-021。

现状：M0、T1.1、T1.2 已完成（T1.2 提交 4b742dd），工作树干净，
pnpm verify（51 files / 417 tests）与 pnpm e2e（19 passed）全绿，persistence 行覆盖 95.68%。

请执行 T1.3：先按 AGENTS.md §8 复述目标/产出/验收与风险，并先确认 HANDOFF §6.2 的两个缺口
（bench 骨架缺失、table:read 缺文件语义）以及脏表追踪的归属；这些是验证/行为/分层决策，
按 AGENTS.md §11 先问，不要自行选定。

确认后实现：packages/table-engine 的 JSONL 编解码、行集类型、Worker 协议；
apps/desktop/src/renderer/workers/table.worker.ts 与 Worker 客户端；
IPC table:read/write/trash（含 preload 与契约）；行数重算与脏表原语；
补 E2E `pnpm e2e -- --grep "table"`，并跑 `pnpm verify` 与 `pnpm bench -- --table-io`。

完成后勾选 TASKS、更新 CHANGELOG、按 Conventional Commits 提交，输出任务报告并停下等我确认。
不要自动进入 T1.4；不要放宽 CSP/沙箱；不要跳过测试或降低 lint/覆盖率阈值。
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
当前（2026-10-20 交接时）策略为 `danger-full-access`，且审批提示已关闭——不要使用
`sandbox_permissions` 参数。

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
- **T1.2 实测的 grep 陷阱**：`pnpm e2e -- --grep "workspace"` 会实际跑全量（pnpm 把额外的 `--`
  传给 Playwright，grep 被当成位置参数忽略）。要只跑子集，用：
  `pnpm exec playwright test --config apps/desktop/playwright.config.ts --grep "workspace"`。
  全量 19 条仍然全绿。

### 3.4 `ELECTRON_RUN_AS_NODE=1`

DSH 进程环境全局存在该变量，子进程会继承；Electron 会退化为纯 Node。所有启动/测试前
`Remove-Item Env:ELECTRON_RUN_AS_NODE`；E2E fixture 已在传给子进程前删除该键。

### 3.5 安装 / Electron 运行时（T0.5 新增）

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

### 3.6 文本编码与路径陷阱（T0.3 起）

- DSH 的 shell 是 **Windows PowerShell 5.1**：`Get-Content` 默认按 GBK 解码无 BOM 的 UTF-8 文件（乱码），
  `Set-Content -Encoding UTF8` 会写入 **BOM**。**源码与文档一律用编辑器工具（read/write/edit）修改**。
- `[System.IO.File]::ReadAllBytes('相对路径')` 按**进程 CWD**（`D:\DSH_Work_Space`）解析，不是 PowerShell 的
  `cd` 目录；这类 .NET 调用必须给绝对路径。
- `pnpm` 的 stdout 被 PowerShell 当成错误流时会打印 `NativeCommandError` 红字，但**结论看 `$LASTEXITCODE`**；
  建议 `pnpm ... *> test-results/xxx.log` 后再检索。
- 截图是设备像素（125% DPI）：窗口 1440×816 → 页面 1426×779 CSS px → PNG 1783×943。
  新增截图用例必须复用 `shell.spec.ts` 的 `settleFrame()`（双 rAF），否则首帧会拼接旧画面。

### 3.7 已知的测试/依赖行为

- `pnpm e2e` 会重写 `docs/reports/m0/t0.2-window.png`；调试主题时还会重写
  `t0.4-shell-dark.png`（受**真实鼠标悬停**影响，字节不稳定，视觉无变化）。断言不依赖像素；
  提交时若不想要噪声可 `git checkout --` 还原并在提交说明里写一句。
- `apps/desktop/test-results/`、`playwright-report/`、`coverage/` 均已 gitignore。
- Vitest 覆盖率已排除纯类型模块：`packages/domain/src/types.ts`、`packages/persistence/src/types.ts`。
- 通过用例不残留 trace；失败用例在 `apps/desktop/test-results/<test>/` 留下
  `test-failed-1.png`、`trace.zip`（内建）与 `attachments/trace-*.zip`（fixture 录的完整 context trace）。
- T1.2 起 `apps/desktop` 的 `dependencies` 只有 `write-file-atomic@8.0.0`；main 构建会**外置**它
  （`out/main/index.cjs` 里是 `require("write-file-atomic")`），所以打包时它必须留在 dependencies。
- preload 产物仍只 `require("electron")`；`@curve/persistence` 与 zod 都不得进入 preload。

---

## 4. 已交付的关键接口（T1.3 直接消费，不要回退）

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

// 工厂
createId / createWorkspaceId / createTableId / createColumnId / createRowId / … / isId
createTimestamp(now?: Date): string
```

约定：schema 一律 `strictObject`；ID 读取放宽为 `^<prefix>_[A-Za-z0-9][A-Za-z0-9_-]*$`，写入恒为
`<prefix>_<uuid>`；`checkInvariants` 的 `issues` 阻塞、`warnings` 可修复；`rowCount` 只是提示值。

### 4.2 `@curve/persistence`

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

`MemoryWorkspaceStore` 已实现同一端口，供 app-core/T1.5 单测使用。

纯函数/常量（包根统一导出）：

- 布局：`WORKSPACE_*`、`tableFilePath(tableId)`、`tableFileName`、`workspaceFolderName(name)`、
  `sanitizeWorkspaceFolderName`、`isSafeRelativePath`、`assertSafeRelativePath`、`findManifestPathIssues`。
- 备份：`formatBackupTimestamp`、`tableBackupFileName`、`manifestBackupFileName`、
  `parseTableBackupFileName`、`parseBackupPath`、`planBackupRotation`、`isExpiredBackup`、`MAX_BACKUPS_PER_TARGET`。
- manifest：`createEmptyManifest`、`validateManifest`、`parseManifestDocument`、`serializeManifest`。

`packages/persistence` 无 Electron/Node 内置导入；T1.3 不要把 `node:fs` 放进这个包。

### 4.3 main：`FileWorkspaceStore`

`apps/desktop/src/main/workspace/file-workspace-store.ts`：

- 构造参数：`{ userDataPath, appVersion, now?, uuid?, logger?, isProcessAlive?, writeFile? }`。
- 额外公开 `listRecent(): Promise<RecentEntry[]>`（`recent.json`）。
- `create` 会创建并打开工作区、写 `.lock`、写最近列表；`open` 先校验 manifest，再检查/替换锁；
  `close` 删除自己的 `.lock`；未知 id 的 `close` 幂等返回 `{ok:true}`。
- `writeTable`：旧文件存在时先备份（最多 3 份），再 `write-file-atomic` 替换；失败保留旧文件并返回 `E_FS_WRITE`。
- `writeManifest`：先 `validateManifest`（id 必须匹配、table.file 必须是 `tables/<tableId>.jsonl`），
  备份旧 manifest，再原子写；损坏的 manifest 不会被 `open` 覆盖。
- `trash` 只把表文件移到 `.trash/`，不修改 manifest。
- 路径白名单：`path-safety.ts` 的 `resolveInsideRoot` / `resolveWorkspaceRelativePath` 全部先
  `fs.realpath`（缺失目标则解析父目录）再做 `path.relative` 前缀判断；失败 `E_PATH_DENIED`。
- `.lock`：`{pid, startedAt, appVersion}`；PID 存活且 <24h → `E_WS_LOCKED`；PID 不存在/超过 24h →
  stale warning 并替换；无法解析的 lock 按 corrupt 处理（warning + 替换）。
- 备份轮转与 7 天清理已在 `open` 执行；manifest 也有独立 3 份备份。

### 4.4 IPC / preload / renderer

- `CurveApi` 当前命名空间：`app`、`log`、`workspace`、`manifest`。
- `IMPLEMENTED_IPC_CHANNELS` 共 7 个：`app:info`、`log:write`、`workspace:create/open/close/recent`、
  `manifest:write`。
- `workspace:recent:remove/clear` 仍未注册（留给 T5.3/欢迎页）。
- `HandlerContract` 的 request/response 输入类型是 `unknown`（`safeParse` 接收跨进程原始载荷）。
- preload 只 import `channels.ts`/`envelope.ts` 的运行时内容；`ipc.ts` 只做 `import type`。
- `e2e/ipc.spec.ts` 会断言“实际注册通道 == `IMPLEMENTED_IPC_CHANNELS`”。T1.3 加 `table:*` 时
  必须同步 `channels.ts`、handlers、preload、`CurveApi`、renderer `api-client` 和该 E2E。

---

## 5. T1.2 实施记录（已完成 2026-10-20，提交 `4b742dd`）

### 5.1 交付文件

```
packages/persistence/src/
├─ types.ts                  # WorkspaceStore 端口与请求/响应类型
├─ layout.ts                 # §7.1 布局、名称清洗、相对路径校验
├─ backup.ts                 # 时间戳、备份命名、轮转、7 天过期、路径解析
├─ manifest.ts               # 空 manifest、版本优先检查、Zod+不变量、序列化
├─ memory-workspace-store.ts # 内存适配器
├─ *.test.ts                 # 4 个测试文件（共 77 条）
└─ index.ts
apps/desktop/src/main/workspace/
├─ file-workspace-store.ts   # 文件适配器（711 行）
├─ path-safety.ts            # realpath + 前缀白名单
├─ lock-file.ts              # .lock 生命周期与 stale 判断
├─ recent-list.ts            # userData/recent.json
├─ atomic-write.ts           # write-file-atomic 包装
└─ *.test.ts                 # 4 个测试文件（共 29 条）
apps/desktop/e2e/workspace.spec.ts   # 4 条 E2E
docs/adr/019-write-file-atomic.md
docs/adr/020-workspace-create-path.md
docs/adr/021-backup-naming.md
```

### 5.2 关键决策

- 备份：`backups/<tableId>.<YYYYMMDDTHHmmssSSSZ>.jsonl.bak`，manifest 为
  `manifest.<timestamp>.json.bak`；每目标 3 份，打开时清理 7 天前（ADR-021）。
- `workspace:create` 的 `dir` 是父目录；根为 `dir/<清洗名称>.cstudio`；已存在 `E_WS_BUSY`（ADR-020）。
- 原子写用 `write-file-atomic@8.0.0`，只进 main；`fsync: true`（ADR-019）。
- 读取 manifest 先看原始 `formatVersion`，数字且 >1 → `E_WS_VERSION_UNSUPPORTED`，再走 Zod/不变量。
- 路径白名单不是字符串前缀，而是 `realpath` 后 `path.relative`；缺失目标解析父目录。
- manifest 也有 3 份备份，供 SPEC §7.5 启动恢复使用；`backup:list/restore` 仍只看表备份。
- `.trash` 只移动文件，manifest 更新由调用方负责（T2.1 删除表流程）。

### 5.3 已验证证据

| 命令 | 结果 |
|---|---|
| `pnpm verify` | exit 0；ESLint 0 problem；depcruise **148 modules / 381 dependencies / 0 violations**；**51 files / 417 tests** |
| `pnpm test:coverage` | exit 0；persistence **lines 95.68% / branches 88% / functions 100%**；全局 lines 92.86% / branches 84.75% |
| `pnpm e2e` | **19 passed**（T0.4 shell 6 + T0.3 IPC 4 + E1 5 + T1.2 workspace 4） |
| `pnpm exec playwright test ... --grep "workspace"` | **4 passed** |
| `pnpm build` | exit 0；main 277.54 kB、preload 3.65 kB |
| `pnpm format:check` | exit 0 |

### 5.4 与计划/规格的差异

- 新增 ADR-019/020/021，并同步 SPEC §7.1、§7.4、§7.5、§9.0、§15.1。
- 新增 manifest 备份（原 SPEC §7.4 只明确表备份，§7.5 的恢复流程实际需要 manifest 备份）。
- `HandlerContract` 的输入泛型改为 `unknown`，避免 Zod 4 的 input 泛型把已注解 schema 推成 `unknown`。
- Vitest 覆盖率排除 `packages/persistence/src/types.ts`（纯类型，无语可执行语句）。
- 未实现 `app.requestSingleInstanceLock()`；未在应用退出时主动 `closeAll()`。
- 未在 `open` 重算 `rowCount`；留给 T1.3 的 JSONL 读取路径（SPEC §7.5）。

---

## 6. T1.3 表数据 JSONL 读写与 Worker（下一个任务）

### 6.1 任务原文（`docs/TASKS.md` T1.3）

- **依赖**：T1.2（已完成）
- **覆盖**：FR-TBL-04、FR-TBL-07
- **参考**：SPEC §7.3、§7.4、§8
- **产出**：
  - `packages/table-engine`：JSONL 编解码、行集类型、Worker 协议
  - `apps/desktop/src/renderer/workers/table.worker.ts`
  - IPC：`table:read/write/trash`，大小与行数限制
  - 脏表追踪与 `rowCount` 重算
- **步骤**：
  1. 编码器逐行 `JSON.stringify`，流式拼接，避免一次性大数组。
  2. 解码器逐行解析，错误带行号；空文件返回空表。
  3. Worker 接收文本 → 解析 → 返回 rows/issues；主线程不阻塞。
  4. 写盘前校验行数/字节上限。
- **验收**：
  - [ ] 100k×10 行 round-trip 数据逐行相等。
  - [ ] 坏行（截断 JSON）返回 `E_TABLE_PARSE` + 行号，不吞行。
  - [ ] 空表写 0 字节、读回 0 行。
  - [ ] 内存峰值不超预算（见 TESTPLAN §4）。
- **验证**：`pnpm exec vitest run packages/table-engine && pnpm bench -- --table-io`

### 6.2 开工前必须先确认的缺口

1. **bench 骨架不存在**：根 `package.json` 有 `"bench": "tsx scripts/bench.ts"`，但 `scripts/bench.ts`
   和 `node_modules/.bin/tsx` 都不存在，`fixtures/` 也没有。T1.3 的验证命令会直接失败。
   建议补最小 `scripts/bench.ts`（`--table-io`：固定种子生成 100k×10，测 encode/decode，写
   `bench/report.json`）并加 `tsx` devDependency；这是工具接线，不是运行时依赖。若用户不接受新增
   devDependency，则必须把 bench 明确记为阻塞，不能假装通过。
2. **`table:read` 缺文件语义**：当前 `FileWorkspaceStore.readTable` 在 `tables/<id>.jsonl` 不存在时返回
   `E_TABLE_NOT_FOUND`；`MemoryWorkspaceStore` 返回 `""`。T1.3 必须统一。建议：表在 manifest 中且
   `rowCount === 0` 时缺文件视为空表（`{jsonl:"",bytes:0}`）；`rowCount > 0` 时返回 `E_TABLE_NOT_FOUND`
   并让上层告警。该选择影响 T2.1 新建空表与崩溃恢复，先问用户。
3. **脏表追踪归属**：T1.3 产出写了“脏表追踪”，但 `app-core` 是 T1.5，AGENTS §5 要求业务状态进
   app-core。建议 T1.3 只在 `table-engine` 提供纯 `DirtyTableTracker`/`diffTableRows` 原语，Zustand
   接线留给 T1.5；先确认用户是否接受这个拆分。

### 6.3 建议的落地拆分

1. **`packages/table-engine`（纯逻辑）**
   - `jsonl.ts`：
     - `encodeJsonl(rows: readonly Row[]): string`：`{id, values}` → `{"id":"...","v":[...]}`；
       每行 `\n`，末尾保留换行；空数组 → `""`；不写 BOM。
     - `decodeJsonl(jsonl: string, table: TableMeta): JsonlDecodeResult`：空串 → 0 行；逐行解析，
       1-based 行号；`v` 顺序对应 columns；逐格 `parseCell`；行长 ≤ 8MB；返回 `rows`、`issues`
       （`row`/`columnId?`/`code`/`message`）与 `stats`。**不要直接把 `{id,v}` 传给 `parseRow`**
       （它要 `values`）。
     - 错误映射：调用方把阻塞 issue 转 `E_TABLE_PARSE`，保留行号。
   - `row-set.ts`：`TableData`/`RowSet` 类型、`countRows`、`rowCount` 与 manifest 的差异比较。
   - `worker-protocol.ts`：`{ id, type: 'decode'|'encode', payload }` 请求/响应 discriminated union。
   - `dirty-set.ts`：纯 `DirtyTableTracker`（mark/clear/list），不依赖 Zustand/React。
   - 测试：round-trip、空表、坏行、BOM/CRLF/末尾换行、超长行、Unicode、100k×10（可较小基准）。
2. **Worker**
   - `apps/desktop/src/renderer/workers/table.worker.ts`：`self.onmessage` → `decode/encode` →
     `postMessage`；不要让异常变成未处理 rejection。
   - `apps/desktop/src/renderer/table-io/client.ts`：请求 id、pending map、取消/关闭；`new Worker(new URL(...), { type: 'module' })`。
   - 先验证生产 CSP：`default-src 'self'` 是否允许 Vite 产物 worker；若需要 `worker-src blob:`，
     属于 CSP 变更，**先写 ADR 并问用户**，不要直接放宽。
3. **IPC `table:read/write/trash`**
   - 契约：`{ workspaceId, tableId }`，`table:write` 加 `jsonl`；响应 `table:read` → `{jsonl,bytes}`，
     `table:write` → `{bytes}`，`table:trash` → `{ok:true}`。
   - 请求 schema 用 `workspaceIdSchema`/`tableIdSchema`；main handlers 直接调
     `FileWorkspaceStore.readTable/writeTable/trash`，不要在 IPC 层再拼路径。
   - 同步 `channels.ts`（`IMPLEMENTED` 变 10 个）、preload、renderer `api-client`、`e2e/ipc.spec.ts`。
   - `table:trash` 仍只移文件；删除表时由调用方发 `manifest:write`。
4. **`rowCount` 重算**
   - 在 `FileWorkspaceStore.open` 成功后，用 table-engine 的纯解码/计数重算每表行数；与 manifest
     不一致时更新 manifest（复用内部原子写与备份）并追加 warning；不要覆盖损坏的 manifest。
   - 如果某表 JSONL 解析失败，记 warning/`E_TABLE_PARSE`，不要静默清零。
5. **E2E 与 bench**
   - 新增 `e2e/table-io.spec.ts`（或扩展 workspace.spec）：创建 workspace → 写一个 1 表 manifest →
     `table:write` 3 行 → `table:read` 逐字相等 → `table:trash` 后文件消失 → 清理。
   - `pnpm exec playwright test --config apps/desktop/playwright.config.ts --grep "table"`。
   - `pnpm bench -- --table-io`：固定种子、不依赖网络/真实用户目录；输出 `bench/report.json`。

### 6.4 关键陷阱

| 陷阱 | 说明 |
|---|---|
| `Row` vs JSONL | `Row.values` 对应 JSONL 的 `v`；`parseRow` 只接受 `{id,values}` |
| 编码/解码不分工 | 编码在 renderer（或 Worker），写盘在 main；不要 renderer 直接 `fs` |
| 空表 | 空数组编码为 `""`（0 字节）；解码空串为 0 行；不要写 `\n` 表示空表 |
| BOM/CRLF | SPEC 要求 UTF-8 无 BOM、`\n`；解码要明确 BOM/CRLF 是报错还是容忍，并测试 |
| 8MB 单行 | 在解码前按行长度拒；错误带行号，不要整文件吞掉 |
| 100k 内存 | 不要 `JSON.parse` 整个数组；逐行处理，避免多次 `+` 拼接大字符串 |
| Worker CSP | 先测生产产物；不得为 Worker 放宽 `script-src`/`worker-src` 而不写 ADR |
| IPC 上限 | 单次载荷 256MB；100k×10 JSONL 可能数十 MB，注意 `table:write` 的序列化/复制 |
| 路径 | IPC 只传 id；main 用已有 `readTable/writeTable`，不要新造路径逻辑 |
| `rowCount` | 是提示值；重算后更新 manifest 要原子写+备份，失败不影响打开 |
| `table:trash` | 只移文件；manifest 更新是独立步骤，测试要覆盖“文件移走但 manifest 未改”的中间态 |
| 覆盖率 | `table-engine` 行覆盖 ≥85%；新逻辑必须有正反例 |
| e2e grep | `pnpm e2e -- --grep` 会跑全量；过滤用直接 `playwright ... --grep` |

### 6.5 验证命令

```powershell
$env:PATH = "D:\DSH_Work_Space\tools\bin;C:\Users\MECHREVO\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin;$env:PATH"
cd D:\DSH_Work_Space\curve-studio
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue

pnpm exec vitest run packages/table-engine
pnpm verify
pnpm test:coverage        # table-engine 行覆盖 ≥ 85%
$env:CURVE_E2E_NO_SANDBOX = '1'
pnpm exec playwright test --config apps/desktop/playwright.config.ts --grep "table"
pnpm bench -- --table-io  # 先解决 §6.2 的 bench 缺口
```

---

## 7. 后续里程碑提醒

### 7.1 公共 API / 契约位置（已获批，改动先问用户）

- `ErrorCode` / `AppError` / `toAppError` → `@curve/domain`（`src/errors.ts`）。
- 领域类型与 schema → `@curve/domain`（`src/types.ts`、`src/schemas.ts`）。`strictObject` 策略与
  ID 宽松度是**读取契约**，改动需 ADR。
- `WorkspaceStore` 端口、布局/备份纯函数、`MemoryWorkspaceStore` → `@curve/persistence`。
- `FileWorkspaceStore` / 路径白名单 / 锁 / 最近列表 → `apps/desktop/src/main/workspace/`。
- `IpcResult<T>` → `apps/desktop/src/shared/contracts/envelope.ts`；通道名 → `channels.ts`。
- `CurveApi` → `apps/desktop/src/shared/contracts/ipc.ts`；preload 只暴露白名单方法。
- `@curve/ui` 的公共入口与 `tokens.css` 令牌名/`data-theme` 是主题契约。
- 消息表 key（`shell.*`/`theme.*`/`language.*`/`error.*`）在 `renderer/i18n/messages/zh-CN.ts`；
  新增 UI 文案必须同时加 zh-CN 与 en-US。

### 7.2 M1–M6

- 严格按 `docs/TASKS.md` 的 ID 顺序；每个任务一个提交；每个里程碑结束跑验收演示、写报告、停下。
- `T1.3` JSONL + Worker（下一个）；`T1.4` 迁移框架与夹具；`T1.5` app-core 命令总线。
- `T1.4` 才创建 `fixtures/workspaces/`；T1.3 的 100k 数据在测试/bench 脚本里生成，不要提交大文件。
- `T2.1` 起 UI 才接工作区入口；T1.3 的 E2E 直接调 `window.api`，不要提前做 UI。
- M1 验收演示：创建 `Demo.cstudio` → 写 1,000 行 → 关闭重开 → 逐行相等；篡改 manifest → 报错且
  原文件不变；伪造 `.lock` → 走恢复提示。

---

## 8. 已知风险与处理

| 风险 | 影响 | 处理 |
|---|---|---|
| 会话策略回到 `workspace-write` | `pnpm verify` 报 `spawn EPERM`，e2e 同样受影响 | 切到 `danger-full-access`；不要改项目配置绕过 |
| agent shell 内 Electron 无法初始化 | E2E `Process failed to launch!` | `CURVE_E2E_NO_SANDBOX=1`（E2E）/ `NO_SANDBOX=1`（dev）；普通终端不需要 |
| 干净安装缺 Electron 运行时 | `pnpm dev`/`e2e` 失败 | 根 `postinstall`；仍缺时手工 `node install.js` |
| 截图证据非字节稳定（鼠标悬停） | 每次 e2e 后工作树变脏 | 预期行为；断言不依赖像素；提交时说明或还原 |
| `pnpm bench` 缺失 | T1.3 验证命令无法执行 | 先补 `scripts/bench.ts` + `tsx` devDependency，或明确记为阻塞并问用户 |
| `table:read` 缺文件语义不一致 | 新空表读失败或静默丢数据 | T1.3 先定语义并统一 Memory/File 适配器 |
| Worker 与生产 CSP 不兼容 | E2E 中 Worker 无法加载 | 先测 `default-src 'self'`；需要 `blob:` 时写 ADR 并问用户，禁止直接放宽 CSP |
| `app.requestSingleInstanceLock()` 未实现 | 两个进程可同时打开同一工作区 | `.lock` 仍能拦截；T1.2 已记录，后续任务补 |
| 应用退出未 `closeAll` | 异常退出留下 `.lock` | 下次打开按 PID/24h 识别 stale 并替换；正常 close 会删锁 |
| `write-file-atomic@8` 引擎 | Node 20.11 下 `engines` 不满足 | 实际 Node 24.21 / Electron 24.22 满足；若必须支持 Node 20 需复核 ADR-019 |
| `rowCount` 未重算 | manifest 提示值与真实行数不一致 | T1.3 在 open 后用 JSONL 计数更新并 warning |
| `pnpm e2e -- --grep` 不过滤 | 误以为只跑了子集 | 用直接 `playwright ... --grep` 过滤；全量 19 条已绿 |
| 100k 性能预算 | M2/M4 可能超预算 | T1.3 先测编解码；T2.1/T2.6 提前 Worker/虚拟化 |
| `fixtures/` 尚不存在 | T1.4 前无法复用工作区夹具 | T1.3 用临时目录/脚本生成；T1.4 建正式夹具 |

---

## 9. 不可做清单（重申）

- 不关闭 `contextIsolation` / `sandbox` / `webSecurity`，不打开 `nodeIntegration`。
- 不把 `--no-sandbox`、`CURVE_E2E_NO_SANDBOX` 写进应用代码、默认脚本或 CI。
- 不在 renderer 里 `require('fs')`、读任意路径、暴露 `ipcRenderer` 本体或泛 `invoke`。
- 不把 Zod / 任何外部包放进 preload。
- 不为通过安装而删除 `allowBuilds` 白名单或提交 `--ignore-scripts`。
- 不跳过测试、不放宽 ESLint/覆盖率规则、不用 `--no-verify`。
- 不未经 ADR 升级 `formatVersion`、改数据格式、改 IPC 通道或公共 API。
- 不把 `node_modules`、`out/`、`dist-types/`、`release/`、`test-results/`、`debug.log`、真实用户数据提交进仓库。
- 不在组件里硬编码用户文案/颜色；文案走 `t()`，颜色走令牌。
- 不自动跨里程碑推进；每个里程碑验收报告后停下等确认。

---

## 10. 新会话启动检查清单

- [ ] `git status --short` 干净，`git log --oneline -3` 顶部为本交接提交
      （`docs: add T1.3 implementation handoff`），其下为 `4b742dd`（T1.2）。
- [ ] 已注入 PATH（§3.1），`pnpm --version` 为 11.28.5。
- [ ] 会话文件策略为 `danger-full-access`（§3.2），否则先切换。
- [ ] 已读 `AGENTS.md`、本文件、`docs/TASKS.md` T1.3、`docs/TESTPLAN.md` §1/§2/§3（E2/E3）/§4/§5、
      `docs/SPEC.md` §7.3/§7.4/§8/§15.1、`docs/DECISIONS.md` ADR-003/007/011/014/019/021。
- [ ] 已确认 `apps/desktop/node_modules/electron/dist/electron.exe` 存在。
- [ ] 已清除 `ELECTRON_RUN_AS_NODE`；跑 E2E 前再设 `CURVE_E2E_NO_SANDBOX=1`。
- [ ] 已确认用户本轮范围（T1.3，然后停下；不进入 T1.4）。
- [ ] 已就 §6.2 的 bench、`table:read` 缺文件语义、脏表归属得到用户答复。
- [ ] 复述 T1.3 目标/产出/验收后再动手。
