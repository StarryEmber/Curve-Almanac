# TASKS — Curve Studio v1 可执行任务清单

> 39 个任务，按依赖顺序执行。**一次只做一个**；依赖未完成不得开始。
> 每个任务的"验证"命令必须在任务报告中附真实输出。完成定义见 `AGENTS.md §10`。
> 参考人日按人类开发者估算（合计约 65 人日）；AI 协作可压缩，但**验收项不压缩**。

## 0. 状态与协议

- 状态：`[ ]` 未开始 · `[~]` 进行中 · `[x]` 完成 · `[!]` 阻塞（必须在任务报告写明原因）
- 任务开始前：读 `AGENTS.md`、本任务的"参考"章节、`docs/TESTPLAN.md` 对应层。
- 任务结束时：勾选本任务 → 更新 `CHANGELOG.md` → 写 ADR（如需）→ 提交。
- 每个里程碑结束：执行该里程碑的"验收演示"，输出报告，**停下等人类确认**。

## 1. 里程碑总览

| 里程碑 | 主题 | 任务 | 退出标准 | 估算 |
|---|---|---|---|---|
| M0 | 基建 | T0.1–T0.5 | 窗口能开、门禁能跑、违规依赖被拦 | 7 人日 |
| M1 | 领域与持久化 | T1.1–T1.5 | 工作区/表可创建、读写、迁移、恢复 | 8.5 人日 |
| M2 | 表格数据 | T2.1–T2.7 | 建表、编辑、粘贴、导入、筛选、10 万行 | 13.5 人日 |
| M3 | 表格外观 | T3.1–T3.6 | 模板、令牌、条件格式、导入导出 | 9.5 人日 |
| M4 | 图表 | T4.1–T4.6 | 宽/长表出图、交互、采样、PNG | 9 人日 |
| M5 | 体验 | T5.1–T5.5 | 布局、撤销、自动保存/恢复、设置 | 8.5 人日 |
| M6 | 扩展与发布 | T6.1–T6.5 | 插件、安装包、全量验收 | 8 人日 |

## 2. 依赖图与推荐主路径

```
M0
T0.1 → T0.2 → T0.3 → T0.5
        └────→ T0.4

M1
T0.1 → T1.1 → T1.2 → T1.3 → T1.4
T1.1 + T1.2 + T1.3 → T1.5

M2
T1.5 → T2.1 → T2.2 → T2.4
T2.1 + T1.4 → T2.3
T2.2 + T1.3 → T2.5
T2.1 → T2.6
T2.1..T2.6 → T2.7

M3
T1.1 → T3.1
T2.1 + T2.6 + T3.1 → T3.2
T3.1 → T3.3
T3.2 + T3.3 → T3.4
T2.6 + T3.4 → T3.5
T2.6 → T3.6

M4
T1.1 + T2.6 → T4.1
T4.1 → T4.2
T4.1 + T0.4 → T4.3
T4.3 + T2.6 → T4.4
T4.4 → T4.5
T4.2 + T4.5 → T4.6

M5
T2.1 + T4.4 → T5.1
T1.5 + T2.2 + T2.3 + T3.4 → T5.2 → T5.4
T1.2 + T1.3 + T1.5 → T5.3
T0.4 + T3.1 → T5.5

M6
T1.1 → T6.1 → T6.2
T6.2 + T2.5 + T3.2 → T6.3
T0.2 + T5.5 → T6.4
全部 → T6.5
```

**推荐主路径**：`T0.1 → T0.2 → T0.3 → T1.1 → T1.2 → T1.3 → T1.4 → T1.5 → T2.1 → T2.2 → T2.5 → T2.7 → T3.1 → T3.2 → T3.4 → T4.1 → T4.3 → T4.4 → T5.1 → T5.2 → T6.1 → T6.2 → T6.3 → T6.5`

**可并行轨道**（若有多代理）：

- 轨道 A（数据）：M1 → M2。
- 轨道 B（外观/图表）：T3.1/T3.3 可在 T1.1 后启动；T4.1 可在 T2.6 后启动。
- 轨道 C（壳/体验）：T0.4 → T5.1 → T5.5。
- 轨道 D（扩展）：T6.1 → T6.2 可在 T1.1 后启动。

---

## M0 基建

<a id="t01"></a>
### T0.1 初始化 monorepo 与质量工具链
- 状态：`[x]`
- 依赖：无
- 覆盖：NFR-07、NFR-02
- 参考：SPEC §4、§5
- 产出：
  - 根 `package.json`、`pnpm-workspace.yaml`、`tsconfig.base.json`、`.gitignore`
  - `eslint.config.js`、`.prettierrc`、`vitest.config.ts`、`.dependency-cruiser.cjs`
  - 9 个包骨架：`domain`、`table-engine`、`chart-model`、`chart-echarts`、`persistence`、`plugin-sdk`、`ui`、`app-core`、`desktop`
  - `CHANGELOG.md`、`docs/adr/README.md`
- 步骤：
  1. `pnpm init`，配置 workspace 与 Node/pnpm engines。
  2. 写 `tsconfig.base.json`：strict + `noUncheckedIndexedAccess` + `noImplicitOverride` + 路径别名。
  3. ESLint 9 flat config：typescript-eslint、react-hooks、import/order；零 warning。
  4. Vitest：node 默认环境；UI 用 `// @vitest-environment jsdom`。
  5. dependency-cruiser 落实 SPEC §4.3 七条规则。
  6. 每个包 `package.json` + `src/index.ts`（先导出占位类型），桌面包先空壳。
- 验收：
  - [x] `pnpm install` 无 peer 警告/错误。
  - [x] `pnpm verify` 全绿（至少 1 个 smoke 测试）。
  - [x] 故意写一条 `domain → react` import，`pnpm lint` 必须失败；撤销后恢复。
  - [x] 路径别名在 Vitest 中可用。
- 验证：`pnpm install && pnpm verify`

<a id="t02"></a>
### T0.2 Electron 三进程骨架与安全窗口
- 状态：`[x]`
- 依赖：T0.1
- 覆盖：NFR-02、NFR-08
- 参考：SPEC §15.3
- 产出：
  - `apps/desktop/electron.vite.config.ts`、`src/main/index.ts`、`src/preload/index.ts`、`src/renderer/`（React 入口）
  - 安全窗口配置（`contextIsolation/sandbox/webSecurity`，preload 输出 CJS）
  - 菜单骨架、窗口尺寸记忆、开发/生产加载路径
- 步骤：
  1. 装 Electron、electron-vite、React、electron-builder（先不打包）。
  2. main 创建窗口并加载 renderer；dev 用 Vite server，prod 用 `loadFile`。
  3. preload 只暴露 `app.info`；renderer 渲染 "Curve Studio" 空壳。
  4. 加 `will-navigate`/`setWindowOpenHandler` 拒绝与 CSP。
- 验收：
  - [x] `pnpm dev` 打开窗口，DevTools 仅在开发可用。
  - [x] 打包态或预览态能加载 renderer，控制台无 Node 暴露错误。
  - [x] 在 renderer 执行 `window.require` / `process` 为 `undefined`。
  - [x] 外部链接点击不打开新窗口。
- 验证：`pnpm build && pnpm exec playwright test --grep "smoke"`
- 实现备注（2026-10-20）：
  - 前移了 T0.5 的最小 E2E：`apps/desktop/e2e/{fixtures,smoke}.spec.ts` + `apps/desktop/playwright.config.ts`，
    覆盖 TESTPLAN E1 的五条断言；证据截图 `docs/reports/m0/t0.2-window.png`、`t0.2-dev-window.png`。
  - 受限 shell（DSH agent 沙箱）内 Chromium OS 沙箱无法初始化，E2E 需设 `CURVE_E2E_NO_SANDBOX=1`
    才会给 Electron 传 `--no-sandbox`；该变量**只被 E2E fixture 读取**，不影响应用配置，也不改变
    `webPreferences.sandbox: true`。普通终端直接 `pnpm e2e` 即可，无需该变量。
  - 开发模式 CSP 的内联脚本放宽见 ADR-018；生产策略由 E2E 逐字比对 SPEC §15.3。

<a id="t03"></a>
### T0.3 类型化 IPC 与错误信封
- 状态：`[x]`
- 依赖：T0.2
- 覆盖：NFR-02、NFR-06
- 参考：SPEC §15.1、§15.2、§18
- 产出：
  - `contracts/ipc.ts`：通道常量、请求/响应 Zod schema、`IpcResult<T>`、`AppError`
  - main：`ipcMain.handle` 注册器、统一错误映射、日志
  - preload：`window.api`（只暴露 `app.info` + `log.write`，其余为 T1.2/T1.3 预留）
  - renderer：`api` 客户端封装、错误 toast 骨架
- 步骤：
  1. 定义信封与错误码（先实现 SPEC §18 全集类型）。
  2. 写 `registerHandler(channel, schema, fn)`：校验入参 → 执行 → 包装结果。
  3. preload 用 `contextBridge` 暴露白名单方法。
  4. 渲染端统一处理 `ok:false`，未知异常不泄露堆栈。
- 验收：
  - [x] 非法载荷返回 `E_IPC_INVALID_PAYLOAD`，进程不崩。
  - [x] 未注册通道调用被拒绝。
  - [x] `window.api` 上没有 `invoke`/`send` 泛入口。
  - [x] 错误信封单测覆盖成功/失败/异常三种。
- 验证：`pnpm exec vitest run packages/app-core apps/desktop`
- 实现备注（2026-10-20）：
  - `ErrorCode`/`AppError`/`appErrorSchema`/`toAppError`/`createAppError` 落在
    `packages/domain/src/errors.ts`（ADR-007，schema 为 strict，带 `stack` 的信封会被拒绝）；
    `@curve/domain` 新增唯一运行时依赖 `zod`（SPEC §4.2 允许），desktop 侧 `zod` 放 devDependencies。
  - 契约拆三个文件以满足 preload 零依赖（SPEC §15.4）：`shared/contracts/channels.ts`（18 个通道名，
    无任何 import）、`envelope.ts`（`IpcResult` + `ipcOk`/`ipcFail`/`isIpcResult`，仅类型依赖 domain）、
    `ipc.ts`（Zod 请求/响应 schema 与 `AppInfo`/`LogWriteRequest`/`CurveApi`）。preload 只 import 前两者；
    产物 3.11 kB、只有 `require("electron")`，zod 与 domain 均未进入 preload。
  - main：`ipc/dispatch.ts`（256MB 载荷上限 → 入参 Zod → handler → 响应 Zod → `toAppError`，
    任何分支都不抛）、`ipc/register.ts`（只接受 `IpcChannel` 白名单、重复注册抛错、未注册通道保持未处理）、
    `ipc/handlers.ts`（`app:info`、`log:write`）、`logger.ts`（分级 + 消息/详情截断，T1.x 换文件日志）。
  - renderer：`api-client.ts` 两端校验（入参失败 `E_VALIDATION` 且不触发 IPC；响应 schema 不匹配 → 信封化
    `E_UNKNOWN`；preload 缺失/抛错都有确定信封），`error-text.ts` 按 code 出文案（不回显 `message`/`detail`），
    `toast.tsx` 为 T0.4 前的骨架。
  - TESTPLAN §1.1 对话框替身以纯函数 `resolveE2EDialogStubs` 落地（`!app.isPackaged && CURVE_E2E=1`），
    T1.2/T1.3 的 dialog/file 通道直接消费；打包后一律 `null`，有单测。
  - E2E 新增 `e2e/ipc.spec.ts` 四条：`window.api` 白名单方法、`app:info`/`log:write` 正常路径、
    三种非法载荷后进程仍存活、以及“已注册通道集合 == `IMPLEMENTED_IPC_CHANNELS`”
    （利用 Electron 重复 `ipcMain.handle` 会抛错的特性探测真实注册表）。
  - 验证结果：`pnpm verify` exit 0（28 test files / 148 tests，depcruise 78 modules 0 violations）；
    `pnpm test:coverage` lines 99.11% / statements 99.14% / branches 96.17% / functions 100%；
    `pnpm e2e`（`CURVE_E2E_NO_SANDBOX=1`）9 passed；`pnpm dev` 日志
    `[main] window ready (mode=development, devTools=true, visible=true)`。

<a id="t04"></a>
### T0.4 设计令牌与 App Shell
- 状态：`[x]`
- 依赖：T0.2
- 覆盖：NFR-03、NFR-04
- 参考：SPEC §10.2、§16.3、§16.4
- 产出：
  - `packages/ui`：CSS 变量令牌（颜色/间距/字体/圆角/阴影）、Button/Input/Select/Dialog/Toast/Menu/Tabs
  - `apps/desktop/src/renderer`：标题栏、侧栏、主区、检查器、状态栏、空态
  - `messages/zh-CN.ts` + 类型化 `t(key, params)`（先覆盖 Shell 文案）
  - 浅色/深色主题切换骨架
- 步骤：
  1. 定义 `--cs-*` 令牌；深浅色两套值。
  2. 组件只消费令牌，不写死颜色。
  3. Shell 用 CSS Grid 布局；面板可折叠；焦点顺序正确。
  4. 建立消息表与 `t()`，从第一行 UI 起禁止硬编码文案。
- 验收：
  - [x] 组件测试：Dialog 焦点陷阱、Esc 关闭、Toast 自动消失。
  - [x] 200% 缩放下无横向裁切。
  - [x] 所有按钮有可访问名称；键盘可遍历。
  - [x] Shell 无硬编码用户文案（grep 可查）。
  - [x] 截图基线（浅/深）通过。
- 验证：`pnpm exec vitest run packages/ui && pnpm e2e -- --grep "shell"`
- 实现备注（2026-10-20）：
  - `@curve/ui`：`tokens.css` 定义 58 个 `--cs-*`（浅/深两套，深色覆盖全部颜色与阴影令牌）与 `ui.css`
    （组件样式只消费令牌）；`index.ts` 以副作用引入两份 CSS，`sideEffects` 防止打包时被摇树删除。
  - 组件：Button（`iconOnly` 在类型层强制 `aria-label`）、Input/Select（label/hint/error 关联，`hideLabel`
    仍保留可访问名）、Dialog（焦点陷阱 + Esc + 焦点恢复 + 背景滚动锁）、Menu（APG 键盘契约与 `menuitemradio`）、
    Tabs（自动激活 + roving tabindex）、Toast（`useToasts` + `ToastHost`，错误 `role=alert`、其余 `role=status`）。
  - 令牌测试：解析 `tokens.css` 校验使用/声明一致与深色覆盖完整，并对 8 组前景/背景计算 WCAG 对比度
    （正文 ≥4.5:1、控件 ≥3:1），浅深两套均通过。按 TESTPLAN §8，浅/深"基线"以令牌与计算样式断言为准，
    PNG（`docs/reports/m0/t0.4-shell-{light,dark}.png`）作为证据，不做像素 diff。
  - Shell：CSS Grid 三行三列（标题栏/侧栏/主区/检查器/状态栏），DOM 顺序即键盘顺序；跳转链接是第一个
    Tab 停点；侧栏用 Tabs、标题栏用 Menu（主题）、状态栏用 Select（语言）、帮助入口用 Dialog；空态按钮点击后
    toast 说明工作区功能尚未提供（不假装成功）。
  - i18n：`renderer/i18n/messages/{zh-CN,en-US}.ts` + `createTranslator`/`formatMessage`；`MessageKey` 由
    zh-CN 推导，en-US 用 `Record<MessageKey, string>` 强制完整；`error` 文案用映射类型（键为
    `error.${ErrorCode}`）强制覆盖 SPEC §18 全集；默认 zh-CN，语言选择与 `<html lang>` 同步并持久化到
    localStorage。
  - 主题：`ThemeProvider` 用 `useLayoutEffect` 在首帧前写 `data-theme`/`color-scheme`，支持
    light/dark/system 与系统变化订阅；`resolveTheme`/`applyTheme` 等纯函数放在 `@curve/ui`。
  - 文案门禁：`apps/desktop/test/ui-conventions.test.ts`（Node 工程）用 TypeScript AST 检查 JSX 文本与
    字符串/模板字面量无硬编码文案（注释豁免），并校验 shell CSS 无裸色值且只消费已声明令牌。
  - 工程：desktop 新增 `@curve/ui` 依赖与 tsconfig 引用；新增 `apps/desktop/tsconfig.test.json`（Node 侧
    渲染测试工程）；electron-vite renderer 增加 workspace 路径解析与 react/react-dom `dedupe`；ESLint 为
    `packages/ui` 打开浏览器 globals。
  - 验证结果：`pnpm verify` exit 0（ESLint 0 problem；depcruise 115 modules / 0 violations；38 files /
    228 tests）；`pnpm test:coverage` lines 95.89% / statements 96.02% / branches 86.76% / functions 100%
    （`@curve/ui` 行覆盖 92.33%）；`pnpm e2e`（`CURVE_E2E_NO_SANDBOX=1`）15 passed（T0.4 shell 6 +
    T0.3 IPC 4 + E1 5）；`pnpm dev` 日志 `window ready (mode=development, devTools=true, visible=true)`，
    dev 渲染器 0 console error、Node 全局不可用、开发 CSP 与 ADR-018 一致。

<a id="t05"></a>
### T0.5 CI、E2E 与提交门禁
- 状态：`[x]`
- 依赖：T0.3
- 覆盖：NFR-07、NFR-08
- 参考：TESTPLAN §1、§5
- 产出：
  - `.github/workflows/ci.yml`（Windows + Ubuntu：install/lint/typecheck/test/build）
  - `playwright.config.ts`、`apps/desktop/e2e/smoke.spec.ts`（启动 Electron、断言窗口标题）
  - 覆盖率阈值、`CHANGELOG.md` 模板、PR 模板
- 步骤：
  1. Playwright `_electron.launch` 启动构建产物。
  2. CI 缓存 pnpm；失败上传 trace。
  3. 覆盖率 gate 接入 Vitest。
- 验收：
  - [x] 干净克隆后 `pnpm install && pnpm verify && pnpm e2e` 全绿。
  - [x] E2E 失败时产出 trace/screenshot。
  - [x] 覆盖率低于阈值时 CI 失败。
- 验证：`pnpm verify && pnpm e2e`
- 实现备注（2026-10-20）：
  - `.github/workflows/ci.yml`：`quality` 任务在 `windows-latest` + `ubuntu-latest` 矩阵上跑
    `pnpm install --frozen-lockfile` → `pnpm lint` → `pnpm typecheck` → `pnpm test:coverage` → `pnpm build`，
    覆盖率阈值只来自 `vitest.config.ts`（低于阈值该 step 退出非零、任务失败，阈值未下调）；
    `e2e` 任务仅在 `windows-latest`（`needs: quality`）跑 `pnpm e2e`，失败时上传
    `apps/desktop/test-results` 与 `apps/desktop/playwright-report`（`retention-days: 7`）。
    pnpm 版本由 `packageManager` 固定、Node 24、pnpm store 由 `setup-node` 缓存；
    CI 不使用 `--no-sandbox` / `CURVE_E2E_NO_SANDBOX`（那是 agent shell 的逃生舱）。
  - `apps/desktop/playwright.config.ts`：`outputDir=./test-results`、`trace: 'retain-on-failure'`、
    `screenshot: 'only-on-failure'`、html reporter（`playwright-report`，不自动打开）、
    `forbidOnly`（CI 上禁止 `test.only`）。
  - `apps/desktop/e2e/fixtures.ts`：Electron 是用 `_electron.launch` 手动启动的，Playwright 内建的 trace 只记录
    test steps；fixture 为每个用例开 browser-context trace（DOM snapshot + screencast + console），
    仅在用例失败时保留并 attach 到报告。截图由内建的 `screenshot: 'only-on-failure'`（`test-failed-1.png`）负责；
    采集证据本身失败时只 attach 文本，不掩盖真实失败。
  - `.github/pull_request_template.md`：任务 ID、验证命令与真实结果、证据、风险/回滚、不可做清单自查。
  - **安装缺口修复**：`electron@44.9.0` 的 npm 包不再带 `postinstall`（只提供 `bin.install-electron`），
    干净克隆/CI 上 `pnpm install` 不会下载运行时，`pnpm e2e` 必然失败。新增根 `postinstall` →
    `scripts/install-electron.mjs`：已存在则跳过，缺失时调用 electron 自带 `install.js`，继承 stdio（兼容
    禁止管道的受限 shell），尊重 `ELECTRON_MIRROR`/`ELECTRON_CUSTOM_DIR`，下载失败以非零退出而不是静默跳过。
  - 失败路径实测：临时加一条必失败用例 → `test-results/<test>/test-failed-1.png`（46.5 kB）与
    `trace.zip`（内建 test trace，45.9 kB）+ `attachments/trace-*.zip`（完整 context trace，含
    `trace.network` 与 `screencast/*.jpeg`）均生成；删除临时用例后 15 条正式用例全绿，
    通过用例不残留任何 trace 目录（`retain-on-failure` 生效）。
  - 干净克隆验证（`D:\DSH_Work_Space\curve-studio-clean`，克隆提交 `1aefcdb`）：
    `pnpm install --frozen-lockfile` 13.1s（根 postinstall 解压运行时）→ `pnpm verify` 17.4s /
    38 files / 228 tests，depcruise 115 modules 0 violations → `pnpm e2e` 32.8s / 15 passed，
    三条命令均 exit 0（agent shell 内 E2E 需 `CURVE_E2E_NO_SANDBOX=1`）。

**M0 验收演示**：`pnpm dev` 打开窗口 → `pnpm verify` 全绿 → 故意违反依赖边界被 lint 拦截 → E2E smoke 通过。输出报告后停下。
（2026-10-20 已完成，报告：`docs/reports/m0/REPORT.md`；违规探针已撤销，未提交。）

---

<a id="m1"></a>
## M1 领域与持久化

<a id="t11"></a>
### T1.1 领域模型、Zod 与不变量
- 状态：`[x]`
- 依赖：T0.1
- 覆盖：FR-TBL-01、FR-WS-04
- 参考：SPEC §6
- 产出：
  - `packages/domain/src/{types,schemas,factories,invariants,coerce}.ts`
  - ID 工厂（`ws_/tbl_/col_/row_/cht_/viw_/sty_/rule_` + UUID）
  - 列类型解析/格式化基础函数（日期、数字、布尔、枚举）
  - 全部 Zod schema 与不变量检查
- 步骤：
  1. 按 SPEC §6 写类型；schema 与类型一一对应。
  2. 实现 `parseTableMeta`、`parseManifest`、`parseCell`、`assertInvariants`。
  3. 实现 `coerceCell(raw, column)`：空串/null/千分位/日期/布尔。
  4. 写正反例测试（每类至少 5 个）。
- 验收：
  - [x] 正例 round-trip；反例返回结构化 issue，不抛裸异常。
  - [x] 列 key/主键/行长度/枚举/精度不变量全部覆盖。
  - [x] `domain` 无任何 UI/IO import。
- 验证：`pnpm exec vitest run packages/domain --coverage`
- 实现备注（2026-10-20）：
  - 文件：`types.ts`（SPEC §6 全部类型）、`schemas.ts`（全部 Zod schema 与 `parseManifest`/`parseTableMeta`/
    `parseColumnDef`/`parseRow`/`parseCell`）、`factories.ts`（`<prefix>_<uuid>` ID 工厂 + `createTimestamp`）、
    `invariants.ts`（§6.6 全部不变量 + `assertInvariants`）、`coerce.ts`（§8.1 归一）、
    `format.ts`（数字/日期/布尔/枚举显示基线）、`limits.ts`（§2.2 上限常量）。
  - schema 与类型同步：实体 schema 显式标注 `z.ZodType<T>`，类型与 schema 不一致会直接编译失败；对象一律
    `strictObject`（未知字段视为格式漂移）；递归结构（filter/layout）用 `discriminatedUnion`，错误路径精确到
    字段（例如 `views[0].tableView.filter.children`）。
  - ID：写入一律 `<prefix>_<uuid>`（`crypto.randomUUID`，测试可注入 uuid）；读取放宽为
    `^<prefix>_[A-Za-z0-9][A-Za-z0-9_-]*$`，以兼容 SPEC §7.2 示例里的 `col_time`/`row_001`。
    该取舍只影响校验宽松度，未改变任何持久化格式。
  - 错误返回：解析一律返回 `{ ok:false, issues }`（`path` + SPEC §18 code：`E_TYPE`/`E_REQUIRED`/`E_ENUM`/
    `E_RANGE`/`E_DUPLICATE_KEY`/`E_VALIDATION`），不抛裸异常；`assertInvariants` 只在"打开或失败"场景抛 typed
    `E_WS_INVALID_MANIFEST`（带前 5 条 detail）。
  - 不变量：列 id/key 唯一、主键存在且为 text、行长度/单元格物理类型/主键非空且唯一/行 id 唯一、视图与图表引用、
    layout（≤4 pane、view 至多出现一次、activeViewId 合法）、columnOrder 恰好包含每列一次、widths/sort/filter 引用、
    用户样式 id 不得以 `builtin.` 开头、样式不可解析时 warning 回退；`rowCount` 只告警；issue 超过 100 条后截断。
  - `fieldTypeId`：未提供字段类型注册表时只给 warning（T6.1 接入真实注册表后再严格校验）；提供 resolver 时校验
    `storageType` 与列类型一致。
  - 覆盖率：`packages/domain/src/types.ts` 加入 Vitest 覆盖率 exclude（纯类型、零可执行语句，否则被计为 0% 并
    拉低 domain 包）。
  - 验证结果：`pnpm verify` exit 0（ESLint 0 problem；depcruise 127 modules / 288 dependencies / 0 violations；
    43 files / 302 tests）；`pnpm test:coverage` exit 0，domain 包 lines **97.63%** / branches 92.24% /
    functions 98.92%，全局 lines 96.56% / branches 89.11%；`pnpm format:check` exit 0。

<a id="t12"></a>
### T1.2 工作区仓库与原子持久化
- 状态：`[x]`
- 依赖：T1.1、T0.3
- 覆盖：FR-WS-01、FR-WS-04
- 参考：SPEC §7
- 产出：
  - `packages/persistence`：`WorkspaceStore` 端口 + `MemoryWorkspaceStore`
  - main：`FileWorkspaceStore`（`write-file-atomic`、备份、锁、最近列表）
  - IPC：`workspace:create/open/close/recent`、`manifest:write`
- 步骤：
  1. 定义端口（create/open/readTable/writeTable/writeManifest/trash/listBackups/restore）。
  2. 实现目录创建、manifest 读写、`.lock` 生命周期、备份轮转。
  3. 路径白名单与 `realpath` 校验。
  4. 最近列表存 `userData/recent.json`（路径、名称、最后打开时间）。
- 验收：
  - [x] 新建目录结构完全符合 SPEC §7.1。
  - [x] 写入后强杀进程，文件不半写（模拟：写入前中断）。
  - [x] manifest 损坏返回 `E_WS_INVALID_MANIFEST`，不覆盖原文件。
  - [x] `../` 路径逃逸返回 `E_PATH_DENIED`。
  - [x] 备份保留 3 份，恢复可用。
- 验证：`pnpm exec vitest run packages/persistence apps/desktop && pnpm e2e -- --grep "workspace"`
- 实现备注（2026-10-20）：
  - 决策：ADR-019（`write-file-atomic` 8.0.0）、ADR-020（`workspace:create` 的 `dir` 为父目录 +
    清洗名称 + `.cstudio`）、ADR-021（备份命名/轮转）；SPEC §7.1、§7.4、§7.5、§9.0、§15.1 已同步。
  - `packages/persistence`：`types.ts`（`WorkspaceStore` 端口：create/open/close/readTable/writeTable/
    writeManifest/trash/listBackups/restore）、`layout.ts`（§7.1 布局常量、名称清洗、相对路径校验）、
    `backup.ts`（紧凑 UTC 时间戳、3 份轮转、7 天清理、备份路径解析）、`manifest.ts`（空 manifest、
    先读 `formatVersion` 再 Zod + 不变量、序列化）、`memory-workspace-store.ts`；无 Electron/Node 内置模块。
  - `apps/desktop/src/main/workspace`：`file-workspace-store.ts`（realpath 白名单、原子写、表/manifest
    备份、`.lock`、`.trash`、最近列表）、`path-safety.ts`、`lock-file.ts`、`recent-list.ts`、`atomic-write.ts`。
    manifest 先校验后写；损坏 manifest 只读不覆盖；高版本返回 `E_WS_VERSION_UNSUPPORTED`。
  - IPC：新增 `workspace:create/open/close/recent`、`manifest:write`（`IMPLEMENTED_IPC_CHANNELS` 共 7 个）；
    preload 只加白名单方法；renderer `api-client` 双向校验。`workspace:recent:remove/clear` 仍未注册。
  - E2E：`apps/desktop/e2e/workspace.spec.ts` 4 条（§7.1 布局 + open/recent/close、损坏 manifest 不覆盖、
    未来版本拒绝、`manifest:write`）。
  - 测试：`pnpm verify` exit 0；ESLint 0 problem；depcruise 148 modules / 381 dependencies / 0 violations；
    **51 files / 417 tests**；`pnpm test:coverage` exit 0，persistence lines **95.68%**（全局 lines 92.86%）；
    `pnpm e2e -- --grep "workspace"` 19 passed（含 workspace 4 条；直接 `playwright --grep workspace`
    4 passed）；`pnpm format:check` exit 0。
  - 覆盖：原子写中断（注入 writer 失败后旧文件不变）、损坏 manifest、高版本、`../`/非法 table id →
    `E_PATH_DENIED`、备份 3 份与恢复、锁 stale/active/corrupt、最近列表去重/上限/损坏降级、7 天清理。
  - 残留：`app.requestSingleInstanceLock()` 仍未实现（SPEC §7.5，HANDOFF §6.5 已记录）；应用退出时
    未主动 `closeAll`，正常 `workspace:close` 会删除 `.lock`。

<a id="t13"></a>
### T1.3 表数据 JSONL 读写与 Worker
- 状态：`[x]`
- 依赖：T1.2
- 覆盖：FR-TBL-04、FR-TBL-07
- 参考：SPEC §7.3、§7.4、§8
- 产出：
  - `packages/table-engine`：JSONL 编解码、行集类型、Worker 协议
  - `apps/desktop/src/renderer/workers/table.worker.ts`
  - IPC：`table:read/write/trash`，大小与行数限制
  - 脏表追踪与 `rowCount` 重算
- 步骤：
  1. 编码器逐行 `JSON.stringify`，流式拼接，避免一次性大数组。
  2. 解码器逐行解析，错误带行号；空文件返回空表。
  3. Worker 接收文本 → 解析 → 返回 rows/issues；主线程不阻塞。
  4. 写盘前校验行数/字节上限。
- 验收：
  - [x] 100k×10 行 round-trip 数据逐行相等。
  - [x] 坏行（截断 JSON）返回 `E_TABLE_PARSE` + 行号，不吞行。
  - [x] 空表写 0 字节、读回 0 行。
  - [x] 内存峰值不超预算（`table.decode.100k` 实测 328.6MB ≤ 600MB，见 SPEC §16.1 / TESTPLAN §5.1）。
- 验证：`pnpm exec vitest run packages/table-engine && pnpm bench -- --table-io`

<a id="t14"></a>
### T1.4 迁移框架与夹具
- 状态：`[x]`
- 依赖：T1.3
- 覆盖：FR-WS-04、FR-TBL-08
- 参考：SPEC §7.6
- 产出：
  - `packages/domain/src/migrations/`：注册表、执行器、结果类型
  - 迁移前备份、失败回滚
  - `fixtures/workspaces/v1-min/` 夹具与逐行等价测试
- 步骤：
  1. 定义 `Migration { from, to, migrate(manifest, tables) }`。
  2. 顺序执行，禁止跳版；每步后校验不变量。
  3. 失败时恢复备份并返回 `E_MIGRATION_FAILED`。
  4. 用夹具模拟 v1 → 测试迁移（可造一个测试专用 v0）。
- 验收：
  - [x] 夹具打开成功，行数与内容逐行相等。
  - [x] `formatVersion: 2` 被拒绝并提示升级。
  - [x] 迁移失败后原文件哈希不变。
  - [x] 备份目录存在且可回滚。
- 验证：`pnpm exec vitest run packages/domain --testNamePattern "migration" && pnpm verify`

<a id="t15"></a>
### T1.5 app-core 状态与命令总线骨架
- 状态：`[x]`
- 依赖：T1.1、T1.2、T1.3、T0.2
- 覆盖：FR-WS-01、FR-TBL-02
- 参考：SPEC §13.1
- 产出：
  - `packages/app-core`：Zustand store 切片（workspace/tables/views/ui）
  - 命令注册表、`dispatch`、Immer patches 捕获、错误 surface
  - 启动序列：打开工作区 → 读 manifest → 加载表 → 恢复布局
  - 选择器：当前表、可见行、脏表列表
- 步骤：
  1. 定义 `AppState` 与 actions；大数组放表切片，避免全局重渲染。
  2. 命令 `(state, payload) => { next, patches, inversePatches }`。
  3. 先实现 `table.cell.set`、`workspace.open` 两个命令验证链路。
  4. 错误统一进 `ui.error` + 日志。
- 验收：
  - [x] 打开夹具工作区，表数据进入 store，选择器正确。
  - [x] 命令 dispatch 产生可逆 patches；失败不改状态。
  - [x] `app-core` 无 React/Electron import。
  - [x] 100k 行加载后首屏选择器调用 < 16ms（memo 命中）。
- 验证：`pnpm exec vitest run packages/app-core`

**M1 验收演示**：脚本/测试创建 `Demo.cstudio` → 写入 1,000 行 → 关闭重开 → 数据逐行相等；篡改 manifest → 报错且原文件不变；伪造 `.lock` → 走恢复提示。输出报告后停下。
（2026-10-21 已执行并获用户接受；报告：`docs/reports/m1/REPORT.md`；验收测试：`apps/desktop/src/main/workspace/m1-acceptance.test.ts`。三条演示全部通过；SPEC §7.5 的完整恢复交互按 ADR-026 后置到 T5.3，T2.1 只呈现 warning。T2.1 开工前仍需逐项确认 HANDOFF §7.5 的决策。）

---

<a id="m2"></a>
## M2 表格数据

<a id="t21"></a>
### T2.1 工作区入口、表管理与虚拟化数据网格
- 状态：`[x]`
- 依赖：T1.5、T0.4
- 覆盖：FR-WS-01、FR-WS-02、FR-TBL-01、FR-TBL-02、FR-TBL-07
- 参考：SPEC §9.0、§9.1
- 产出：
  - 欢迎页：新建/打开/最近打开；无工作区时不显示网格
  - 表列表：新建表向导（名称 + 主键）、重命名、删除（`.trash`）、打开
  - 基础标签栏：打开表创建/激活 `ViewDef`；关闭标签
  - `apps/desktop/src/renderer/features/grid/`：Grid、Header、Cell、SelectionLayer
  - TanStack Table + Virtual；列宽拖拽、冻结列、矩形选择、键盘导航
  - ARIA grid 语义与焦点管理
- 步骤：
  1. 欢迎页接 `workspace.create/open/recent`；新建默认目录 `Documents/Curve Studio/`。
  2. 新建表向导创建 `TableMeta`（默认主键 `id` text）并打开视图。
  3. 用 `TableMeta.columns` 建列定义；`Row.values` 建数据；虚拟化 + sticky 冻结列。
  4. 键盘状态机：移动/选择/编辑入口；标签栏支持 Ctrl/Cmd+W 关闭。
  5. 大表用 `React.memo` 单元格，避免整表刷新。
- 验收：
  - [x] 无工作区时欢迎页可用；新建/打开/最近三条路径都能进入网格。
  - [x] 新建表（默认主键）→ 重命名 → 删除进 `.trash` → 重新打开，行为正确。
  - [x] 删除被图表/视图引用的表：确认框列出数量，确认后引用一并删除，无悬挂引用。
  - [x] 打开同一张表两次只激活已有标签，不重复创建。
  - [x] 100k 行首帧 < 1s；滚动 ≥ 55fps（基准脚本/手工）。
  - [x] 方向键/Tab/Home/End/PageUp/PageDown 行为正确。
  - [x] 列宽拖拽与双击自适应生效，刷新后保留。
  - [x] 屏幕阅读器可读出行列数（axe 无 critical）。
- 验证：`pnpm exec vitest run apps/desktop -- --grep "grid|welcome" && pnpm e2e -- --grep "grid|workspace"`
- 实现备注（2026-10-21，ADR-027）：
  - 决策（用户逐项确认）：新增 `table.create`/`table.delete` 同步命令；结构性操作后立即写 manifest；
    新表只写 manifest 条目不落 0 字节文件；实现 `dialog:pickDirectory` 且默认父目录
    `Documents/Curve Studio`；删除用 Dialog 列数量后一条命令级联；`openWorkspace` 注入 Worker 异步
    解码端口；TanStack Table v8 + Virtual v3；`workspace:recent:remove/clear` 后置 T5.3。
  - app-core：`commands/layout.ts`、`commands/tables.ts`、`commands/views.ts`、
    `usecases/workspace-actions.ts`（`stateToManifest`/`countTableReferences`）、`openWorkspace.decodeTable`；
    新增 22 条单测（表命令 7、视图命令 7、actions 6；异步解码 2 条并入 open use case 测试）。
  - renderer：`app-core/{renderer-core,use-app-core,use-workspace-controller,workspace-store}.ts(x)`、
    `features/workspace/{WelcomePage,NewWorkspaceDialog,OpenWorkspaceDialog,TabBar,WorkspaceView}.tsx`、
    `features/tables/{TableList,NewTableDialog,RenameTableDialog,DeleteTableDialog}.tsx`、
    `features/grid/{DataGrid,GridHeader,GridCell,SelectionLayer,grid-navigation,grid-sizing}.ts(x)`；
    全部文案进 zh-CN/en-US 消息表。
  - main/IPC：`dialog:pickDirectory` handler/preload/api-client/E2E 替身；`app:info.documentsDir`；
    `table:trash` 改为按 id 解析文件（支持“manifest 先写、文件后移”的删除顺序）；
    `electron.vite.config.ts` 删除显式 `table-worker` 入口，Vite 产出
    `assets/table.worker-<hash>.js`（E2E 断言同步）。
  - E2E：`apps/desktop/e2e/grid.spec.ts` 8 条（欢迎页新建/打开/最近、表 CRUD+`.trash`+重开、
    目录选择与错误路径、级联计数、警告提示、ARIA/键盘/矩形选择 + axe、列宽拖拽/自适应/重开、
    200% 缩放、100k 首帧与滚动帧率）。
  - 实测：100k 首帧 **405ms**；滚动采样 **165.7fps**（Electron rAF 采样，未锁定显示器刷新率）；
    `pnpm verify` **72 files / 594 tests**；depcruise **220 modules / 737 deps / 0 violations**；
    `pnpm test:coverage` 全局 lines **81.57%**（新增 UI 代码拉低，阈值 70% 仍满足）；
    `pnpm e2e` **30 passed**。
  - 残留：`workspace:recent:remove/clear` 与恢复对话框按 ADR-026/027 后置 T5.3；100k 滚动帧率仍是
    合成 rAF 采样，T2.7 用正式 bench 固化；Grid 只读，编辑在 T2.2。

<a id="t22"></a>
### T2.2 单元格编辑与校验
- 状态：`[x]`
- 依赖：T2.1
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
  - [x] 5 种类型均可编辑；非法值不落库且错误可读。
  - [x] 主键重复被阻止并定位冲突行。
  - [x] 编辑一次 = 一条撤销记录（800ms 合并）。
  - [x] 纯键盘可完成"改一格"。
- 验证：`pnpm verify && pnpm test:coverage && pnpm e2e`（E2E 包含 `edit.spec.ts`）
- 实现备注（2026-10-21，ADR-028）：
  - 开工前用户逐项确认 8 个决策：每次提交后异步保存；`table.cell.set` 最小撤销栈（800ms 合并、
    Ctrl/Cmd+Z、Shift+Z/Cmd+Y、上限 100）；新增行留给 T2.4/T2.5；结构化 `CellIssue` + `t(key)`；
    主键冲突显示行号并滚动/高亮；F2 + 双击 + 直接输入；date/boolean/enum 用原生控件；状态栏三态 +
    `validateCellBatch` 纯函数。
  - app-core：`validation/cell-issue.ts`、`validation/cell-validation.ts`、`history/edit-history.ts`、
    `usecases/save-queue.ts`、`state/manifest.ts`；`ui` 增加 `save`/`editIssue`；`WorkspaceActions`
    增加 `updateCell/undo/redo/retrySave/flushSaves`；`CommandBusOptions.onCommand`；renderer 注入
    `encodeTable`；打开/关闭工作区清理历史与保存状态。
  - renderer：`features/grid/editors/*`（Text/Number/Date/Boolean/Enum + `CellEditor`）、
    `use-cell-editing.ts`、`cell-issue-text.ts`；`GridCell` 支持编辑器/错误/冲突高亮，`DataGrid` 用
    `rangeExtractor` 保留编辑行；`WorkspaceView` 接入 Ctrl/Cmd+Z/Y/S；`StatusBar` 增加保存三态、
    错误定位与重试；全部文案进 zh-CN/en-US。
  - 保存：每次成功提交后 Worker encode → `table:write` → `manifest:write`，按表串行并合并待写；
    失败保留 dirty 并显示可重试错误；关闭工作区前 flush ≤3s。
  - 测试：app-core 新增 cell-validation/edit-history/save-queue/updateCell/close-flush 用例；renderer
    新增 editor-value、CellEditor、cell-issue-text 组件测试；`e2e/edit.spec.ts` 3 条（五类型 + 重开、
    非法值/必填/主键冲突定位、F2/Enter/Tab/Esc + 撤销重做）。
  - 实测：`pnpm verify` **78 files / 638 tests**，depcruise **242 modules / 851 deps / 0 violations**；
    `pnpm test:coverage` 全局 lines **77.73%**（新增 UI 拉低，阈值 70/60 未下调）；`pnpm format:check`
    通过；`pnpm e2e` **33 passed**；`pnpm build` exit 0（renderer 1,164.07 kB）。
  - 残留：新增行/空主键自动生成留 T2.4/T2.5；完整撤销栈与菜单留 T5.2；1.5s 自动保存/崩溃恢复留
    T5.3；日期编辑器只编辑日期，带时刻值提交后归一为本地午夜（ADR-028）；批量校验暂无 UI。

<a id="t23"></a>
### T2.3 列管理、结构变更与迁移
- 状态：`[x]`
- 依赖：T2.1、T1.4
- 覆盖：FR-TBL-01、FR-TBL-08
- 参考：SPEC §6.6、§7.6
- 产出：
  - 列管理面板：新增/编辑/删除/重排/改类型/角色/枚举/主键
  - 结构变更命令 + 行数据迁移（补 null、类型转换、失败回滚）
  - 破坏性操作二次确认（删列/改类型/换主键）
- 步骤：
  1. 新增列默认 `text/role=none`，可改。
  2. 改类型：逐行尝试转换，失败列出前 100 行让用户确认。
  3. 删列：确认后从 rows 删除对应下标；图表引用进入错误态。
  4. 改主键：校验唯一非空后提交。
- 验收：
  - [x] 加列后旧行补 `null`，行数不变。
  - [x] 改类型成功/失败路径都有测试，失败不改数据。
  - [x] 删列后清理 `columnOrder/widths/sort/filter`，重新加载不变量通过；`columnOverrides` 按 ADR-029
        保留（SPEC §6.6.7 允许跨表模板引用缺失列），由单测证明未被改动。
  - [x] 删列后图表显示"列已删除"错误态，不崩溃。
  - [x] 100 列上限生效。
- 验证：`pnpm exec vitest run packages/domain packages/table-engine -- --grep "column" && pnpm e2e -- --grep "schema"`
- 实现备注（2026-10-21，ADR-029）：
  - 开工前用户逐项确认 10 项决策：不升 `formatVersion`/不接迁移；改类型失败整批取消并列前 100 行；删列
    清理视图状态但保留图表/样式引用；图表做到数据层 + 最小只读占位；共用确认框同步执行；100 列命令
    硬拒绝 + UI 禁用；面板放右侧 Inspector；重排改表结构并同步所有视图；结构命令不接撤销历史；列编辑
    覆盖完整 `ColumnDef`、宽度仍由视图管理。
  - domain：`column-ops.ts` 新增 `planColumnAdd/Update/Delete/Reorder/PrimaryKeyChange`；逐行
    `coerceCell`/`parseCell`、前 100 条 `ColumnChangeFailure`、schema 经 `checkTable` 复核；空值保持
    `null`，主键列必须 text。
  - app-core：`commands/columns.ts`、`commands/column-views.ts`（filter 递归裁剪、冻结计数、视图顺序）、
    `validation/column-draft.ts`（字段级表单校验）、`validation/column-change.ts`（确认框预览与图表失效计数）、
    `state/chart-validity.ts`；`table.meta.update` 增加 `primaryKey`；actions 增加
    `inspectColumnChange/addColumn/updateColumn/deleteColumn/reorderColumns/changePrimaryKey`。改变行数据的
    命令走保存队列（表 → manifest），只改 schema 的命令只写 manifest；保存失败返回 `committed: true`。
  - renderer：`features/columns/{ColumnsPanel,ColumnFormDialog,ColumnChangeDialog,column-form,column-error-text}`、
    `features/charts/ChartPlaceholder.tsx`；Inspector 接入列面板；WorkspaceView 接入 chart 占位；文案进
    zh-CN/en-US；CSS 只用 `--cs-*` 令牌。
  - 测试：domain 22 条、app-core 命令/视图/校验/预览/actions 共 56 条、renderer 17 条；`e2e/schema.spec.ts`
    8 条（增列补 null/重开、改类型成功、失败字节不变、删列+图表错误态+重开、换主键成功/失败、100 列禁用、
    200% 缩放键盘可达）。
  - 实测：`pnpm verify` **89 files / 733 tests**，depcruise **265 modules / 968 deps / 0 violations**；
    `pnpm test:coverage` 全局 lines **77.83%** / statements 77.58% / branches 69.49% / functions 78.78%
    （domain `column-ops.ts` lines 94.76%）；`pnpm format:check` 通过；`pnpm build` exit 0
    （renderer 1,246.01 kB）；`pnpm e2e` **41 passed**。
  - 残留：结构变更不可撤销（T5.2 统一历史）；100k 行改类型/重排为同步执行、无进度/取消（T2.7 复核）；
    图表完整渲染/重映射留 T3.1；视图级自定义列顺序留 T2.6；`.trash`/备份恢复 UI 仍按 T5.3。

<a id="t24"></a>
### T2.4 区域粘贴
- 状态：`[x]`
- 依赖：T2.2
- 覆盖：FR-TBL-03
- 参考：SPEC §9.3
- 产出：
  - 剪贴板 TSV/CSV 解析器（引号、换行、制表符）
  - 矩阵应用：扩容行、列确认、批量校验
  - 进度与取消（≥10k 单元格）
- 步骤：
  1. 单格文本 vs 多格矩阵判定。
  2. 解析为 `Cell[][]`，按目标列类型 coerce。
  3. 超出列数弹确认；超出行数自动追加。
  4. 整批校验通过才提交，作为一条命令。
- 验收：
  - [x] Excel 5×4 粘贴内容逐格正确，含引号与换行。
  - [x] 类型错误整批不提交，错误定位到单元格（前 100 条 + 定位首个错误）。
  - [x] 10k 单元格粘贴可取消，取消后数据不变。
  - [x] 筛选激活时粘贴整批拒绝，隐藏行不被修改；完整“只写可见行/超出可见行整批拒绝”
        语义按 ADR-030 延后 T2.6（用户已确认，T2.6 必须闭环）。
  - [x] 粘贴可一次撤销。
- 验证：`pnpm exec vitest run packages/table-engine packages/app-core --testNamePattern "paste"`；
  `pnpm verify`；`pnpm test:coverage`；`pnpm format:check`；`pnpm build`；
  `pnpm exec playwright test --config apps/desktop/playwright.config.ts e2e/paste.spec.ts`；`pnpm e2e`。
- 实现备注（2026-10-22，ADR-030）：
  - 开工前用户逐项确认 11 项决策：TSV 优先/单列含逗号回退 CSV 且无新 IPC；选择矩形左上角锚点、
    rowId 定位；筛选存在时保守整批拒绝并把可见行语义延后 T2.6；实现 `table.rows.insert` 与空
    text 主键生成、不加独立新增行 UI；单条原子 `table.paste` 携带 `newColumns`，100 列硬上限；
    整批预检前 100 条 + 定位首错、不支持对话框内编辑；≥10,000 格可取消进度、async 分块、不引入
    Worker；粘贴接入最小历史一次一条；保存走 T2.2 队列并 flush ≤3s；10k 端到端 P95 ≤1s 软预算；
    不做区域复制。
  - table-engine：`src/paste.ts` 的 `parseClipboardText`（TSV/CSV、引号/`""`/内嵌换行、CRLF、BOM、
    单尾随换行、矩形化、未闭合引号 `E_IMPORT_FORMAT`）。
  - app-core：`commands/{paste,rows}.ts`、`validation/{paste-plan,paste-columns}.ts`；`PastePlanner`
    分块 + `planPaste` 同步；新增 `PasteIssue`（矩阵坐标）、`PasteSummary`、`createPasteColumns`；
    `WorkspaceActions.preparePaste/applyPaste`；`EditHistory` 记录 `table.paste`（一次一条）；
    `changedTableId` 把 `table.paste`/`table.rows.insert` 纳入保存队列。
  - renderer：`features/paste/{PasteColumnsDialog,PasteErrorDialog,PasteProgressDialog,use-paste,
    paste-issue-text}.tsx`；`DataGrid` 增加 `onPaste`、选择矩形锚点与 locate 高亮，并修复虚拟行
    未挂载时键盘焦点丢失（100ms 安全重试，编辑器打开时不抢焦点）；`GridCell` 增加
    `--paste-error` 高亮；i18n zh-CN/en-US 与 `styles.css` 同步。
  - 测试：table-engine 14 条、app-core paste-plan 18 条 + paste-columns 6 条 + rows 3 条 + paste
    6 条 + history 3 条 + actions 12 条、renderer 17 条、`e2e/paste.spec.ts` 7 条（5×4 引号/换行+
    重开、类型错误+定位+磁盘不变、超列确认+新列+重开、10k 格取消、撤销/重做、筛选守卫、200%
    缩放键盘可达）。
  - 实测：`pnpm verify` **99 files / 813 tests**；depcruise **286 modules / 1073 deps / 0 violations**；
    `pnpm test:coverage` 全局 lines **76.34%** / statements 76.17% / branches 68.45% / functions 77.92%
    （阈值 70/60 未下调）；`pnpm format:check` 通过；`pnpm build` exit 0（renderer **1,308.67 kB**）；
    `pnpm e2e` **48 passed**；`e2e/paste.spec.ts` **7 passed**；10k parse+plan 本机 P95 **7.75ms**。
  - 残留：筛选视图只能整批拒绝，完整可见行语义 T2.6；独立“新增行”按钮/快捷键仍未实现（E3 的
    键盘新增一行留给后续任务）；10 万级矩阵命令阶段仍同步，T2.7 评估 Worker/预算；256MB 写盘上限
    在保存时强制（`committed: true`），未在 dispatch 前编码整表；区域复制未实现。

<a id="t25"></a>
### T2.5 CSV/JSON 导入向导
- 状态：`[x]`
- 依赖：T2.2、T1.3
- 覆盖：FR-TBL-04、FR-TBL-06
- 参考：SPEC §9.4
- 产出：
  - 导入向导 5 步 UI；编码/分隔符/表头覆盖
  - Worker 解析（Papa Parse + 平台 TextDecoder；不引入 jschardet/iconv-lite 运行时依赖）
  - 列映射与类型推断；错误报告导出
  - 追加/替换（替换前备份）；原始文件副本
- 步骤：
  1. 读文件文本（IPC），Worker 嗅探编码/分隔符。
  2. 预览 20 行；列映射到已有列或新建列。
  3. 全量解析 + 校验；展示 stats/issues。
  4. 提交：构建新 rows + JSONL，原子替换；替换前备份。
- 验收：
  - [x] 100k 行 CSV ≤ 8s，UI 不冻结。
  - [x] GBK 文件正确解码；错编码有提示可覆盖。
  - [x] 坏行报告行号；跳过/取消行为符合 SPEC。
  - [x] 取消后内存与磁盘数据完全不变。
  - [x] 导入后单表超过 200,000 行被拒绝；100k–200k 先提示再继续。
- 验证：`pnpm e2e -- --grep "import" && pnpm bench -- --import`
- 实现备注（2026-10-22，ADR-031）：
  - 12 项决策全部由用户确认，详见 ADR-031：`file:importText` 返回 bytes + token；Worker
    严格 UTF-8 → GB18030 + 手动覆盖；Papa Parse；自动嗅探/表头启发式；当前表内映射；1000 行
    抽样推断（<80% text）；坏行整行跳过/取消 + 按坏行聚合的错误 CSV；替换二次确认 + 现有
    旧表备份 + `imports/` 原文/sidecar hash；专用 Worker、取消即 terminate；最终行数
    >200k 拒绝、>100k 确认；保存队列 flush ≤3s；导入一条撤销；小夹具提交、100k 脚本生成。
  - table-engine：`src/import.ts`（`sniffCsv`/`parseCsv`/`parseJson`/`buildImportColumns`/
    `inferColumnType`/`planImport`/`ImportIssue`/`ImportPlan`）与 22 条测试；新增
    `papaparse` 运行时依赖。
  - app-core：`table.import` 命令、`applyImport` action、`import-planning.ts`（
    `createImportColumns`/`autoMapImportColumns`）、历史与保存队列接入；命令 7 条、planning
    5 条、actions 3 条测试。
  - desktop：`main/import/*`、`FileWorkspaceStore.archiveImport`、`file:importText`/
    `file:exportText`/`file:archiveImport` 通道、renderer `import/*` Worker/client/encoding、
    `features/import/*` 五步向导、TableList 入口、i18n/CSS；`e2e/import.spec.ts` 6 条。
  - 夹具：`fixtures/csv/{small,quoted,types,bad-rows}.csv`、`fixtures/json/points.json` 与
    README；`fixtures/csv/gbk-100k.csv` 由 `scripts/gen-100k.ts` 生成并 gitignore。
  - 实测：`pnpm verify` **111 files / 880 tests**；depcruise **319 modules / 1213 deps /
    0 violations**；`pnpm test:coverage` 全局 lines **74.12%** / statements 74.06% / branches
    66.03% / functions 76.11%（阈值未下调）；`pnpm format:check` 通过；`pnpm build` exit 0
    （renderer **1,339.13 kB** + 懒加载 ImportSession 42.82 kB；import worker 266.08 kB）；
    `pnpm e2e` **54 passed**；`e2e/import.spec.ts` **6 passed**；`pnpm bench -- --import`
    P50 **645ms** / P95 **659ms**（预算 8s）。
  - 残留：命令阶段仍同步执行 100k 行校验/行构建；100k 逆补丁内存上限留 T5.2；>50MB 原文只
    记录路径/hash、不复制；替换备份复用 `writeTable`，没有独立快照；错误 CSV 按坏行聚合，
    机器消费需拆分 `codes/messages`；JSON 嵌套对象/数组不支持；`file:archiveImport` 为 T2.5
    新增通道（18→19 声明、11→14 已实现）。

<a id="t26"></a>
### T2.6 筛选、排序与视图状态
- 状态：`[x]`
- 依赖：T2.1
- 覆盖：FR-TBL-05
- 参考：SPEC §9.5、§6.2
- 产出：
  - 筛选器构建器（all/any、12 种操作符）
  - 多列排序（3 级）；空值排最后；`Intl.Collator`
  - 视图状态持久化；多表格视图（不同筛选/样式）
  - 大表在 Worker 查询
- 步骤：
  1. 纯函数 `applyFilter(rows, predicate)`、`applySort(rows, sort)`。
  2. UI 状态写入 `TableViewState`，自动保存。
  3. >20k 行走 Worker，返回行 ID 顺序。
- 验收：
  - [x] 12 种操作符全部单测覆盖；空值排序固定最后。
  - [x] 100k 行筛选+排序 ≤ 400ms。
  - [x] 重启后筛选/排序/列宽/隐藏/冻结恢复。
  - [x] 同一张表两个视图互不影响。
  - [x] 承接 T2.4 延后项：筛选激活时粘贴只写可见行，矩阵超出可见行数整批拒绝，隐藏行不被修改
        （ADR-030）。
- 验证：`pnpm exec vitest run packages/table-engine -- --grep "filter|sort" && pnpm bench -- --query`
- 实现备注（2026-10-23，ADR-032）：
  - 开工前用户逐项确认 12 项：工具条 + 筛选对话框；单层 all/any（≤20）；按类型操作符白名单；
    文本大小写不敏感/空串按 null/between 含边界；表头点击 + Shift 三级排序；空值最后 +
    UI locale collator + 稳定排序；每个确认动作立即写 manifest、不进撤销；TabBar 复制当前视图；
    Inspector 隐藏列 + 已隐藏列表；专用 query Worker + 行快照/增量缓存（≤20k 主线程，>20k Worker，
    失败回退）；粘贴按可见行写入、超出整批拒绝；bench query.100k + E2E Worker 计时。
  - table-engine：`src/query.ts`（12 操作符、all/any、排序/校验、自然键快速路径）、
    `src/query-protocol.ts`（sync/query 消息与守卫），`MAX_SORT_LEVELS=3` 落在 domain。
  - app-core：`validation/filter-builder.ts`（UI 草稿 → 谓词）、`validation/view-state.ts`
    （筛选/排序/隐藏校验）、`commands/view-copy.ts` + `duplicateView`、`table.paste` 的
    `rowIds/viewId` 可见行与 stale 检查；视图状态仍走 `view.update` + manifest。
  - desktop：`renderer/query/{client,handler}`、`workers/query.worker.ts`、`features/filter/FilterDialog`、
    `features/grid/{grid-sort,use-view-rows}`，DataGrid/GridHeader/ColumnsPanel/TabBar/WorkspaceView、
    i18n/CSS 同步；`e2e/filter.spec.ts` 6 条（筛选/三级排序、重开恢复、双视图、隐藏列、100k Worker、
    200% 缩放），并改写 T2.4 的筛选粘贴 E2E 为“只写可见行 + 超出拒绝”。
  - 实测：`pnpm verify` **122 files / 967 tests**；depcruise **342 modules / 1309 deps / 0 violations**；
    `pnpm test:coverage` 全局 lines **75.00%** / statements 74.87% / branches 66.81% /
    functions 76.03%（阈值 70/60 未下调）；`pnpm format:check` 通过；`pnpm build` exit 0
    （renderer 约 1.41MB；query.worker 约 225kB）；`pnpm e2e` **60 passed**；
    `pnpm bench -- --query` `query.100k` P95 **34ms**、`query.text-sort.100k` P95 **347ms**（预算 400ms）。
  - 残留：筛选对话框只编辑单层条件（嵌套谓词只读）；100k 中文排序/极端值仍可能接近预算；
    查询 Worker 缓存最多 4 张表；视图状态连续拖动列宽会多次写 manifest（T5.3 统一）；
    10 万级粘贴/导入命令阶段仍同步（T2.7 评估）。

<a id="t27"></a>
### T2.7 10 万行性能硬化
- 状态：`[x]`
- 依赖：T2.1–T2.6
- 覆盖：FR-TBL-07、NFR-01
- 参考：SPEC §16.1
- 产出：
  - `scripts/bench.ts` + 固定 100k 夹具生成器
  - 性能报告（P50/P95、内存、帧率）
  - 瓶颈修复：memo、虚拟化、Worker、序列化
- 步骤：
  1. 生成 100k×10 夹具，跑打开/滚动/编辑/筛选/保存。
  2. 记录基线；逐项优化并复测。
  3. 把预算写入 CI（软门禁 + 报告）。
- 验收：
  - [x] 打开 ≤3s、排序 ≤400ms、编辑提交 ≤50ms、保存 ≤500ms。
  - [x] 内存峰值 ≤600MB。
  - [x] 报告提交到 `bench/report.json`（CI artifact）。
  - [x] 回归超过 20% 时 CI 报警。
- 验证：`pnpm bench`
- 实现备注（2026-10-23，ADR-033）：
  - 开工前用户逐项确认 7 项：CI 预算硬失败 + 20% 回归软告警（基线由 CI Windows runner
    生成后提交）；bench 采打开/保存/编辑/筛选排序/导入 + E2E 采冷启动/首帧/滚动/内存；
    夹具共享 `scripts/gen-100k.ts`、临时目录不提交；内存 600MB 用 E2E
    `app.getAppMetrics()`（main+renderer+worker，不含 GPU）门禁、bench 峰值只作趋势；
    中文排序先优化、仍超再确认预算；优化范围限实现级 + Worker 内部；M2 验收另写一条 E2E spec
    （本次不执行）。实测中文 644ms 后用户确认 CJK 单列 800ms 预算。
  - 三处优化：`table.cell.set` 用 base 状态校验 + 冻结新行数组（Immer 不再遍历 100k 数组），
    提交 P95 409ms → 1ms；排序计划预计算 `nulls`/`keys`/`Float64Array` 等，
    `query.100k` 447ms → 238ms、ASCII 文本排序 516ms → 338ms；筛选谓词缓存列下标与
    规范化比较值；非 ASCII 文本改用参考 `numeric:true` collator（CJK 1.1s → 644ms）。
  - bench：`scripts/bench-report.ts`（报告/基线/回归，单测）、`scripts/tsconfig.json`（纳入
    typecheck）、`node --expose-gc --import tsx`、suite 间 GC、`--write-baseline`。
  - E2E：`apps/desktop/e2e/perf.spec.ts` 3 条（冷启动 ≤2.5s、100k 打开 ≤3s、
    整应用内存 ≤600MB + `data-query-total-ms` 趋势）；`fixtures.ts` 暴露
    `appLaunch.launchStartedAt`；`main.tsx`/`use-workspace-controller`/`WorkspaceView`
    增加 `curve:app-ready`、`curve:open` 打点；`DataGrid` 增加 `data-query-total-ms`。
  - 内存口径：`app.getAppMetrics().memory.privateBytes` 汇总 main + renderer + utility
    （不含 GPU）；`workingSetSize` 会重复计算共享页，只作诊断。主进程打开路径也做了两处
    减法：行数重算按 `0x0A` 字节计数、`readTable` 直接读 UTF-8 字符串，整应用 private 峰值
    644MB → **570MB**（main 225MB → 135MB）。
  - E2E 实测：冷启动 **997ms**（2.5s）、100k 打开 `curve:open` **665ms**（3s，点击到首帧
    1005ms）、整应用 private 峰值 **570MB**（600MB，working set 711MB 仅诊断）、
    端到端查询（含首次快照克隆）448–490ms。
  - CI：新增 `bench` 作业（report artifact + Job Summary + `::warning` 注释）；
    `.gitignore` 放行 `bench/README.md` 与 `bench/baseline.json`。
  - 实测：`pnpm bench` —— open **358ms**（3s）、save **349ms**（500ms）、edit **1ms**（50ms）、
    query **238ms**（400ms）、ASCII 文本排序 **338ms**（400ms）、CJK 排序 **644ms**（800ms）、
    import **781ms**（8s）；`query.sync-clone.100k` ~300ms（诊断）。
  - 残留：CJK 排序 800ms 单列预算；whole-array 撤销补丁每个 100k 行编辑约多 800KB（T5.2 统一）；
    `bench/baseline.json` 需由 CI Windows runner 生成后提交，提交前回归比较为 `missing`；
    M2 验收 spec 未在本任务执行。

**M2 验收演示**：新建表 → 粘贴 200 行 → 导入 100k CSV（GBK + 错误行）→ 筛选/排序 → 列宽/冻结 → 重启还原 → 性能预算达标。输出报告后停下。
（2026-10-23 已执行并经用户接受；验收测试：`apps/desktop/e2e/m2-acceptance.spec.ts`；报告：`docs/reports/m2/REPORT.md`。单条 E2E + 全量 64 passed；导入 824ms、100k 打开 624ms、内存峰值 497MB。M2 已关闭，下一步 T3.1。）

---

<a id="m3"></a>
## M3 表格外观

<a id="t31"></a>
### T3.1 表格样式模型与内置模板
- 状态：`[x]`
- 依赖：T1.1
- 覆盖：FR-STY-01、FR-STY-05
- 参考：SPEC §10.1、§10.3
- 产出：
  - `TableStyle` Zod schema、默认值、不变量
  - 4 个内置模板常量；`resolveStyle(id)` 与回退
  - 内置模板 fork 语义
- 步骤：
  1. 按 SPEC 定义 tokens/overrides/rules。
  2. 内置模板写成不可变常量，id 稳定。
  3. `resolveStyle` 找不到 → 默认 + warning。
- 验收：
  - [x] 4 个内置模板通过 schema 校验且视觉差异明显。
  - [x] 编辑内置 → 自动生成 `sty_` 副本，内置不变。
  - [x] 非法颜色/越界数值被拒绝。
- 验证：`pnpm exec vitest run packages/domain -- --grep "style"`
- 实现备注（2026-10-23，ADR-034）：
  - 决策：4 个内置模板为 domain 深度冻结常量、`builtin: true`、不入 manifest；默认
    `builtin.report-light`；`resolveStyle` 返回 `{style, fallback, warning?}`，未知 id（含未知
    `builtin.*`）回退 + warning；`forkTableStyle` 深拷贝为 `sty_<uuid>`、`builtin:false`、名称
    `Name (2)`；颜色只接受 `#RGB/#RGBA/#RRGGBB/#RRGGBBAA`；默认常量集中到 domain。
  - domain：新增 `table-style.ts`（4 个模板、默认令牌、resolve/fork/create、isResolvableStyleId）、
    `schemas.ts` 的 `tableStyleColorSchema`、`invariants.ts` 的持久化 builtin/默认样式/重复规则
    id 检查；18 条 style 单测 + 1 条 invariant 单测，域包 150 tests。
  - persistence/app-core：删除本地 `'builtin.report-light'`，统一引用 `DEFAULT_TABLE_STYLE_ID`。
  - 实测：`pnpm verify` **124 files / 997 tests**，depcruise **347 modules / 1335 deps / 0
    violations**；coverage lines **75.13%**（`table-style.ts` 97.56%）；`format:check` 通过；
    `pnpm build` exit 0（renderer 1,419.17 kB）。
  - 残留：`builtin.finance` 的数字右对齐/千分位由 T3.2 列格式化实现；实际视觉快照留 T3.2；
    内置名称本地化留 T3.4/T3.5；fork 保留规则 id；颜色暂不支持关键字/CSS 变量。

<a id="t32"></a>
### T3.2 样式渲染管线
- 状态：`[x]`
- 依赖：T2.1、T2.6、T3.1
- 覆盖：FR-STY-02、FR-STY-03、FR-STY-07
- 参考：SPEC §10.2
- 产出：
  - `StyleProvider`：TableStyle → CSS 变量
  - 密度/斑马纹/网格线/圆角/内边距
  - 数字/日期/布尔/枚举格式化
  - 列覆盖（对齐/宽度/标签/渲染模式）
  - `bar` 与 `badge` 单元格渲染
- 步骤：
  1. 单一函数 `styleToCssVars(style)`，网格只读变量。
  2. 单元格格式化管线：原始值 → 列覆盖 → 字段类型 → 字符串。
  3. bar 的 min/max 由当前筛选结果计算并缓存。
- 验收：
  - [x] 令牌改动即时反映，无内联硬编码颜色。
  - [x] 列覆盖不影响 schema 与其他视图。
  - [x] 数字/日期在 zh-CN/en-US 下格式正确。
  - [x] 视觉快照通过（浅色/深色/紧凑/财务）。
- 验证：`pnpm exec vitest run packages/ui apps/desktop`（`--grep` 不是 Vitest 5 参数；目录全跑）
- 实现备注（2026-10-23，ADR-035）：
  - 决策：`styleToCssVars` 输出 20 个 `--cs-table-*` 变量，`TableStyleProvider` 直接作为网格
    `<section>`；工具栏把应用控件令牌局部映射到表头配色。行高 = `max(密度基线, ceil(fontSize×1.25)+2×paddingY)`，
    内置模板仍为 24/32/40。数字统一 `Intl.NumberFormat` + 千分位，数字/日期默认右对齐；布尔本地化；
    有效宽度 `view.widths > 覆盖 width > ColumnDef.width > 160`；bar 的 min/max 只统计当前可见行；
    badge 哈希到样式自身的 4 组令牌。adopt “全局数字规则”，不扩展 `TableStyleTokens`。
  - 文件：`packages/ui/src/{table-style,TableStyleProvider,table-style-format}.ts(x)` 及测试；
    `WorkspaceView` 解析 `styleId`；`DataGrid/GridCell/GridHeader/grid-sizing` 接线；
    `apps/desktop/src/renderer/styles.css` 网格段；`e2e/style.spec.ts`；`e2e/edit.spec.ts` 布尔文案。
  - 实测：`pnpm verify` **128 files / 1037 tests**，depcruise **355 modules / 1363 deps / 0
    violations**；coverage lines **75.39%**；`style.spec.ts` 1 passed，全量 E2E **65 passed**；
    `pnpm bench` exit 0；四模板 + 用户样式截图见 `docs/reports/t3.2/`。
  - 残留：所有数字显示千分位、布尔显示“是/否”属于显示层变化；未提交 PNG 像素基线（按仓库既有
    “E2E 不断言像素”策略，使用计算样式契约 + 截图证据）；bar 只在启用时扫描可见行；未实现 T3.3
    条件格式/T3.4 编辑器/T3.5 模板管理。

<a id="t33"></a>
### T3.3 条件格式引擎
- 状态：`[x]`
- 依赖：T3.1、T1.1
- 覆盖：FR-STY-04
- 参考：SPEC §10.4
- 产出：
  - 纯函数 `evaluateRules(rules, row, columns)`；行/单元格目标
  - 12 种比较语义；首条命中；空值规则
  - 可见行求值优化与基准
- 步骤：
  1. 复用 `FilterPredicate` 求值器，补条件格式语义。
  2. 按数组顺序短路；禁用规则跳过。
  3. 只对可见行求值；缓存列索引。
- 验收：
  - [x] 所有操作符正反例；`between` 含边界。
  - [x] 首条命中；50 条规则 × 100 行 ≤ 16ms。
  - [x] 空值/类型不匹配不抛异常。
  - [x] 规则编辑可撤销。
- 验证：`pnpm exec vitest run packages/domain`（Vitest 5 不支持 `--grep`；目录全跑）+
  `pnpm bench -- --query`。
- 实现备注（2026-10-24，ADR-036）：
  - 决策：比较语义原语下沉 `packages/domain/src/predicate.ts`，table-engine 的
    `QueryContext`/缓存/排序保留并复用；`condition.ts` 的 `createConditionalFormat` 一次准备、
    逐可见行求值，`evaluateRules` 为一次性入口。number/date 的 `contains` 只在条件模式启用；
    过滤器白名单不变。缺失列分支忽略、全缺失规则不命中；空值/类型不匹配返回 false。
    渲染优先级“错误/冲突/粘贴错误 > 选中 > 条件规则 > bar > 斑马纹”；条件背景覆盖 bar，
    行 icon 只画首个可见列。新增 `style.update`（manifest-only、workspace 作用域历史）与
    `SaveQueue.enqueueManifest`。
  - 文件：`packages/domain/src/{predicate,condition}.ts` 与测试；`packages/table-engine/src/query.ts`；
    `packages/app-core/src/commands/styles.ts`、`app-core.ts`、`history/edit-history.ts`、
    `usecases/{save-queue,workspace-actions}.ts`；`packages/ui/src/table-style-format.ts`；
    `apps/desktop/src/renderer/features/grid/{DataGrid,GridCell}.tsx`、`styles.css`、i18n；
    `apps/desktop/e2e/style.spec.ts`；`scripts/bench.ts`；ADR-036。
  - 实测：`pnpm verify` **131 files / 1123 tests**；coverage lines **75.82%** / statements
    75.70% / branches 68.74% / functions 76.68%；`pnpm lint` 通过（depcruise 361 modules / 1390
    deps / 0 violations）；`pnpm typecheck` 通过；`pnpm build` exit 0（renderer 1,446.60 kB）；
    `pnpm e2e` **65 passed**；`pnpm bench` exit 0，`condition.rules.50x100` P50/P95 **1ms**/16ms。
  - 残留：number/date `contains` 匹配 epoch 字符串而非显示日期；条件规则不叠加；渲染层不做
    对比度自动校正；`style.update` 的 manifest 写入异步，撤销后由保存队列落盘；T3.4 必须用
    `conditionCompareOps` 构建操作符列表并复用 `style.update`。

<a id="t34"></a>
### T3.4 样式编辑器与实时预览
- 状态：`[x]`
- 依赖：T3.2、T3.3
- 覆盖：FR-STY-02、FR-STY-04
- 参考：SPEC §10.6
- 产出：
  - 检查器面板：模板、令牌、列覆盖、条件规则
  - 颜色选择器/数值输入/下拉；非法值内联报错
  - 前 50 行实时预览；命令接入与撤销
- 步骤：
  1. 表单状态本地草稿，提交时发命令。
  2. 预览复用真实网格渲染管线。
  3. 规则构建器支持 all/any 嵌套（最多两层）。
- 验收：
  - [x] 改任意令牌 100ms 内预览更新。
  - [x] 非法输入不提交且提示明确。
  - [x] 一次控件提交 = 一条撤销记录。
  - [x] 纯键盘可完成"改密度 + 加一条规则"。
- 验证：`pnpm exec vitest run apps/desktop/src/renderer/features/style packages/app-core/src/validation/condition-builder.test.ts`
  + `pnpm exec playwright test --config apps/desktop/playwright.config.ts apps/desktop/e2e/style.spec.ts`
  （Vitest 5 不支持 TASKS 原文的 `--grep`，改为目录/文件过滤）。
- 实现备注（2026-10-24，ADR-037）：
  - 决策：检查器“样式”标签 + 宽对话框编辑器（左侧令牌/模板/列覆盖/条件规则，右侧前 50 行
    预览）；编辑内置模板时本地 fork，第一次控件提交用新增 `style.create { style, viewId? }`
    原子创建副本并指向视图，后续 `style.update`；文本/数字/颜色失焦或 Enter 提交，下拉/
    复选框与规则保存各一次提交；非法值内联报错并禁用“完成”；规则最多两层 all/any，操作符
    用 `conditionCompareOps`。预览复用 `TableStyleProvider`/`GridCell`/`presentStyledCell`/
    `createConditionalFormat`/`computeBarRanges`，不挂载 DataGrid 编辑器/查询/虚拟滚动。
  - 文件：`packages/app-core/src/commands/styles.ts`（`style.create`）、
    `packages/app-core/src/validation/condition-builder.ts`、`app-core.ts`、`history/edit-history.ts`、
    `usecases/workspace-actions.ts`；`apps/desktop/src/renderer/features/style/*`、
    `shell/Inspector.tsx`、`features/grid/GridCell.tsx`（预览 test-id 前缀）、`styles.css`、i18n；
    `apps/desktop/e2e/style.spec.ts`；ADR-037 与 `docs/reports/t3.4/`。
  - 实测：`pnpm verify` **133 files / 1140 tests**；coverage lines **74.70%** / statements
    74.59% / branches 67.35% / functions 72.97%；`pnpm format:check` 通过；`pnpm build` exit 0
    （renderer 1,545.42 kB + ImportSession 42.82 kB；CSS 59.59 kB）；`pnpm e2e` **66 passed**；
    `pnpm bench` exit 0；预览自测 **3ms**/100ms；200% 缩放与纯键盘流程通过。
  - 残留：T3.4 不做模板另存/重命名/复制/删除/设为默认/导入导出（T3.5）；预览只取物理前
    50 行，不支持筛选后预览；规则超过两层/缺失列只读；密度会覆盖垂直内边距为 SPEC 预设；
    规则列表不能拖拽排序（新规则追加末尾）。

<a id="t35"></a>
### T3.5 模板管理与导入导出
- 状态：`[x]`
- 依赖：T2.6、T3.4
- 覆盖：FR-STY-05、FR-STY-06
- 参考：SPEC §10.5
- 产出：
  - 另存/重命名/复制/删除/设为默认/应用
  - 导出 `.curvestyle.json`、导入校验与冲突处理
  - 删除引用回退默认
- 步骤：
  1. 模板 CRUD 走命令总线。
  2. 导出前 Zod 校验；导入后重新分配 id。
  3. 名称冲突加 ` (2)`；非法文件给具体错误。
- 验收：
  - [x] 导出→新工作区导入→应用，视觉一致。
  - [x] 删除被引用模板，所有视图回退默认并提示。
  - [x] 非法/损坏文件被拒绝，不污染 manifest。
  - [x] 模板操作可撤销（删除需二次确认；按 SPEC §13.1 删除同样可撤销）。
- 验证：`pnpm exec playwright test --config apps/desktop/playwright.config.ts apps/desktop/e2e/template.spec.ts`
  （`pnpm e2e -- --grep "template"` 等价，但会先 build 并生成 100k 夹具）+ `pnpm verify`。
- 实现备注（2026-10-24，ADR-038）：
  - 决策：新增 `style.delete { styleId }` 与 `style.apply { styleId, target }`（表视图/工作区默认），
    另存为/复制/导入落库复用 `style.create`、重命名复用 `style.update`；不新增 `style.setDefault`
    与 IPC。删除在同一命令内回退所有引用视图与工作区默认；按 SPEC §13.1 可撤销 + UI 二次确认
    （TASKS 原文“删除除外”与 SPEC 冲突，以 SPEC 为准并在此记录）。`.curvestyle.json` 由 domain
    的 `styleExportDocumentSchema` 校验，解析失败区分 `json/tooLarge/version/document`；导入总是
    重新分配 `sty_`/`rule_` id、强制 `builtin:false`、名称冲突 ` (2)`；跨表缺失列保留并只提示。
  - 文件：`packages/domain/src/{style-export.ts,table-style.ts}` 与测试；
    `packages/app-core/src/commands/styles.ts`、`validation/style-import.ts`、`app-core.ts`、
    `history/edit-history.ts`、`usecases/workspace-actions.ts` 与测试；
    `apps/desktop/src/renderer/features/style/{TemplateManagerDialog,TemplateImportDialog,style-transfer,
    StylePanel,StyleEditorDialog}.tsx`、`styles.css`、i18n；`apps/desktop/e2e/template.spec.ts`、
    `e2e/fixtures.ts`（仅测试的 saveFile 选项）；ADR-038 与 `docs/reports/t3.5/`。
  - 实测：`pnpm verify` **138 files / 1181 tests**；coverage lines **74.94%** / statements 74.81% /
    branches 67.53% / functions 73.00%；`pnpm format:check` 通过；`pnpm build` exit 0（renderer
    **1,594.18 kB** + ImportSession 42.82 kB；CSS 62.86 kB）；`pnpm e2e` **68 passed**
    （template 2 条；perf 内存 568MB/600MB、冷启动 939ms）；`pnpm bench` exit 0（open 352ms、
    save 254ms、query 209ms、text-sort 248ms、cjk-sort 434ms、import 623ms、condition 0ms）。
  - 残留：导入总是新建模板，不合并/覆盖同名样式；导入预览只含前 50 行；名称冲突按持久化
    `style.name` 比较；2,000,000 字符上限；模板管理为模态对话框；renderer bundle 增至约 1.59MB
    （T6.4 评估）；删除撤销的确认文案必须说明可撤销。

<a id="t36"></a>
### T3.6 CSV 导出
- 状态：`[x]`
- 依赖：T2.6
- 覆盖：FR-TBL-06
- 参考：SPEC §9.6
- 产出：
  - 导出对话框：原始值/显示格式、列顺序、筛选范围
  - UTF-8 BOM、转义、文件名
  - 大表流式导出（不一次性拼 100MB 字符串）
- 步骤：
  1. 按视图顺序与筛选结果生成行。
  2. 显示格式导出走 `StyleProvider` 的格式化函数。
  3. 分块写入，避免主线程卡顿。
- 验收：
  - [x] Excel 打开无乱码；引号/逗号/换行正确转义。
  - [x] 只导出当前筛选/排序结果。
  - [x] 100k 行导出 ≤ 5s 且 UI 可取消。
- 验证：`pnpm e2e -- --grep "export-csv"`（另需 `pnpm verify`、`pnpm build`、`pnpm bench`）
- 实现备注（2026-10-24，ADR-039）：
  - 决策：网格工具条“导出 CSV…”→ `ExportCsvDialog`；只读、不发命令、不进撤销、不写
    manifest/JSONL。列只导出当前视图可见列（`tableView.columnOrder`）；行默认当前筛选/排序，
    另提供“全部行（忽略筛选、保留排序）”。值默认“按显示格式”并复用 `formatStyledCellValue`
    （表头 `columnDisplayLabel`），原始值用存盘值（日期 epoch ms、布尔 true/false、enum 存储值，
    表头 `column.label`）；条件颜色/图标不导出。
  - 传输：新增单通道 `file:exportCsv`（`begin/append/finish/cancel`，19→20；已实现 14→15）。
    main 写同目录临时文件、`fsync` 后 rename；取消删除临时文件；`before-quit` 清理未完成会话。
    renderer 约 1,000 行/块并在块间 `setTimeout(0)` 让出事件循环，进度/取消在对话框内完成。
  - 格式：UTF-8 BOM 只一次、CRLF、RFC 4180（含逗号/引号/CR/LF/首尾空白才加引号）；默认文件名
    `<清洗后表名>-<yyyyMMdd-HHmm>.csv`（本地时间），Windows 保留名加 `_` 前缀；不处理 CSV
    公式注入（记录为残留风险）。
  - 性能：`formatCellValue` 的 `Intl.DateTimeFormat`/`NumberFormat` 按 locale/格式缓存（原先每个
    日期单元格新建 formatter）；100k×10 显示格式导出实测 **1,716ms**/5,000ms，取消无残留文件。
  - 文件：`packages/table-engine/src/csv-export.ts`、`packages/domain/src/format.ts`、
    `apps/desktop/src/main/export/csv-export-file.ts`、`shared/contracts/{channels,ipc}.ts`、
    `preload/api.ts`、`renderer/api-client.ts`、`renderer/features/export/*`、`DataGrid`/
    `WorkspaceView`、i18n/styles、`e2e/export-csv.spec.ts`、ADR-039、`docs/reports/t3.6/`。
  - 实测：`pnpm verify` **143 files / 1232 tests**；coverage lines **74.90%** / statements 74.78% /
    branches 67.66% / functions 73.20%；`pnpm format:check` 通过；`pnpm build` exit 0（renderer
    **1,617.22 kB** + ImportSession 42.82 kB；CSS 64.03 kB）；`pnpm e2e` **71 passed**（export-csv
    3 条）；`pnpm bench` exit 0（open 663ms、save 342ms、edit 0ms、query 213ms、text-sort 260ms、
    cjk-sort 667ms、import 893ms、condition P95 1ms）；perf 内存 571MB/600MB、冷启动 1,025ms。
  - 残留：显示格式的千分位/本地化日期可能被 Excel 当作文本；原始值日期是 epoch ms；不导出
    隐藏列、不提供列选择器；不缓解公式注入；一次只允许一个导出任务；renderer bundle 增至
    ~1.62MB（T6.4 评估拆包）。

**M3 验收演示**：应用 4 个内置模板对比 → 改令牌/列格式 → 加"高温标红"→ 另存模板 → 导出 → 新工作区导入应用 → 重启还原。输出报告后停下。

**M3 验收演示（2026-10-24 已执行并获用户接受）**：`apps/desktop/e2e/m3-acceptance.spec.ts`
单条用例按上述脚本执行（3 次启动：源工作区 → 新工作区导入 → 重启还原），全量 E2E 内 11.2s；
报告 `docs/reports/m3/REPORT.md` 与 10 张截图。演示中发现并修复“虚拟化行高不随样式令牌重测”
（`DataGrid` 在行高变化时 `virtualizer.measure()`），`pnpm e2e` **72 passed**。接受前复核：
`pnpm verify` 143 files / 1232 tests、`pnpm build` exit 0、`m3-acceptance` 单跑 1 passed、
全量 `pnpm e2e` 72 passed。**M3 已关闭；此后 T4.1–T4.5 已完成，下一任务 T4.6。**

---

<a id="m4"></a>
## M4 图表

> 状态（2026-10-26）：`T4.1`（RenderModel 与宽/长表映射）、`T4.2`（LTTB 采样与缺失值语义）、
> `T4.3`（ECharts 适配器）、`T4.4`（图表创建与检查器）与 `T4.5`（图表交互、空态与 PNG 导出）
> 已完成；下一任务 `T4.6`（图表性能硬化）。M4 验收演示在 T4.6 完成后执行，停下等用户确认。

<a id="t41"></a>
### T4.1 RenderModel 与宽/长表映射
- 状态：`[x]`
- 依赖：T1.1、T2.6
- 覆盖：FR-CHT-01、FR-CHT-02
- 参考：SPEC §11.1–§11.3
- 产出：
  - `packages/chart-model`：`resolveSeries(table, rows, spec)` → `RenderModel`
  - 宽表/长表映射、系列命名、类型校验、warning 收集
  - 排序/筛选接入；null 断点；重复 X 警告
- 步骤：
  1. 校验映射（列存在、类型/角色匹配），失败返回结构化错误。
  2. 宽表：每 Y 列一条系列；长表：groupBy 系列列。
  3. 生成稳定系列 id（列 ID / `seriesId:value`）。
- 验收：
  - [x] 固定夹具的 RenderModel 黄金快照通过。
  - [x] 空数据/缺列/类型错返回错误或 warning，不崩溃。
  - [x] 系列顺序稳定；>20 系列截断并警告。
  - [x] 包内无 echarts import。
- 验证：`pnpm exec vitest run packages/chart-model`

  实现备注（2026-10-24，ADR-040）：
  - 决策：`resolveSeries(table, rows, spec, options?)` 返回 `{ ok, model } | { ok, issues }`；
    `validateChartMapping` + `canBeChartX/Y/Series` 复用给检查器；`MAX_CHART_SERIES = 20`。
    行顺序 = filter → 丢 number/date 缺失 X 行 → sort（未配置时数值/时间 X 升序、text 保序）→
    分组；筛选/排序复用 `@curve/table-engine`（ADR-032）。宽表 `id=列 id`、`name=label`（重名
    ` (2)`）；长表 `id=<seriesColumnId>:<存储值>`、空值归 `(空)`、enum 用 option label；Y `null`
    为断点、非 number 聚合 warning；重复 X 保留全部点 + warning；>20 截断 + warning。
    调色板为 4 组 8 色常量（colorblind 用 Okabe–Ito）；`style.background` 解析顺序
    `options.background` > `theme`(auto) > `light/dark` > `#ffffff`；`meta.sampled=false`、
    `sourcePoints=renderedPoints=非空 Y 值数`。未做 LTTB（T4.2）与 ECharts（T4.3）。
  - 文件：`packages/chart-model/src/{render-model,palettes}.ts` 与测试、
    `render-model.test.ts.snap`（2 条黄金快照）、`index.ts` 公开出口、`tsconfig.json`
    增加 domain/table-engine 的 project references 与 `types: ["node"]`（仅测试读源码用）。
  - 实测：`pnpm verify` **144 files / 1276 tests**；coverage 全局 lines **75.34%** /
    branches 68.21%，`render-model.ts` lines **97.54%** / `palettes.ts` **90.9%**；
    `pnpm format:check` 通过；`pnpm build` exit 0；`pnpm e2e` 72 passed（未改 UI）；
    `pnpm bench` exit 0。
  - 残留：X 缺失的 number/date 行被丢弃（有 warning）；warning 为英文聚合文案，未本地化；
    长表把 null 与空字符串合并为 `(空)`；调色板为常量，未接设计令牌；T4.2 采样口径以本任务
    的 `sourcePoints` 为准。

<a id="t42"></a>
### T4.2 LTTB 采样与缺失值语义
- 状态：`[x]`
- 依赖：T4.1
- 覆盖：FR-CHT-05
- 参考：SPEC §11.2
- 产出：
  - LTTB 实现（保留首尾）；阈值/目标可配
  - 缺失值断点处理；采样元数据
  - 10 万点基准
- 步骤：
  1. 对每个系列独立采样；x 必须单调（排序后）。
  2. 记录 `sourcePoints/renderedPoints/sampled`。
  3. 采样关闭时原样输出。
- 验收：
  - [x] 100k → 2k 点，首尾保留，峰值形状肉眼可辨。
  - [x] 采样耗时 ≤ 50ms/系列。
  - [x] null 不参与采样三角计算，输出仍为 null。
  - [x] 属性测试：输出点数 ≤ target 且 x 单调。
- 验证：`pnpm exec vitest run packages/chart-model --testNamePattern sample && pnpm bench -- --sample`
  （Vitest 5 用 `--testNamePattern` 过滤；`-- --grep` 不会过滤，见 HANDOFF §3.6）

  实现备注（2026-10-25，ADR-041）：
  - 决策：`sampling.ts` 新增 `lttbIndices(x, y, target)`（升序原始下标、保留首尾**非空**点、
    null/非有限值不参与三角面积、`target<3` 退化、`target≥点数` 原样返回）与
    `sampleSeriesIndices(x, values, options)`（逐系列判定 `enabled && 非空点数 > threshold &&
    非空点数 > target`）。number/time 轴用存储数值、category 轴用行下标采样；采样只取
    子序列，不重排（用户 `sort` 亦然）。
  - 共享 X 轴对齐：采样后 `x.values` 取各系列保留下标的升序并集；未采样系列贡献全部非空
    下标（不因邻居采样丢点），被采样系列在其它系列的位置为 `null`、其非空点数 ≤ target；
    `x.values.length` 可大于 target（上界约 `Σ max(threshold, target)`）。只有真的降采样时
    才改写模型，否则保持 T4.1 原样输出。
  - meta：`sourcePoints` 仍为采样前非空 Y 总数、`renderedPoints` 为采样后非空 Y 总数
    （≤ sourcePoints）、`sampled` 由采样器置位；warning 文本与顺序完全沿用 T4.1。
  - 文件：`packages/chart-model/src/sampling.ts`、`render-model.ts`（集成）、`index.ts`、
    `sampling.test.ts`（17 条，含 100k→2k 与属性测试）、`render-model.test.ts`（+9 条集成）；
    `scripts/bench.ts` 新增 `sample` suite 与 `--sample`；根 `devDependencies` 增加 workspace 包
    `@curve/chart-model`（仅 bench 用）、`scripts/tsconfig.json` 增加 project reference。
  - 实测：`pnpm bench -- --sample` —— `chart.resolve-sample.100k`（100k×10、2 个 Y 系列，
    含解析）P50 **82ms** / P95 **93ms**（预算 300ms）；`chart.sample.100k`（单系列 100k→2k）
    P50 **4ms** / P95 **4ms**（预算 50ms）；`chart.resolve-unsampled.100k` P50 **55ms**
    （仅诊断）。`pnpm verify` **145 files / 1302 tests**；coverage 全局 lines **75.55%** /
    statements 75.46% / branches 68.41% / functions 73.96%（`sampling.ts` lines **93.24%**、
    `render-model.ts` **96.96%**）；`pnpm e2e` **72 passed**。
  - 残留：多系列采样后 x 并集可能长于 target（T4.6 复核渲染/内存）；被采样略过的 null 与
    原始缺口不可区分（T4.3 只能按非空成对渲染）；category 轴按下标采样；未采样系列贡献
    全部非空点，极端多小系列时采样收益下降。详见 ADR-041“代价/复核条件”。

<a id="t43"></a>
### T4.3 ECharts 适配器
- 状态：`[x]`
- 依赖：T4.1、T0.4
- 覆盖：FR-CHT-03、FR-CHT-04
- 参考：SPEC §11.4
- 产出：
  - `packages/chart-echarts`：`createChartRenderer()` 生命周期
  - RenderModel → option 映射；主题/调色板；tooltip/legend/dataZoom
  - `toPNG`、resize、dispose
  - option 黄金快照测试
- 步骤：
  1. 按需注册 ECharts 模块。
  2. `setOption(option, { notMerge: false })` 更新；`dispose` 清理。
  3. 背景 auto 跟应用主题；导出 2x。
- 验收：
  - [x] 4 个调色板/深浅背景 option 快照通过。
  - [x] resize 不变形；dispose 无泄漏（实例计数为 0）。
  - [x] tooltip 显示单位/精度；null 断点不连 line。
  - [x] 包外无 echarts 引用。
- 验证：`pnpm exec vitest run packages/chart-echarts`

  实现备注（2026-10-25，ADR-042）：
  - 依赖：`echarts@^6.1.0`（安装 6.1.0）是 `@curve/chart-echarts` 唯一新增运行时依赖；按需注册
    `LineChart`/`ScatterChart`/`BarChart` + `Grid`/`Tooltip`/`Legend`/`DataZoom`/`Toolbox` +
    `CanvasRenderer`（9 个 installer，幂等）。注册子集实测 606.0 kB minified / 206 kB gzip；
    适配器完整 bundle（含 domain/zod/chart-model）1.0 MB / 304 kB gzip。T4.3 尚未被 renderer
    引用，`pnpm build` 产物保持 1,618.04 kB。
  - option：`toEChartsOption(model, { locale? })` 纯函数；`x.type` `number`→ECharts `value`、
    `time`→`time`、`text`→`category`；类目轴用 `xAxis.data` + 对齐数组，数值/时间轴用 `[x, y]`
    对；`style`（palette/lineWidth/smooth/showSymbol/showGrid/legend/yStartAtZero/numberDigits）
    逐项映射；tooltip（HTML + 转义、X 单位、Y 固定精度）、`dataZoom`（inside + slider）、
    toolbox 框选缩放；`animation: false`。
  - 断点策略（解决 TASKS 与 ADR-041 的冲突）：`meta.sampled === false` → `connectNulls: false`
    （真实缺口断开，符合 SPEC §11.2.4 与"null 断点不连 line"）；`meta.sampled === true` →
    `connectNulls: true`（ADR-041 §4：采样后的 null 与真实缺口不可区分，采样图必须跨过）。
  - 主题：`resolveChartTheme(background)` 用 WCAG 相对亮度推导 light/dark（支持 hex/rgb/rgba，
    未知语法按 light），颜色为与 `@curve/ui` 令牌同值的常量，不 import `@curve/ui`。
  - 生命周期：`createChartRenderer({ locale? })` 惰性 `init`；`render`（同一容器再渲染=重新挂载）、
    `update`（`setOption(..., { notMerge:false, replaceMerge:['series','xAxis','yAxis'] })`）、
    `resize`、`dispose`（幂等）、`toPNG({ scale=2, background })`；空模型不创建实例；错误返回
    `{ ok:false, error }`（`E_UNKNOWN`/`E_EXPORT_FAILED`）；`activeChartInstanceCount()` 证明
    dispose 后为 0。
  - 文件：`packages/chart-echarts/src/{theme,format,option,registration,renderer}.ts` 与
    `option.test.ts`（24 条，含 6 条黄金快照）、`option.ssr.test.ts`（2 条真实 ECharts
    SSR/SVG 冒烟）、`format.test.ts`（15）、`theme.test.ts`（6）、`renderer.test.ts`（16，
    mock `echarts/core`）、`registration.test.ts`（1）、`boundary.test.ts`（2，扫描
    workspace + 包清单）；`package.json`/`tsconfig.json`（references、DOM lib、
    `types:["node"]`）；`.dependency-cruiser.cjs` 新增 `only-chart-echarts-imports-echarts`。
  - 实测：`pnpm exec vitest run packages/chart-echarts` **8 files / 68 tests**；`pnpm verify`
    **152 files / 1369 tests**、depcruise 416 modules / 1655 deps / 0 violations；coverage 全局
    lines **76.09%** / branches 69.04%，`chart-echarts/src` lines **99.56%**（option/renderer/
    theme/registration 100%）；`pnpm build` exit 0（renderer 1,618.04 kB 未变）；`pnpm e2e`
    72 passed（3.2m）；`pnpm bench` exit 0（chart.sample P95 21ms/50ms）。
  - 残留：Y 单位不在 RenderModel（tooltip 只有 X 单位 + Y 精度），需要时扩展契约并写 ADR；
    toolbox 标题为 ECharts 英文默认值（T4.5 本地化）；`resize` 的像素级"不变形"由 T4.5/T4.6
    的 E2E 验证（T4.3 单测证明委托与不重建 option）；采样图的真实缺口也会被连线（ADR-041
    代价）；动画关闭；dataZoom 滑块常驻。详见 ADR-042"代价/复核条件"。

<a id="t44"></a>
### T4.4 图表创建与检查器
- 状态：`[x]`
- 依赖：T4.3、T2.6
- 覆盖：FR-CHT-01、FR-CHT-02、FR-CHT-03
- 参考：SPEC §11.5
- 产出：
  - 图表列表、新建向导（选表→映射→列→预览）
  - 检查器：数据/映射/外观/坐标轴
  - 图表 CRUD 走命令总线；图表持久化、复制、删除、视图联动
- 步骤：
  1. 映射选择器只展示类型兼容的列。
  2. 非法映射即时提示，不创建。
  3. 修改 120ms 防抖更新，`setOption` merge。
- 验收：
  - [x] 宽表多 Y、长表系列拆分均正确。
  - [x] 检查器所有项生效并持久化，重启保留。
  - [x] 列被删后图表进入可操作错误态。
  - [x] 复制图表生成新 id，互不影响。
- 验证：`pnpm e2e -- --grep "chart"`

  实现备注（2026-10-25，ADR-043）：
  - 命令/用例：新增 `chart.create { chart, view }`、`chart.update { chart }`、
    `chart.delete { chartId }`（manifest-only、workspace 作用域历史）与
    `createChart/updateChart/deleteChart/duplicateChart/openChart` actions；创建严格校验
    映射/筛选/排序并在同一事务内建视图入 layout；更新允许悬空映射（列删除后的修复路径）、
    覆盖 `createdAt`、刷新 `updatedAt`、标题同步图表视图标题；删除级联视图与 layout 引用；
    默认 `sampling { enabled, 5000, 2000 }`。`duplicateChart` 用新 `cht_`/`viw_` 与 ` (2)`
    标题，`openChart` 激活或重建标签页。
  - RenderModel 扩展：`y?: { label?: string }`（来自 `ChartOptions.yLabel`）与
    `RenderStyle.connectNulls = sampled || layout === 'long'`；适配器映射 `yAxis.name`、
    `grid.bottom` 72（X 轴名避开 dataZoom）；6 条 option + 2 条 RenderModel 黄金快照有意更新。
    长表的 null 是共享 X 轴的表达产物，跨过；宽表未采样仍断线。
  - UI：侧栏图表列表（新建/打开/复制/重命名/删除）、新建向导（表→类型/名称→映射/列→实时预览）、
    检查器四组（数据/映射/外观/坐标轴）、`ChartView`/`ChartCanvas`（首次 render + 120ms 防抖
    update + resize + dispose）、错误态内嵌重映射（与检查器共用 `ChartMappingFields`）、
    `data-chart-*` 渲染契约；删除 `ChartPlaceholder`。图表读全表行 + 图表自身 filter/sort；
    列删除不自动重映射；复制/新建要求映射有效。
  - 文件：`packages/app-core/src/{commands/charts.ts,app-core.ts,history/edit-history.ts,
    usecases/workspace-actions.ts,index.ts}`、`packages/chart-model/src/render-model.ts`、
    `packages/chart-echarts/src/option.ts`、`packages/ui/src/Select.tsx`、
    `apps/desktop/src/renderer/features/charts/*`、`shell/{Sidebar,Inspector}.tsx`、
    `features/workspace/WorkspaceView.tsx`、`i18n/messages/*`、`styles.css`、
    `apps/desktop/{package.json,tsconfig.web.json}`、`e2e/{chart.spec.ts,schema.spec.ts}`。
  - 实测：`pnpm verify` **159 files / 1434 tests**；coverage 全局 lines **75.89%** /
    statements 75.75% / branches 68.76% / functions 74.28%（`chart-model/src` lines 95.93%、
    `chart-echarts/src` 99.57%、`app-core/src` 98.41%）；`format:check` 通过；`pnpm build`
    exit 0（renderer **3,209.97 kB**、CSS 70.66 kB）；`pnpm e2e` **76 passed**（chart.spec
    4 条：6.2s/3.9s/2.8s/2.8s）；`pnpm bench` exit 0（chart.resolve-sample P95 75ms/300ms、
    chart.sample P95 5ms/50ms）。
  - 残留：长表跨过真实缺口；坏图表不可复制；Y 轴名单一/无单位；图表全表解析成本（T4.6）；
    每提交 flush manifest；主 chunk +1.59MB（T6.4）；aria 摘要/三种空态/PNG/toolbox 本地化属
    T4.5；图表与表格选中行联动（SHOULD）未实现。详见 ADR-043“代价/复核条件”。

<a id="t45"></a>
### T4.5 图表交互、空态与 PNG 导出
- 状态：`[x]`
- 依赖：T4.4
- 覆盖：FR-CHT-04、FR-CHT-06、FR-CHT-07
- 参考：SPEC §11.4–§11.6
- 产出：
  - 缩放/图例/tooltip/resize；空态/错误态组件
  - PNG 导出（透明/白/深背景，2x）
  - 图表 `aria-label` 摘要与"查看数据表"
- 步骤：
  1. 空态区分"无表/未映射/无数据"。
  2. 导出前等待渲染完成；失败捕获。
  3. 键盘可达：图例/缩放可用按钮操作。
- 验收：
  - [x] 缩放/图例/tooltip 在 100k 采样图上可用。
  - [x] 导出 PNG 尺寸/背景/文件名符合 SPEC。
  - [x] 三种空态文案与行动按钮正确。
  - [x] axe 无 critical。
- 验证：`pnpm e2e -- --grep "chart-interaction|png"`

  实现备注（2026-10-26，ADR-044）：
  - 交互：`ChartRenderer` 新增 `getInteractionState`/`dispatchInteraction`/`onInteractionChange`；
    ECharts `datazoom`/`legendselectchanged` 与 DOM 工具栏共享同一份瞬态状态。图表视图工具栏
    提供逐系列 `aria-pressed` 图例按钮、放大/缩小/重置缩放（`data-chart-zoom-start/end`
    暴露窗口）、“查看数据表”与“导出 PNG…”；全部为原生按钮，键盘可达。交互状态不写
    `ChartSpec`/manifest、不进撤销、不跨重启保留。
  - 空态：`data-chart-empty` = `no-table` / `unmapped` / `no-data`；`no-table` 显示
    “删除图表…”（`DeleteChartDialog`），`unmapped` 显示“配置映射”（聚焦内嵌
    `ChartMappingFields`），`no-data`（`data-chart-state="empty"`）显示“查看数据表”
    （`openTable`）。映射仍不自动改写（SPEC §19）。
  - 无障碍：canvas 宿主 `role="img"` 的 `aria-label` 为“标题、类型、系列数、点数（采样时含
    原始点数）”；映射不改 DOM 语义。E2E 在 100k 图上跑 axe wcag2a/aa，critical 为 0。
  - PNG：`ChartCanvas` 暴露 `exportPng`（flush 120ms 防抖 + 两个动画帧 → 同步 `toPNG`）；
    `ChartExportDialog` 提供透明/白/深背景、固定 2x、文件名 `<标题>-<yyyyMMdd-HHmm>.png`
    （非法字符/保留名/80 码点清洗）；保存复用 `file:exportText` 新增
    `encoding:'base64'`（原子写字节），不新增 IPC 通道；失败/取消均在对话框内处理。
  - toolbox：`toEChartsOption` 增加 `labels`（zoom/back）与 tooltip 稳定类名
    `cs-chart-tooltip`；`ChartCanvas` 用 i18n 传入“框选缩放/还原缩放”。
  - 文件：`packages/chart-echarts/src/{option,renderer}.ts`；`shared/contracts/ipc.ts`；
    `main/{import/import-files.ts,workspace/atomic-write.ts,index.ts}`；
    `renderer/features/charts/{ChartView,ChartCanvas,ChartExportDialog,ChartEmptyState,
    chart-export}.tsx/ts`、`chart-text.ts`、`i18n/messages/*`、`styles.css`；
    `apps/desktop/e2e/chart-interaction.spec.ts`（3 条）。
  - 实测：`pnpm verify` **161 files / 1474 tests**；coverage 全局 lines **76.26%** /
    statements 76.12% / branches 69.03% / functions 74.65%（`chart-echarts/src` 96.75%）；
    `format:check` 通过；`pnpm build` exit 0（renderer 3,238.36 kB、CSS 72.19 kB）；
    `pnpm e2e` **79 passed**（chart-interaction 3 条：4.0s / 2.4s / 2.4s；全量 3.7m）；
    `pnpm bench` exit 0（chart.resolve-sample P95 66ms/300ms、chart.sample P95 2ms/50ms）。
  - 残留：`no-table` 是防御态（合法 manifest 的 `checkChartInto` 把缺失表当错误，无法从磁盘
    打开），由组件测试覆盖；E2E 覆盖可达的 `no-data`/`unmapped`。导出入口在视图工具栏而非
    检查器（ADR-044 已改 SPEC §11.5 措辞）。图例/缩放不持久化。详见 ADR-044“代价/复核条件”。

<a id="t46"></a>
### T4.6 图表性能硬化
- 状态：`[ ]`
- 依赖：T4.2、T4.5
- 覆盖：FR-CHT-05、NFR-01
- 参考：SPEC §16.1
- 产出：
  - 100k 点端到端基准；防抖/采样/merge 优化
  - 图表更新 <200ms（2k 点）；解析+采样 <300ms
  - 回归报告
- 步骤：
  1. 基准记录解析、采样、option、渲染四段耗时。
  2. 避免每次更新重建实例；避免重复 resolve。
  3. 大表切换映射时显示 loading，不冻结输入。
- 验收：
  - [ ] 预算达标；连续拖动缩放不卡顿。
  - [ ] 切换表/映射无内存泄漏（10 次后实例数稳定）。
  - [ ] 回归 >20% 报警。
- 验证：`pnpm bench -- --chart && pnpm e2e -- --grep "chart-perf"`

**M4 验收演示**：同一张表建宽表折线 + 长表多系列 → 缩放/图例/tooltip → 100k 点采样徽标 → 导出 PNG → 重启还原。输出报告后停下。

---

<a id="m5"></a>
## M5 体验

<a id="t51"></a>
### T5.1 分栏布局与标签页
- 状态：`[ ]`
- 依赖：T2.1、T4.4
- 覆盖：FR-WS-02
- 参考：SPEC §12
- 产出：
  - 递归分栏（最多 4 pane）、拖拽调整比例、标签页
  - 新建/关闭/移动视图；布局变更走命令总线；布局持久化与恢复
  - 非法布局回退策略
- 步骤：
  1. 用 `LayoutNode` 驱动渲染；比例 0.2–0.8。
  2. 关闭最后一个标签 → 关闭 pane；至少保留 1 个。
  3. 保存去抖 500ms；恢复时校验引用。
- 验收：
  - [ ] 4 pane、水平/垂直、比例拖拽正常。
  - [ ] 重启后布局/活动标签/滚动位置（可选）恢复。
  - [ ] 引用失效回退单 pane，视图不丢。
  - [ ] 纯键盘可切换标签/关闭。
- 验证：`pnpm e2e -- --grep "layout"`

<a id="t52"></a>
### T5.2 撤销/重做
- 状态：`[ ]`
- 依赖：T1.5、T2.2、T2.3、T3.4
- 覆盖：FR-TBL-02、FR-STY-02
- 参考：SPEC §13.2
- 产出：
  - 基于 Immer patches 的历史栈（上限 100）
  - 合并规则（800ms 单元格编辑）；批量操作单条
  - 快捷键、菜单文案、历史清空
- 步骤：
  1. 命令返回 inverse patches；undo 应用 inverse，redo 应用 patches。
  2. 新命令入栈丢弃 redo 分支。
  3. 排除 UI 状态（选择/滚动/标签）。
- 验收：
  - [ ] 100 步撤销/重做数据一致；历史内存超 256MB 时丢最旧且不崩。
  - [ ] 粘贴/导入/列变更各为一条历史。
  - [ ] 图表创建/修改、视图开关、样式修改均可撤销。
  - [ ] 撤销后自动保存落盘。
  - [ ] 关闭工作区清空历史。
- 验证：`pnpm exec vitest run packages/app-core -- --grep "history" && pnpm e2e -- --grep "undo"`

<a id="t53"></a>
### T5.3 自动保存、恢复与最近打开
- 状态：`[ ]`
- 依赖：T1.2、T1.3、T1.5
- 覆盖：FR-WS-01、FR-WS-03
- 参考：SPEC §7.5、§13.3
- 产出：
  - 脏表队列、1.5s 防抖/10s 强制、串行写
  - 保存状态指示；失败重试
  - 退出 flush（3s）；崩溃恢复对话框
  - 手动保存（Ctrl/Cmd+S）立即 flush；最近列表、未保存确认
  - 启动时 stale/corrupt `.lock` 的“尝试恢复/直接打开”选择；manifest 不可读时列出
    `backups/manifest.*.json.bak` 并让用户确认重建（SPEC §7.5，ADR-026）
- 步骤：
  1. 订阅文档状态，标脏；队列合并同表写入。
  2. 写表→写 manifest；失败保留脏标记。
  3. 启动检测 stale lock，提供恢复/直接打开；manifest 损坏时扫描备份并二次确认后再重建。
- 验收：
  - [ ] 强杀进程后重开，已提交数据不丢（允许丢最后 <1.5s 的编辑并提示）。
  - [ ] 保存失败可见、可重试，不丢内存数据。
  - [ ] 退出时 flush 成功；超时确认不卡死。
  - [ ] Ctrl/Cmd+S 立即落盘，状态指示从"保存中"回到"已保存"。
  - [ ] 最近列表可打开/移除/清空。
  - [ ] 伪造 stale/corrupt `.lock` 与损坏 manifest 时出现恢复/直接打开选择；选择恢复后数据逐行
    相等，拒绝恢复时原文件字节不变（ADR-026）。
- 验证：`pnpm e2e -- --grep "autosave|recovery"`

<a id="t54"></a>
### T5.4 快捷键与命令面板
- 状态：`[ ]`
- 依赖：T5.2
- 覆盖：FR-WS-02、NFR-03
- 参考：SPEC §9.1、§13.2
- 产出：
  - 键位注册表（作用域：全局/网格/图表）
  - 命令面板（Ctrl/Cmd+K，模糊搜索，最近使用）
  - 冲突检测与不可用原因
- 步骤：
  1. 命令声明 `id/label/shortcut/scopes/isEnabled`。
  2. 统一 keydown 分发；输入框内不劫持。
  3. 面板列出可执行命令并显示快捷键。
- 验收：
  - [ ] 所有核心操作有快捷键且不冲突。
  - [ ] 输入框内 Ctrl/Cmd+C/V 不被劫持。
  - [ ] 面板键盘可操作，Esc 关闭。
- 验证：`pnpm exec vitest run apps/desktop -- --grep "keymap" && pnpm e2e -- --grep "palette"`

<a id="t55"></a>
### T5.5 设置与国际化
- 状态：`[ ]`
- 依赖：T0.4、T3.1
- 覆盖：NFR-04、FR-STY-01
- 参考：SPEC §16.3–§16.4
- 产出：
  - 设置对话框：主题、语言、默认表格样式、自动保存
  - 完整 `en-US` 消息表；`zh-CN` 补齐
  - 全量文案审计与迁移（T0.4 之后的 UI）
- 步骤：
  1. 扩展 `MessageKey` 与插值；补 en-US。
  2. 设置持久化到 `userData/settings.json`（非工作区）。
  3. 语言切换即时生效（不需重启）。
  4. grep 审计并迁移遗漏的硬编码文案。
- 验收：
  - [ ] 中英文可切换，无缺失 key（开发模式报错）。
  - [ ] 设置重启后保留。
  - [ ] 组件中无硬编码用户文案（grep 检查）。
  - [ ] 文案变长 30% 不破布局。
- 验证：`pnpm exec vitest run packages/ui apps/desktop -- --grep "i18n|settings" && pnpm e2e -- --grep "settings"`

**M5 验收演示**：建 2 表 3 视图分 2 pane → 撤销/重做 5 步 → 强杀恢复 → 最近打开 → 切英文/深色 → 重启全部还原。输出报告后停下。

---

<a id="m6"></a>
## M6 扩展与发布

<a id="t61"></a>
### T6.1 插件 SDK 与注册表
- 状态：`[ ]`
- 依赖：T1.1
- 覆盖：FR-EXT-01、FR-EXT-02、FR-EXT-04
- 参考：SPEC §14
- 产出：
  - `packages/plugin-sdk`：清单、上下文、4 类注册表、生命周期
  - 版本校验（主版本=1）、重复 id、dispose
  - 宿主激活器：错误隔离、禁用列表、日志
- 步骤：
  1. 注册表纯数据 + 订阅；`register/replace/list/dispose`。
  2. `activatePlugin`：校验 apiVersion → activate → 记录贡献。
  3. 失败回滚已注册项，标记禁用。
- 验收：
  - [ ] 注册/列出/移除/重复 id 全部有测试。
  - [ ] 插件激活抛错不影响内置功能。
  - [ ] 不兼容版本被禁用并提示。
  - [ ] `deactivate` 后 UI 无残留贡献。
- 验证：`pnpm exec vitest run packages/plugin-sdk`

<a id="t62"></a>
### T6.2 示例插件
- 状态：`[ ]`
- 依赖：T6.1
- 覆盖：FR-EXT-03
- 参考：SPEC §14.2
- 产出：
  - `plugins/plugin-sample`：`rating` 语义字段类型（storageType=number）+ 简易 JSON 导入器
  - 单元测试与 README
- 步骤：
  1. 字段类型：1–5 解析/校验/格式化（★）；storageType=number。
  2. 导入器：解析 `{points:[{x,y}]}`。
  3. 在桌面组装点静态导入并激活。
- 验收：
  - [ ] 新建列可选 `rating`，存为 number，重启后仍可解析。
  - [ ] 示例导入器出现在导入向导并可完成导入。
  - [ ] 插件测试独立运行，不依赖桌面。
- 验证：`pnpm exec vitest run plugins/plugin-sample && pnpm e2e -- --grep "plugin"`

<a id="t63"></a>
### T6.3 插件接入 UI 与隔离
- 状态：`[ ]`
- 依赖：T6.2、T2.5、T3.2
- 覆盖：FR-EXT-01、FR-EXT-02
- 参考：SPEC §14.3
- 产出：
  - 列类型选择器/导入器列表/图表类型列表读取注册表
  - 插件错误边界与"禁用插件"入口
  - 贡献点变更后的 UI 刷新
- 步骤：
  1. 移除硬编码的内置列表，改为注册表 + 内置注册。
  2. 插件贡献的菜单项加来源标识。
  3. 错误 toast 带插件名，可跳日志。
- 验收：
  - [ ] 移除示例插件后 UI 不残留其选项。
  - [ ] 插件抛错只影响自身，其他功能正常。
  - [ ] 所有贡献点从注册表读取（grep 无硬编码）。
- 验证：`pnpm e2e -- --grep "plugin-ui"`

<a id="t64"></a>
### T6.4 安装包与发布配置
- 状态：`[ ]`
- 依赖：T0.2、T5.5
- 覆盖：NFR-08
- 参考：SPEC §16.6
- 产出：
  - electron-builder：`appId=com.curvestudio.app`、productName、NSIS + portable
  - 图标、许可证、版本号注入、`userData` 路径
  - 安装/卸载/数据保留冒烟
- 步骤：
  1. 配 `electron-builder.yml`；产物到 `release/`。
  2. 安装包默认当前用户，不要求管理员。
  3. 首次启动创建 `userData`；卸载不删工作区。
- 验收：
  - [ ] 干净 Windows 用户安装/启动/卸载成功。
  - [ ] 安装后工作区默认路径可写；卸载后用户工作区仍在。
  - [ ] 版本号与 `package.json` 一致。
- 验证：`pnpm package` + 手工安装冒烟

<a id="t65"></a>
### T6.5 全量验收与文档收尾
- 状态：`[ ]`
- 依赖：M0–M6 全部任务（T6.5 除外）
- 覆盖：全部 FR/NFR
- 参考：TESTPLAN §3–§6
- 产出：
  - 全量 E2E、性能报告、可访问性报告
  - README 更新为产品说明；用户手册；开发者指南；ADR 索引
  - 发布检查清单与已知限制
- 步骤：
  1. 跑 `pnpm verify && pnpm e2e && pnpm bench`，归档报告。
  2. 执行 README §6 九步验收演示并录屏/截图。
  3. 对照 SPEC §17 逐条勾选；未达标项列明确认。
- 验收：
  - [ ] 九步演示一次通过。
  - [ ] 全部 FR 有证据（测试名/截图/报告）。
  - [ ] 已知限制写入文档，不隐藏在代码里。
  - [ ] 安装包在干净机器复验通过。
- 验证：`pnpm verify && pnpm e2e && pnpm bench`

**M6 验收演示**：示例插件可用 → 安装包安装/卸载 → 全量 E2E/性能/可访问性报告 → 九步演示 → 发布清单签字。输出报告后停下。
