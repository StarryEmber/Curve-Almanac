# HANDOFF — Curve Studio 实施交接

> **更新（2026-10-20，T1.1 会话）**：`T0.5` 已提交（`1aefcdb`），M0 验收演示与
> `docs/reports/m0/REPORT.md` 已完成；**M1 进行中**：`T1.1`（领域模型、Zod 与不变量）已完成并提交，
> 下一个任务是 `T1.2`（工作区仓库与原子持久化，依赖 T1.1/T0.3）。本文其余内容仍描述 T0.4 → T0.5 的交接，
> 属历史记录；开始 T1.2 前请以 `docs/TASKS.md` 与 `docs/SPEC.md` 为准。
>
> 本文件面向**下一个实现会话**。当前会话已完成 `T0.4`，按用户要求停止。
> 最后更新：2026-10-20 · T0.4 提交：`7b42a04` · 分支：`main` · 工作树：干净。
> 阅读顺序：`AGENTS.md` → 本文件 → `docs/TASKS.md` 的 T0.5 → `docs/TESTPLAN.md` §1、§5 →
> `docs/SPEC.md` §5.2、§15.3 → `docs/DECISIONS.md` ADR-014、ADR-017。

---

## 1. 当前进度快照

| 项 | 状态 |
|---|---|
| 方案文档 | v1.0 已锁定（SPEC / TASKS / TESTPLAN / DECISIONS） |
| `T0.1` monorepo 与质量工具链 | **已完成**（`702293c`） |
| `T0.2` Electron 三进程骨架与安全窗口 | **已完成**（`6520c65`），验收 4/4，E2E E1 5/5 |
| `T0.3` 类型化 IPC 与错误信封 | **已完成**（`21f7bbe`），验收 4/4，148 tests / E2E 9 passed |
| `T0.4` 设计令牌与 App Shell | **已完成**（`7b42a04`），验收 5/5，228 tests / E2E 15 passed |
| 下一个任务 | `T0.5` CI、E2E 与提交门禁（M0 最后一个任务） |
| 里程碑 | M0 进行中；T0.5 后跑 M0 验收演示并写 `docs/reports/m0/REPORT.md` |
| 提交历史 | `347637b` docs: import v1 specification<br>`702293c` chore(tooling): initialize monorepo and quality gates（T0.1）<br>`6b0a395` docs: add T0.2 implementation handoff<br>`6520c65` feat(desktop): add secure electron shell（T0.2）<br>`e4f14fb` docs: add T0.3 implementation handoff<br>`21f7bbe` feat(ipc): add typed ipc envelope and error mapping（T0.3）<br>`f5153a3` docs: add T0.4 implementation handoff<br>`7b42a04` feat(ui): add design tokens and app shell（T0.4）<br>其后一条 `docs: add T0.5 handoff` |
| 工作树 | 干净（`git status --short` 无输出） |

**用户明确要求**：一次只做一个任务；每个任务先复述目标/产出/验收，再写测试、实现、跑 `pnpm verify`
与任务指定 e2e/bench，最后勾选 TASKS、更新 CHANGELOG、必要时 ADR、Conventional Commit。
新会话从 `T0.5` 开始；T0.5 完成后按 §6 跑 M0 验收演示、写报告，然后**停下等确认**，不要自行进入 M1。

---

## 2. 新会话开场提示词（可直接粘贴）

```text
工作目录：D:\DSH_Work_Space\curve-studio（仓库根）。

先读 AGENTS.md、docs/HANDOFF.md、docs/TASKS.md 的 T0.5、docs/TESTPLAN.md §1/§5、
docs/SPEC.md §5.2/§15.3，以及 docs/DECISIONS.md 的 ADR-014/ADR-017。

当前 T0.4 已完成并提交（7b42a04），工作树干净，`pnpm verify` 与 `pnpm e2e` 全绿。
请执行 T0.5：先按 AGENTS.md §8 复述目标/产出/验收与风险，再落地 CI 工作流
（Windows + Ubuntu：install/lint/typecheck/test/build，E2E 仅 Windows）、
Playwright 失败时的 trace/screenshot、覆盖率 gate 的 CI 接线、PR 模板；
用干净克隆/全新安装验证 `pnpm install && pnpm verify && pnpm e2e`，并验证失败时确实产出 trace。
完成后跑 M0 验收演示（pnpm dev 开窗 → verify 全绿 → 故意违反依赖边界被 lint 拦截 → E2E smoke 通过），
产出 docs/reports/m0/REPORT.md，勾选 TASKS、更新 CHANGELOG，按 Conventional Commits 提交，
最后输出任务报告并停下等我确认。
不要自动进入 M1；不要放宽 CSP/沙箱；不要跳过测试或放宽 lint/覆盖率阈值来让 CI 变绿。
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
| pnpm store | `D:\.pnpm-store\v11`（T0.4 实测；pnpm 会提示 `C:\Users\...\AppData\Local\pnpm\store` 跨盘不可硬链接） |
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
- E2E 会重写 `docs/reports/m0/t0.2-window.png`（E1 smoke 的截图用例），跑完 `pnpm e2e` 后工作树可能脏一条；
  这是预期的，提交时说明即可（该文件现在展示 T0.4 的 Shell）。

### 3.3 受限 shell 里 Electron 无法直接启动（T0.2 实测，仍然有效）

- 在 **DSH agent 的 pwsh 会话**里直接启动 Electron：
  - 默认（Chromium OS 沙箱开启）→ 进程以 `0x80000003` 退出，`main.js` 未执行；
  - 加 `--no-sandbox` 后 `main.js` 可执行，但 userData 落在 `%APPDATA%` → 写入 `EPERM` 崩溃。
- 原因：该 shell 的写入被限制在 `D:\DSH_Work_Space` 内，且 Chromium 沙箱/多进程初始化不可用；
  **不是应用代码问题**。
- **可行组合**（已多次实测窗口可见、页面正常）：
  1. 启动参数加 `--no-sandbox`；
  2. `app.setPath('userData', <D:\DSH_Work_Space 下的目录>)`。
- 已落地为**仅测试可用**的逃生舱（不进入应用逻辑）：
  - `apps/desktop/e2e/fixtures.ts`：`CURVE_E2E_NO_SANDBOX=1` 时才给 Electron 传 `--no-sandbox`；
    userData 固定放 `apps/desktop/test-results/e2e-user-data/run-*`（gitignore）。
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
pnpm dev
```

- 用户自己开的普通终端没有这些限制：`pnpm dev` / `pnpm e2e` 原样可用，**不要**把
  `--no-sandbox`、`CURVE_E2E_NO_SANDBOX` 写进应用或默认脚本。
- 想验证 **dev 渲染器**（生产构建之外）：先 `pnpm dev` 起 dev server，再用
  `_electron.launch({ env: { ELECTRON_RENDERER_URL: 'http://localhost:5173', CURVE_E2E: '1',
  CURVE_E2E_USER_DATA: <workspace 下目录> }, args: [desktopDir, '--no-sandbox'] })` 另起一个实例，
  用 Playwright 取 DOM/console。T0.4 用此法确认 dev 页面 0 console error、开发 CSP 正确。

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
| electron-vite | 6.0.0 | Vite 8 / rolldown 内核；`build.rolldownOptions`；`externalizeDeps` **默认 true**（只作用于 `dependencies`） |
| Vite | 8.3.4 | 用 **oxc** 转译；`esbuild` 选项被忽略（设了会告警）；JSX 默认自动运行时 |
| React / React DOM | 19.3.1 | 组件测试用 `@testing-library/react` 16 + jsdom 30；React 19 允许 `ref` 作为普通 prop |
| electron-builder | 26.15.3 | 仅安装，未配置打包（T6.4） |
| Playwright | 1.64.1 | 只用 `_electron`，未下载浏览器（`connectOverCDP` 亦可用，无需浏览器） |

### 3.7 文本编码与路径陷阱（T0.3 实测）

- DSH 的 shell 是 **Windows PowerShell 5.1**：`Get-Content` 默认按 GBK 解码无 BOM 的 UTF-8 文件（乱码），
  `Set-Content -Encoding UTF8` 会写入 **BOM**。**源码与文档一律用编辑器工具（read/write/edit）修改**，
  不要用 shell 重定向/`Set-Content` 改文本，否则会把中文写坏或让 prettier 报错。
- `[System.IO.File]::ReadAllBytes('相对路径')` 按**进程 CWD**（`D:\DSH_Work_Space`）解析，不是 PowerShell 的
  `cd` 目录；这类 .NET 调用必须给绝对路径。
- `pnpm` 的 stdout 被 PowerShell 当成错误流时会打印 `NativeCommandError` 红字，但**结论看 `$LASTEXITCODE`**；
  建议 `pnpm ... > log 2>&1` 到 `test-results/`（已 gitignore）后再判断与检索。

### 3.8 T0.4 新增的实测结论（T0.5 会直接用到）

- **截图首帧会拼接旧画面**：在 125% DPI 的 Windows 上，页面刚加载完立刻 `page.screenshot()` 偶尔会把
  标题栏画到图片底部（表面尚未重绘）。`e2e/shell.spec.ts` 里的 `settleFrame()`（连续两次
  `requestAnimationFrame`）可稳定修复；**新增截图用例必须复用**。
- 截图是设备像素：窗口 1440×816 → 页面 1426×779 CSS px → PNG 1783×943（DPR 1.25）。不要按 CSS 像素
  硬编码图片尺寸。
- **Vitest 下 CSS 的 `?raw` 返回空串**（`test.css` 默认 false，CSS 被 stub）。需要读取 CSS 文本的测试
  一律用 `node:fs`，并放在带 Node 类型的工程里：
  - `packages/ui/src/tokens.test.ts`（包内，`types: ["node"]`）；
  - `apps/desktop/test/ui-conventions.test.ts`（新工程 `apps/desktop/tsconfig.test.json`，Node + ES2022）。
- 渲染进程 bundle **未压缩且包含 zod**（`api-client` 在渲染端二次校验，T0.3 起如此；当前 ~755 kB JS）。
  T6.4 打包时再决定压缩与体积预算；T0.5 的 CI 不要新增会误报的体积门禁。

---

## 4. T0.2 / T0.3 已交付的关键接口（不要回退）

- **安全面**：`contextIsolation/sandbox/webSecurity=true`、`nodeIntegration=false`、`devTools=isDev`、
  `webviewTag=false`；`will-navigate`/`setWindowOpenHandler`/`will-attach-webview`/权限请求全部拒绝；
  CSP 由 renderer 插件在 `serve`/`build` 时注入 `<meta>`，生产策略逐字等于 SPEC §15.3（ADR-018 只放宽 dev）。
- **isDev 判据是 `ELECTRON_RENDERER_URL`**（不是 `app.isPackaged`）：预览/E2E 跑未打包构建时必须像生产。
- **IPC 契约拆三件**（preload 零依赖边界）：`src/shared/contracts/channels.ts`（零 import）、
  `envelope.ts`（`IpcResult`/`isIpcResult`）、`ipc.ts`（Zod schema + `CurveApi`）。
  preload 只 import 前两者，产物约 3.1 kB 且只 `require("electron")`。
- **错误类型在 `@curve/domain`**：`ERROR_CODES`/`ErrorCode`/`AppError`/`appErrorSchema`/`toAppError`；
  `IpcResult<T>` 留在 desktop contracts 的 `envelope.ts`。
- main 侧 `ipc/dispatch.ts` 双向校验（入参 256MB 上限、响应契约），任何分支不抛；`ipc/register.ts` 只接受
  通道白名单。`window.api` 目前只有 `app.info` 与 `log.write`，没有 `invoke`/`send` 泛入口。
- TESTPLAN §1.1 对话框替身：纯函数 `resolveE2EDialogStubs`，仅 `!app.isPackaged && CURVE_E2E=1` 生效。

---

## 5. T0.4 实施记录（已完成 2026-10-20，提交 `7b42a04`）

### 5.1 交付文件

```
packages/ui/
├─ package.json                     # peer react/react-dom；devDeps 供测试；sideEffects 保留 CSS
├─ tsconfig.json                    # composite + DOM lib + react-jsx + types:["node"]（给令牌测试读 CSS）
└─ src/
   ├─ tokens.css                    # 58 个 --cs-*，:root 浅色 + [data-theme='dark'] 深色
   ├─ ui.css                        # 组件样式，只消费令牌
   ├─ theme.ts                      # THEME_ATTRIBUTE / storage key / resolveTheme / applyTheme / prefersDark
   ├─ Button.tsx Input.tsx Select.tsx Dialog.tsx Menu.tsx Tabs.tsx Toast.tsx class-names.ts
   ├─ Button.test.tsx fields.test.tsx Dialog.test.tsx Menu.test.tsx Tabs.test.tsx Toast.test.tsx
   ├─ theme.test.ts tokens.test.ts index.test.ts
   └─ index.ts                      # 副作用引入两份 CSS + 公共导出
apps/desktop/src/renderer/
├─ App.tsx                          # I18nProvider → ThemeProvider → AppShell
├─ shell/{AppShell,TitleBar,Sidebar,WorkspaceEmptyState,Inspector,StatusBar,HelpDialog,icons}.tsx
├─ shell/use-runtime-info.ts        # app:info → loading/ready/error 三态
├─ i18n/{index.tsx,translate.ts}    # I18nProvider/useI18n + createTranslator/formatMessage/isLocale
├─ i18n/messages/{zh-CN,en-US}.ts   # 全部 Shell 文案 + SPEC §18 的 26 个 error.<code>
├─ theme/ThemeProvider.tsx          # light/dark/system，首帧前写 data-theme + color-scheme
├─ styles.css                       # Shell 的 CSS Grid 布局，只消费 --cs-* 令牌
├─ App.test.tsx                     # 10 条 Shell 行为测试
└─ error-text.ts                    # describeAppError(error, t)
apps/desktop/test/ui-conventions.test.ts   # TypeScript AST 文案门禁 + 裸色值/令牌门禁（Node 工程）
apps/desktop/tsconfig.test.json            # 新增 Node 侧测试工程（root/desktop solution 均引用）
apps/desktop/e2e/shell.spec.ts             # 6 条 T0.4 E2E
docs/reports/m0/t0.4-shell-{light,dark}.png
```

删除：`renderer/toast.tsx`、`renderer/toast.test.tsx`（由 `@curve/ui` 的 Toast 取代）。

### 5.2 关键决策

- **令牌是唯一颜色来源**：`tokens.css` 定义 58 个 `--cs-*`；深色块覆盖全部 21 个颜色令牌与两个阴影。
  令牌测试解析 CSS，断言组件/Shell 用到的令牌都有声明、深色覆盖完整、组件 CSS 无裸色值。
- **对比度自动校验**：对 8 组前景/背景（正文 4.5:1、控件/焦点环 3:1）在浅深两套下计算 WCAG 比值；
  新增/改色必须同时过测试。
- **组件可访问性契约**：Button 的 `iconOnly` 在类型层要求 `aria-label`；Dialog 陷阱 + Esc + 焦点恢复 +
  背景滚动锁 + `aria-modal`/`aria-labelledby`；Menu 支持 Arrow/Home/End/Esc/Tab 与 `menuitemradio`；
  Tabs 自动激活 + roving tabindex；Toast 错误 `role=alert`、其余 `role=status`，关闭按钮有可访问名。
- **Shell 布局**：CSS Grid 三行三列（`titlebar` / `sidebar main inspector` / `statusbar`），DOM 顺序即
  键盘顺序；跳转链接是第一个 Tab 停点；面板折叠用条件渲染；主区/侧栏/检查器都 `min-width: 0` + 滚动，
  以保证 200% 缩放（640 CSS px 宽）下无横向裁切。
- **i18n**：`MessageKey` 由 zh-CN 推导；en-US 用 `Record<MessageKey, string>` 强制完整；错误码用映射类型
  （键为 `error.${ErrorCode}`）强制覆盖 SPEC §18 全集；`t()` 支持 `{name}` 插值；
  默认 zh-CN，语言选择与 `<html lang>` 同步并持久化到 `localStorage['curve-studio.locale']`。
- **主题**：`mode`（light/dark/system）与 `resolved` 分离；`useLayoutEffect` 在首帧前应用
  `data-theme` 与 `color-scheme`，避免深色偏好闪白；选择持久化到 `localStorage['curve-studio.theme']`。
- **未实现功能不假装成功**：空态的"新建/打开工作区"按钮点击后弹 info toast 说明该功能在后续里程碑提供。
- **测试工程边界**：渲染进程仍是 web 工程（无 Node 类型）；读文件做门禁的测试放在
  `apps/desktop/test/` + `tsconfig.test.json`，不污染浏览器工程。
- **renderer 解析**：electron-vite renderer 增加 `vite-tsconfig-paths`（读根 `tsconfig.base.json`）与
  `resolve.dedupe: ['react','react-dom']`；`@curve/ui` 放 desktop devDependencies（源码包，随 bundler 编译）。

### 5.3 已验证证据（T0.4）

| 命令 | 结果 |
|---|---|
| `pnpm verify` | exit 0；ESLint 0 problem；depcruise **115 modules / 0 violations**；**38 files / 228 tests passed** |
| `pnpm test:coverage` | exit 0；lines **95.89%**、statements **96.02%**、branches **86.76%**、functions **100%**（`@curve/ui` 行 92.33%） |
| `pnpm e2e`（`CURVE_E2E_NO_SANDBOX=1`） | **15 passed**：T0.4 shell 6、T0.3 IPC 4、E1 smoke 5 |
| `pnpm dev`（`NO_SANDBOX=1` + E2E userData） | `[main] window ready (mode=development, devTools=true, visible=true)` |
| dev 渲染器（Playwright 另起实例 + `ELECTRON_RENDERER_URL`） | `window.require/process = undefined`、`window.api` 存在、开发 CSP 与 ADR-018 一致、**0 console error** |
| `pnpm format:check` | exit 0 |
| 截图 | `docs/reports/m0/t0.4-shell-light.png`、`t0.4-shell-dark.png`（浅/深 + 计算令牌断言） |

E2E `shell.spec.ts` 覆盖：五区结构、面板折叠、纯键盘（跳转链接/Tabs/Menu/Dialog + 焦点恢复）、
**200% 缩放无横向裁切**、浅/深切换 + 截图 + reload 保持、en-US 全量切换且无 message key 泄漏。

### 5.4 与计划/规格的差异

- 无 SPEC/公共 API 偏离；未新增 ADR。
- 新增 Node 侧测试工程 `apps/desktop/tsconfig.test.json`（TESTPLAN §3 允许 `apps/desktop/test/` 作为 L3 位置），
  用于源码级文案/令牌门禁。
- `docs/reports/m0/t0.2-window.png` 由 E1 smoke 用例每次重写，现在展示 T0.4 的 Shell。

---

## 6. M0 收尾：T0.5 与验收演示

### 6.1 T0.5 现状与缺口（不要重复造）

已有：`apps/desktop/playwright.config.ts`（`testDir=./e2e`、workers=1、list reporter）、15 条 E2E、
`vitest.config.ts` 的覆盖率阈值（lines/statements/functions 70、branches 60）、`CHANGELOG.md`、
`pnpm verify`/`pnpm e2e` 脚本、`.dependency-cruiser.cjs` 边界规则。

T0.5 需要补齐：

1. `.github/workflows/ci.yml`：Windows + Ubuntu 矩阵；`pnpm install`（缓存 pnpm store）→
   `pnpm lint` → `pnpm typecheck` → `pnpm test` → `pnpm build`；E2E 仅 Windows
   （Ubuntu 不跑 Electron E2E，TESTPLAN §1 门禁）。Windows runner 上 Electron 可正常启动，
   **不要**把 `--no-sandbox` 写进 CI 脚本（那是 agent shell 的逃生舱）。
2. E2E 失败留证：`playwright.config.ts` 增加 `trace: 'retain-on-failure'`、`screenshot: 'only-on-failure'`，
   CI 用 `actions/upload-artifact` 上传 `apps/desktop/test-results`（含 trace）与 `playwright-report`。
3. 覆盖率 gate：`pnpm test:coverage` 已在 CI 之外可用；T0.5 决定是否在 CI 用 `--coverage` 并让阈值失败即红。
   阈值不得下调；如需上调先记录实测。
4. PR 模板 / CHANGELOG 模板：CHANGELOG 已存在（Keep a Changelog 风格），补 `.github/pull_request_template.md`
   （任务 ID、验收命令、截图/证据、风险）。`CODEOWNERS` 不要求。
5. 干净克隆验证：本地可用 `git clone <repo> <temp>` + `pnpm install --frozen-lockfile && pnpm verify && pnpm e2e`
   （agent shell 里 E2E 仍需 `CURVE_E2E_NO_SANDBOX=1`；干净克隆目录需在 `D:\DSH_Work_Space` 下）。
6. 失败路径实测：临时把某条 E2E 断言改错（或加一条必失败用例）→ 确认 trace/screenshot 产出后再还原；
   不要提交该临时改动。

### 6.2 M0 验收演示（T0.5 之后立即执行）

按 `docs/TASKS.md` 的 M0 行：

1. `pnpm dev` 打开窗口（agent shell 按 §3.3 的环境变量）；
2. `pnpm verify` 全绿；
3. 故意在 `packages/domain` import React（或 `packages/ui` import `@curve/app-core`）→ `pnpm lint` 必须被
   depcruise 拦截 → 还原；
4. `pnpm e2e` smoke 通过（至少 E1 5 条 + shell 6 条）。

产出 `docs/reports/m0/REPORT.md`：命令、真实输出摘要、截图路径（`t0.2-window.png`、`t0.4-shell-*.png`）、
遗留问题（例如 renderer bundle 体积、`t0.2-window.png` 会被重写、覆盖率 `@curve/ui` 分支覆盖 78.81% 等）、
以及"可以进入 M1"的结论。**写完报告、提交、输出任务报告后停下等用户确认**，不要自动进入 M1。

---

## 7. 后续里程碑提醒

### 7.1 公共 API / 契约位置（已获批，改动先问用户）

- `ErrorCode` / `AppError` / `toAppError` → `@curve/domain`（`src/errors.ts`），由
  `apps/desktop/src/shared/contracts/ipc.ts` 以 `export type` 重导出。
- `IpcResult<T>` 留在 desktop contracts 的 `envelope.ts`；渲染端从 `envelope.ts` 取。
- `@curve/ui` 的公共入口：组件 props、`THEME_ATTRIBUTE`（`data-theme`）、`THEME_STORAGE_KEY`、
  `resolveTheme`/`applyTheme`、`useToasts`/`ToastHost`。`tokens.css` 的令牌名与 `data-theme` 选择器是
  主题契约，改名等于破坏主题，需 ADR/同步文档。
- 消息表 key（`shell.*`/`theme.*`/`language.*`/`error.*`）由 zh-CN 表定义；新增 UI 文案必须同时加
  zh-CN 与 en-US（缺一条 `tsc` 就报错）。

### 7.2 M1–M6

- 严格按 `docs/TASKS.md` 的 ID 顺序；每个任务一个提交；每个里程碑结束跑验收演示、写报告、停下。
- `T1.1` 起 domain 的 public API 会快速扩张；保持 Zod schema 与类型同步，覆盖率 ≥85%。
- 文件格式 / IPC 通道 / 公共 API 的歧义必须停问；其余按 SPEC §19 默认值 + ADR。

---

## 8. 已知风险与处理

| 风险 | 影响 | 处理 |
|---|---|---|
| agent shell 内 Electron 无法初始化 | `pnpm dev`/`e2e` 直接失败 | 见 §3.3：`CURVE_E2E_NO_SANDBOX=1`（E2E）/ `NO_SANDBOX=1`（dev）；普通终端不需要 |
| agent shell 禁止写 `%TEMP%`/`%APPDATA%` | E2E/应用无法建 userData | E2E userData 放 `apps/desktop/test-results/e2e-user-data`；真实运行用用户自己的 userData |
| 首帧截图拼接旧画面（125% DPI） | 截图证据出现重复标题栏 | 截图前用 `settleFrame()`（双 rAF）；已固化在 `shell.spec.ts` |
| Vitest 下 CSS `?raw` 为空 | 令牌测试误判/假通过 | CSS 文本用 `node:fs` 读取，放在 Node 类型工程（§3.8） |
| `packages/ui/tsconfig` 有 `types:["node"]` | 组件代码可能误用 Node API | 只给测试读文件用；ESLint 的 ui 配置只开浏览器 globals，禁止 Node 导入 |
| 渲染进程 bundle ~755 kB 且含 zod | 启动/内存 | T0.3 起既有；T6.4 打包阶段决定压缩/拆包/是否保留渲染端二次校验 |
| Vite 8 用 oxc，`esbuild` 选项被忽略 | 配了会告警且无效 | 不要设 `esbuild`；JSX 用默认自动运行时或 tsconfig |
| electron-vite `externalizeDeps` 默认 true | preload 若依赖外部包会失败 | 桌面端依赖全放 `devDependencies`；preload 只 import electron + 相对模块 |
| `electron-winstaller` build script | `pnpm install` 报 `ERR_PNPM_IGNORED_BUILDS` | 已在 `pnpm-workspace.yaml` 显式 `electron-winstaller: false`；不要整体放开 allowBuilds |
| Vite 8 提示改用原生 `resolve.tsconfigPaths` | 每次构建一条非阻断提示 | 按 SPEC §5.3 保留 `vite-tsconfig-paths` |
| ESLint 9.39.5 已停止支持 | 长期无安全更新 | TASKS 指定 ESLint 9；升级需 ADR + 评估 `eslint-plugin-import` |
| 跨包 import 未加 TS reference | `tsc -b` TS6307/TS6059 | desktop 四个 tsconfig 已引用 `packages/{domain,ui}`；再引入新包时同步 `references` |
| preload 误 import zod/contracts/ipc | sandbox 下加载失败 | preload 只 import `contracts/channels.ts` 与 `envelope.ts`；产物应只含 `require("electron")`（当前 3.1 kB） |
| Playwright 未下载浏览器 | 若未来加浏览器测试会失败 | 本项目只用 `_electron`；需要时显式 `pnpm exec playwright install` |
| 截图/本地化断言依赖 zh-CN 默认 | 语言/文案改动会改 E2E | 只断言 message table 的值或结构；en-US 用例单独断言 |
| 100k 性能预算 | M2/M4 可能超预算 | T2.1/T2.6 提前 Worker/虚拟化；T2.7/T4.6 专项硬化 |
| `t0.2-window.png` 被 E2E 重写 | 跑完 e2e 工作树变脏 | 预期行为；提交时说明，或 T0.5 决定改名为 `e1-window.png`（需同步文档） |

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

- [ ] `git status --short` 干净，`git log --oneline -3` 顶部为 `7b42a04`。
- [ ] 已注入 PATH（§3.1），`pnpm --version` 为 11.28.5。
- [ ] 已读 `AGENTS.md`、本文件、`docs/TASKS.md` T0.5、`docs/TESTPLAN.md` §1/§5、
      `docs/SPEC.md` §5.2/§15.3、ADR-014/ADR-017。
- [ ] 已确认 `apps/desktop/node_modules/electron/dist/electron.exe` 存在。
- [ ] 已清除 `ELECTRON_RUN_AS_NODE`；agent 会话内再设 `CURVE_E2E_NO_SANDBOX=1` 才能跑 E2E。
- [ ] 已确认用户本轮范围（T0.5 + M0 验收演示与报告，然后停下；不进入 M1）。
- [ ] 复述 T0.5 目标/产出/验收后再动手。
