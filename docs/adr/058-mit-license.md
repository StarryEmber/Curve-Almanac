# ADR-058 开源许可证切换：UNLICENSED → MIT（公开发布）

- 状态：**已接受**（2026-10-30，用户决定）
- 日期：2026-10-30
- 相关：SPEC §0；README §10；`apps/desktop/build/license.txt`；T6.4/ADR-055；发布说明 `docs/releases/0.1.0.md`

## 背景

v1 之前按“专有软件”交付：根与 `apps/desktop/package.json` 的 `license` 为 `UNLICENSED`，
`apps/desktop/build/license.txt` 为“proprietary and confidential / All rights reserved”，
`packaging.test.ts` 断言该专有文本。

用户 2026-10-30 决定把 Curve Almanac **公开到 GitHub 并开源**，因此必须：

1. 给仓库一个明确的开源许可证（否则公开源码默认“保留所有权利”，他人无法合法使用/修改）；
2. 让安装包许可证页与 `package.json` 的许可证一致；
3. 重新打包并更新校验和/发布说明；
4. 保留 Electron/Chromium/依赖自身的许可证。

## 决定

采用 **MIT License**（用户选项为 MIT/Apache-2.0；选 MIT：文本最短、义务最少、与当前
“个人/小团队工具”定位相符；Apache-2.0 的专利授权条款可在发布前另行切换，见复核条件）。

具体变更：

- 新增根 `LICENSE`：标准 MIT 文本，`Copyright (c) 2026 StarryEmber`（主体见 ADR-059）。
- 根 `package.json` 与 `apps/desktop/package.json` 的 `license` 改为 `"MIT"`。
- `apps/desktop/build/license.txt`（NSIS 许可证页）改为 MIT 文本 + 第三方许可说明。
- `apps/desktop/test/packaging.test.ts`：断言 `MIT`、`MIT License`、`Permission is hereby granted`，
  替换原来的 `UNLICENSED`/`All rights reserved` 断言。
- README §10、`docs/releases/0.1.0.md` 的许可证段落改为 MIT；维护交接/发布待办同步。
- 重新执行 `pnpm package`，更新 `release/SHA256SUMS.txt`、发布说明与维护交接里的哈希/体积。

## 代价

- **不可撤回**：已按 MIT 发布的版本，任何人都可以按 MIT 使用/修改/再分发；不能对已发布版本
  “收回”许可。发布前确认版权主体名称（当前为 “StarryEmber”，见 ADR-059）。
- MIT **不含专利授权**（Apache-2.0 有）；若产品涉及专利，发布前应改 Apache-2.0。
- MIT 不授予商标权；“Curve Almanac”名称/图标不随代码许可自动授权。
- 安装包许可证页文本变化 → 必须重打包；旧的专有安装包（若已分发）仍按旧条款。
- 需要保留所有第三方许可证（Electron/Chromium/npm 依赖）；MIT 只覆盖本项目代码。
- 公开源码后，安全问题/issue/PR 的维护成本上升；发布说明需写明支持范围。

## 影响

- 新增：`LICENSE`、本 ADR。
- 修改：根/desktop `package.json`、`build/license.txt`、`packaging.test.ts`、README、
  `docs/releases/0.1.0.md`、`docs/HANDOFF-MAINTENANCE.md`、`docs/adr/README.md`、CHANGELOG；
  重新生成的 `release/*.exe`、`release/SHA256SUMS.txt`（gitignore，不上传仓库）。
- 不改：源代码行为、`formatVersion`、JSONL/manifest、IPC、CSP、Electron 安全选项、依赖。
- 历史报告/ADR（如 T6.4）中的“专有软件”描述保留为当时事实，由本 ADR 作为变更索引。

## 复核条件

- 若发布前决定改用 **Apache-2.0**：替换 `LICENSE` 与 `build/license.txt`、`package.json` 的
  `license`、测试断言与 README/发布说明，重新打包并更新校验和；不要只改一处。
- 若版权主体不是 “StarryEmber”（公司/个人）：同步修改 LICENSE、license.txt、package 的
  `author`/`copyright` 与发布说明。
- 若将来需要闭源：只能对**新版本**改许可证；已发布的 MIT 版本不能撤回。
- 若引入 GPL/AGPL 等 copyleft 依赖：先评估与 MIT 分发/安装包的兼容性，并更新第三方许可说明。
- 若 GitHub 公开仓库需要贡献者许可/CLA：另行决策并写 ADR，不在本 ADR 预设。
