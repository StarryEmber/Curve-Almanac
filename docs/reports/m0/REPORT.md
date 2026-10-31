# M0 验收报告 — 基建

> 日期：2026-10-20 · 分支：`main` · 提交：`5cb985a`（T0.5）· 工作树：干净
> 环境：Windows 10 x64 · Node 24.21.0 · pnpm 11.28.5 · Electron 44.9.0 · Playwright 1.64.1
> 退出标准（`docs/TASKS.md` M0 行）：**窗口能开、门禁能跑、违规依赖被拦**。

## 1. 结论

M0 的退出标准全部达成，五条验收演示均按顺序执行并留下真实输出。建议进入 M1（`T1.1`），
**等用户确认后再开始**。已知遗留见 §5，均不阻塞 M1。

## 2. 验收演示与真实输出

### 2.1 `pnpm dev` 打开窗口

agent shell 内按 `docs/HANDOFF.md §3.3` 注入环境变量（普通终端直接 `pnpm dev` 即可）：

```powershell
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
$env:NO_SANDBOX = '1'
$env:CURVE_E2E = '1'
$env:CURVE_E2E_USER_DATA = 'D:\DSH_Work_Space\curve-studio\apps\desktop\test-results\dev-user-data'
pnpm dev
```

日志（`test-results/dev-m0.log`）：

```text
dev server running for the electron renderer process at:
  ➜  Local:   http://localhost:5173/
starting electron app...
[main] window ready (mode=development, devTools=true, visible=true)
```

### 2.2 `pnpm verify` 全绿

```text
$ eslint . --max-warnings=0 && pnpm lint:boundaries
✔ no dependency violations found (115 modules, 262 dependencies cruised)
$ tsc -b --pretty false
$ vitest run
 Test Files  38 passed (38)
      Tests  228 passed (228)
```

exit 0；ESLint 0 problem；测试耗时 3.7s。

### 2.3 故意违反依赖边界被 lint 拦截

在 `packages/domain/src/index.ts` 临时加入 `import React from 'react'`（`domain` 只允许 `zod`）：

```text
$ depcruise apps packages --config .dependency-cruiser.cjs

  error domain-stays-pure: packages/domain/src/index.ts → react

x 1 dependency violations (1 errors, 0 warnings). 116 modules, 263 dependencies cruised.
[ELIFECYCLE] Command failed with exit code 1.
```

`pnpm lint` exit 1。撤销探针后重跑 `pnpm lint`：exit 0、`115 modules, 0 violations`，`git status` 干净。
探针未提交。

### 2.4 `pnpm e2e` smoke 通过

```text
Running 15 tests using 1 worker
  ok 1–4   apps/desktop/e2e/ipc.spec.ts     （T0.3 typed IPC）
  ok 5–10  apps/desktop/e2e/shell.spec.ts   （T0.4 shell）
  ok 11–15 apps/desktop/e2e/smoke.spec.ts   （E1 启动与安全）
  15 passed (25.5s)
```

共 29.3s（含 `pnpm build`）。E1 5 条、shell 6 条、IPC 4 条，均覆盖 TESTPLAN 对应场景。

### 2.5 覆盖率门禁（CI 同款命令）

`pnpm test:coverage` exit 0：

| 指标 | 实测 | 阈值 |
|---|---|---|
| lines | **95.89%** | 70% |
| statements | **96.02%** | 70% |
| functions | **100%** | 70% |
| branches | **86.76%** | 60% |

`@curve/ui` 行覆盖 92.33%、分支 78.81%（Menu/Select 的键盘分支），高于全局阈值。
阈值定义在 `vitest.config.ts`，本次**未下调**。

### 2.6 干净克隆（T0.5 验收项）

从提交 `5cb985a` 克隆到 `D:\DSH_Work_Space\curve-studio-clean`：

| 步骤 | 结果 |
|---|---|
| `git clone` | exit 0，HEAD=`5cb985a` |
| `pnpm install --frozen-lockfile` | exit 0，13.1s；根 `postinstall` 输出 `[install-electron] done.` |
| `pnpm verify` | exit 0，17.4s；38 files / 228 tests；depcruise 115 modules 0 violations |
| `pnpm e2e`（`CURVE_E2E_NO_SANDBOX=1`） | exit 0，32.8s；**15 passed** |

> 关键修复：`electron@44.9.0` 的 npm 包不再带 `postinstall`，干净安装不会下载运行时。
> T0.5 增加根 `postinstall` → `scripts/install-electron.mjs`（已存在则跳过、尊重
> `ELECTRON_MIRROR`/`ELECTRON_CUSTOM_DIR`、失败非零退出），否则干净克隆/CI 的 E2E 必然失败。

### 2.7 E2E 失败留证（T0.5 验收项）

临时加入一条必失败用例（未提交），`pnpm exec playwright test --grep "T0.5 probe"` exit 1，产出：

| 证据 | 路径 | 大小 |
|---|---|---|
| 失败截图（内建 `screenshot: 'only-on-failure'`） | `test-results/<test>/test-failed-1.png` | 46.5 kB |
| 内建 test trace | `test-results/<test>/trace.zip` | 45.9 kB |
| 完整 context trace（fixture 录制，含 `trace.network`、`screencast/*.jpeg`） | `test-results/<test>/attachments/trace-*.zip` | 28.5 kB |
| 错误上下文 | `test-results/<test>/error-context.md` | 1.5 kB |

删除探针后重跑：15 passed，且通过用例不残留任何 trace 目录（`retain-on-failure` 生效）。
CI 在 E2E 失败时上传 `apps/desktop/test-results` 与 `apps/desktop/playwright-report`。

## 3. 截图证据

- `docs/reports/m0/t0.2-window.png` — E1 截图用例（每次 `pnpm e2e` 重写）
- `docs/reports/m0/t0.4-shell-light.png` — T0.4 浅色基线
- `docs/reports/m0/t0.4-shell-dark.png` — T0.4 深色基线
- `docs/reports/m0/t0.2-dev-window.png` — T0.2 开发窗口（历史证据，未重写）

截图受真实鼠标悬停位置影响，**字节不稳定**；T0.4 已决定不断言像素，只断言令牌与计算样式
（TESTPLAN §8 / TASKS T0.4 备注）。因此 `pnpm e2e` 后工作树可能出现截图差异，属预期。

## 4. 里程碑交付

| 任务 | 提交 | 结果 |
|---|---|---|
| T0.1 monorepo 与质量工具链 | `dad2a33` | `pnpm install` / `pnpm verify` 通过，边界规则生效 |
| T0.2 Electron 三进程与安全窗口 | `91b1ade` | 安全窗口、CSP、E1 5/5 |
| T0.3 类型化 IPC 与错误信封 | `130395c` | 契约三件、错误映射、IPC E2E 4/4 |
| T0.4 设计令牌与 App Shell | `1231c09` | 58 令牌、组件库、i18n、主题、shell E2E 6/6 |
| T0.5 CI、E2E 与提交门禁 | `5cb985a` | CI 矩阵、失败留证、覆盖率门禁、干净克隆通过 |
| M0 验收报告 | 本次文档提交 | 本文件 |

## 5. 遗留问题与已知风险

| # | 问题 | 影响 | 处理 |
|---|---|---|---|
| 1 | 渲染进程 bundle 773.66 kB 且含 zod | 启动/内存 | T6.4 打包阶段决定压缩/拆包/是否保留渲染端二次校验 |
| 2 | 截图证据非字节稳定（鼠标悬停） | 每次 `pnpm e2e` 后工作树变脏 | 已记录为预期；断言不依赖像素；需要时在 M1 之后给截图用例加中性指针位置 |
| 3 | CI 工作流尚未在真实 GitHub runner 运行 | Windows runner 的 Electron 启动、artifact 上传未实测 | 首次 push 后确认；本地已用干净克隆验证命令序列 |
| 4 | `@curve/ui` 分支覆盖 78.81% | 低于 SPEC 对纯逻辑包 85% 的要求（ui 非纯逻辑包） | M1 起新增代码按 ≥85% 要求；如需再补 Menu/Select 分支 |
| 5 | Electron 44 无 package `postinstall` | 升级 electron 时可能再断 | 已由根 `postinstall` 修复；升级时复核 `scripts/install-electron.mjs` |
| 6 | Ubuntu CI 也会执行 Electron 运行时下载 | 质量任务多约 10–20s | 可接受；如变慢再按平台跳过 |
| 7 | `pnpm bench` / `scripts/bench.ts` 尚未实现 | 性能门禁未接线 | 按 TASKS 在 T2.7 落地 |
| 8 | `t0.2-window.png` / `t0.4-shell-*.png` 会被 E2E 重写 | 提交噪声 | 预期行为，文档已注明 |

## 6. 结论

- M0 退出标准：窗口能开 ✅、门禁能跑 ✅、违规依赖被拦 ✅。
- `pnpm verify`、`pnpm e2e`、`pnpm test:coverage`、干净克隆安装与 E2E 全部通过。
- 建议进入 M1 的 `T1.1`（领域模型、Zod 与不变量）；**需用户确认后再开始**，不自动推进。
