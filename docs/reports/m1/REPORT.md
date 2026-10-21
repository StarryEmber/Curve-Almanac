# M1 验收报告 — 领域与持久化

> 日期：2026-10-21 · 分支：`main` · 基线提交：`fdd6545`（T2.1 交接文档）· 工作树：提交前仅新增验收测试
> 环境：Windows 10 x64 · Node 24.21.0 · pnpm 11.28.5 · Electron 44.9.0（本次演示未启动 Electron）
> 退出标准（`docs/TASKS.md` M1）：**工作区/表可创建、读写、迁移、恢复**；三条验收演示见 §3。
> 决策依据：AGENTS §8、TASKS M1、SPEC §7.1–§7.6/§13.1/§15.1/§16.1、ADR-020–ADR-025。
> **验收结果（2026-10-21）**：用户接受 M1；R1 的恢复交互按 ADR-026 后置到 T5.3。

## 1. 结论

M1 的三条验收演示全部通过，并已固化为可重复运行的测试：

| # | 验收演示 | 结果 |
|---|---|---|
| 1 | 创建 `Demo.cstudio` → 写入 1,000 行 → 关闭重开 → 逐行相等 | ✅ 通过 |
| 2 | 篡改 manifest → 报错且原文件不变 | ✅ 通过（3 种篡改） |
| 3 | 伪造 `.lock` → 走恢复提示 | ✅ 通过（stale/corrupt 警告 + 替换，active 拒绝） |

门禁：`pnpm verify` **67 files / 557 tests**、depcruise **188 modules / 555 deps / 0 violations**；
`pnpm test:coverage` 全局 lines **93.62%**；`pnpm format:check` 通过；`pnpm e2e` **22 passed**。
本次未修改任何生产代码、`formatVersion`、IPC 通道、CSP 或沙箱配置。

**用户已于 2026-10-21 接受 M1，并授权进入 T2.1**；T2.1 开工前仍须按 AGENTS §11 逐项确认
`docs/HANDOFF.md §7.5` 的 8 个待定决策。与 SPEC §7.5 的差距（§5 R1）已裁决：恢复交互后置到 T5.3
（ADR-026），M1 以“warning + 替换锁”现状验收。

## 2. 演示方式

### 2.1 为什么用测试而不是手工窗口

T2.1 之前 renderer 还没有欢迎页、表列表与网格（`AppShell` 主区仍是空态），手工窗口无法建表或写入
1,000 行；TASKS 的 M1 条目明确允许“脚本/测试”。因此演示做成 L3 契约/集成测试，直接驱动**生产**的
`FileWorkspaceStore` 与 `@curve/table-engine`，不使用 fake store：

- 测试：`apps/desktop/src/main/workspace/m1-acceptance.test.ts`（3 cases）。
- 临时目录 + 固定时钟 + 固定 ID：符合 AGENTS §6（不依赖真实用户目录/系统时间）与 TESTPLAN §1.3/§4。
- 路径：`create` → `writeManifest`（空的 `rowCount: 0` 表条目）→ `writeTable`（JSONL）→
  `writeManifest`（`rowCount: 1000`，最后写）→ `close` → **新 store 实例** `open` → `readTable`
  → `decodeJsonl`。写入顺序符合 SPEC §7.4.4 与 ADR-022（新表可先只有 manifest 条目）。
- 复现命令：

```powershell
$env:PATH = "D:\DSH_Work_Space\tools\bin;C:\Users\MECHREVO\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin;$env:PATH"
cd D:\DSH_Work_Space\curve-studio
pnpm exec vitest run apps/desktop/src/main/workspace/m1-acceptance.test.ts --reporter=verbose
```

### 2.2 演示数据（确定性）

| 项 | 值 |
|---|---|
| 工作区 | `Demo.cstudio`（临时父目录下，名称经 ADR-020 清洗） |
| 工作区 id | `ws_m1demo`（测试注入固定 uuid；生产用 `crypto.randomUUID()`） |
| 表 | `tbl_m1demo` “Sensor readings”，`schemaVersion: 1` |
| 列 | `col_m1_id` text 主键、`col_m1_time` date、`col_m1_value` number（precision 1，°C） |
| 行 | 1,000 行（`row_0001`–`row_1000`），每 97 行一个 `null` 数值，共 10 个 null |
| JSONL | **55,695 bytes**，1,000 个内容行，LF 结尾、无 BOM |
| manifest | **1,775 bytes** |
| JSONL SHA-256 | `19282691e6853f5866cb8099253533723911ad90b03338227c772139314fd186` |
| manifest SHA-256 | `85a124e675269d379242f9c8c78516d3c57e1f3207b49812fd5b26fb1bf21996` |
| 首行 / 末行 | `sensor-1 / 1767225660000 / 20.1`；`sensor-1000 / 1767285600000 / 20` |

固定时钟 `2026-10-21T00:00:00.000Z`，表/工作区 `updatedAt = 2026-10-21T00:05:00.000Z`。因此上述两个
哈希在重复运行中稳定（已连续跑两次核对一致），报告中可直接作为回归基线。

### 2.3 实际输出

```text
 ✓ apps/desktop/src/main/workspace/m1-acceptance.test.ts > M1 acceptance demo >
   creates Demo.cstudio, writes 1,000 rows and reads them back row-for-row after a restart 263ms
 ✓ ... > refuses a tampered manifest and leaves every original byte untouched 125ms
 ✓ ... > takes the stale-lock recovery path and refuses an active lock 207ms

 Test Files  1 passed (1)
      Tests  3 passed (3)
   Duration  1.23s
```

## 3. 验收演示逐项

### 3.1 创建 → 1,000 行 → 关闭重开 → 逐行相等

测试名：`creates Demo.cstudio, writes 1,000 rows and reads them back row-for-row after a restart`。

执行与断言：

1. **创建**：`FileWorkspaceStore.create({ dir: parent, name: 'Demo' })` 生成 `Demo.cstudio`；
   断言 SPEC §7.1 的 `manifest.json`、`tables/`、`backups/`、`imports/`、`.trash/` 与 `.lock` 存在，
   `name === 'Demo'`、`formatVersion === 1`、1 张表、1 个视图。
2. **写入**：`writeTable` 返回 55,695 bytes；磁盘文件与 `encodeJsonl(rows)` 逐字符相等，无 BOM、
   以 `\n` 结尾、`split('\n')` 为 1,001 段、`countJsonlRows = 1,000`，`statSync().size` 与返回值一致。
3. **首次读取**：`decodeJsonl` 的 `issues` 为空，`stats = { total: 1000, accepted: 1000, skipped: 0 }`，
   `rows` 与内存中的 1,000 行 `toEqual`（含 10 个 null）。
4. **关闭**：`close` 后 `.lock` 删除；`listRecent()` 只含 `{ path: Demo.cstudio, name: 'Demo' }`。
5. **重启**：用**新的** `FileWorkspaceStore` 实例（同一 `userData`）`open`；`warnings` 为空，
   返回的 manifest 与关闭前 `toEqual`，`tables[0].rowCount === 1000`，`updatedAt === 00:05:00Z`，
   新 `.lock` 写入。
6. **重开读取**：`readTable` 返回的 `jsonl` 与写入串完全相等、`bytes === 55,695`；再次 `decodeJsonl`
   后逐行循环 `expect(redecoded.rows[i]).toEqual(rows[i])`，最终整数组 `toEqual`。
7. **不重写**：重开后 `manifest.json` 与表文件的 SHA-256 都与关闭前相同（`rowCount` 一致，未触发
   ADR-022 的重算重写；`updatedAt` 未被修改）。
8. **再次关闭**：`.lock` 删除。

结论：1,000 行数据在“关闭 → 冷启动 → 打开”后逐行相等，且打开过程没有顺手改写任何文件。

### 3.2 篡改 manifest → 报错且原文件不变

测试名：`refuses a tampered manifest and leaves every original byte untouched`。工作区关闭后，
`backups/` 中已有 2 份 `manifest.<timestamp>.json.bak`；记录备份目录清单后分别做三种篡改：

| 篡改 | 打开结果 | 原文件 | 锁/备份 |
|---|---|---|---|
| 截断 JSON（前 120 字符） | `E_WS_INVALID_MANIFEST` | SHA-256 不变 | 无 `.lock`；备份清单不变 |
| 合法 JSON、主键改为不存在的 `col_missing` | `E_WS_INVALID_MANIFEST` | SHA-256 不变 | 无 `.lock`；备份清单不变 |
| `formatVersion: 2` | `E_WS_VERSION_UNSUPPORTED`（`detail: formatVersion=2`） | SHA-256 不变 | 无 `.lock`；备份清单不变 |

断言在失败后重新读取文件并比较 SHA-256，而不是只比较内存字符串；同时断言 `backups/` 没有新增文件。
三种失败都发生在写锁与任何 manifest 修复之前，因此“报错且原文件不变”严格成立。最后把原始 manifest
写回，确保清理时不会留下半写工作区。

> 注意：即使 `backups/` 里有可用的 manifest 备份，当前 `open` 也只返回 `E_WS_INVALID_MANIFEST`，
> 不会自动扫描备份重建（SPEC §7.5 的“恢复流程”尚未实现，见 §5 R1）。这与本演示要求的“报错”一致，
> 但“尝试恢复/直接打开”的交互仍缺失。

### 3.3 伪造 `.lock` → 恢复路径

测试名：`takes the stale-lock recovery path and refuses an active lock`。

| 锁状态 | 构造 | 结果 |
|---|---|---|
| stale | `{pid:999999, startedAt:'2020-01-01T00:00:00.000Z'}` | 打开成功；`warnings` 恰 1 条：<br>`The previous session did not close this workspace cleanly; its stale lock was replaced.`<br>锁被替换为当前 pid + 固定时钟；表数据仍逐行相等；关闭后删除 |
| corrupt | 写入 `not a lock document` | 打开成功；`warnings` 恰 1 条：<br>`The workspace lock file was unreadable and has been replaced.`<br>锁被替换；关闭后删除 |
| active | `{pid:process.pid, startedAt:now}` | 拒绝：`E_WS_LOCKED`（`detail: pid=<pid>`）；锁文件字节不变，不会被第二个实例抢占 |

结论：stale/corrupt 锁走“提示 + 替换”的恢复路径，active 锁走拒绝路径，且都不影响已写入的 1,000 行。

**“恢复提示”的当前形态**：它是 `open()` 返回的 `warnings: string[]`，不是交互式对话框；完整交互
（“尝试恢复”/“直接打开” + manifest 备份重建）尚未实现，已按 ADR-026 后置到 T5.3（自动保存、恢复与
最近打开）。T2.1 必须把这些 warning 呈现给用户（HANDOFF §5.4 已列为 T2.1 要求），但不在 T2.1 新增
恢复 IPC 或静默重建 manifest。

## 4. 门禁与回归

| 命令 | 结果 | 备注 |
|---|---|---|
| `pnpm verify` | exit 0 | ESLint 0 problem；depcruise **188 modules / 555 deps / 0 violations**；**67 files / 557 tests**（11.04s） |
| `pnpm test:coverage` | exit 0 | 全局 stmts **93.34%** / branch **84.87%** / funcs **97.44%** / lines **93.62%**；阈值未下调 |
| `pnpm format:check` | exit 0 | Prettier 全部匹配 |
| `pnpm e2e` | exit 0 | **22 passed**（44.1s）；先 `pnpm build`；`CURVE_E2E_NO_SANDBOX=1` 且清除 `ELECTRON_RUN_AS_NODE` |

与 M1 开工前基线对比：

| 指标 | 基线（T1.5 / HANDOFF） | 本次 | 变化 |
|---|---|---|---|
| verify 文件/测试 | 66 / 554 | **67 / 557** | +1 file / +3 tests（本次验收测试） |
| depcruise | 187 modules / 548 deps | **188 / 555** | 新增测试文件及其 import |
| 全局 lines | 93.51% | **93.62%** | +0.11pp |
| E2E | 22 passed | **22 passed** | 不变 |

E2E 会重写 `docs/reports/m0/t0.2-window.png` 与 `t0.4-shell-dark.png`（真实鼠标悬停导致字节不稳定，
M0 已记录）。本次在提交前用 `git checkout --` 还原，工作树只保留新增测试与文档。

## 5. 遗留问题与已知风险

| # | 问题 | 影响 | 建议处理 |
|---|---|---|---|
| R1 | **SPEC §7.5 的恢复交互未实现**：stale/corrupt 锁只有 warning；manifest 损坏时不会扫描 `backups/manifest.*.json.bak` 重建，也没有“尝试恢复/直接打开”选择。演示中备份存在但 `open` 仍返回 `E_WS_INVALID_MANIFEST`。 | 崩溃后用户只能看到警告/错误，无法在应用内选择恢复；不满足 SPEC §7.5 的完整描述。 | **已裁决（2026-10-21）**：接受 M1，把交互记入 **T5.3**（TASKS 中 T5.3 才是“自动保存、恢复与最近打开”；T5.1 是分栏布局），见 ADR-026。T2.1 只呈现 warning。 |
| R2 | 演示使用 main 适配器 + 编解码器，未经过 Electron IPC 或 renderer UI。 | 1,000 行的“IPC + UI”链路尚未证明；不过 `e2e/workspace.spec.ts` 已覆盖 IPC 的 create/open/close、损坏 manifest、未来版本。 | T2.1 接 renderer 后，用 100k 基准 + 网格 E2E 补“IPC + UI”证据；本次验收测试保留为持久层回归。 |
| R3 | `@curve/app-core` 未消费这次 1,000 行工作区：`apps/desktop` 在 T2.1 之前没有 app-core 依赖（HANDOFF §7.4）。 | 打开 use case 对 1,000 行的状态装载未在本次演示中直接验证；T1.5 测试用 `v1-min` 夹具覆盖了同一路径。 | T2.1 接线时把 Worker 解码注入 `openWorkspace`，并复跑 100k 打开预算（SPEC §16.1）。 |
| R4 | 生产迁移注册表为空（ADR-024）；本次只验证了“未来版本拒绝”，没有真实 v1→v2 迁移。 | 首次真实格式升级前，旧版本仍以 `E_WS_VERSION_UNSUPPORTED` 正确拒绝。 | 按 ADR-024/T2.3 接入迁移、升版本、补夹具与逐行等价测试。 |
| R5 | `openWorkspace` 在 `WorkspaceStore.open` 成功后若表读取失败，不会自动 `close`，可能残留 `.lock`（HANDOFF §7.4 第 7 条）。 | 本次演示的失败都发生在写锁之前，未触发；真实 renderer 路径可能触发。 | T2.1 适配层或 main 生命周期补 close-on-failure，并加失败路径测试。 |
| R6 | E2E 截图字节不稳定，每次 `pnpm e2e` 后工作树变脏。 | 提交噪声。 | 沿用 M0 处理：提交前还原；断言不依赖像素。 |

## 6. 验收确认（2026-10-21 已完成）

1. **接受 M1** 并进入 `T2.1`（工作区入口、表管理与虚拟化数据网格）：**已确认**。
2. **R1 处置**：**已确认**——接受 M1，把“恢复/直接打开 + manifest 备份重建”记入 T5.3 的崩溃恢复
   范围（ADR-026）；T2.1 不新增恢复 IPC。
3. **长期回归**：**已确认**——`m1-acceptance.test.ts` 保留在 `pnpm verify` 中（套件从 66/554 变为
   67/557），T5.3 实现交互后应扩展而不是删除。

T2.1 已获授权；开工前仍须确认 HANDOFF §7.5 的 8 个决策。不自动进入 T2.2。
