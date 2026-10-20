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

### Changed

- T0.1：按 ADR-017 调整 `docs/SPEC.md §5.2` 的 `lint` 脚本，使其同时执行 ESLint 与 dependency-cruiser。
- T0.2：`apps/desktop` 拆分为 node / web / e2e 三个 TS 工程（solution `tsconfig.json`），
  根 `tsconfig.json` 引用三者；移除已无引用的 `@curve/desktop` 路径映射。
- T0.2：ESLint 增加 renderer Node 边界（禁止 `process`/`require`/`Buffer`/`node:*`/`electron` 导入）。
- T0.2：Vitest 覆盖率排除三个进程入口（其行为由 E2E 覆盖），其余逻辑仍受门禁约束。
- T0.2：`package.json` 的 `e2e` 脚本改用 `apps/desktop/playwright.config.ts`。
- T0.2：`pnpm-workspace.yaml` 显式声明 `electron-winstaller: false`（v1 用 NSIS，不需要 Squirrel 安装脚本）。
