# HANDOFF — Curve Studio 实施交接

> 本文件面向**下一个实现会话**。当前会话已完成 `T0.3`，按用户要求停止。
> 最后更新：2026-10-20 · T0.3 提交：`21f7bbe` · 分支：`main` · 工作树：干净。
> 阅读顺序：`AGENTS.md` → 本文件 → `docs/SPEC.md` §10.2（令牌与渲染）与 §16.3/§16.4（可访问性/国际化）→
> `docs/TASKS.md` 的 T0.4 → `docs/TESTPLAN.md` §2 的 `ui/components` 行与 §6.1 → `docs/DECISIONS.md` ADR-013。

---

## 1. 当前进度快照

| 项 | 状态 |
|---|---|
| 方案文档 | v1.0 已锁定（SPEC / TASKS / TESTPLAN / DECISIONS） |
| `T0.1` monorepo 与质量工具链 | **已完成**（`702293c`） |
| `T0.2` Electron 三进程骨架与安全窗口 | **已完成**（`6520c65`），验收 4/4，E2E E1 5/5 |
| `T0.3` 类型化 IPC 与错误信封 | **已完成**（`21f7bbe`），验收 4/4，148 tests / E2E 9 passed |
| 下一个任务 | `T0.4` 设计令牌与 App Shell |
| 里程碑 | M0 进行中；剩余 `T0.4 → T0.5` |
| 提交历史 | `347637b docs: import v1 specification`<br>`702293c chore(tooling): initialize monorepo and quality gates`（T0.1）<br>`6b0a395 docs: add T0.2 implementation handoff`<br>`6520c65 feat(desktop): add secure electron shell`（T0.2）<br>`e4f14fb docs: add T0.3 implementation handoff`<br>`21f7bbe feat(ipc): add typed ipc envelope and error mapping`（T0.3）<br>其后一条 `docs: add T0.4 handoff` |
| 工作树 | 干净（`git status --short` 无输出） |

**用户明确要求**：一次只做一个任务；每个任务先复述目标/产出/验收，再写测试、实现、跑 `pnpm verify` 与任务指定 e2e/bench，最后勾选 TASKS、更新 CHANGELOG、必要时 ADR、Conventional Commit。新会话从 `T0.4` 开始，完成并报告后**停下等确认**；除非用户明确要求连续执行，否则不要自行推进到 `T0.5`。

---

## 2. 新会话开场提示词（可直接粘贴）

```text
工作目录：D:\DSH_Work_Space\curve-studio（仓库根）。

先读 AGENTS.md、docs/HANDOFF.md、docs/SPEC.md §10.2 与 §16.3/§16.4、docs/TASKS.md 的 T0.4、
docs/TESTPLAN.md §2 的 ui/components 行与 §6.1，以及 docs/DECISIONS.md 的 ADR-013。

当前 T0.3 已完成并提交（21f7bbe），工作树干净。请执行 T0.4：
先按 AGENTS.md §8 复述目标/产出/验收与风险，再测试先行（Dialog 焦点陷阱/Esc、Toast 自动消失、
Shell 无硬编码文案），实现 --cs-* 令牌 + packages/ui 基础组件 + App Shell + 消息表 t() + 浅深色骨架，
跑 pnpm verify 与 pnpm e2e（截图放 docs/reports/m0/），更新 TASKS/CHANGELOG，按 Conventional Commits 提交，
最后输出任务报告并停下等我确认。
不要自动进入 T0.5；不要放宽 CSP/沙箱；Dialog/Toast 必须可键盘操作，且 200% 缩放下不横向裁切。
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
| pnpm store | `D:\DSH_Work_Space\.pnpm-store\v11`（跨盘无法复用 `C:\Users\...\AppData\Local\pnpm\store`，pnpm 会提示） |
| Electron 二进制 | `apps/desktop/node_modules/electron/dist/electron.exe`（**44.9.0**，经 npmmirror 安装） |
| 当前 DSH 文件策略 | `danger-full-access`（截至交接时） |

Node/pnpm **不在 PATH**。每条命令前先注入：

```powershell
$env:PATH = "D:\DSH_Work_Space\tools\bin;C:\Users\MECHREVO\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin;$env:PATH"
$git = 'D:\DSH_Work_Space\tools\mingit\cmd\git.exe'
cd D:\DSH_Work_Space\curve-studio
```

### 3.2 Git

- 本地身份：`Curve Studio Agent <agent@curve-studio.local>`；`core.autocrlf=false`；`.gitattributes` 强制 LF。
- 提交用上面的 `$git` 绝对路径；不要重置或改写已有提交。

### 3.3 【新增·重要】受限 shell 里 Electron 无法直接启动

T0.2 实测结论（多次复现）：

- 在 **DSH agent 的 pwsh 会话**里直接启动 Electron：
  - 默认（Chromium OS 沙箱开启）→ 进程以 `0x80000003`（STATUS_BREAKPOINT）退出，`main.js` 甚至未执行；
  - 加 `--no-sandbox` 后 `main.js` 可执行，但若 userData 落在 `%APPDATA%` → 写入 `EPERM` 并崩溃。
- 原因：该 shell 的文件写入被限制在 `D:\DSH_Work_Space` 内（`%TEMP%`、`%APPDATA%` 均被拒），
  且 Chromium 的沙箱/多进程初始化在此环境不可用。**不是应用代码问题**（最小复现见任务报告）。
- **可行组合**（已实测窗口可见、页面正常）：
  1. 启动参数加 `--no-sandbox`；
  2. `app.setPath('userData', <D:\DSH_Work_Space 下的目录>)`。
- 已落地为**仅 E2E 使用**的逃生舱（不进入应用逻辑）：
  - `apps/desktop/e2e/fixtures.ts`：`CURVE_E2E_NO_SANDBOX=1` 时才给 Electron 传 `--no-sandbox`；
    userData 固定放 `apps/desktop/test-results/e2e-user-data/run-*`（gitignore）；
  - `apps/desktop/src/main/e2e-hooks.ts`：`CURVE_E2E=1 && !app.isPackaged && CURVE_E2E_USER_DATA=<dir>`
    时才重定向 userData；打包态一律失效（有单测）。
- **agent 会话里跑验证要这样**：

```powershell
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
$env:CURVE_E2E_NO_SANDBOX = '1'   # 只影响 E2E fixture
pnpm e2e
```

- **手工看 dev 窗口**（agent 会话）：

```powershell
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
$env:NO_SANDBOX = '1'                      # electron-vite 会追加 --no-sandbox
$env:CURVE_E2E = '1'
$env:CURVE_E2E_USER_DATA = 'D:\DSH_Work_Space\curve-studio\apps\desktop\test-results\dev-user-data'
$env:REMOTE_DEBUGGING_PORT = '9333'        # 可选：Playwright connectOverCDP 调试
pnpm dev
```

- **用户自己开的普通终端**没有这些限制：`pnpm dev` / `pnpm e2e` 原样可用，**不要**把
  `--no-sandbox`、`CURVE_E2E_NO_SANDBOX` 写进应用或默认脚本。

### 3.4 Electron 下载（重装时）

```powershell
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
$env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'
$env:ELECTRON_CUSTOM_DIR = '{{ version }}'
pnpm install
```

若 postinstall 被跳过：`cd apps\desktop\node_modules\electron; node install.js`（同样带上述变量），
确认 `dist\electron.exe` 与 `path.txt` 存在。**不要假装能启动**。

### 3.5 `ELECTRON_RUN_AS_NODE=1`

DSH 进程环境全局存在该变量，子进程会继承；Electron 会退化为纯 Node。所有启动/测试前
`Remove-Item Env:ELECTRON_RUN_AS_NODE`；E2E fixture 已在传给子进程前删除该键。

### 3.6 工具链版本与差异（会踩坑）

| 组件 | 实际版本 | 注意 |
|---|---|---|
| Electron | 44.9.0 | 支持 ESM main，但本项目 main/preload 固定 CJS |
| electron-vite | 6.0.0 | Vite 8 / rolldown 内核；`build.rolldownOptions`，`rollupOptions` 是别名；`externalizeDeps` **默认 true**（只作用于 `dependencies`） |
| Vite | 8.3.4 | 用 **oxc** 转译；`esbuild` 选项被忽略（设了会告警）；JSX 默认自动运行时 |
| React / React DOM | 19.3.1 | 组件测试用 `@testing-library/react` 16 + jsdom 30 |
| electron-builder | 26.15.3 | 仅安装，未配置打包（T6.4） |
| Playwright | 1.64.1 | 只用 `_electron`，未下载浏览器 |

### 3.7 【新增】agent shell 的文本编码与路径陷阱（T0.3 实测）

- 该 shell 是 **Windows PowerShell 5.1**：`Get-Content` 默认按 GBK 解码无 BOM 的 UTF-8 文件（显示成乱码），
  `Set-Content -Encoding UTF8` 会写入 **BOM**。**源码与文档一律用编辑器工具（read/write/edit）修改**，
  不要用 shell 重定向/`Set-Content` 改文本，否则会把中文写坏或让 prettier 报错。
- `[System.IO.File]::ReadAllBytes('相对路径')` 按**进程 CWD**（`D:\DSH_Work_Space`）解析，不是 PowerShell 的
  `cd` 目录；这类 .NET 调用必须给绝对路径。
- `pnpm` 的 stdout 被 PowerShell 当成错误流时会打印 `NativeCommandError` 红字，但**结论看 `$LASTEXITCODE`**；
  建议 `pnpm ... > log 2>&1` 到 `test-results/`（已 gitignore）后再判断与检索。

---

## 4. T0.2 已交付内容

### 4.1 文件

```
apps/desktop/
├─ electron.vite.config.ts          # main/preload 强制 CJS + renderer 的 CSP meta 插件
├─ playwright.config.ts             # testDir=./e2e，workers=1
├─ tsconfig.json                    # solution：node / web / e2e
├─ tsconfig.node.json               # main+preload+shared+构建配置（types: node）
├─ tsconfig.web.json                # renderer+shared（DOM + react-jsx + vite/client）
├─ tsconfig.e2e.json                # playwright.config + e2e + shared（node + DOM）
├─ package.json                     # main=./out/main/index.cjs, productName, dev/build 脚本
├─ src/main/index.ts                # 进程入口（wiring；不在覆盖率内）
├─ src/main/window-options.ts       # 安全窗口选项工厂（单测）
├─ src/main/window-state.ts         # 窗口状态读写/离屏回退/捕获（单测）
├─ src/main/navigation.ts           # isNavigationAllowed（单测）
├─ src/main/menu.ts                 # 菜单模板，DevTools/Reload 仅 dev（单测）
├─ src/main/errors.ts               # toAppError（单测）
├─ src/main/e2e-hooks.ts            # 仅测试的 userData 重定向（单测）
├─ src/preload/index.ts             # contextBridge 暴露 window.api
├─ src/preload/api.ts               # createCurveApi(invoke)，零 Electron 依赖（单测）
├─ src/shared/ipc.ts                # IPC_CHANNELS / ErrorCode / AppError / IpcResult / CurveApi / isIpcResult
├─ src/shared/csp.ts                # 生产/开发 CSP 字符串（单测）
├─ src/renderer/index.html|main.tsx|App.tsx|App.test.tsx|global.d.ts|styles.css
└─ e2e/fixtures.ts|smoke.spec.ts    # TESTPLAN E1 的五条 smoke
docs/reports/m0/t0.2-window.png     # 预览态截图（验收证据）
docs/reports/m0/t0.2-dev-window.png # dev 态截图（CDP 抓取）
docs/adr/018-dev-csp-react-refresh.md
```

### 4.2 关键决策

- **CJS 产物**：根 `package.json` 是 `"type": "module"`，用 `build.rolldownOptions.output.format='cjs'`
  且显式 `entryFileNames: 'index.cjs'`，`package.json main` 指向 `./out/main/index.cjs`。
- **preload 零依赖**：只 import `electron` 与 `src/shared/*`（相对导入会被打包）。
  `externalizeDeps` 只会外部化 `dependencies`（本项目没有），所以 preload 里不能出现 `zod` 等包。
- **CSP 单一注入点**：renderer 插件 `curve:csp-meta` 在 `serve`/`build` 时注入 `<meta>`；
  生产策略逐字等于 SPEC §15.3；开发模式多 `script-src 'unsafe-inline'` 与
  `connect-src ws/http://localhost:*`（ADR-018）。
- **安全面**：`contextIsolation/sandbox/webSecurity=true`、`nodeIntegration=false`、`devTools=isDev`、
  `webviewTag=false`、`allowRunningInsecureContent=false`、`navigateOnDragDrop=false`；
  `will-navigate`/`setWindowOpenHandler`/`will-attach-webview`/权限请求全部拒绝；导航守卫 fail-closed。
- **isDev 的判据是 `ELECTRON_RENDERER_URL`**（不是 `app.isPackaged`）：预览/E2E 跑的是未打包构建，
  必须表现得像生产（DevTools 关、生产 CSP）。
- **菜单**：File/Edit/View/Window/Help；`reload`/`forceReload`/`toggleDevTools` 只在 dev 出现。
- **窗口状态**：`userData/window-state.json`；离屏或重叠 < 120px 时回退 1440×900 居中；
  最小 1024×700；最大化时保存 `getNormalBounds()`。
- **覆盖率**：`apps/desktop/src/{main/index.ts,preload/index.ts,renderer/main.tsx}` 三个入口从
  coverage 排除（纯 wiring，由 E2E 覆盖）；其余逻辑全部有单测（整体 98.49% 行）。

### 4.3 已验证证据（T0.2）

| 命令 | 结果 |
|---|---|
| `pnpm install` | exit 0；Electron 二进制经 npmmirror 安装成功 |
| `pnpm verify` | exit 0；ESLint 0 problem；depcruise 56 modules / 0 violations；**18 test files / 62 tests passed** |
| `pnpm test:coverage` | exit 0；lines/statements **98.49%**、branches **95.45%**、functions **100%** |
| `pnpm build` | exit 0；`out/main/index.cjs`、`out/preload/index.cjs`、`out/renderer/index.html` |
| `pnpm e2e`（`CURVE_E2E_NO_SANDBOX=1`） | **5 passed**：标题/主区、`window.require|process` 未定义、`app.info` 正常、外链与弹窗被拒、生产 CSP 逐字一致且内联脚本被阻断、DevTools 打不开 |
| `pnpm dev`（`NO_SANDBOX=1` + E2E userData） | 日志 `[main] window ready (mode=development, devTools=true, visible=true)` |
| CDP 检查 dev 页面 | `window.require/process` undefined、`window.api` 存在、dev CSP 正确、**0 console errors** |
| `pnpm format:check` | exit 0 |

---

## 5. T0.3 实施记录（已完成 2026-10-20，提交 `21f7bbe`）

> 5.1–5.5 是实施前的计划，保留作决策依据；5.6 是实际交付与验证，5.7 是下一任务入口。
> 计划与实现的差异（契约拆成三个文件、`IpcResult` 从 `envelope.ts` 导入）记录在 5.6。

### 5.1 任务原文要点（TASKS.md）

- 依赖 T0.2；覆盖 NFR-02、NFR-06；参考 SPEC §15.1、§15.2、§18。
- 产出：`contracts/ipc.ts`（通道常量、请求/响应 Zod schema、`IpcResult<T>`、`AppError`）；
  main 的 `ipcMain.handle` 注册器 + 统一错误映射 + 日志；preload 只暴露 `app.info` 与 `log.write`
  （其余 T1.2/T1.3 预留）；renderer 的 api 客户端封装 + 错误 toast 骨架。
- 验收：非法载荷返回 `E_IPC_INVALID_PAYLOAD` 且进程不崩；未注册通道被拒绝；`window.api` 上没有
  `invoke`/`send` 泛入口；错误信封单测覆盖成功/失败/异常三种。
- 验证：`pnpm exec vitest run packages/app-core apps/desktop`（外加 `pnpm verify`、`pnpm e2e`）。

### 5.2 已获用户批准的位置决定（不要自行改动）

- `ErrorCode` / `AppError` 放 **`@curve/domain`**（纯类型 + Zod），`apps/desktop/src/shared/contracts/ipc.ts`
  重导出；`IpcResult<T>` 留在 desktop contracts（见 §7.1）。
- 理由：`app-core`/`persistence` 后续也需要 `AppError`，不能反向依赖 desktop。

### 5.3 从 T0.2 继承的接口（迁移点）

- 当前 `apps/desktop/src/shared/ipc.ts` 已经定义了 SPEC §18 的**完整** `ErrorCode` 联合、
  `AppError`、`IpcResult<T>`、`IPC_CHANNELS`（只有 `app:info`）、`AppInfo`、`CurveApi`、`isIpcResult`。
- T0.3 需要：
  1. 把 `ErrorCode`/`AppError` 移到 `packages/domain/src/index.ts`（或 `errors.ts` 并由 index 导出），
     用 Zod 定义 `appErrorSchema`，覆盖 SPEC §18 全部 code；domain 仍需保持零 Node/React 依赖。
  2. 新建 `apps/desktop/src/shared/contracts/ipc.ts`：通道常量、每个通道的请求/响应 Zod schema、
     `IpcResult<T>`、从 `@curve/domain` 重导出 `AppError`/`ErrorCode`。
  3. `src/shared/ipc.ts` 变成薄重导出（或删除，同步改 preload/renderer 的 import）。
- **TS 工程引用陷阱**：`apps/desktop` 一旦 import `@curve/domain`，必须在 `tsconfig.node.json`、
  `tsconfig.web.json`（若 renderer 也用到类型）、`tsconfig.e2e.json` 的 `references` 里加
  `{ "path": "../../packages/domain" }`，否则 `tsc -b` 报 TS6307/TS6059。同理依赖 `paths` 解析。
- **preload 边界**：不要在 preload 里 import Zod schema 或任何 `dependencies` 中的包；
  `sandbox: true` 下 `require('zod')` 不可用。校验放 main，preload 只做信封收窄（继续用 `isIpcResult`）。
- **renderer 类型**：`src/renderer/global.d.ts` 声明 `Window.api: CurveApi`；扩 API 时同步改它，
  并更新 `App.tsx` 的调用点与 `App.test.tsx` 的 stub。

### 5.4 设计建议（`registerHandler`）

```ts
// apps/desktop/src/main/ipc/register.ts
registerHandler(channel, requestSchema, async (payload) => data);
// 内部：schema.safeParse -> 失败 { ok:false, error:{code:'E_IPC_INVALID_PAYLOAD'} }
//       成功 -> try { return { ok:true, data } } catch (e) { return { ok:false, error: toAppError(e) } }
```

- 未注册通道：`ipcMain.handle` 只注册白名单；可另加 `ipcMain.on` 兜底或用 E2E 断言 `invoke('nope')` 被拒。
- 日志：先 `console.error` 即可（T1.x 再引入文件日志）；不得把 stack 放进信封（SPEC §18）。
- 对话框替身（TESTPLAN §1.1）：`app.isPackaged === false && process.env.CURVE_E2E === '1'` 时才生效，
  读 `CURVE_E2E_DIR`/`CURVE_E2E_SAVE`/`CURVE_E2E_IMPORT`；生产分支必须短路，并加单测断言打包后失效
  （可复用 `e2e-hooks.ts` 的模式）。

### 5.5 验证与收尾

- 新增单测：信封三分支、非法载荷、未知通道、`toAppError` 映射、dialog 替身 gate。
- `pnpm verify` 必须全绿；`pnpm test:coverage` 不得跌破阈值（当前 98.49%）。
- E2E：`CURVE_E2E_NO_SANDBOX=1 pnpm e2e`（agent 会话），普通终端直接 `pnpm e2e`。
- 勾选 `docs/TASKS.md` T0.3 的 4 个验收项；CHANGELOG 增条目；ADR 仅在偏离 SPEC 时新增。
- 提交示例：`feat(ipc): add typed ipc envelope and error mapping`，正文写“验证：”与命令结果。
- 输出任务报告（任务 ID、改动文件、验证命令与真实结果、残留风险），**停下等确认**。

### 5.6 实际交付与验证（2026-10-20，提交 `21f7bbe`）

- 新增：`packages/domain/src/errors.ts`（`ERROR_CODES` / strict 的 `appErrorSchema` / `createAppError` /
  `isAppError` / `toAppError`）、`shared/contracts/{channels,envelope,ipc}.ts`、
  `main/{logger,ipc/{dispatch,register,handlers}}.ts`、`renderer/{api-client,error-text,toast}`、`e2e/ipc.spec.ts`。
- 删除：`shared/ipc.ts`、`main/errors.ts`（及其单测）；旧入口改用 `@curve/domain` 与新的 `main/index.ts` 接线。
- 与 §5.3 的差异（有意为之）：契约拆成三个文件 —— `channels.ts` 零 import、`envelope.ts` 只对 domain 做**类型**
  依赖、只有 `ipc.ts` import zod。preload 只 import 前两者，产物 3.11 kB 且仅 `require("electron")`。
  `IpcResult` 不再从 `contracts/ipc.ts` 重导出，消费方从 `contracts/envelope.ts` 取（避免同模块 import+export）。
- 双向校验：`dispatch.ts` 校验 handler 的返回值；renderer `api-client` 再校验一次 `data`。`log:write` 的 `level`
  按 SPEC 保持 `string`，未知值在 logger 降级为 `info`；消息/详情截断（2000/1000 字符）避免日志被撑爆。
- 验证证据：`pnpm verify` exit 0（ESLint 0 problem；depcruise 78 modules / 0 violations；28 files / 148 tests）；
  `pnpm test:coverage` lines 99.11% / statements 99.14% / branches 96.17% / functions 100%；
  `pnpm e2e`（`CURVE_E2E_NO_SANDBOX=1`）9 passed；`pnpm dev` 日志
  `[main] window ready (mode=development, devTools=true, visible=true)`。

### 5.7 下一个会话入口：T0.4 设计令牌与 App Shell

- 目标（TASKS T0.4）：`packages/ui` 的 `--cs-*` 令牌与 Button/Input/Select/Dialog/Toast/Menu/Tabs；
  `apps/desktop/src/renderer` 的 Shell（标题栏/侧栏/主区/检查器/状态栏/空态）；`messages/zh-CN.ts` +
  类型化 `t(key, params)`；浅/深色切换骨架。
- **必须替换的 T0.3 占位物**：
  - `src/renderer/App.tsx`（空壳 + 运行态面板，含 `runtime-status` testid 与 `role="status"/"alert"`）；
  - `src/renderer/toast.tsx`（骨架：`useToasts` + `ToastHost`，`role=alert/status` 与 `Dismiss notification` 按钮）；
  - `src/renderer/error-text.ts`（按 code 的英文文案表 → 应改为 `t('error.<code>')`）；
  - `src/renderer/styles.css` 的 `.toast*` 规则。
- 同步修改：`src/renderer/App.test.tsx`（依赖上述 testid/role）、必要时 `contracts/ipc.ts` 的 `CurveApi` 不变。
- 可访问性/缩放：TESTPLAN §2 的 `ui/components` 行 + §6.1（200% 缩放、纯键盘脚本）。
- 不要动 T0.3 的安全面：CSP 注入点、`window.api` 白名单、preload 零依赖边界。

---

## 6. M0 剩余任务与停点

| 任务 | 内容 | 关键依赖/注意 |
|---|---|---|
| T0.4 | 设计令牌与 App Shell | 需要 e2e 截图；200% 缩放；文案走 `t()`；会替换 `App.tsx` 空壳、`toast.tsx` 与 `error-text.ts` |
| T0.5 | CI、E2E 与提交门禁 | 已有 Playwright 骨架与 `e2e/ipc.spec.ts`；补 trace/CI YAML/覆盖率 gate；Windows runner 必须能跑 Electron |

T0.1–T0.3 已完成。

**M0 验收演示**：`pnpm dev` 打开窗口 → `pnpm verify` 全绿 → 故意违反依赖边界被 lint 拦截 →
E2E smoke 通过。产出 `docs/reports/m0/REPORT.md`（命令、结果、截图路径、遗留问题）后**停下等用户确认**，
不要自动进入 M1。

---

## 7. 后续里程碑提醒

### 7.1 公共 API 位置（T0.3 已落地，已获用户批准）

- `ErrorCode` / `AppError` / `toAppError` → `@curve/domain`（`src/errors.ts`），由
  `apps/desktop/src/shared/contracts/ipc.ts` 以 `export type` 重导出。
- `IpcResult<T>` 留在 desktop contracts 的 `envelope.ts`；`ipc.ts` 不重导出它（渲染端从 `envelope.ts` 取）。
- 若新会话要改这个位置，属于公共 API 决策，**先问用户**。

### 7.2 M1–M6

- 严格按 `docs/TASKS.md` 的 ID 顺序；每个任务一个提交；每个里程碑结束跑验收演示、写报告、停下。
- `T1.1` 起 domain 的 public API 会快速扩张；保持 Zod schema 与类型同步，覆盖率 ≥85%。
- 文件格式 / IPC 通道 / 公共 API 的歧义必须停问；其余按 SPEC §19 默认值 + ADR。

---

## 8. 已知风险与处理

| 风险 | 影响 | 处理 |
|---|---|---|
| agent shell 内 Electron 无法初始化 | `pnpm dev`/`e2e` 直接失败 | 见 §3.3：`CURVE_E2E_NO_SANDBOX=1`（E2E）/ `NO_SANDBOX=1`（dev）；普通终端不需要 |
| agent shell 禁止写 `%TEMP%`/`%APPDATA%` | E2E/应用无法建 userData | E2E userData 放 `apps/desktop/test-results/e2e-user-data`；应用真实运行用用户自己的 userData |
| Vite 8 用 oxc，`esbuild` 选项被忽略 | 配了会告警且无效 | 不要设 `esbuild`；JSX 用默认自动运行时或 tsconfig |
| electron-vite `externalizeDeps` 默认 true | 若把依赖放 `dependencies`，preload 会 `require` 外部包 → 沙箱失败 | 桌面端依赖全部放 `devDependencies`；preload 只 import electron + 相对模块 |
| `electron-winstaller` build script | `pnpm install` 报 `ERR_PNPM_IGNORED_BUILDS` | 已在 `pnpm-workspace.yaml` 显式 `electron-winstaller: false`；不要整体放开 allowBuilds |
| Vite 8 提示改用原生 `resolve.tsconfigPaths` | 每次测试打印一条非阻断提示 | 按 SPEC §5.3 保留 `vite-tsconfig-paths` |
| ESLint 9.39.5 已停止支持 | 长期无安全更新 | TASKS 指定 ESLint 9；升级需 ADR + 评估 `eslint-plugin-import` |
| 跨包 import 未加 TS reference | `tsc -b` TS6307/TS6059 | desktop 三个 tsconfig 已引用 `packages/domain`；再引入新包时同步 `references` 与 `@curve/*` 路径映射 |
| preload 误 import `contracts/ipc.ts` 或 zod | sandbox 下加载失败 / 预加载体积暴涨 | preload 只 import `contracts/channels.ts` 与 `envelope.ts`；`out/preload/index.cjs` 应只含 `require("electron")`（当前 3.11 kB） |
| Playwright 未下载浏览器 | 若未来加浏览器测试会失败 | 本项目只用 `_electron`；需要时显式 `pnpm exec playwright install` |
| 截图基线字体差异 | 视觉快照不稳定 | 断言令牌/计算样式；像素基线允许字体差异（TESTPLAN E5） |
| 100k 性能预算 | M2/M4 可能超预算 | T2.1/T2.6 提前 Worker/虚拟化；T2.7/T4.6 专项硬化 |

---

## 9. 不可做清单（重申）

- 不关闭 `contextIsolation` / `sandbox` / `webSecurity`，不打开 `nodeIntegration`。
- 不把 `--no-sandbox`、`CURVE_E2E_NO_SANDBOX` 写进应用代码或默认脚本；它们只服务于受限 shell 的测试。
- 不在 renderer 里 `require('fs')`、读任意路径、暴露 `ipcRenderer` 本体或泛 `invoke`。
- 不把 Zod / 任何外部包放进 preload。
- 不为通过安装而删除 `allowBuilds` 白名单或提交 `--ignore-scripts`。
- 不跳过测试、不放宽 ESLint 规则、不用 `--no-verify`。
- 不未经 ADR 升级 `formatVersion`、改数据格式、改 IPC 通道或公共 API。
- 不把 `node_modules`、`out/`、`dist-types/`、`release/`、`test-results/`、`debug.log`、真实用户数据提交进仓库。
- 不自动跨里程碑推进；每个里程碑验收报告后停下等确认。

---

## 10. 新会话启动检查清单

- [ ] `git status --short` 干净，`git log --oneline -3` 显示 `21f7bbe`。
- [ ] 已注入 PATH（§3.1），`pnpm --version` 为 11.28.5。
- [ ] 已读 `AGENTS.md`、本文件、SPEC §10.2/§16.3/§16.4、T0.4 相关 TESTPLAN 段落。
- [ ] 已确认 `apps/desktop/node_modules/electron/dist/electron.exe` 存在。
- [ ] 已清除 `ELECTRON_RUN_AS_NODE`；agent 会话内再设 `CURVE_E2E_NO_SANDBOX=1` 才能跑 E2E。
- [ ] 已确认用户本轮范围（默认 T0.4 完成后停下）。
- [ ] 复述 T0.4 目标/产出/验收后再动手。
