# HANDOFF — Curve Studio 实施交接

> 本文件面向**下一个实现会话**。当前会话已完成 `T0.1`，按用户要求停止。
> 最后更新：2026-10-19 · T0.1 提交：`702293c` · 分支：`main` · 工作树：干净。
> 阅读顺序：`AGENTS.md` → 本文件 → `docs/SPEC.md` 相关章节 → `docs/TASKS.md` 目标任务 → `docs/TESTPLAN.md` 对应层 → `docs/DECISIONS.md`。

---

## 1. 当前进度快照

| 项 | 状态 |
|---|---|
| 方案文档 | v1.0 已锁定（SPEC / TASKS / TESTPLAN / DECISIONS） |
| `T0.1` 初始化 monorepo 与质量工具链 | **已完成**（`docs/TASKS.md` 已勾选） |
| 下一个任务 | `T0.2` Electron 三进程骨架与安全窗口 |
| 里程碑 | M0 进行中；M0 剩余 `T0.2 → T0.3 → T0.4 → T0.5` |
| 提交历史 | `347637b docs: import Curve Studio v1 specification`<br>`702293c chore(tooling): initialize monorepo and quality gates`（T0.1）<br>其后可能有一条 `docs: add T0.2 handoff...` 提交 |
| 工作树 | 干净（`git status --short` 无输出） |

**用户明确要求**：一次只做一个任务；每个任务先复述目标/产出/验收，再写测试、实现、跑 `pnpm verify` 与任务指定 e2e/bench，最后勾选 TASKS、更新 CHANGELOG、必要时 ADR、Conventional Commit。上一会话被用户限定“先只做 T0.1”，因此**新会话默认从 T0.2 开始，完成并报告后停下等确认**；除非用户明确要求连续执行，否则不要自行推进到 T0.3。

---

## 2. 新会话开场提示词（可直接粘贴）

```text
工作目录：D:\DSH_Work_Space\curve-studio（仓库根）。

先读 AGENTS.md、docs/HANDOFF.md、docs/SPEC.md §15.3、docs/TASKS.md 的 T0.2、
docs/TESTPLAN.md §1.1 与 E1，以及 docs/DECISIONS.md 的 ADR-001/002。

当前 T0.1 已完成并提交（702293c），工作树干净。请执行 T0.2：
先按 AGENTS.md §8 复述目标/产出/验收与风险，再写测试/验证骨架、实现、
跑 pnpm verify 与任务验证命令，更新 TASKS/CHANGELOG/DECISIONS（Electron 实际版本），
按 Conventional Commits 提交，最后输出任务报告并停下等我确认。
不要自动进入 T0.3；不要关闭 Electron 安全选项；不要跳过测试或放宽 lint。
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
| 当前 DSH 文件策略 | `danger-full-access`（截至交接时） |

Node/pnpm **不在 PATH**。每条命令前先注入：

```powershell
$env:PATH = "D:\DSH_Work_Space\tools\bin;C:\Users\MECHREVO\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin;$env:PATH"
$git = 'D:\DSH_Work_Space\tools\mingit\cmd\git.exe'
cd D:\DSH_Work_Space\curve-studio
```

### 3.2 Git

- 仓库已 `git init -b main`；本地身份：`Curve Studio Agent <agent@curve-studio.local>`。
- `core.autocrlf=false`；`.gitattributes` 强制 `eol=lf`（保护 JSONL/CSV 夹具）。
- 提交用上面的 `$git` 绝对路径；不要重置或改写已有提交。
- 初始文档提交 `347637b`，T0.1 提交 `702293c`（55 files）。

### 3.3 网络与 Electron 下载（T0.2 的高风险点）

- npm registry 可达，但**很慢**：元数据请求常见 10–90s；完整重装约 10 分钟。
- GitHub release **HEAD 可达，但 release-assets 的 GET 曾连接超时**（MinGit 直连失败）。
- `registry.npmmirror.com` 可达且快，已验证可下载 Git for Windows 二进制。
- **T0.2 安装 Electron 前建议先设镜像**：

  ```powershell
  Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
  $env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'
  $env:ELECTRON_CUSTOM_DIR = '{{ version }}'
  pnpm install
  ```

  若仍失败：直接运行 `node node_modules\electron\install.js`（同样带上述环境变量），
  它会把二进制解压到 `node_modules/electron/dist` 并写 `path.txt`。不要跳过 Electron 安装后假装能启动。

### 3.4 沙箱 / postinstall 边界

- 在**受限沙箱**下，pnpm 用管道 stdio 派生 postinstall，会触发 `spawn EPERM`
  （`unrs-resolver postinstall$ node postinstall.js` 失败）。这不是代码问题。
- 当前 full-access 下已正常：`pnpm install --force` 输出 `unrs-resolver postinstall: Done`，exit 0。
- 如果文件策略回退到 `workspace-write`：
  - 优先在允许的环境重跑 `pnpm install`；
  - 或 `pnpm install --ignore-scripts`，再直接 `node node_modules\<pkg>\install.js`（Electron 用此路径）；
  - 不要为了绕过而关闭 `allowBuilds`、`sandbox` 或提交 `--ignore-scripts` 到 CI。
- `pnpm-workspace.yaml` 已有显式白名单：`electron`、`esbuild`、`unrs-resolver`。
  新依赖若确需 build script，必须逐项加入白名单并说明原因，不能整包放开。

### 3.5 `ELECTRON_RUN_AS_NODE=1`

- 当前 DSH 进程环境全局存在 `ELECTRON_RUN_AS_NODE=1`，子进程会继承。
- 后果：Electron 可执行文件会以纯 Node 运行，窗口不出现，E2E 失败。
- 处理：所有启动 Electron 的命令前 `Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue`；
  Playwright `_electron.launch({ env })` 中显式 `delete env.ELECTRON_RUN_AS_NODE`。
- 在 T0.2 的 E2E 中断言 `typeof window.require === 'undefined'`、`typeof process === 'undefined'`，
  同时确认应用确实以窗口模式启动（`app.isPackaged === false` 且窗口可见）。

---

## 4. T0.1 已交付内容

### 4.1 文件

```
package.json                 # 脚本契约 + packageManager pnpm@11.28.5 + engines node>=20.11
pnpm-workspace.yaml          # apps/* packages/* plugins/* + allowBuilds 白名单
tsconfig.base.json           # strict + noUncheckedIndexedAccess/noImplicitOverride/noUnused* + @curve/* paths
tsconfig.json                # solution：references 9 个项目
eslint.config.js             # ESLint 9 flat：typescript-eslint、react-hooks、import/order、no-restricted-imports
.prettierrc / .prettierignore
vitest.config.ts             # node 环境；覆盖率阈值（lines/statements/functions 70、branches 60）
.dependency-cruiser.cjs      # SPEC §4.3 边界规则；规则 7 按包生成
.gitignore / .gitattributes / .editorconfig
CHANGELOG.md
docs/adr/README.md
docs/adr/017-lint-boundary-gate.md
packages/{domain,table-engine,chart-model,chart-echarts,persistence,plugin-sdk,ui,app-core}/
  ├─ package.json            # private, type module, exports "." -> ./src/index.ts
  ├─ tsconfig.json           # composite + dist-types（gitignored）
  └─ src/index.ts + index.test.ts
apps/desktop/                # 同样是占位包；T0.2 替换为三进程入口
  ├─ package.json
  ├─ tsconfig.json           # types: ["node"]（T0.2 需要重新评估 renderer 的 DOM/Node 类型拆分）
  └─ src/index.ts + index.test.ts
pnpm-lock.yaml
```

### 4.2 关键决策

- **ADR-017**：`pnpm lint` = `eslint . --max-warnings=0 && pnpm lint:boundaries`；
  `lint:boundaries` = `depcruise apps packages --config .dependency-cruiser.cjs`。
  SPEC §5.2 已同步。`plugins/*` 在 T6.2 加入扫描路径。
- **依赖边界规则 7（禁止 `@curve/*/src/*` 深层导入）**：
  - depcruise 按包生成 `no-deep-import-into-<pkg>`（包外 → 该包 `src/` 非 index 文件即报错）；
  - ESLint `no-restricted-imports` 对 `@curve/*/src`、`@curve/*/src/*` 兜底。
- **TS 工程引用**：`tsc -b` + 源码包 + paths 已跑通。新增跨包 import 时，
  必须在**引用方** `tsconfig.json` 的 `references` 里补目标包，否则报 TS6307/TS6059。
  本次 `app-core` 已补 `domain/table-engine/chart-model/persistence/plugin-sdk`。
- **`.gitattributes` 强制 LF**：JSONL/CSV 格式要求，不要在 Windows 上改成 CRLF。

### 4.3 已验证证据（T0.1）

| 命令 | 结果 |
|---|---|
| `pnpm install` | exit 0；`Already up to date`；无 peer 警告 |
| `pnpm exec tsc -b --force --pretty false` | exit 0；无残留 `src/*.d.ts` |
| `pnpm verify` | exit 0；ESLint 0 warning；depcruise `no dependency violations found (18 modules, 11 dependencies cruised)`；**9 test files / 9 tests passed** |
| `pnpm test:coverage` | exit 0；Statements/Branches/Functions/Lines **100%** |
| `pnpm format:check` | exit 0；`All matched files use Prettier code style!` |
| 故意 `domain → react` 后 `pnpm lint` | exit 1：`error domain-stays-pure: packages/domain/src/__boundary_probe.ts → react`；删除探针后 exit 0 |

路径别名已由 `table-engine`/`app-core` 测试验证：`import { PACKAGE_NAME } from '@curve/domain'` 正常解析。

---

## 5. 下一步：T0.2 Electron 三进程骨架与安全窗口

### 5.1 任务原文要点（TASKS.md）

- 依赖：T0.1；覆盖：NFR-02、NFR-08；参考：SPEC §15.3。
- 产出：
  - `apps/desktop/electron.vite.config.ts`
  - `src/main/index.ts`、`src/preload/index.ts`、`src/renderer/`（React 入口）
  - 安全窗口（`contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`、`webSecurity: true`，preload 输出 CJS）
  - 菜单骨架、窗口尺寸记忆、开发/生产加载路径
- 步骤：
  1. 安装 Electron、electron-vite、React、electron-builder（先不打包）。
  2. main 创建窗口并加载 renderer；dev 用 Vite server，prod 用 `loadFile`。
  3. preload 只暴露 `app.info`；renderer 渲染 “Curve Studio” 空壳。
  4. 加 `will-navigate` / `setWindowOpenHandler` 拒绝与 CSP。
- 验收：
  - [ ] `pnpm dev` 打开窗口，DevTools 仅在开发可用。
  - [ ] 打包态或预览态能加载 renderer，控制台无 Node 暴露错误。
  - [ ] renderer 中 `window.require` / `process` 为 `undefined`。
  - [ ] 外部链接点击不打开新窗口。
- 验证：`pnpm build && pnpm exec playwright test --grep "smoke"`（T0.5 提供用例前可手工）。

### 5.2 启动前的依赖与配置决定

- 建议把 Electron 依赖放在 `apps/desktop` 的 `devDependencies`：
  `electron`（安装时最新 stable，锁精确版本）、`electron-vite`、`electron-builder`、
  `vite`、`@vitejs/plugin-react`、`react`、`react-dom`、`@types/react`、`@types/react-dom`。
- 当前已知最新：Electron **44.9.0**、electron-vite **6.0.0**、React **19.3.1**、Vite **8.3.4**。
  安装后把 Electron 实际版本补进 `docs/DECISIONS.md` 的 ADR-001 备注（SPEC §5.1）。
- `electron-vite` 的 peer 里可能有 `@swc/core`；先看 `pnpm install` 是否产生 peer 警告，再决定是否加。
  不要用 `--no-strict-peer-dependencies` 之类方式“消除”警告。
- 新增运行时依赖前按 AGENTS §4 写 ADR；但 Electron/React/Vite 已在 ADR-001/002 与 SPEC §5.1 覆盖，
  只需补版本备注，除非偏离选型。

### 5.3 实现陷阱（按优先级）

1. **preload 必须 CJS，且不能依赖被 externalize 的包**
   - 根 `package.json` 是 `"type": "module"`；electron-vite 默认可能输出 ESM。
   - 对 sandbox preload，显式配置 CJS 输出：`build.rollupOptions.output.format = 'cjs'`，
     并让 main 的 `webPreferences.preload` 指向实际文件名（如 `../preload/index.cjs`）。
   - 不要让 preload import `zod` 或 contracts 里的 Zod schema；`externalizeDepsPlugin` 会把
     `dependencies` 变成 `require('zod')`，在 `sandbox: true` 下不可用。
     T0.2 的 preload 只 import `electron` 与一个**零运行时依赖**的 channel 常量模块。
2. **CSP 与 dev HMR 的冲突**
   - 生产 CSP（SPEC §15.3）：`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'`。
   - 开发模式需额外允许 `ws://localhost:*` 与 `http://localhost:*`。
   - 推荐在 main 里用 `session.defaultSession.webRequest.onHeadersReceived` 按 `app.isPackaged` 注入策略，
     避免 meta 同时存在导致开发态被生产 CSP 卡死。无论哪种方式，CSP 必须真实存在且可验证。
3. **`ELECTRON_RUN_AS_NODE`**：见 §3.5；启动与 E2E 都必须清除。
4. **窗口状态**
   - `userData/window-state.json` 保存尺寸/位置；恢复时校验在可见屏幕内，否则回退 1440×900 居中。
   - 最小 1024×700；不要写入工作区目录。
5. **导航与新窗口**
   - `will-navigate` 一律 `preventDefault()`（初始 `loadURL/loadFile` 不触发它）。
   - `setWindowOpenHandler` 一律 `{ action: 'deny' }`。
   - 外部链接（测试页内置）点击不得打开新窗口；不要调用 `shell.openExternal` 任意 URL。
6. **DevTools**
   - `webPreferences.devTools: !app.isPackaged`；菜单里仅在开发模式提供 toggle。
   - 验收要求“DevTools 仅在开发可用”，不要把 `openDevTools()` 写死在启动路径。
7. **renderer 的 Node 边界**
   - 当前 `apps/desktop/tsconfig.json` 只有 `types: ["node"]`、`lib: ["ES2022"]`。
     T0.2 引入 DOM 后，建议拆成 main/preload（node）与 renderer（DOM）两个 tsconfig 项目，
     并更新根 `tsconfig.json` 的 references；若暂时单项目，至少加 ESLint 覆盖：
     对 `apps/desktop/src/renderer/**` 禁止 `process`/`require`/`Buffer`/`__dirname` 全局与 `node:*` 导入。
   - 运行时以 `nodeIntegration: false` 为准，但类型/ lint 层也要防回归。
8. **占位文件替换**
   - `apps/desktop/src/index.ts` 与 `index.test.ts` 会被三进程入口替换；`package.json` 的
     `exports`/`main` 要相应调整（Electron 入口用 `main: "./out/main/index.cjs"`）。
   - 根 `tsconfig.base.json` 里的 `@curve/desktop` 路径映射若不再需要，移除前确认没有引用。

### 5.4 验证建议

- `pnpm build` 后检查：
  - `apps/desktop/out/main/index.cjs`（或实际 CJS 入口）
  - `apps/desktop/out/preload/index.cjs`
  - `apps/desktop/out/renderer/index.html`
- 自动化冒烟（建议 T0.2 就装 `@playwright/test` 并写最小 `apps/desktop/e2e/smoke.spec.ts`；
  T0.5 再补齐 CI/trace/覆盖率 gate，这与原计划“T0.4 前需要 e2e”一致，属计划内前移，任务报告里说明即可）：
  - `_electron.launch({ args: ['out/main/index.cjs'], env })`，`env` 删除 `ELECTRON_RUN_AS_NODE`；
  - 断言窗口标题包含 `Curve Studio`；
  - `page.evaluate(() => typeof window.require)` → `undefined`；
  - `page.evaluate(() => typeof process)` → `undefined`；
  - 断言 `window.api.app.info()` 返回 `{ version, platform, locale }`；
  - 点击测试页内置外链，断言没有新窗口；
  - 截图存 `docs/reports/m0/t0.2-window.png`（小文件可提交，作为验收证据）。
- 若 Playwright 暂时不可用：至少用 `pnpm dev` 手工开窗 + DevTools 控制台检查，
  并在报告中写明“手工验证”，不要声称自动化通过。
- `pnpm verify` 必须继续全绿；桌面包新增代码要有测试（窗口选项工厂、窗口状态校验等纯函数优先）。

### 5.5 收尾

- 勾选 `docs/TASKS.md` T0.2 的 4 个验收项与状态。
- `CHANGELOG.md` 增加 T0.2 条目。
- `docs/DECISIONS.md` ADR-001 补 Electron 实际版本（以及 electron-vite/React/Vite 版本）。
- 若新增 Playwright 依赖或拆分 tsconfig，写进任务报告；只有偏离 SPEC/数据格式/安全/公共 API 才需要新 ADR。
- 提交示例：`feat(desktop): add secure electron shell`，正文写“验证：”与命令结果摘要。
- 输出任务报告（任务 ID、改动文件、验证命令与真实结果、截图路径、残留风险），**停下等确认**。

---

## 6. M0 剩余任务与停点

| 任务 | 内容 | 关键依赖/注意 |
|---|---|---|
| T0.2 | Electron 三进程 + 安全窗口 | Electron 下载镜像；CJS preload；`ELECTRON_RUN_AS_NODE` |
| T0.3 | 类型化 IPC 与错误信封 | 见 §7.1 的 `AppError` 位置决定 |
| T0.4 | 设计令牌与 App Shell | 需要 e2e 截图；200% 缩放；文案走 `t()` |
| T0.5 | CI、E2E 与提交门禁 | 覆盖率 gate 已配好；Playwright trace；CI YAML |

**M0 验收演示**：`pnpm dev` 打开窗口 → `pnpm verify` 全绿 → 故意违反依赖边界被 lint 拦截 → E2E smoke 通过。
产出 `docs/reports/m0/REPORT.md`（命令、结果、截图路径、遗留问题）后**停下等用户确认**，不要自动进入 M1。

---

## 7. 后续里程碑提醒

### 7.1 T0.3 的公共 API 位置（已获用户批准的默认方案）

- `ErrorCode` / `AppError` 放 `@curve/domain`（纯类型 + Zod），`apps/desktop/src/shared/contracts/ipc.ts` 重导出；
  `IpcResult<T>` 留在 desktop contracts。
- 理由：`app-core`/`persistence` 都需要 `AppError`，不能反向依赖 desktop。
- 如果新会话要改动这个位置，属于公共 API 决策，**先问用户**。

### 7.2 M1–M6

- 严格按 `docs/TASKS.md` 的 ID 顺序；每个任务一个提交；每个里程碑结束跑验收演示、写报告、停下。
- `T1.1` 起，domain 的 public API 会快速扩张；保持 Zod schema 与类型同步，覆盖率 ≥85%。
- 文件格式 / IPC 通道 / 公共 API 的歧义必须停问；其余按 SPEC §19 默认值 + ADR。

---

## 8. 已知风险与处理

| 风险 | 影响 | 处理 |
|---|---|---|
| Vite 8 提示改用原生 `resolve.tsconfigPaths` | 每次测试打印一条 **非阻断提示**，exit 0 | 按 SPEC §5.3 保留 `vite-tsconfig-paths`；若切换，先写 ADR 并更新 SPEC |
| ESLint 9.39.5 已被 npm 标记停止支持 | 长期无安全更新 | TASKS 指定 ESLint 9，且 `eslint-plugin-import` peer 尚不支持 10；升级需单独 ADR + 替换 import 插件评估 |
| Electron 二进制下载 | T0.2 可能超时/失败 | 用 §3.3 的 npmmirror 镜像；失败时直接 `node node_modules/electron/install.js`，不跳过 |
| pnpm 管道 stdio EPERM | 受限沙箱下 postinstall 失败 | 用 full-access 或 `--ignore-scripts` + 直接 node 执行 postinstall；不改安全策略 |
| 跨包 import 未加 TS reference | `tsc -b` TS6307/TS6059 | 新增 import 时同步引用方 `tsconfig.json` 的 `references`；`tsc -b --force` 验证 |
| 截图基线字体差异 | 视觉快照不稳定 | 断言令牌/计算样式；像素基线允许字体渲染差异（TESTPLAN E5 已允许） |
| 100k 性能预算 | M2/M4 可能超预算 | T2.1/T2.6 提前 Worker/虚拟化；T2.7/T4.6 专项硬化；超预算记录实测与计划，不静默放过 |
| 安装 electron-builder | 会拉取 app-builder 二进制 | 安装阶段先不打包；T6.4 才 `pnpm package`，实际安装冒烟前问用户 |

---

## 9. 不可做清单（重申）

- 不关闭 `contextIsolation` / `sandbox` / `webSecurity`，不打开 `nodeIntegration`。
- 不在 renderer 里 `require('fs')`、读任意路径、暴露 `ipcRenderer` 本体或泛 `invoke`。
- 不为通过安装而删除 `allowBuilds` 白名单或提交 `--ignore-scripts`。
- 不跳过测试、不放宽 ESLint 规则、不用 `--no-verify`。
- 不未经 ADR 升级 `formatVersion`、改数据格式、改 IPC 通道或公共 API。
- 不把 `node_modules`、`out/`、`dist-types/`、`release/`、真实用户数据提交进仓库。
- 不自动跨里程碑推进；每个里程碑验收报告后停下等确认。

---

## 10. 新会话启动检查清单

- [ ] `git status --short` 干净，`git log --oneline -3` 显示 `702293c`。
- [ ] 已注入 PATH（§3.1），`pnpm --version` 为 11.28.5。
- [ ] 已读 `AGENTS.md`、本文件、T0.2 相关 SPEC/TESTPLAN 段落。
- [ ] 已确认当前 DSH 文件策略；若为受限沙箱，先决定 postinstall 方案。
- [ ] 已清除 `ELECTRON_RUN_AS_NODE`（启动 Electron 前）。
- [ ] 已确认用户本轮范围（默认 T0.2 完成后停下）。
- [ ] 复述 T0.2 目标/产出/验收后再动手。
