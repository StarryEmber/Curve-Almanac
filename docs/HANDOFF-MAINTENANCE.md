# Curve Almanac 维护交接（v1 / 0.1.0 之后）

> **用途**：v1 发布后，接手更新、维护、发新版本或修 bug 的会话/维护者先读这一份。
> **不是**实现历史：完整的任务/环境/决策记录见 [HANDOFF.md](HANDOFF.md) 与 `docs/reports/`。
> **配套**：[DSH 使用手册](DSH.md) · [用户手册](MANUAL.md) · [开发者指南](DEVELOPER.md) ·
> [SPEC](SPEC.md) · [TESTPLAN](TESTPLAN.md) · [ROADMAP](ROADMAP.md)

## 0. 状态卡（2026-10-30）

| 项 | 值 |
|---|---|
| 产品/版本 | Curve Almanac **0.1.0**（Windows 10/11 x64） |
| 阶段 | v1 实施完成；**M0–M6 已关闭**；进入维护/发布阶段 |
| 最新提交 | `git log -1 --oneline`（本维护交接提交；上一版为 `ad36d19`） |
| 工作树 | 干净；**无 GitHub remote、无 tag** |
| 安装包 | `release/Curve Almanac Setup 0.1.0.exe`（112,421,015 B）· `release/Curve Almanac 0.1.0.exe`（112,183,688 B） |
| SHA-256 | Setup `3F8685C7BE60CA2AC5CA8DD63098F7F1A38A98657E979D9841A0A169B20BF33E`；portable `D95E61436FC2DE5E60DD7F3EF791AD4A4495E24E10EDC2EAA904BFFEB6F52F28` |
| 验证基线 | `pnpm verify` 198 files / 1831 tests；`pnpm e2e` 功能 111 passed + 2 内存门禁；`pnpm bench` exit 0 |
| 内存门禁 | 整应用 private ≤ **1024MB**（ADR-057；600MB 为历史） |
| 打包冒烟 | `pnpm package:smoke` PASS（install 18.6s / launch 10.1s / uninstall 9.1s，StarryEmber 版权重打后） |
| 签名 | **未签名**（SmartScreen 提示）；证书/签名策略未定 |
| 许可证/主体 | **MIT**（根 `LICENSE`，ADR-058）；Copyright © 2026 **StarryEmber**；`build/license.txt` 同步；第三方组件各自许可 |
| 仓库/作者 | GitHub 仓库 **curve-almanac**；根包名 `curve-almanac`；Git 作者 **StarryEmber**（ADR-059） |
| 文档 | README、SPEC、TASKS、TESTPLAN、HANDOFF、MANUAL、DSH、DEVELOPER、ROADMAP、ADR-001–057 |

## 1. 30 分钟接手清单

1. 读 [AGENTS.md](../AGENTS.md) 的 §2/§8/§10/§12（不可协商、任务协议、DoD、禁做）。
2. 读本文件 §2–§8；需要发布时再读 §6。
3. 确认环境：`git status` 干净、`pnpm --version` 11.28.5、Node ≥20.11、Electron 44.9.0。
4. 跑一次 `pnpm verify`；时间允许再跑 `pnpm e2e`（独占 CPU）。
5. 查 §13 的“立即待办/决策”，不要擅自替用户做发布/许可/签名决定。
6. 任何改动前先复述目标/范围/验收，再动手；一次只做一个任务。

环境细节（PATH、git 路径、沙箱、镜像）见 [DSH.md §2/§3](DSH.md)。

## 2. 产品与代码现状

- **技术栈**：Electron 44.9.0 + electron-vite + React 19 + TypeScript strict + Zustand/Immer +
  TanStack Table/Virtual + ECharts 6.1.0（仅 `chart-echarts`）+ Zod + pnpm workspace。
- **包结构**：`domain` / `table-engine` / `chart-model` / `chart-echarts` / `persistence` /
  `plugin-sdk` / `ui` / `app-core` / `desktop` + `plugins/plugin-sample`。
- **边界**：`domain←table-engine←chart-model←chart-echarts`、`domain←persistence←app-core←desktop`、
  `domain←plugin-sdk←plugins/*`、`ui←desktop`；`lint:boundaries` 硬阻断。
- **数据格式**：`.cstudio` 目录；`formatVersion: 1`；manifest + JSONL；原子写 + 备份 + `.lock`；
  高版本拒绝。**任何格式变更都要新迁移 + ADR + fixtures。**
- **安全**：`contextIsolation/sandbox/webSecurity`、CSP、最小 preload、Zod IPC、工作区白名单；
  不得为调试关闭。
- **关键机制**：命令总线（唯一写路径）、`SaveQueue`（1.5s/10s + flush）、`EditHistory`（100 条/
  256MB）、插件宿主（静态、错误隔离、会话级禁用）、`electron-log` 文件日志（按天/7 天）、
  1GB 内存门禁。

## 3. 发布状态与 GitHub

- 本地安装包已重打（含 T6.6 的 `electron-log`）并通过冒烟；`release/` 被 gitignore，**未提交**。
- **尚未推送 GitHub**：无 remote、无 tag。GitHub 发布前必须先定：
  1. 源码公开还是仅公开二进制：私有仓库的 Release 附件不对公众开放；**当前已按用户决定
     公开源码并采用 MIT（ADR-058）**；仍需仓库名、推送方式与 GitHub 网络。
  2. 证书/签名：未签名可发布，但要在发布说明写明 SmartScreen；签名方案见 ADR-055 复核条件。
  3. 分发渠道与仓库名（`curve-almanac` 建议）。
- 建议路径（不改代码）：源码暂不公开 → 建公开的 `curve-almanac-releases` 仓库，只放发布说明、
  安装包、`SHA256SUMS.txt`；源码仓库保持私有/本地。
- 发布前必须在**干净 Windows 用户/VM**复验（当前仅有“无既存安装/无 userData/非管理员”的本机冒烟；
  用户 2026-10-30 曾豁免一次，但正式发布建议补做）。

## 4. 常用命令

```powershell
$env:PATH = "D:\DSH_Work_Space\tools\bin;C:\Users\MECHREVO\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin;$env:PATH"
pnpm verify                 # lint + typecheck + test（改动后必须绿）
pnpm e2e                    # build + 113 条 E2E（独占 CPU，7–10 分钟）
pnpm bench                  # 10 万行性能（exit 0）
pnpm package                # 打 NSIS + portable 到 release/
pnpm package:smoke          # 真实安装/启动/卸载（写系统目录，先确认无既有安装）
pnpm format:check
```

- E2E 受限 shell：`$env:CURVE_E2E_NO_SANDBOX='1'`。
- E2E 会重写 `docs/reports/m0/*.png`；提交前 `git checkout -- docs/reports/m0`。
- `package:smoke` 会重写 `docs/reports/t6.4/t6.4-package-metrics.json`；先备份/恢复历史，
  新 metrics 放对应版本目录（如 `docs/reports/t6.6/`）。
- 打包需网络/镜像；本机缓存已存在。GitHub 不可达时设 `ELECTRON_MIRROR`/
  `ELECTRON_BUILDER_BINARIES_MIRROR`，不要删依赖。

## 5. 变更流程（按类型）

| 类型 | 流程 |
|---|---|
| **Bug 修复** | 先写复现测试 → 最小修复 → `pnpm verify` + 相关 E2E → TASKS/CHANGELOG → 提交；若影响已发布行为，补发布说明 |
| **依赖升级** | 读 §9 清单 → 写 ADR（运行时依赖）→ 升级/锁版本 → verify/e2e/bench → `pnpm package && package:smoke` → 记录体积/asar |
| **功能/行为变更** | 先读 SPEC；偏离先写 ADR（下一个编号 058+）→ 改 SPEC/TASKS/TESTPLAN → 测试先行 → 实现 → 全量验证 |
| **数据格式变更** | 必须新迁移 + `fixtures/workspaces/` 旧版夹具 + “旧版打开→迁移→逐行等价”测试 + ADR；禁止静默改 `formatVersion` |
| **安全修复** | 先评估影响面（IPC/路径/CSP/依赖）→ 最小修复 + 回归测试 → 发布补丁版本；不要在容器里关闭安全选项 |
| **纯文档** | 更新对应活文档（MANUAL/DSH/README/ROADMAP/CHANGELOG）；不跑测试但要 `format:check` + 链接检查 |
| **发布** | 走 §6，不要跳步；发布节点停下等人类确认 |

## 6. 发布新版本（步骤）

1. **冻结**：`git status` 干净；`pnpm verify`、`pnpm e2e`、`pnpm bench` 绿。
2. **版本**：同时改根与 `apps/desktop/package.json` 的 `version`（`packaging.test.ts` 断言相等）；
   更新 CHANGELOG、README、MANUAL 首行；必要时写迁移/发布说明。
3. **打包**：`pnpm package`；核对 `release/` 三件产物；检查 asar 含 `out/**`、
   `write-file-atomic`、`signal-exit`、`electron-log`，无 `*.map`/开发文件。
4. **冒烟**：`pnpm package:smoke`；保存新 metrics；恢复 T6.4 历史 metrics。
5. **干净机器**：全新 Windows 用户/VM 安装→启动→建工作区→卸载→数据保留；记录环境。
6. **签名（可选）**：有证书则按 ADR-055 接入 `win.sign`/`CSC_LINK` + 时间戳，验
   `Get-AuthenticodeSignature`；无证书则在发布说明写明未签名。
7. **校验和**：对两个 exe 生成 SHA-256，写入 `SHA256SUMS.txt` 随 Release 上传。
8. **发布说明**：版本、系统要求、安装/便携、未签名提示、数据路径、卸载保留、主要变化、已知限制、
   校验和。模板见 [PROMPTS.md](PROMPTS.md) 的“发布”提示词。
9. **GitHub**：先决策公开范围；`git tag -a vX.Y.Z` → 推送 → Release 上传 Setup/portable/
   `SHA256SUMS.txt`；不要上传 `builder-debug.yml`/`.blockmap`；不要提交 `release/`。
10. **回滚**：保留上一版安装包与工作区 `backups/`；跨 `formatVersion` 不支持降级。

## 7. 数据兼容（最容易出事）

- `formatVersion: 1` 是契约；任何字段/语义变化都先 ADR + 迁移。
- 行数据 JSONL 格式、列 ID 引用、原子写、manifest 最后写、`.lock`/备份语义不得改。
- 新字段优先**可选**并保持旧文件可读；必须拒绝未来版本（`E_WS_VERSION_UNSUPPORTED`）。
- 迁移测试必须逐行等价、失败回滚、原文件可读；夹具放 `fixtures/workspaces/`。
- 打开 10 万行工作区/保存/恢复/导出是回归重点；不要信任 `rowCount`。

## 8. 测试与已知 flake

| 层 | 命令 | 备注 |
|---|---|---|
| Lint/类型/单测 | `pnpm verify` | 198 files / 1831 tests；ESLint 0 |
| 覆盖率 | `pnpm test:coverage` | 全局 lines ≈77.3%；阈值 70/60 |
| E2E | `pnpm e2e` | 113 条；功能 111；1 worker；独占 CPU |
| 基准 | `pnpm bench` | exit 0；与基线比 >20% 回归告警 |
| 打包 | `pnpm package` / `package:smoke` | 需网络/系统写权限 |

已知 flake（处理方式，不要改预算）：

- Vitest 5s 超时（`recent-list`/`file-workspace-store`/`m1-acceptance`）：196+ worker 高负载偶发；
  单文件复跑应 <1s；不放宽 timeout。
- `chart-perf`/`perf` 内存：历史 509–639MB；门禁 **1GB**（ADR-057）；先关外部游戏/聊天/Steam。
- 全量 E2E teardown timeout：检查遗留 Electron/并发 Playwright。
- 目标机器上 `taskkill`/单实例/锁相关用例需要独占。

## 9. 依赖升级指南

| 依赖 | 当前 | 升级前/后检查 |
|---|---|---|
| Electron | 44.9.0 | 主进程 API、sandbox/CSP、E2E `_electron`、打包体积；升级后全量 E2E + package:smoke |
| electron-log | 5.4.4 | 日志路径/格式/`resolvePathFn`/`maxSize`/同步写；`e2e/logging.spec.ts` + 冒烟 |
| React | 19.x | 组件测试、StrictMode、E2E 交互 |
| ECharts | 6.1.0（锁） | `option.ssr.test.ts` 黄金快照、采样/断点、chart-perf |
| TypeScript/ESLint/Vitest | 见 lock | `pnpm verify`；规则/覆盖率 |
| pnpm/Node | 11.28.5 / ≥20.11 | `packageManager`/lockfile；CI 矩阵 |
| electron-builder | 26.15.3 | NSIS 参数、asar 收集、图标/许可；`packaging.test.ts` + 冒烟 |

升级运行时依赖先写 ADR（体积/维护/替代方案）；一次只升一个主依赖，避免混合回归。

## 10. 已知技术债/限制（维护视角）

- 安装包未签名；macOS/Linux 未配置；无自动更新/发布通道（ADR-016/055）。
- 内存门禁 1GB：600–1024MB 的真实增长不会被 E2E 拦截（ADR-057 代价）。
- 日志：跨天首次写入才归档、单日无大小上限、renderer 限流会丢日志、无日志查看器（ADR-056）。
- 插件：禁用不持久化、文案不本地化、图表预设不回显、大文件导入在主线程（ADR-053/054）。
- CSV 导出不套用语义字段格式；main 原生对话框英文。
- 强杀最多丢最后 1.5s；恢复只自动尝试最新一份 manifest 备份。
- 100k 图表内存/性能敏感；改动命令面板/AppShell 订阅/图表缓存时必须重跑 chart-perf。
- `table.delete` redo 可能留孤儿 JSONL；`table.meta.update` 菜单文案不区分重命名/主键。

## 11. 运维与故障处理

| 现象 | 处理 |
|---|---|
| 用户保存失败/只读 | 查磁盘空间/权限；状态栏重试；不要静默丢数据 |
| stale/corrupt lock | 恢复对话框；不要手删 `.lock` 除非确认无进程 |
| manifest 损坏 | 用 `backups/` 最新备份；取消不改文件；记录日志 |
| 插件报错 | 插件管理器禁用、看环形日志；不要改宿主错误隔离 |
| 打包失败 | 先看网络/镜像；再查 asar/依赖；不要删 `electron-log` |
| 日志排查 | `%APPDATA%\Curve Almanac\logs\main.log`（按天，7 天） |
| 用户数据清理 | 只删 `%APPDATA%\Curve Almanac` 与工作区；先备份 |

## 12. 文档/手册维护

- 发布新版本时更新：README 版本/功能、MANUAL 首行与新增功能、DSH 命令/基线、ROADMAP 限制、
  CHANGELOG、HANDOFF 状态卡、TESTPLAN 基线。
- 用户手册截图：用临时工作区与示例数据，避免真实路径/客户数据；不要覆盖 `docs/reports/*` 历史证据。
- 新决策写 ADR（058+）并更新 `docs/adr/README.md`；ADR 不接受静默修改历史。
- 手册/文档修改后跑 `pnpm format:check`，检查相对链接与图片路径。

## 13. 立即待办与待决策（交接给用户）

1. **GitHub 发布**：公开源码 + MIT + 版权主体 StarryEmber 已决定（ADR-058/059）；仓库名
   `curve-almanac`；待推送网络（本机到 github.com:443 不通）、tag/Release 与附件上传。
2. **干净机器复验**：正式发布前在全新 Windows 用户/VM 执行安装/启动/建工作区/卸载/数据保留。
3. **签名**：是否购买 OV/EV 或使用企业自签名；未签名则发布说明必须写明 SmartScreen。
4. **分发渠道**：官网/内网/网盘/GitHub Release；是否提供校验和。
5. **手册发布**：当前 MANUAL 为 Markdown（11 张截图）；是否导出 PDF/HTML、是否补更多截图。
6. **1GB 门禁**：环境受控后若连续 3 次 <600MB，可按 ADR-057 复核条件降回；否则保持 1GB。

## 14. 不要做

- 不要关闭 `contextIsolation`/`sandbox`/CSP，或为通过测试放宽安全选项。
- 不要绕过命令总线改 store；不要在 renderer 读文件/require Node。
- 不要静默改 `formatVersion`、删迁移、改 `appId`、删除验收项。
- 不要把 `release/`、`node_modules`、`test-results`、真实用户数据提交进仓库。
- 不要在未确认许可证/公开范围前把源码推到公开 GitHub。
- 不要在并发/高负载下判定性能回归；先独占复跑。
- 不要用 PowerShell `Set-Content` 批量改 UTF-8 源码（会损坏中文）；用编辑工具 + `git diff`。

## 15. 证据索引

| 内容 | 位置 |
|---|---|
| M6 验收/关闭 | `docs/reports/m6/REPORT.md` |
| 九步演示/截图/metrics | `docs/reports/t6.5/` |
| 日志/文件转发/打包 metrics | `docs/reports/t6.6/` |
| T6.4 安装包/冒烟历史 | `docs/reports/t6.4/` |
| 插件 SDK/示例/UI | `docs/reports/t6.1/`、`t6.2/`、`t6.3/` |
| 规格/测试/决策 | `docs/SPEC.md`、`docs/TESTPLAN.md`、`docs/adr/` |
| 用户手册/DSH 手册 | `docs/MANUAL.md`、`docs/DSH.md` |
| 实施历史/环境事实 | `docs/HANDOFF.md` |
