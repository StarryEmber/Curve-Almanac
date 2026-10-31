# Curve Almanac × DSH 使用手册

> **面向读者**：在本仓库内工作的 DSH 会话/自动化代理（也适用于人类维护者）。
> **目的**：让下一个会话在不重新摸索的情况下，安全地运行、验证、打包、发布和维护 Curve Almanac。
> **配套**：[AGENTS.md](../AGENTS.md)（强制守则）· [HANDOFF.md](HANDOFF.md)（实施交接）·
> [用户手册](MANUAL.md) · [开发者指南](DEVELOPER.md) · [SPEC](SPEC.md)

## 1. 三十秒事实

| 项 | 值 |
|---|---|
| 仓库根 | `D:\DSH_Work_Space\curve-studio`（GitHub 仓库名：**curve-almanac**；本地目录可继续用旧名） |
| 产品/版本 | **Curve Almanac 0.1.0**（Windows x64） |
| 阶段 | **v1 实施完成；M0–M6 全部关闭（M6 于 2026-10-30 关闭）** |
| 最近提交 | 见 `git log -1 --oneline`（作者重写/文档同步）；安装包重打见 `26e76a9` |
| 主验证 | `pnpm verify` = 198 files / 1831 tests；`pnpm e2e` 功能测试 111 passed；`pnpm bench` exit 0 |
| 内存门禁 | 整应用 private ≤ **1024MB**（ADR-057；600MB 为历史门禁） |
| 安装包 | `release/Curve Almanac Setup 0.1.0.exe`（NSIS 每用户）、`release/Curve Almanac 0.1.0.exe`（portable） |
| 数据位置 | `%APPDATA%\Curve Almanac`（设置/最近/日志）、`Documents\Curve Almanac`（默认工作区父目录） |
| 状态文档 | `docs/reports/m6/REPORT.md`、`docs/reports/t6.5/`、`docs/reports/t6.6/`、`docs/HANDOFF.md` |

**一句话**：v1 已可发布；接下来主要是发布执行（干净机器/签名/分发/发布说明）与手册编写/发布，
不是继续加功能。

## 2. 会话开场（复制即用）

```text
工作目录：D:\DSH_Work_Space\curve-studio
先读：AGENTS.md → docs/DSH.md → docs/HANDOFF-MAINTENANCE.md → docs/HANDOFF.md（§0.3/§0.15）→
docs/reports/m6/REPORT.md → docs/reports/t6.6/REPORT.md → docs/TASKS.md 的 M6
规则：一次只做一个任务；先复述再动手；不自动改 formatVersion/IPC/公共 API；
发布相关先读 docs/TESTPLAN.md §7。
```

工作前先确认：

```powershell
$env:PATH = "D:\DSH_Work_Space\tools\bin;C:\Users\MECHREVO\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin;$env:PATH"
git status --short          # 应为空
pnpm --version              # 11.28.5
node --version              # v24.x
```

本机 `git` 不在 PATH 时用 `D:\DSH_Work_Space\tools\mingit\cmd\git.exe`。

## 3. 环境事实（本机）

| 项 | 值/注意事项 |
|---|---|
| Node | `C:\Users\MECHREVO\.dsh\dsh-runtimes\...\node\bin\node.exe`（v24.x） |
| pnpm | `...\pnpm\bin\pnpm.mjs`（11.28.5）；命令垫片 `D:\DSH_Work_Space\tools\bin\pnpm.cmd` |
| Electron | `apps/desktop/node_modules/electron/dist/electron.exe`（44.9.0） |
| pnpm store | `D:\.pnpm-store\v11` |
| E2E 沙箱 | 受限 shell 必须 `$env:CURVE_E2E_NO_SANDBOX='1'`（只影响测试启动参数，不改应用安全选项） |
| 打包镜像 | GitHub 不可达时设 `ELECTRON_MIRROR`/`ELECTRON_BUILDER_BINARIES_MIRROR` 到 npmmirror；本机 2026-10-30 打包时缓存已存在，未再下载 |
| 文件沙箱 | 当前会话 `danger-full-access`；若回到 `workspace-write`，`verify`/E2E 可能 EPERM，需切回 |
| 屏幕/DPI | 本机 125% DPI；E2E 不做像素基线，只比计算样式/属性 |

## 4. 读什么（按目的）

| 目的 | 先读 |
|---|---|
| 产品是什么/怎么用 | [README](../README.md) → [MANUAL](MANUAL.md) |
| 改代码/跑测试 | [AGENTS](../AGENTS.md) → [DEVELOPER](DEVELOPER.md) → [SPEC](SPEC.md) §4/§6/§7 |
| 当前状态/续作 | [HANDOFF](HANDOFF.md)（§0.3/§0.15）→ [维护交接](HANDOFF-MAINTENANCE.md) → [M6 报告](reports/m6/REPORT.md) |
| 发布 | [TESTPLAN](TESTPLAN.md) §7 → [T6.4 报告](reports/t6.4/REPORT.md) → [T6.6 报告](reports/t6.6/REPORT.md) |
| 已知限制 | [ROADMAP](ROADMAP.md) + 各任务报告 §残留风险（不规划 v2，ADR-060） |
| 决策原因 | [ADR 索引](adr/README.md)（ADR-001–057） |

**优先级**：用户当前指令 > AGENTS/DSH > SPEC > TASKS/TESTPLAN > 历史报告。冲突时停下来问。

## 5. 仓库结构与边界

```text
apps/desktop/        Electron main/preload/renderer、e2e、test、build 资源、electron-builder.yml
packages/domain/     模型/Zod/不变量/归一/迁移（零 UI/IO）
packages/table-engine/  JSONL、查询排序、粘贴、导入、CSV 导出
packages/chart-model/   RenderModel、宽/长映射、LTTB
packages/chart-echarts/ 唯一依赖 echarts 的包
packages/persistence/  WorkspaceStore 端口、manifest 校验
packages/plugin-sdk/   插件契约/注册表/宿主
packages/app-core/     命令总线、状态、保存队列、历史
packages/ui/           令牌与基础组件
plugins/plugin-sample/ rating 字段类型 + points 导入器
scripts/               gen-100k、bench、package-smoke
docs/                  SPEC/TASKS/TESTPLAN/ADRs/reports/MANUAL/DEVELOPER/ROADMAP
release/               安装包产物（gitignore）
```

不可破坏的边界（`pnpm lint:boundaries` 硬阻断）：

- `domain` 不 import React/Electron/ECharts/Zustand/fs；
- `chart-model` 不 import ECharts；只有 `chart-echarts` 可以；
- `persistence` 不 import Electron；`ui` 不 import `app-core`/`persistence`；
- 插件只 import `@curve/plugin-sdk` 与 `@curve/domain` 的公开类型；
- renderer 不直接访问 Node/fs；一切经 `window.api` 的类型化 IPC。

## 6. 命令与预期

| 命令 | 用途 | 预期/耗时 |
|---|---|---|
| `pnpm dev` | 开发模式（HMR） | 需要 Electron 图形环境 |
| `pnpm build` | renderer + main + preload | ~1s；renderer ≈3,472 kB |
| `pnpm lint` | ESLint + depcruise | 0 warning / 0 violations |
| `pnpm typecheck` | `tsc -b` | 0 error |
| `pnpm test` | Vitest | 198 files / 1831 tests，~25s（高负载可能 5s 超时 flake） |
| `pnpm test:coverage` | 覆盖率 | lines ≈77.3%，阈值 70/60 |
| `pnpm e2e` | 先 build 再 Playwright | 113 条（功能 111 + 2 条内存门禁；2026-10-30 全量功能 111 passed，内存按 1GB 判定）；~7–10 分钟，**独占 CPU** |
| `pnpm bench` | 10 万行基准 | exit 0；~30–60s |
| `pnpm package` | build + electron-builder | ~1–2 分钟；产出 `release/` |
| `pnpm package:smoke` | 真实安装→启动→建工作区→卸载 | ~40–60s；会写系统目录，需无既有安装 |
| `pnpm format:check` | Prettier | 0 diff |

E2E 常用定向运行：

```powershell
$env:CURVE_E2E_NO_SANDBOX='1'
pnpm exec playwright test --config apps/desktop/playwright.config.ts apps/desktop/e2e/t6.5-acceptance.spec.ts
pnpm exec playwright test --config apps/desktop/playwright.config.ts apps/desktop/e2e/logging.spec.ts
```

跑全量前后注意：

- E2E 会重写 `docs/reports/m0/*.png`；提交前 `git checkout -- docs/reports/m0`。
- 全量必须 1 worker、独占 CPU；游戏/聊天/Steam 等会推高内存与超时。
- `chart-perf`/`perf` 内存门禁为 1GB（ADR-057）；两条用例的数值在门禁内即通过。
- 新加 E2E 后至少跑一次全量，避免抢占其他用例内存/时序。

## 7. 测试与已知 flake

| 现象 | 处理 |
|---|---|
| Vitest 单文件 5s 超时（`recent-list`/`file-workspace-store`/`m1-acceptance`） | 196+ worker 并行时偶发；单文件复跑应 <1s；**不要放宽全局 timeout** |
| `chart-perf` 内存超限 | 先确认外部程序负载；门禁 1GB；历史波动 509–639MB；按 ADR-057 复核 |
| 全量 E2E teardown timeout | 关闭遗留 Electron；检查是否并发跑了第二个 Playwright |
| E2E 启动失败 | 先 `pnpm build`；去掉 `ELECTRON_RUN_AS_NODE`；受限 shell 加 `CURVE_E2E_NO_SANDBOX=1` |
| 打包下载失败 | 配置 npmmirror 镜像；记为环境阻塞，不删依赖 |
| `package:smoke` 拒绝运行 | 机器已有安装；先卸载或换干净用户态 |

**禁止**：用 `--no-verify`、跳过测试、放宽 lint/覆盖率/内存门禁来“通过”；除用户明确书面指示
（例如 2026-10-30 将内存门禁改为 1GB，见 ADR-057）。

## 8. 运行与检查应用

- 开发：`pnpm dev`；构建产物：`apps/desktop/out/`；打包：`release/`。
- 已安装应用：`%LOCALAPPDATA%\Programs\Curve Almanac\Curve Almanac.exe`。
- 手工启动已打包版本：在普通 shell 中直接运行；受限 shell 需 `--no-sandbox` 并去掉
  `ELECTRON_RUN_AS_NODE`（见 HANDOFF §3.7）。
- 用户数据：`%APPDATA%\Curve Almanac`；日志 `logs\main.log`（按天归档，7 天）。
- 工作区：`<父目录>/<名称>.cstudio`；默认父目录 `Documents\Curve Almanac`。
- E2E 用 `CURVE_E2E_USER_DATA` 隔离 userData；不要指向真实用户目录。
- 重置测试态：只删 `test-results/` 下自己的临时目录；不要删真实 `%APPDATA%`/Documents。
- 检查 asar（打包后）：

```powershell
$asar = Get-ChildItem node_modules/.pnpm -Directory -Filter '@electron+asar@*' | Select-Object -First 1
$mod = Join-Path $asar.FullName 'node_modules\@electron\asar'
node -e "const a=require(process.argv[1]); console.log(a.listPackage(process.argv[2]).filter(f=>f.includes('electron-log')).join('\n'))" "$mod" "release/win-unpacked/resources/app.asar"
```

## 9. 发布流程（建议执行顺序）

1. **冻结代码**：确认 `git status` 干净、`pnpm verify` 绿、`pnpm e2e` 功能测试绿（内存按 1GB）。
2. **版本**：`apps/desktop/package.json` 与根 `package.json` 版本必须相等（`packaging.test.ts`）；
   若升版本，两处一起改，并更新 CHANGELOG/README 版本号。
3. **打包**：`pnpm package`；核对产物大小与 asar（必须含 `write-file-atomic`、`signal-exit`、
   `electron-log`；无 `*.map`/开发文件）。
4. **冒烟**：`pnpm package:smoke`；确认安装/启动/默认路径建工作区/卸载/数据保留；它会重写
   `docs/reports/t6.4/t6.4-package-metrics.json`——**先备份/恢复历史 metrics**，新 metrics 放
   `docs/reports/t6.6/` 或对应版本目录。
5. **干净机器复验**：v1 尚未做（用户 2026-10-30 豁免）；正式发布前应在全新 Windows 用户/VM
   上装一次、建工作区、卸载、确认数据保留。记录机器/用户态。
6. **签名**：v1 未签名（SmartScreen）。有证书时按 ADR-055 复核条件接入 `win.sign`，并在冒烟里
   校验 `Get-AuthenticodeSignature`；不要在没有证书时伪造。
7. **校验和**：对 `release/*.exe` 生成 SHA-256（`Get-FileHash -Algorithm SHA256`），与发布说明
   一起存档。
8. **发布说明**：从 `CHANGELOG.md` 的 v1 条目 + [ROADMAP](ROADMAP.md) 已知限制生成；必须写明
   未签名、Windows x64、1GB 内存门禁、日志/数据路径。
9. **分发**：按用户渠道（官网/内网/网盘）上传；本项目无自动更新/发布通道（ADR-016）。
10. **打 tag**：`git tag -a v0.1.0 -m "Curve Almanac 0.1.0"`；推送前确认用户要求。
11. **回滚**：保留上一版安装包与工作区 `backups/`；v1 只支持 `formatVersion: 1`，不支持降级跨格式。

## 10. 手册编写流程

当前 `docs/MANUAL.md` 已是 v1 用户手册（安装、快速上手、各功能、快捷键、恢复、排障、限制），
但**尚未配图到每个章节、未做 PDF/HTML 发布**。建议：

1. **受众/范围**：最终用户（非开发者）；开发细节留在 [DEVELOPER](DEVELOPER.md)。
2. **截图**：优先复用 `docs/reports/t6.5/`、`t6.3/` 的验收截图；新截图用临时工作区
   （如 `Demo.cstudio`）与示例数据，避免真实路径/客户数据；统一浅色主题、100% 或 200% 缩放。
3. **截图命名**：`manual-<章节>-<描述>.png`，放 `docs/manual/`（或继续引用 reports；不要覆盖历史证据）。
4. **内容检查**：逐项对照应用菜单/按钮，确保手册没有承诺未实现功能；快捷键与 F1 表一致；
   中英双语 UI 名称写清（如“设置（Settings）”）。
5. **验证**：按 README §6 九步演示走一遍手册步骤；200% 缩放/纯键盘抽查；截图不出现真实用户名。
6. **发布格式**：Markdown 源在 `docs/MANUAL.md`；如需 PDF/HTML，用 Pandoc/Word 导出，图片用相对
   路径；发布前检查目录锚点与链接。
7. **版本**：手册首行写适用版本与日期；每次发布更新。

## 11. 改代码的规则（摘要，完整见 AGENTS）

- 一次只做一个任务；先读 TASKS 依赖/验收；先复述（≤5 行）再动手。
- 新功能必须带测试；UI 任务要键盘 + 200% 缩放冒烟；纯逻辑覆盖率 ≥85%，全局 ≥70%。
- 改格式/IPC/公共 API 前先写 ADR 并更新 SPEC；禁止静默改 `formatVersion`。
- 新运行时依赖前写 ADR；本机能 50 行解决的不加依赖。
- 提交用 Conventional Commits；一个任务一个提交；正文写“验证：”与结果。
- 里程碑/发布节点停下来等人类确认，不要自动关闭里程碑或发布。

## 12. 文档与证据索引

| 内容 | 位置 |
|---|---|
| M6 汇总（验收/关闭） | `docs/reports/m6/REPORT.md` |
| 九步演示 + 截图 + metrics | `docs/reports/t6.5/` |
| 日志/文件转发测试与打包 metrics | `docs/reports/t6.6/` |
| 打包/NSIS/asar/冒烟 | `docs/reports/t6.4/` |
| 插件 SDK/示例/UI | `docs/reports/t6.1/`、`t6.2/`、`t6.3/` |
| 规格/测试矩阵/决策 | `docs/SPEC.md`、`docs/TESTPLAN.md`、`docs/adr/` |
| 产品手册 | `docs/MANUAL.md` |
| 维护交接/提示词 | `docs/HANDOFF-MAINTENANCE.md`、`docs/PROMPTS.md` |
| 已知限制 | `docs/ROADMAP.md`（不规划 v2） |

## 13. 当前待办与开放决策

| 项 | 状态/建议 |
|---|---|
| 干净机器安装复验 | 用户已豁免；正式发布前建议补做（全新 Windows 用户/VM） |
| 代码签名证书 | 未提供；有证书再接入，否则发布说明写明未签名/SmartScreen |
| 分发渠道 | 未定；需用户给出官网/内网/网盘与是否打 tag |
| 手册配图/PDF | 用户手册已有文字版；待补截图与发布格式 |
| 1GB 内存门禁 | 用户 2026-10-30 决定；环境受控后连续 3 次 <600MB 可降回（ADR-057） |
| T6.6 安装包 | 已重打 + `package:smoke` PASS；若再改代码需重新打包 |
| 自动更新/遥测 | v1 明确不做（ADR-016），不要在发布中引入 |

## 14. 明确不要做

- 不要关闭 `contextIsolation`/`sandbox`/`webSecurity` 或放宽 CSP 来“让代码跑起来”。
- 不要在 renderer `require('fs')`/读任意路径；不要绕过 `window.api`。
- 不要绕过命令总线改 store；不要用 `JSON.parse(JSON.stringify())` 做热路径深拷贝。
- 不要手改 `formatVersion`、删迁移、改 `appId`（会变成另一个产品）。
- 不要提交 `node_modules`、`release/`、`test-results/`、真实用户数据。
- 不要并发跑两个 E2E/Playwright（同一 `test-results` 会互相覆盖/挂起）。
- 不要用 PowerShell `Set-Content` 批量改 UTF-8 源码（本机默认编码会损坏中文）；用编辑工具/
  `prettier --write`，改完 `git diff` 检查。
- 不要把历史报告里的 600MB 门禁当成当前值（现为 1GB，ADR-057）。

## 15. 快速排障

| 症状 | 检查 |
|---|---|
| `pnpm` 命令找不到 | 注入 PATH（§2）；`pnpm.cmd` 在 `D:\DSH_Work_Space\tools\bin` |
| `git` 找不到 | 用完整路径 `D:\DSH_Work_Space\tools\mingit\cmd\git.exe` |
| E2E 卡住 | `Get-Process electron`；杀掉遗留实例；确认没有第二个 Playwright |
| 内存门禁失败 | 关掉 Steam/游戏/聊天；按 ADR-057 的 1GB 判断；不要改预算 |
| 打包 asar 缺 electron-log | 检查 `electron-builder` 依赖收集、`package-smoke` required、`files` 白名单 |
| 中文乱码/文件损坏 | 用 `git diff`/`file` 检查编码；从 git 恢复后重新编辑 |
| 提交前工作树脏 | E2E 会改 `docs/reports/m0/*.png`；`git checkout -- docs/reports/m0` |
