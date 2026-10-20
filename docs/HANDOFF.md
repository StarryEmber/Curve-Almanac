# HANDOFF — Curve Studio 实施交接

> 本文件面向**下一个实现会话**。当前会话已完成 `T1.1`（领域模型、Zod 与不变量），按用户要求停止。
> 最后更新：2026-10-20 · T1.1 提交：`a58ee20` · 分支：`main` · 工作树：干净。
> 阅读顺序：`AGENTS.md` → 本文件 → `docs/TASKS.md` 的 T1.2 → `docs/TESTPLAN.md` §1、§2、§5 →
> `docs/SPEC.md` §7（§7.1–§7.6）、§13.1、§15.1、§15.2、§18 → `docs/DECISIONS.md` ADR-003/007/008。

---

## 1. 当前进度快照

| 项 | 状态 |
|---|---|
| 方案文档 | v1.0 已锁定（SPEC / TASKS / TESTPLAN / DECISIONS） |
| M0 基建（T0.1–T0.5） | **已完成**；验收报告 `docs/reports/m0/REPORT.md`（`02afe4b`） |
| `T0.5` CI、E2E 与提交门禁 | **已完成**（`1aefcdb`），干净克隆 install/verify/e2e 全绿 |
| `T1.1` 领域模型、Zod 与不变量 | **已完成**（`a58ee20`），43 files / 302 tests，domain 行覆盖 97.63% |
| 当前里程碑 | M1 进行中（T1.1 完成，T1.2 未开始） |
| 下一个任务 | **`T1.2` 工作区仓库与原子持久化**（依赖 T1.1、T0.3，均已满足） |
| 提交历史（近 5 条） | `a58ee20 feat(domain): add domain model schemas and invariants（T1.1）`<br>`02afe4b docs: add m0 acceptance report`<br>`1aefcdb chore(ci): …（T0.5）`<br>`16f159d docs: add T0.5 implementation handoff`<br>`7b42a04 feat(ui): …（T0.4）`<br>其上一条为本交接提交 `docs: add T1.2 implementation handoff` |
| 工作树 | 干净（`git status --short` 无输出） |

**用户明确要求**：一次只做一个任务；每个任务先复述目标/产出/验收，再写测试、实现、跑 `pnpm verify`
与任务指定 e2e/bench，最后勾选 TASKS、更新 CHANGELOG、必要时 ADR、Conventional Commit。
新会话从 `T1.2` 开始；**T1.2 完成后输出任务报告并停下等确认**，不要自动进入 T1.3。

---

## 2. 新会话开场提示词（可直接粘贴）

```text
工作目录：D:\DSH_Work_Space\curve-studio（仓库根）。

先读 AGENTS.md、docs/HANDOFF.md、docs/TASKS.md 的 T1.2、docs/TESTPLAN.md §1/§2/§5、
docs/SPEC.md §7（§7.1–§7.6）、§13.1、§15.1/§15.2、§18，以及 docs/DECISIONS.md 的
ADR-003/ADR-007/ADR-008。

现状：M0 已完成（docs/reports/m0/REPORT.md），T1.1 已提交（a58ee20），工作树干净，
pnpm verify（43 files / 302 tests）与 pnpm e2e（15 passed）全绿。

请执行 T1.2：先按 AGENTS.md §8 复述目标/产出/验收与风险，并先确认 HANDOFF §6.2 列出的
三个待决问题（备份文件名规范、workspace 目录命名语义、write-file-atomic 依赖 ADR）——
这三个都属于文件格式/依赖决策，按 AGENTS.md §11 必须先问，不要自行选定。

确认后实现：packages/persistence 的 WorkspaceStore 端口 + MemoryWorkspaceStore；
apps/desktop/src/main 的 FileWorkspaceStore（原子写、备份轮转、.lock、最近列表、路径白名单）；
IPC workspace:create/open/close/recent 与 manifest:write（含 preload 与契约）；
补 E2E `pnpm e2e -- --grep "workspace"`，并跑 `pnpm verify`。

完成后勾选 TASKS、更新 CHANGELOG、按 Conventional Commits 提交，输出任务报告并停下等我确认。
不要自动进入 T1.3；不要放宽 CSP/沙箱；不要跳过测试或降低 lint/覆盖率阈值。
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
| Electron 二进制 | `apps/desktop/node_modules/electron/dist/electron.exe`（**44.9.0**） |
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

### 3.7 已知的测试产物行为

- `pnpm e2e` 会重写 `docs/reports/m0/t0.2-window.png`；调试主题时还会重写
  `t0.4-shell-dark.png`（受**真实鼠标悬停**影响，字节不稳定，视觉无变化）。断言不依赖像素；
  提交时若不想要噪声可 `git checkout --` 还原并在提交说明里写一句。
- `apps/desktop/test-results/`、`playwright-report/`、`coverage/` 均已 gitignore。
- Vitest 覆盖率已排除 `packages/domain/src/types.ts`（纯类型、零可执行语句，否则恒 0%）。
- 通过用例不残留 trace；失败用例在 `apps/desktop/test-results/<test>/` 留下
  `test-failed-1.png`、`trace.zip`（内建）与 `attachments/trace-*.zip`（fixture 录的完整 context trace）。

---

## 4. T1.1 已交付的关键接口（T1.2 直接消费，不要回退）

`@curve/domain`（`packages/domain/src/index.ts` 统一导出）：

```ts
// 类型（SPEC §6 全集）
Cell, ColumnType, ColumnDef, TableMeta, Row, TableViewState, ViewDef, ChartSpec,
TableStyle, LayoutNode, WorkspaceManifest, WorkspaceSettings, FilterPredicate, SortSpec …

// 解析（永不抛裸异常）
parseManifest(value): ParseResult<WorkspaceManifest>
parseTableMeta(value): ParseResult<TableMeta>
parseColumnDef(value): ParseResult<ColumnDef>
parseRow(value): ParseResult<Row>
parseCell(value, column): CellResult          // 严格：JSONL 读取路径
toValidationIssues(error, input?): ValidationIssue[]

// 不变量（SPEC §6.6）
checkTable(table, { rows?, resolveFieldTypeStorage? }): InvariantReport
checkInvariants(manifest, { rowsByTable?, resolveFieldTypeStorage? }): InvariantReport
assertInvariants(report): void                // 有 issue 时抛 typed E_WS_INVALID_MANIFEST

// 归一与格式化（SPEC §8.1）
coerceCell(raw, column): CellResult           // 宽松：粘贴/导入路径
formatCellValue(value, column, options?): string

// 工厂
createId(prefix, uuid?) / createWorkspaceId / createTableId / createColumnId / createRowId /
createChartId / createViewId / createStyleId / createRuleId / isId(prefix, value)
createTimestamp(now?: Date): string
```

约定（T1.2 必须遵守）：

- `ParseResult` / `CellResult` 是**结构化失败**：`{ ok:false, issues:[{path,code,message}] }`，
  code 取 SPEC §18（`E_TYPE`/`E_REQUIRED`/`E_ENUM`/`E_RANGE`/`E_DUPLICATE_KEY`/`E_VALIDATION`）。
- schema 一律 `strictObject`：manifest 里出现未知字段会被拒绝（视为格式漂移）。
- ID 读取放宽为 `^<prefix>_[A-Za-z0-9][A-Za-z0-9_-]*$`（兼容 SPEC §7.2 的 `col_time`），
  写入恒为 `<prefix>_<uuid>`。
- `checkInvariants` 的 `issues` 是**阻塞**的（应转 `E_WS_INVALID_MANIFEST`），`warnings` 是**可修复**的
  （应回传给 renderer，SPEC §6.6 末段）。
- `rowCount` 只是提示值：`checkInvariants` 在传入真实行时会给出 warning 而不是 error。

---

## 5. T1.1 实施记录（已完成 2026-10-20，提交 `a58ee20`）

### 5.1 交付文件

```
packages/domain/src/
├─ types.ts        # SPEC §6 全部类型 + ParseResult/CellResult/ValidationIssue
├─ limits.ts       # SPEC §2.2 上限常量
├─ schemas.ts      # 全部 Zod schema；parseManifest/parseTableMeta/parseColumnDef/parseRow/parseCell
├─ factories.ts    # ID 工厂（uuid 可注入）、createTimestamp
├─ invariants.ts   # SPEC §6.6 不变量；checkTable/checkInvariants/assertInvariants
├─ coerce.ts       # SPEC §8.1 归一
├─ format.ts       # 数字/日期/布尔/枚举显示基线
├─ *.test.ts       # 6 个测试文件（domain 共 89 条用例）
└─ index.ts        # 统一导出
vitest.config.ts   # 覆盖率排除 packages/domain/src/types.ts
```

### 5.2 关键决策

- **schema 与类型强绑定**：实体 schema 标注 `z.ZodType<T>`，类型与 schema 不同步直接编译失败。
- **递归结构用 `discriminatedUnion`**（filter 的 `kind`、layout 的 `type`），错误路径能精确到
  `views[0].tableView.filter.children`，而普通 `z.union` 只会给出 `invalid_union`。
- **缺失字段 vs 类型错误**：Zod 4 的 `invalid_type` 不携带 `input`，因此 `toValidationIssues` 会按
  issue path 回查原始值：`undefined` → `E_REQUIRED`，否则 `E_TYPE`。
- **日期不许回滚**：`YYYY-MM-DD` 逐段校验（`2026-02-30` 不会变成 3 月 2 日）；非 date-only 字符串才走
  `Date.parse`；数字日期必须是整数 epoch ms。
- **`fieldTypeId` 暂缓严判**：没有字段类型注册表时给 warning；T6.1 接入 registry 后再按
  `storageType` 严格校验（`checkInvariants` 的 `resolveFieldTypeStorage` 参数已预留）。
- **issue 截断**：`MAX_REPORTED_ISSUES = 100`，超出后追加一条 "report truncated"。

### 5.3 已验证证据

| 命令 | 结果 |
|---|---|
| `pnpm verify` | exit 0；ESLint 0 problem；depcruise **127 modules / 288 dependencies / 0 violations**；**43 files / 302 tests** |
| `pnpm test:coverage` | exit 0；domain **lines 97.63% / branches 92.24% / functions 98.92%**；全局 lines 96.56% / branches 89.11% |
| `pnpm e2e` | 15 passed（T0.4 shell 6 + T0.3 IPC 4 + E1 5） |
| `pnpm format:check` | exit 0 |

### 5.4 与计划/规格的差异

- 无 SPEC/公共 API 偏离，未新增 ADR。
- 新增覆盖率 exclude：`packages/domain/src/types.ts`（纯类型）。
- ID 读取宽松度（见 §4）已写入 `docs/TASKS.md` T1.1 实现备注。

---

## 6. T1.2 工作区仓库与原子持久化（下一个任务）

### 6.1 任务原文（`docs/TASKS.md` T1.2）

- **依赖**：T1.1、T0.3（均已完成）
- **覆盖**：FR-WS-01、FR-WS-04
- **产出**：
  - `packages/persistence`：`WorkspaceStore` 端口 + `MemoryWorkspaceStore`
  - main：`FileWorkspaceStore`（`write-file-atomic`、备份、锁、最近列表）
  - IPC：`workspace:create` / `open` / `close` / `recent`、`manifest:write`
- **步骤**：
  1. 定义端口（create/open/readTable/writeTable/writeManifest/trash/listBackups/restore）。
  2. 实现目录创建、manifest 读写、`.lock` 生命周期、备份轮转。
  3. 路径白名单与 `realpath` 校验。
  4. 最近列表存 `userData/recent.json`（路径、名称、最后打开时间）。
- **验收**：
  - [ ] 新建目录结构完全符合 SPEC §7.1。
  - [ ] 写入后强杀进程，文件不半写（模拟：写入前中断）。
  - [ ] manifest 损坏返回 `E_WS_INVALID_MANIFEST`，不覆盖原文件。
  - [ ] `../` 路径逃逸返回 `E_PATH_DENIED`。
  - [ ] 备份保留 3 份，恢复可用。
- **验证**：`pnpm exec vitest run packages/persistence apps/desktop && pnpm e2e -- --grep "workspace"`

### 6.2 开始前必须问用户的 3 个问题（属于格式/依赖决策，AGENTS §11）

1. **备份文件命名**：SPEC §7.1 写 `backups/tbl_<uuid>.<timestamp>.jsonl.bak`，
   §7.4 写 `backups/<name>.<ISO时间戳>.bak`（若 `<name>` 含扩展名则为 `tbl_x.jsonl.<ts>.bak`）。
   两处不一致，必须选一个并写 ADR；推荐以 §7.1 目录布局为准，同时修正 §7.4 文案。
2. **`workspace:create` 的 `dir` 语义**：`dir` 是"父目录 + 自动拼 `<name>.cstudio`"，还是"工作区根目录本身"？
   SPEC §7.1 示例是 `Demo.cstudio/`，§9.0 默认目录是 `Documents/Curve Studio/`，未定义拼接规则。
   需要确认（建议父目录 + 清洗后的名称 + `.cstudio`），并写 ADR。
3. **`write-file-atomic` 依赖**：SPEC §5.1 已指定该库，但 AGENTS §4 要求新增运行时依赖写 ADR
   （体积/维护/替代方案）。建议新增 ADR 记录，并把实际版本补进备注；替代方案是自写约 50 行
   （临时文件 + fsync + rename）。

### 6.3 依赖已就绪的 domain API

见 §4。T1.2 的读取路径建议：

```ts
const parsed = parseManifest(rawJson);           // 结构 + 字段级校验
if (!parsed.ok) throw createAppError('E_WS_INVALID_MANIFEST', '…', { detail: … });
const report = checkInvariants(parsed.data, { rowsByTable });  // 跨对象不变量
if (report.issues.length > 0) throw createAppError('E_WS_INVALID_MANIFEST', '…', { detail: … });
return { manifest: parsed.data, warnings: report.warnings };
```

**注意 `formatVersion`**：`workspaceManifestSchema` 用 `z.literal(1)`，未来版本会被解析成 `E_ENUM`。
在 `parseManifest` 之前先读原始 JSON 的 `formatVersion`：数字且 > 1 → 立即返回
`E_WS_VERSION_UNSUPPORTED`（SPEC §2.2 / §7.6 / AGENTS §2.2），不要把它当普通格式错误。

### 6.4 建议的落地拆分

1. **`packages/persistence`（纯逻辑，域内）**
   - `WorkspaceStore` 端口（create/open/readTable/writeTable/writeManifest/trash/listBackups/restore）。
   - `MemoryWorkspaceStore`（测试与命令总线用）。
   - 纯函数：目录布局常量（`manifest.json`/`tables/`/`backups/`/`.trash/`/`imports/`/`.lock`）、
     备份名生成与轮转、相对路径校验（拒绝 `..`、绝对路径、盘符）。
   - **不得 import Electron**；只允许 `@curve/domain` + 标准 JS。
2. **`apps/desktop/src/main/workspace/`**
   - `FileWorkspaceStore`：`fs/promises` + `write-file-atomic`，原子写、备份、`.lock`、最近列表。
   - 工作区根白名单：`Map<workspaceId, realRoot>`；所有入参路径先 `realpath` 再校验前缀，
     失败 → `E_PATH_DENIED`。
3. **契约与 preload**
   - `apps/desktop/src/shared/contracts/ipc.ts`：补 workspace/manifest 的请求/响应 Zod schema 与
     `CurveApi` 命名空间；`RecentEntry`/`WorkspaceManifest` 复用 `@curve/domain` 类型。
   - `channels.ts`：把 5 个通道加入 `IMPLEMENTED_IPC_CHANNELS`。**注意**：`e2e/ipc.spec.ts` 会断言
     "实际已注册通道 == `IMPLEMENTED_IPC_CHANNELS`"，忘记同步会让 T0.3 的用例失败（这是有意的护栏）。
   - `preload/api.ts`：只加白名单方法；**preload 不得 import `ipc.ts`（含 zod）**，类型用
     `import type` 从 `ipc.ts` 取（编译后擦除）。产物仍应只含 `require("electron")`。
4. **E2E**：新增 `apps/desktop/e2e/workspace.spec.ts`（`--grep "workspace"`）：
   - 在 `test-results/` 下的临时绝对路径创建 → 断言 §7.1 目录结构；
   - `open` 读回 manifest → `warnings` 为空；
   - 篡改 `manifest.json` → `E_WS_INVALID_MANIFEST` 且原文件内容不变；
   - `../` 逃逸 / 绝对路径 → `E_PATH_DENIED`；
   - 写表 → `listBackups` 3 份 → `restore` 后内容回退。
   直接 `page.evaluate(() => window.api.workspace...)`，不必等 UI（T2.1 才有入口）。
5. **工程接线**：`@curve/persistence` 加进 desktop 的 `devDependencies`（源码包）与
   `apps/desktop/tsconfig.node.json` 的 `references`（否则 `tsc -b` 报 TS6307/TS6059），
   根 `tsconfig.json` 已引用 desktop 的 solution，无需改动。

### 6.5 关键陷阱

| 陷阱 | 说明 |
|---|---|
| 半写文件 | 原子写必须"同目录临时文件 → fsync → rename"；跨目录/跨盘 rename 会失败 |
| 写序 | 先写所有表文件，最后写 `manifest.json`（SPEC §7.4.4）；任何一步失败保留旧文件并返回 `E_FS_WRITE` |
| `.lock` | 写 `{pid, startedAt, appVersion}`；PID 存活 → `E_WS_LOCKED`；不存在或超 24h → stale 提示恢复/直接打开 |
| 单实例 | SPEC §7.5 要求 `app.requestSingleInstanceLock()`，当前 main **尚未实现**；若要补，注意 E2E 每个用例有独立 userData，不会被锁挡住（但 dev 与 E2E 同时跑会争锁） |
| 备份轮转 | 每表最多 3 份；启动时清理 7 天前的备份；恢复前要校验目标路径在 `backups/` 内 |
| 路径校验 | Windows 大小写不敏感、8.3 短路径、符号链接：一律 `fs.realpath` 后做前缀比较，再拼相对路径 |
| manifest 覆盖 | 损坏的 manifest 不得被静默重写；解析失败时原文件原样保留，返回 `E_WS_INVALID_MANIFEST` |
| 最近列表 | `userData/recent.json` 不在 SPEC §6 的 manifest 里，需要自己的 Zod schema（`RecentEntry[]`，按路径去重、按最后打开时间排序） |
| 测试隔离 | 单测用临时目录（`fs.mkdtemp`，放 `os.tmpdir()` 或 `test-results/`）；E2E 目录放 `apps/desktop/test-results/` 下（沙箱内可写） |

### 6.6 验证命令

```powershell
$env:PATH = "D:\DSH_Work_Space\tools\bin;C:\Users\MECHREVO\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin;$env:PATH"
cd D:\DSH_Work_Space\curve-studio
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue

pnpm exec vitest run packages/persistence apps/desktop
pnpm verify
$env:CURVE_E2E_NO_SANDBOX = '1'
pnpm e2e -- --grep "workspace"
pnpm test:coverage        # persistence 行覆盖 ≥ 85%
```

---

## 7. 后续里程碑提醒

### 7.1 公共 API / 契约位置（已获批，改动先问用户）

- `ErrorCode` / `AppError` / `toAppError` → `@curve/domain`（`src/errors.ts`）。
- 领域类型与 schema → `@curve/domain`（`src/types.ts`、`src/schemas.ts`）。`schemas.ts` 的
  `strictObject` 策略与 ID 宽松度是**读取契约**，改动需 ADR。
- `IpcResult<T>` 在 `apps/desktop/src/shared/contracts/envelope.ts`；
  通道名在 `channels.ts`（SPEC §15.1 冻结的 18 个）。
- `@curve/ui` 的公共入口与 `tokens.css` 的令牌名/`data-theme` 是主题契约，改名等于破坏主题。
- 消息表 key（`shell.*`/`theme.*`/`language.*`/`error.*`）由 zh-CN 表定义；新增 UI 文案必须同时加
  zh-CN 与 en-US（缺一条 `tsc` 就报错）。

### 7.2 M1–M6

- 严格按 `docs/TASKS.md` 的 ID 顺序；每个任务一个提交；每个里程碑结束跑验收演示、写报告、停下。
- `T1.3` 是 JSONL 编解码 + Worker（依赖 T1.2）；`T1.4` 迁移框架（依赖 T1.3）；`T1.5` app-core 命令总线。
- 文件格式 / IPC 通道 / 公共 API 的歧义必须停问；其余按 SPEC §19 默认值 + ADR。
- `T2.1` 起 UI 才接工作区入口；T1.2 的 E2E 直接调 `window.api` 即可，不要提前做 UI。

---

## 8. 已知风险与处理

| 风险 | 影响 | 处理 |
|---|---|---|
| 会话策略回到 `workspace-write` | `pnpm verify` 报 `spawn EPERM`，e2e 同样受影响 | 切到 `danger-full-access`；不要改项目配置绕过 |
| agent shell 内 Electron 无法初始化 | E2E `Process failed to launch!` | `CURVE_E2E_NO_SANDBOX=1`（E2E）/ `NO_SANDBOX=1`（dev）；普通终端不需要 |
| 干净安装缺 Electron 运行时 | `pnpm dev`/`e2e` 失败 | 根 `postinstall` → `scripts/install-electron.mjs`；仍缺时手工 `node install.js` |
| 截图证据非字节稳定（鼠标悬停） | 每次 e2e 后工作树变脏 | 预期行为；断言不依赖像素；提交时说明或还原 |
| `manifest.json` 手改/损坏 | 打不开工作区 | T1.2 要求：返回 `E_WS_INVALID_MANIFEST` 且不覆盖原文件 |
| Windows 路径大小写/短路径 | 白名单误判 | 一律 `realpath` 后比较；测试覆盖大小写变体 |
| `write-file-atomic` 新增依赖 | 安装体积/维护 | 先写 ADR（§6.2 问题 3），版本补进 ADR 备注 |
| 跨包 import 未加 TS reference | `tsc -b` TS6307/TS6059 | 新增包时同步 `apps/desktop/tsconfig.node.json` 的 `references` |
| preload 误 import zod/`ipc.ts` | sandbox 下加载失败 | preload 只 import `channels.ts`/`envelope.ts`，类型用 `import type` |
| `pnpm e2e` 需要 build | 忘记 build 就测旧产物 | `pnpm e2e` 脚本已包含 `pnpm build` |
| 100k 性能预算 | M2/M4 可能超预算 | T2.1/T2.6 提前 Worker/虚拟化；T2.7/T4.6 专项硬化 |

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
      （`docs: add T1.2 implementation handoff`），其下为 `a58ee20`（T1.1）。
- [ ] 已注入 PATH（§3.1），`pnpm --version` 为 11.28.5。
- [ ] 会话文件策略为 `danger-full-access`（§3.2），否则先切换。
- [ ] 已读 `AGENTS.md`、本文件、`docs/TASKS.md` T1.2、`docs/TESTPLAN.md` §1/§2/§5、
      `docs/SPEC.md` §7、`docs/DECISIONS.md` ADR-003/007/008。
- [ ] 已确认 `apps/desktop/node_modules/electron/dist/electron.exe` 存在。
- [ ] 已清除 `ELECTRON_RUN_AS_NODE`；跑 E2E 前再设 `CURVE_E2E_NO_SANDBOX=1`。
- [ ] 已确认用户本轮范围（T1.2，然后停下；不进入 T1.3）。
- [ ] 已就 §6.2 的三个问题得到用户答复（或用户明确授权按推荐方案 + ADR 执行）。
- [ ] 复述 T1.2 目标/产出/验收后再动手。
