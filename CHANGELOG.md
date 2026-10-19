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

### Changed

- T0.1：按 ADR-017 调整 `docs/SPEC.md §5.2` 的 `lint` 脚本，使其同时执行 ESLint 与 dependency-cruiser。
