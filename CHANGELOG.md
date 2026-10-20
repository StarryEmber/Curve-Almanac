# Changelog

本文件记录 Curve Studio 的所有重要变更。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [SemVer](https://semver.org/lang/zh-CN/)。应用代码尚未发布（0.x），条目按任务 ID 归档在 `Unreleased` 下。

## [Unreleased]

### Added

- T0.1：初始化 pnpm monorepo（`apps/*`、`packages/*`、`plugins/*`）与 Node/pnpm 版本约束。
- T0.1：TypeScript strict 基线（`noUncheckedIndexedAccess`、`noImplicitOverride`、`noUnusedLocals`、
  `noUnusedParameters`）与 `@curve/*` 路径映射。
- T0.1：ESLint 9 flat config（typescript-eslint、react-hooks、import/order）、Prettier、Vitest 与覆盖率门禁。
- T0.1：dependency-cruiser 边界规则，落实 SPEC §4.3 的七条依赖约束。
- T0.1：9 个包骨架（`domain`、`table-engine`、`chart-model`、`chart-echarts`、`persistence`、
  `plugin-sdk`、`ui`、`app-core`、`desktop`）与包级 smoke 测试。
- T0.1：`CHANGELOG.md`、`docs/adr/README.md` 与 ADR-017。
- T0.2：Electron 三进程骨架（`apps/desktop/src/{main,preload,renderer}`）与 `electron.vite.config.ts`，
  main/preload 输出 CJS（`out/main/index.cjs`、`out/preload/index.cjs`）。
- T0.2：安全窗口工厂（`contextIsolation`/`sandbox`/`webSecurity`/`nodeIntegration: false`，窗口选项有单测）、
  `will-navigate` 与 `setWindowOpenHandler` 全拒绝、权限请求全拒绝、`will-attach-webview` 拒绝。
- T0.2：生产/开发两套 CSP（构建期注入 `<meta>`），生产策略与 SPEC §15.3 逐字一致。
- T0.2：`app:info` IPC 通道与类型化 preload 桥（`window.api.app.info()`，无 `invoke` 泛入口）。
- T0.2：菜单骨架（DevTools/Reload 仅开发模式）、窗口尺寸记忆（`userData/window-state.json`，
  离屏回退 1440×900 居中）、E2E 专用 userData 重定向钩子。
- T0.2：Playwright Electron E2E（TESTPLAN E1 五条 smoke）+ 截图证据
  `docs/reports/m0/t0.2-window.png`、`t0.2-dev-window.png`。
- T0.2：ADR-018（开发模式 CSP 为 Fast Refresh 放宽）与 SPEC §15.3 同步。
- T0.3：`ErrorCode`/`AppError`/`appErrorSchema`/`toAppError` 迁入 `@curve/domain`
  （`zod` 成为该包唯一运行时依赖），新增 `packages/domain/src/errors.ts` 与 16 条单测。
- T0.3：类型化 IPC 契约 `apps/desktop/src/shared/contracts/`：`channels.ts`（SPEC §15.1 的 18 个通道名，
  零依赖）、`envelope.ts`（`IpcResult` 与 `isIpcResult`）、`ipc.ts`（每个已实现通道的 Zod 请求/响应 schema、
  `AppInfo`/`LogWriteRequest`/`CurveApi`）。
- T0.3：main 的 IPC 注册与分发 `src/main/ipc/{dispatch,register,handlers}.ts`：256MB 载荷上限、
  入参校验失败 → `E_IPC_INVALID_PAYLOAD`、异常统一映射（不泄露堆栈）、响应契约校验、重复注册抛错。
- T0.3：`log:write` 通道与 `log.write` preload 方法；`window.api` 仍只暴露 `app.info`/`log.write`，
  无 `invoke`/`send` 泛入口。
- T0.3：renderer 的 `api-client`（入参与响应双向校验）、`error-text`（按 code 出文案，不回显
  `message`/`detail`）与 toast 骨架（T0.4 替换为 `@curve/ui`）。
- T0.3：TESTPLAN §1.1 对话框替身 `resolveE2EDialogStubs`（仅未打包 + `CURVE_E2E=1` 生效）。
- T0.3：E2E `apps/desktop/e2e/ipc.spec.ts` 四条（桥方法白名单、正常路径、非法载荷后进程存活、
  真实已注册通道集合）。

### Changed

- T0.1：按 ADR-017 调整 `docs/SPEC.md §5.2` 的 `lint` 脚本，使其同时执行 ESLint 与 dependency-cruiser。
- T0.2：`apps/desktop` 拆分为 node / web / e2e 三个 TS 工程（solution `tsconfig.json`），
  根 `tsconfig.json` 引用三者；移除已无引用的 `@curve/desktop` 路径映射。
- T0.2：ESLint 增加 renderer Node 边界（禁止 `process`/`require`/`Buffer`/`node:*`/`electron` 导入）。
- T0.2：Vitest 覆盖率排除三个进程入口（其行为由 E2E 覆盖），其余逻辑仍受门禁约束。
- T0.2：`package.json` 的 `e2e` 脚本改用 `apps/desktop/playwright.config.ts`。
- T0.2：`pnpm-workspace.yaml` 显式声明 `electron-winstaller: false`（v1 用 NSIS，不需要 Squirrel 安装脚本）。
- T0.3：删除 `apps/desktop/src/shared/ipc.ts` 与 `apps/desktop/src/main/errors.ts`
  （分别由 `shared/contracts/*` 与 `@curve/domain` 取代）；`src/main/index.ts` 改用 IPC 注册器与 `logger`。
- T0.3：`electron.vite.config.ts` 为 main 增加 `vite-tsconfig-paths`（SPEC §5.3），
  `apps/desktop/tsconfig.{node,web,e2e}.json` 增加对 `packages/domain` 的工程引用。
